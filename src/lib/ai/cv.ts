import { llmJson, llmText, extractJson, getZAI } from "./client";
import { extractTextFromCvBuffer } from "./cv-extract";
import { db } from "@/lib/db";
import { getObject } from "@/lib/storage";

/**
 * CV ANALYSIS PIPELINE
 * 1. Extract raw text from virtually ANY document format
 *    (pdf, docx, doc, txt, md, html, rtf, odt, pptx, xlsx, epub, pages,
 *     csv, xml, images via OCR — see cv-extract.ts)
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
  // pdf.js resolves its parsing worker through a COMPUTED dynamic import
  // ("import(this.workerSrc)") which bundlers cannot trace — on edge builds
  // the worker file is simply absent and extraction dies with
  // `Setting up fake worker failed: "No such module pdf.worker.mjs"`.
  // Preloading the worker module into globalThis.pdfjsWorker is pdf.js's
  // official main-thread escape hatch: _setupFakeWorkerGlobal checks it
  // FIRST and skips the dynamic import entirely. The literal specifier here
  // keeps the worker file traced into the deployment bundle.
  const g = globalThis as Record<string, unknown>;
  if (!g.pdfjsWorker) {
    g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  }
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

/** Image CVs (JPG/PNG/screenshots) → OCR through the vision model. */
async function visionOcr(buf: Buffer, mime: string): Promise<string> {
  const dataUri = `data:${mime};base64,${buf.toString("base64")}`;
  const zai = await getZAI();
  const res = await zai.chat.completions.createVision({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "This is a photo or screenshot of a CV/resume. Transcribe ALL visible text exactly — " +
              "name, contact details, summary, skills, education and every experience entry with dates. " +
              "Preserve reading order with line breaks. Output the transcription only, no commentary.",
          },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
    ],
  });
  const text = res.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("Vision OCR produced no text");
  return text;
}

export async function extractCvText(filename: string, storedPath: string): Promise<string> {
  // Storage-abstracted read — works on local disk AND Cloudflare D1/R2.
  const buf = await getObject(storedPath);
  const text = await extractTextFromCvBuffer(filename, buf, {
    extractPdf: extractPdfText,
    visionOcr,
  });
  if (text && text.trim().length > 0) return text.trim();
  throw new Error(`No readable text found in "${filename}"`);
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

/** Heartbeat stamp included in every stage write — drives stale-run resume. */
const hb = () => ({ updatedAt: new Date() });

export async function analyzeCv(candidateId: string): Promise<void> {
  // Full run (server fast path): execute stages until done.
  for (let i = 0; i < 10; i++) {
    if (await runCvStage(candidateId)) return;
  }
  throw new Error("CV pipeline did not converge");
}

/**
 * Execute AT MOST ONE CV pipeline stage. Returns true when finished.
 *
 * Stage 1: extraction + structural parse  (idempotent via parsedJson)
 * Stage 2: rubric scoring + finalize      (idempotent — rewrites scores)
 *
 * Each stage persists its output, so a run killed by the Workers waitUntil
 * lifetime cap resumes from where it stopped on the next poll.
 */
export async function runCvStage(candidateId: string): Promise<boolean> {
  const cvAnalysis = await db.cvAnalysis.findUnique({ where: { candidateId } });
  if (!cvAnalysis) throw new Error("CV analysis record missing");
  if (cvAnalysis.status === "COMPLETED") return true;

  const doc = await db.document.findFirst({
    where: { candidateId, type: "CV" },
    orderBy: { uploadedAt: "desc" },
  });
  if (!doc) throw new Error("No CV document uploaded");

  // ── Stage 1 — extraction + structured parse ──
  let parsed: CvParsed;
  if (cvAnalysis.parsedJson) {
    try {
      parsed = JSON.parse(cvAnalysis.parsedJson) as CvParsed;
    } catch {
      throw new Error("Stored CV parse is corrupt — re-upload the CV");
    }
  } else {
    await db.cvAnalysis.update({ where: { candidateId }, data: { status: "PROCESSING", progress: "Extracting text from document", error: null, ...hb() } });

    const rawText = await extractCvText(doc.filename, doc.storedPath);
    if (!rawText || rawText.length < 20) {
      throw new Error(
        "Could not extract readable text from the CV. If it is a scanned document or an image-only PDF, " +
        "export it to text/Word, or upload it as JPG/PNG photos (OCR is supported)"
      );
    }

    await db.cvAnalysis.update({ where: { candidateId }, data: { rawText: rawText.slice(0, 60000), progress: "AI parsing CV structure", ...hb() } });

    parsed = await llmJson<CvParsed>(PARSE_SYSTEM, `Parse this CV:\n\n${rawText.slice(0, 40000)}`);

    await db.cvAnalysis.update({
      where: { candidateId },
      data: { parsedJson: JSON.stringify(parsed), progress: "Scoring against job criteria", ...hb() },
    });
    return false; // scoring runs on the next stage call
  }

  // ── Stage 2 — rubric scoring against the job's CV criteria ──
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
      ...hb(),
    },
  });
  return true;
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
