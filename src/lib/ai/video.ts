import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, readdir, rm, mkdir } from "fs/promises";
import path from "path";
import { llmJson } from "./client";
import { getZAI, extractJson } from "./client";
import type { VisionMultimodalContentItem } from "z-ai-web-dev-sdk";
import { clampScore, weightedMean, type CriterionScore } from "./cv";
import { db } from "@/lib/db";
import { getObject } from "@/lib/storage";

const exec = promisify(execFile);

/** Browser-prepared manifest shape (see src/lib/media-client.ts). */
interface PrecomputedManifest {
  version: number;
  durationSec: number;
  frames: { t: number; dataUrl: string }[];
  audio: { startSec: number; wavBase64: string }[];
}

async function loadPrecomputed(key: string | null | undefined): Promise<PrecomputedManifest | null> {
  if (!key) return null;
  try {
    const buf = await getObject(key);
    const parsed = JSON.parse(buf.toString("utf-8")) as PrecomputedManifest;
    if (parsed && (parsed.frames?.length || parsed.audio?.length)) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * VIDEO INTERVIEW ANALYSIS PIPELINE
 *
 * A1. ffprobe                → duration / has-audio
 * A2. ffmpeg                 → up to 12 evenly-spaced JPEG frames (timestamps recorded)
 * A3. ffmpeg                 → mono 16 kHz WAV, split into 60 s chunks
 * A4. ASR per chunk          → transcript segments with chunk-accurate timestamps
 * A5. Vision LLM (frames)    → visual findings: posture, eye contact, dressing,
 *                              confidence signals, fidgeting — with frame timestamps
 * A6. Fusion LLM (text)      → merges visual findings + transcript, scores every
 *                              VIDEO criterion 0-100 and emits timestamped evidence
 * Overall = weighted mean of criterion scores.
 *
 * Analysis window is capped to the first 10 minutes to keep processing time sane.
 */

const WORK_ROOT = path.join(process.cwd(), "storage", "tmp");
const MAX_ANALYSIS_SEC = 600;
const MAX_FRAMES = 12;
// The ASR service accepts audio up to ~30 s per request — chunk at 28 s to stay safely inside the limit.
const CHUNK_SEC = 28;
const MAX_CHUNKS = 16; // ≈ first 7.5 minutes of speech

function srcPath(storedPath: string) {
  return path.join(process.cwd(), "storage", "uploads", storedPath);
}

async function ffprobeDuration(file: string): Promise<{ duration: number; hasAudio: boolean }> {
  try {
    const { stdout } = await exec("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-select_streams", "a",
      "-show_entries", "stream=codec_type",
      "-of", "json", file,
    ], { timeout: 30000 });
    const j = JSON.parse(stdout);
    const duration = parseFloat(j?.format?.duration || "0");
    const hasAudio = (j?.streams || []).some((s: { codec_type?: string }) => s.codec_type === "audio");
    return { duration: Number.isFinite(duration) ? duration : 0, hasAudio };
  } catch {
    return { duration: 0, hasAudio: true };
  }
}

interface Frame { t: number; file: string; dataUrl: string }

async function extractFrames(file: string, work: string, duration: number): Promise<Frame[]> {
  await mkdir(work, { recursive: true });
  const span = Math.min(duration > 5 ? duration : MAX_ANALYSIS_SEC, MAX_ANALYSIS_SEC);
  // interval so we end up with ~MAX_FRAMES frames across the span
  const interval = Math.max(span / MAX_FRAMES, 5);
  await exec("ffmpeg", [
    "-y", "-i", file,
    "-vf", `fps=1/${interval},scale=768:-2`,
    "-frames:v", String(MAX_FRAMES),
    "-q:v", "4",
    path.join(work, "frame_%02d.jpg"),
  ], { timeout: 120000 });

  const files = (await readdir(work)).filter((f) => f.startsWith("frame_")).sort();
  const frames: Frame[] = [];
  for (let i = 0; i < files.length; i++) {
    const buf = await readFile(path.join(work, files[i]));
    frames.push({
      t: Math.round(i * interval * 10) / 10,
      file: files[i],
      dataUrl: `data:image/jpeg;base64,${buf.toString("base64")}`,
    });
  }
  return frames;
}

async function extractAudioChunks(file: string, work: string, hasAudio: boolean): Promise<{ file: string; start: number }[]> {
  if (!hasAudio) return [];
  try {
    await exec("ffmpeg", [
      "-y", "-i", file, "-vn",
      "-ac", "1", "-ar", "16000", "-acodec", "pcm_s16le",
      "-t", String(MAX_ANALYSIS_SEC),
      "-f", "segment", "-segment_time", String(CHUNK_SEC),
      path.join(work, "aud_%03d.wav"),
    ], { timeout: 180000 });
    const files = (await readdir(work)).filter((f) => f.startsWith("aud_")).sort().slice(0, MAX_CHUNKS);
    return files.map((f, i) => ({ file: path.join(work, f), start: i * CHUNK_SEC }));
  } catch (e) {
    console.error("[video] audio extraction failed", e);
    return [];
  }
}

async function transcribeChunks(chunks: { file: string; start: number }[]): Promise<{ start: number; end: number; text: string }[]> {
  const zai = await getZAI();
  const segments: { start: number; end: number; text: string }[] = [];
  for (const c of chunks) {
    try {
      const buf = await readFile(c.file);
      const res = await zai.audio.asr.create({ file_base64: buf.toString("base64") });
      const text = (res?.text || "").trim();
      if (text) segments.push({ start: c.start, end: c.start + CHUNK_SEC, text });
    } catch (e) {
      console.error(`[video] ASR chunk @${c.start}s failed:`, e instanceof Error ? e.message : e);
    }
  }
  return segments;
}

async function transcribeBase64Chunks(chunks: { startSec: number; wavBase64: string }[]): Promise<{ start: number; end: number; text: string }[]> {
  const zai = await getZAI();
  const segments: { start: number; end: number; text: string }[] = [];
  for (const c of chunks) {
    try {
      const res = await zai.audio.asr.create({ file_base64: c.wavBase64 });
      const text = (res?.text || "").trim();
      if (text) segments.push({ start: c.startSec, end: c.startSec + CHUNK_SEC, text });
    } catch (e) {
      console.error(`[video] ASR chunk @${c.startSec}s failed:`, e instanceof Error ? e.message : e);
    }
  }
  return segments;
}

const VISUAL_SYSTEM = `You are a professional interview body-language analyst. You receive a sequence of frames from a recorded video interview, each labelled with its timestamp in seconds.
Analyse ONLY what is visually observable. Return JSON:
{"person_present": boolean,
 "dressing": string (describe attire & professionalism),
 "posture": string,
 "eye_contact": string (note the candidate looking at/away from camera),
 "gestures_fidgeting": string,
 "confidence_signals": string,
 "observations": [{"t": number (seconds, use the frame timestamps), "category": string (one of Confidence|Dressing|Body Language|Engagement|Other), "observation": string (short factual note)}]
Give 6-14 observations spread across the timeline. Be objective and neutral; never guess identity, gender-appropriateness of clothing beyond professionalism, ethnicity or age.`;

async function visionPass(frames: Frame[]): Promise<unknown> {
  if (!frames.length) throw new Error("No frames could be extracted from the video");
  const frameLabels = frames.map((f, i) => `Frame ${i + 1} = t=${f.t}s`).join("; ");
  const zai = await getZAI();
  const content: VisionMultimodalContentItem[] = [
    {
      type: "text",
      text: `These are ${frames.length} sequential frames from a recorded job interview video.\n${frameLabels}\n\n${VISUAL_SYSTEM}`,
    },
    ...frames.map((f) => ({ type: "image_url" as const, image_url: { url: f.dataUrl } })),
  ];
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // SDK's type marks `model` required, but the service accepts the default
      // when omitted — cast keeps runtime payload identical to the working contract.
      const body = {
        messages: [{ role: "user", content }],
        thinking: { type: "disabled" },
      } as unknown as Parameters<typeof zai.chat.completions.createVision>[0];
      const res = await zai.chat.completions.createVision(body);
      const raw = res.choices[0]?.message?.content || "";
      const parsed = extractJson<unknown>(raw);
      if (parsed) return parsed;
      throw new Error("vision returned unparseable JSON");
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Vision analysis failed");
}

const FUSION_SYSTEM = `You are an impartial interview assessment engine. You receive:
(a) VISUAL FINDINGS from a frame-analysis pass (timestamped), and
(b) a TIMESTAMPED TRANSCRIPT of the spoken audio.
Your job: score the candidate on each listed VIDEO criterion (0-100), and produce a timestamped evidence list.

Scoring rules:
- 50 = barely acceptable for a professional role, 80+ = strong, <40 = a real weakness.
- Score ONLY from the provided evidence. No speculation beyond it.
- Criteria that are purely verbal (e.g. English proficiency, answer quality) must be scored from the transcript; if there is NO transcript at all, score verbal criteria at 45 with the rationale "no clear audio transcript available" and flag it.
- Dressing/attire and visual posture criteria come from the visual findings.
- Blend criteria like Confidence from both modalities.
Return JSON:
{"scores": [{"criterionId": "...", "score": 0-100, "rationale": "1-3 factual sentences citing evidence"}],
 "observations": [{"t": number_seconds, "category": string, "observation": string, "quote": string_optional_spoken_quote}],
 "overall_impression": string}
Provide 8-20 observations total, spread across timestamps, each traceable to a frame timestamp or transcript segment.`;

export async function analyzeVideo(candidateId: string): Promise<void> {
  // Full run (server fast path): execute stages until done.
  for (let i = 0; i < 80; i++) {
    if (await runVideoStage(candidateId)) return;
  }
  throw new Error("Video pipeline did not converge");
}

/**
 * Execute AT MOST ONE video pipeline stage. Returns true when finished.
 *
 * Manifest path (edge):
 *   Stage 1: vision pass over frames        (idempotent via visualJson)
 *   Stage 2: ONE ASR chunk per call         (idempotent via segmentsJson cursor)
 *   Stage 3: fusion scoring + finalize      (idempotent — rewrites scores)
 *
 * Each stage persists its output, so a run killed by the Workers waitUntil
 * lifetime cap resumes exactly where it stopped on the next poll.
 */
export async function runVideoStage(candidateId: string): Promise<boolean> {
  const analysis = await db.videoAnalysis.findUnique({ where: { candidateId } });
  if (!analysis) throw new Error("Video analysis record missing");
  if (analysis.status === "COMPLETED") return true;

  // Browser-prepared evidence takes priority and does NOT require a raw video
  // document (evidence-only uploads via /api/upload/manifest are legitimate —
  // e.g. when a recording is too large to store on the D1 driver).
  const pre = await loadPrecomputed(analysis.precomputedKey);
  const doc = await db.document.findFirst({
    where: { candidateId, type: "VIDEO" },
    orderBy: { uploadedAt: "desc" },
  });
  if (!pre && !doc) throw new Error("No interview video uploaded");

  const work = path.join(WORK_ROOT, candidateId);
  try {
    if (pre) return await runManifestStage(candidateId, pre);
    // Raw-video path — only meaningful on full servers (ffmpeg available);
    // completes in one call.
    return await runFfmpegAll(candidateId, doc!.storedPath, work);
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** Edge-friendly path: consume frames + audio prepared by the browser. */
async function runManifestStage(candidateId: string, pre: PrecomputedManifest): Promise<boolean> {
  const current = await db.videoAnalysis.findUniqueOrThrow({ where: { candidateId } });

  // ── Stage 1 — vision pass (resumes via persisted visualJson) ──
  let visual: unknown = null;
  if (current.visualJson) {
    try {
      visual = JSON.parse(current.visualJson);
    } catch {
      visual = null;
    }
  }
  if (!visual) {
    await db.videoAnalysis.update({
      where: { candidateId },
      data: {
        status: "PROCESSING",
        error: null,
        durationSec: pre.durationSec || null,
        framesJson: JSON.stringify(pre.frames.map((f) => ({ t: f.t }))),
        progress: "AI visual analysis of frames",
        updatedAt: new Date(),
      },
    });
    const frames: Frame[] = pre.frames.map((f) => ({ t: f.t, file: "(browser)", dataUrl: f.dataUrl }));
    visual = await visionPass(frames);
    await db.videoAnalysis.update({
      where: { candidateId },
      data: {
        visualJson: JSON.stringify(visual),
        progress: pre.audio.length ? "Transcribing speech (ASR)" : "Fusing evidence into criterion scores",
        updatedAt: new Date(),
      },
    });
    return false; // next stage call: ASR or fusion
  }

  // ── Stage 2 — ASR, ONE chunk per call (cursor = segmentsJson length) ──
  let segments: { start: number; end: number; text: string }[] = [];
  if (current.segmentsJson) {
    try {
      segments = JSON.parse(current.segmentsJson) as { start: number; end: number; text: string }[];
    } catch {
      segments = [];
    }
  }
  if (pre.audio.length > segments.length) {
    await db.videoAnalysis.update({
      where: { candidateId },
      data: {
        status: "PROCESSING",
        error: null,
        progress: `Transcribing speech (ASR) ${segments.length + 1}/${pre.audio.length}`,
        updatedAt: new Date(),
      },
    });
    const c = pre.audio[segments.length];
    try {
      const zai = await getZAI();
      const res = await zai.audio.asr.create({ file_base64: c.wavBase64 });
      const text = (res?.text || "").trim();
      if (text) segments.push({ start: c.startSec, end: c.startSec + CHUNK_SEC, text });
      else segments.push({ start: c.startSec, end: c.startSec + CHUNK_SEC, text: "" });
    } catch (e) {
      // Advance the cursor even on failure (empty placeholder) so a
      // permanently broken chunk cannot wedge the pipeline in a retry loop.
      console.error(`[video] ASR chunk @${c.startSec}s failed:`, e instanceof Error ? e.message : e);
      segments.push({ start: c.startSec, end: c.startSec + CHUNK_SEC, text: "" });
    }
    const spoken = segments.filter((s) => s.text);
    await db.videoAnalysis.update({
      where: { candidateId },
      data: {
        segmentsJson: JSON.stringify(segments),
        transcript: spoken.map((s) => `[${fmtT(s.start)}] ${s.text}`).join("\n").slice(0, 50000),
        progress: pre.audio.length > segments.length ? `Transcribing speech (ASR) ${segments.length + 1}/${pre.audio.length}` : "Fusing evidence into criterion scores",
        updatedAt: new Date(),
      },
    });
    return false; // next stage call: more ASR or fusion
  }

  // ── Stage 3 — fusion + finalize ──
  await db.videoAnalysis.update({ where: { candidateId }, data: { progress: "Fusing evidence into criterion scores", updatedAt: new Date() } });
  await finishVideoAnalysis(candidateId, visual, segments.filter((s) => s.text), pre.audio.length > 0);
  return true;
}

/** Full-server path (sandbox / API clients): ffmpeg frames + audio then ASR. */
async function runFfmpegAll(candidateId: string, storedPath: string, work: string): Promise<boolean> {
  await db.videoAnalysis.update({ where: { candidateId }, data: { status: "PROCESSING", progress: "Inspecting video file", error: null, updatedAt: new Date() } });
  await mkdir(work, { recursive: true });
  const src = srcPath(storedPath);
  const { duration, hasAudio } = await ffprobeDuration(src);
  await db.videoAnalysis.update({ where: { candidateId }, data: { durationSec: duration || null, progress: "Extracting interview frames" } });

  const frames = await extractFrames(src, work, duration).catch((e: unknown) => {
    // Edge runtimes have no ffmpeg — surface an actionable message instead of
    // a bare spawn/ENOENT failure.
    throw new Error(
      `Could not extract frames from the recording (${e instanceof Error ? e.message.slice(0, 120) : "unknown"}). On edge deployments re-upload the video from the browser so analysis evidence is prepared client-side.`
    );
  });
  await db.videoAnalysis.update({
    where: { candidateId },
    data: { framesJson: JSON.stringify(frames.map((f) => ({ t: f.t }))), progress: "AI visual analysis of frames" },
  });

  const visual = await visionPass(frames);

  await db.videoAnalysis.update({ where: { candidateId }, data: { progress: "Transcribing speech (ASR)" } });
  const chunks = await extractAudioChunks(src, work, hasAudio);
  const segments = await transcribeChunks(chunks);
  await finishVideoAnalysis(candidateId, visual, segments, chunks.length > 0);
  return true;
}

async function finishVideoAnalysis(
  candidateId: string,
  visual: unknown,
  segments: { start: number; end: number; text: string }[],
  hadAudioChunks = true
): Promise<void> {
  if (segments.length > 0 || hadAudioChunks) {
    await db.videoAnalysis.update({
      where: { candidateId },
      data: {
        transcript: segments.map((s) => `[${fmtT(s.start)}] ${s.text}`).join("\n").slice(0, 50000),
        segmentsJson: JSON.stringify(segments),
        progress: "Fusing evidence into criterion scores",
      },
    });
  } else {
    await db.videoAnalysis.update({ where: { candidateId }, data: { progress: "Fusing evidence into criterion scores" } });
  }

  const candidate = await db.candidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { job: { include: { criteria: true } } },
  });
  const videoCriteria = candidate.job.criteria.filter((c) => c.category === "VIDEO");

  const rubric = videoCriteria.map((c, i) => `${i + 1}. id=${c.id} | ${c.name} (weight ${c.weight}) — ${c.description}`).join("\n");
  const transcript = segments.map((s) => `[${s.start}s-${s.end}s] ${s.text}`).join("\n").slice(0, 24000);

  const fusion = await llmJson<{
    scores: { criterionId: string; score: number; rationale: string }[];
    observations: { t: number; category: string; observation: string; quote?: string }[];
    overall_impression: string;
  }>(
    FUSION_SYSTEM,
    `JOB: ${candidate.job.title}
CRITERIA:
${rubric}

VISUAL FINDINGS:
${JSON.stringify(visual).slice(0, 10000)}

TRANSCRIPT (empty means no usable audio):
${transcript || "(no transcript — audio missing or unintelligible)"}

Return the JSON now.`
  );

  const scores: CriterionScore[] = (fusion.scores || []).map((s) => {
    const crit = videoCriteria.find((c) => c.id === s.criterionId);
    return {
      criterionId: s.criterionId,
      name: crit?.name ?? "Criterion",
      score: clampScore(s.score),
      rationale: String(s.rationale || "").slice(0, 800),
    };
  });
  for (const c of videoCriteria) {
    if (!scores.some((s) => s.criterionId === c.id)) {
      scores.push({ criterionId: c.id, name: c.name, score: 0, rationale: "No score returned by AI for this criterion; treated as not evidenced." });
    }
  }

  const observations = (fusion.observations || [])
    .filter((o) => o && typeof o.observation === "string")
    .map((o) => ({
      t: Math.max(0, Math.round((Number(o.t) || 0) * 10) / 10),
      category: String(o.category || "General").slice(0, 40),
      observation: String(o.observation).slice(0, 400),
      quote: o.quote ? String(o.quote).slice(0, 300) : undefined,
    }))
    .sort((a, b) => a.t - b.t)
    .slice(0, 60);

  const overall = weightedMean(
    scores.map((s) => ({ score: s.score, weight: videoCriteria.find((c) => c.id === s.criterionId)?.weight ?? 1 }))
  );

  await db.videoAnalysis.update({
    where: { candidateId },
    data: {
      status: "COMPLETED",
      progress: null,
      scoresJson: JSON.stringify(scores),
      observationsJson: JSON.stringify(observations),
      overallScore: overall,
      processedAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

export function fmtT(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
