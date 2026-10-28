import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireJobAccess } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { HttpError } from "@/lib/auth";
import { putObject, deleteObject } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_MANIFEST_BYTES = 80 * 1024 * 1024; // ~80 MB JSON
const MAX_FRAMES = 20;
const MAX_AUDIO_CHUNKS = 24;
const MAX_FRAME_B64 = 700 * 1024; // per frame data URL
const MAX_AUDIO_B64 = 4 * 1024 * 1024; // per 28s WAV chunk (base64)

/**
 * POST /api/upload/manifest — attach a BROWSER-PREPARED video manifest.
 *
 * The extracting browser sends evenly-spaced frames (JPEG data URLs) and
 * 16 kHz mono WAV audio chunks produced by the WebAudio pipeline in
 * src/lib/media-client.ts. The AI pipeline then needs zero server-side media
 * tooling, which keeps the platform deployable to edge runtimes.
 */
export async function POST(req: NextRequest) {
  return api(async () => {
    const raw = await req.text();
    if (raw.length > MAX_MANIFEST_BYTES) {
      throw new HttpError(413, "Analysis manifest too large");
    }
    let body: {
      candidateId?: string;
      manifest?: { durationSec?: number; frames?: { t: number; dataUrl: string }[]; audio?: { startSec: number; wavBase64: string }[] };
    };
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Invalid manifest JSON");
    }

    const candidateId = String(body.candidateId || "");
    const m = body.manifest;
    if (!candidateId || !m) throw new HttpError(400, "candidateId and manifest are required");

    const cand = await db.candidate.findUnique({ where: { id: candidateId }, include: { job: true } });
    if (!cand) throw new HttpError(404, "Candidate not found");
    const user = await requireJobAccess(cand.jobId);

    const frames = (Array.isArray(m.frames) ? m.frames : [])
      .filter((f) => f && typeof f.t === "number" && typeof f.dataUrl === "string" && f.dataUrl.startsWith("data:image/") && f.dataUrl.length <= MAX_FRAME_B64)
      .slice(0, MAX_FRAMES)
      .map((f) => ({ t: Math.round(f.t * 10) / 10, dataUrl: f.dataUrl }));

    const audio = (Array.isArray(m.audio) ? m.audio : [])
      .filter((a) => a && typeof a.startSec === "number" && typeof a.wavBase64 === "string" && a.wavBase64.length <= MAX_AUDIO_B64)
      .slice(0, MAX_AUDIO_CHUNKS)
      .map((a) => ({ startSec: Math.round(a.startSec), wavBase64: a.wavBase64 }));

    if (frames.length === 0 && audio.length === 0) {
      throw new HttpError(400, "Manifest contains no usable frames or audio");
    }

    const payload = JSON.stringify({
      version: 1,
      durationSec: Number(m.durationSec) || 0,
      frames,
      audio,
    });
    const stored = await putObject("precomputed", `${candidateId}-manifest.json`, Buffer.from(payload, "utf-8"));

    // free the previous manifest blobs (latest manifest wins)
    const oldAnalysis = await db.videoAnalysis.findUnique({
      where: { candidateId },
      select: { precomputedKey: true },
    });
    if (oldAnalysis?.precomputedKey && oldAnalysis.precomputedKey !== stored.storedPath) {
      await deleteObject(oldAnalysis.precomputedKey).catch(() => {});
    }

    await db.videoAnalysis.updateMany({
      where: { candidateId },
      data: {
        precomputedKey: stored.storedPath,
        // fresh evidence → discard ALL stage artifacts from prior runs so the
        // resumable pipeline never mixes old vision/ASR output with new media
        status: "PENDING",
        error: null,
        progress: "Queued",
        overallScore: null,
        scoresJson: null,
        observationsJson: null,
        transcript: null,
        segmentsJson: null,
        visualJson: null,
        updatedAt: new Date(),
      },
    });

    return {
      stored: true,
      frames: frames.length,
      audioChunks: audio.length,
      note: "Browser-prepared evidence attached — analysis will not need server media tools",
    };
  });
}
