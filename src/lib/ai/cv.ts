import path from "path";
import { llmJson, llmText, extractJson } from "./client";
import { db } from "@/lib/db";
import { getObject } from "@/lib/storage";

/**
 * CV ANALYSIS PIPELINE
 * 1. Extract raw text from PDF / DOCX / TXT
 * 2. LLM structured parse  → skills, education, experience, strengths, concerns
 * 3. LLM rubric scoring    → per-CV-criterion score + rationale
 * Overall score = weighted mean of criterion scores (0-100).
 */

/** Minimal globals pdf.js touches at import in non-DOM runtimes (workerd). */
function ensurePdfjsGlobals() {
  const g = globalThis as Record<string, unknown>;
  g.DOMMatrix ??= class {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    constructor(_init?: unknown) {}
    static fromString(): null {
      return null;
    }
    static fromArray(): null {
      return null;
    }
  } as unknown as undefined;
  g.ImageData ??= class {
    width = 0;
    height = 0;
    data = new Uint8ClampedArray(0);
    constructor(_a?: unknown, _b?: unknown) {}
  } as unknown as undefined;
  g.Path2D ??= class {
    constructor(_a?: unknown) {}
  } as unknown as undefined;
}

/** PDF text extraction via pdf.js — pure JS, works on Node AND workerd. */
async function extractPdfText(buf: Buffer): Promise<string> {
  ensurePdfjsGlobals();
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
    getDocument: (opts: Record<string, unknown>) => { promise: Promise<PdfDoc> };
  };
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: undefined,
  }).promise;
  try {
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
      page.cleanup();
    }
    return parts.join("\n").trim();
  } finally {
    await doc.destroy();
  }
}

interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: { str?: string }[] }>;
    cleanup: () => void;
  }>;
  destroy: () => Promise<void>;
}

export async function extractCvText(filename: string, storedPath: string): Promise<string> {
  // Storage-abstracted read — works on local disk AND Cloudflare R2.
  const buf = await getObject(storedPath);
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return extractPdfText(buf);
  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const out = await mammoth.extractRawText({ buffer: buf });
    return (out.value || "").trim();
  }
  if (ext === ".txt" || ext === ".md") {
    return buf.toString("utf-8").trim();
  }
  if (ext === ".doc") {
    // legacy binary .doc — best-effort strip
    return buf.toString("utf-8").replace(/[^\x20-\x7E\n\r\t\u00A0-\u024F\u2000-\u206F]/g, " ").trim();
  }
  throw new Error(`Unsupported CV format: ${ext || "unknown"} (use PDF, DOCX or TXT)`);
}

export interface CvParsed {
  name?: string;
  headline?: string;
  summary?: string;
  skills: string[];
  education: { degree: string; institution?: string; year?: string }[];
  experience: { role: string; organisation?: string; period?: string; highlights?: string }[];
  strengths: string[];
  concerns: string[];
}

export interface CriterionScore {
  criterionId: string;
  name: string;
  score: number; // 0-100
  rationale: string;
}

export function clampScore(n: unknown, fallback = 50): number {
  const v = typeof n === "number" ? n : parseFloat(String(n));
  if (Number.isNaN(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10));
}

export function weightedMean(scores: { score: number; weight: number }[]): number {
  if (!scores.length) return 0;
  const totalW = scores.reduce((a, s) => a + s.weight, 0);
  if (totalW === 0) return 0;
  return Math.round((scores.reduce((a, s) => a + s.score * s.weight, 0) / totalW) * 10) / 10;
}

const PARSE_SYSTEM = `You are an expert technical recruiter who parses CVs into structured JSON.
Extract the candidate's profile faithfully from the text. If information is missing use an empty array or empty string — never invent facts.
Schema:
{"name": string, "headline": string, "summary": string,
 "skills": string[],
 "education": [{"degree": string, "institution": string, "year": string}],
 "experience": [{"role": string, "organisation": string, "period": string, "highlights": string}],
 "strengths": string[], "concerns": string[]}`;

export async function analyzeCv(candidateId: string): Promise<void> {
  const cvAnalysis = await db.cvAnalysis.findUnique({ where: { candidateId } });
  if (!cvAnalysis) throw new Error("CV analysis record missing");
  const doc = await db.document.findFirst({
    where: { candidateId, type: "CV" },
    orderBy: { uploadedAt: "desc" },
  });
  if (!doc) throw new Error("No CV document uploaded");

  await db.cvAnalysis.update({ where: { candidateId }, data: { status: "PROCESSING", progress: "Extracting text from document", error: null } });

  const rawText = await extractCvText(doc.filename, doc.storedPath);
  if (!rawText || rawText.length < 20) {
    throw new Error("Could not extract readable text from the CV (scanned/image-only PDFs are not supported)");
  }

  await db.cvAnalysis.update({ where: { candidateId }, data: { rawText: rawText.slice(0, 60000), progress: "AI parsing CV structure" } });

  const parsed = await llmJson<CvParsed>(PARSE_SYSTEM, `Parse this CV:\n\n${rawText.slice(0, 40000)}`);

  await db.cvAnalysis.update({
    where: { candidateId },
    data: { parsedJson: JSON.stringify(parsed), progress: "Scoring against job criteria" },
  });

  // ── rubric scoring against the job's CV criteria ──
  const candidate = await db.candidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { job: { include: { criteria: true } } },
  });
  const cvCriteria = candidate.job.criteria.filter((c) => c.category === "CV");
  let scores: CriterionScore[] = [];

  if (cvCriteria.length > 0) {
    const rubric = cvCriteria.map((c, i) => `${i + 1}. id=${c.id} | ${c.name} (weight ${c.weight}) — ${c.description}`).join("\n");
    const scoreSys = `You are an impartial recruitment assessor. You score ONE candidate's CV against explicit criteria.
Rules:
- Score each criterion 0-100 where 50 is a barely-acceptable level for the role, 80+ is strong, <40 is a real weakness.
- Base scores ONLY on evidence in the CV and the job requirements. No bias toward names, gender, age, or schools prestige beyond stated requirements.
- Give a 1-3 sentence factual rationale citing CV evidence for each score.`;
    const scoreRes = await llmJson<{ scores: { criterionId: string; score: number; rationale: string }[] }>(
      scoreSys,
      `JOB TITLE: ${candidate.job.title}
JOB REQUIREMENTS: ${candidate.job.requirements}

CRITERIA:
${rubric}

PARSED CV:
${JSON.stringify(parsed).slice(0, 30000)}

Return JSON: {"scores":[{"criterionId":"...","score":0-100,"rationale":"..."}]} with one entry per criterion.`
    );
    scores = (scoreRes.scores || []).map((s) => {
      const crit = cvCriteria.find((c) => c.id === s.criterionId);
      return {
        criterionId: s.criterionId,
        name: crit?.name ?? "Criterion",
        score: clampScore(s.score),
        rationale: String(s.rationale || "").slice(0, 800),
      };
    });
    // fill any missing criteria
    for (const c of cvCriteria) {
      if (!scores.some((s) => s.criterionId === c.id)) {
        scores.push({ criterionId: c.id, name: c.name, score: 0, rationale: "The AI did not return a score for this criterion; treated as not evidenced." });
      }
    }
  }

  const overall = weightedMean(scores.map((s) => ({ score: s.score, weight: cvCriteria.find((c) => c.id === s.criterionId)?.weight ?? 1 })));

  await db.cvAnalysis.update({
    where: { candidateId },
    data: {
      status: "COMPLETED",
      progress: null,
      scoresJson: JSON.stringify(scores),
      overallScore: overall,
      processedAt: new Date(),
    },
  });
}

/** Optional freeform AI summary used on the report page. */
export async function cvSummary(parsed: CvParsed, scores: CriterionScore[]): Promise<string> {
  try {
    return await llmText(
      "You are a recruitment analyst. Summarise this candidate's CV evaluation in 3-4 neutral, factual sentences. Mention strongest evidence and biggest gaps only.",
      JSON.stringify({ parsed, scores })
    );
  } catch {
    return extractJson<string>(JSON.stringify(parsed)) ? "" : "";
  }
}
