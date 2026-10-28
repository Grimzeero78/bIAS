import { analyzeCv } from "./ai/cv";
import { analyzeVideo } from "./ai/video";
import { db } from "@/lib/db";

/**
 * Minimal in-process background job runner.
 * Uploads enqueue analysis work here; the UI polls /api/analysis/[candidateId].
 * In production this maps to a queue worker (BullMQ/Celery) — the job bodies
 * are pure functions so they can be lifted out unchanged.
 */

const running = new Set<string>();

function key(candidateId: string, kind: "CV" | "VIDEO") {
  return `${kind}:${candidateId}`;
}

export function enqueueAnalysis(candidateId: string, kind: "CV" | "VIDEO") {
  const k = key(candidateId, kind);
  if (running.has(k)) return;
  running.add(k);

  const model = kind === "CV" ? db.cvAnalysis : db.videoAnalysis;

  (async () => {
    try {
      await model.upsert({
        where: { candidateId },
        create: { candidateId, status: "PENDING" },
        update: { status: "PENDING", error: null, progress: "Queued" },
      });
      if (kind === "CV") await analyzeCv(candidateId);
      else await analyzeVideo(candidateId);
    } catch (e) {
      console.error(`[pipeline] ${k} failed:`, e);
      await model
        .update({
          where: { candidateId },
          data: {
            status: "FAILED",
            progress: null,
            error: e instanceof Error ? e.message.slice(0, 500) : "Unknown processing error",
          },
        })
        .catch(() => {});
    } finally {
      running.delete(k);
    }
  })();
}

export function isRunning(candidateId: string, kind: "CV" | "VIDEO") {
  return running.has(key(candidateId, kind));
}
