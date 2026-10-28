import { analyzeCv } from "./ai/cv";
import { analyzeVideo } from "./ai/video";
import { db } from "@/lib/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Background job runner.
 *  - Node deployments: plain fire-and-forget promises (the process outlives the
 *    request, so work continues in the background).
 *  - Cloudflare Workers: the async work is attached to the request lifetime via
 *    ctx.waitUntil(). As a safety net for the platform's lifetime cap, the
 *    analysis status endpoint re-enqueues jobs that are still PENDING, so a
 *    long analysis resumes on the next poll.
 * The UI polls /api/analysis/[candidateId] either way.
 */

const running = new Set<string>();

function key(candidateId: string, kind: "CV" | "VIDEO") {
  return `${kind}:${candidateId}`;
}

/** Shared executor for both the waitUntil fast path and the inline stepper. */
async function executeJob(candidateId: string, kind: "CV" | "VIDEO") {
  const k = key(candidateId, kind);
  try {
    if (kind === "CV") {
      await db.cvAnalysis.upsert({
        where: { candidateId },
        create: { candidateId, status: "PENDING" },
        update: { status: "PENDING", error: null, progress: "Queued" },
      });
      await analyzeCv(candidateId);
    } else {
      await db.videoAnalysis.upsert({
        where: { candidateId },
        create: { candidateId, status: "PENDING" },
        update: { status: "PENDING", error: null, progress: "Queued" },
      });
      await analyzeVideo(candidateId);
    }
  } catch (e) {
    console.error(`[pipeline] ${k} failed:`, e);
    const error = e instanceof Error ? e.message.slice(0, 500) : "Unknown processing error";
    try {
      if (kind === "CV") {
        await db.cvAnalysis.update({ where: { candidateId }, data: { status: "FAILED", progress: null, error } });
      } else {
        await db.videoAnalysis.update({ where: { candidateId }, data: { status: "FAILED", progress: null, error } });
      }
    } catch {
      /* record already gone */
    }
  } finally {
    running.delete(k);
  }
}

export function enqueueAnalysis(candidateId: string, kind: "CV" | "VIDEO") {
  const k = key(candidateId, kind);
  if (running.has(k)) return;
  running.add(k);

  // On Cloudflare, keep the promise alive beyond the response via waitUntil.
  try {
    const ctx = getCloudflareContext().ctx as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
    if (ctx?.waitUntil) {
      ctx.waitUntil(executeJob(candidateId, kind));
      return;
    }
  } catch {
    /* not on Cloudflare */
  }
  void executeJob(candidateId, kind);
}

export function isRunning(candidateId: string, kind: "CV" | "VIDEO") {
  return running.has(key(candidateId, kind));
}

/**
 * Inline stepper for the analysis status endpoint: runs the pipeline to the
 * next persist point (bounded AI work) in the poll request itself. Used to
 * re-drive runs whose waitUntil lifetime was cut by the Workers runtime —
 * their row is left PROCESSING with a stale heartbeat, which waitUntil
 * re-enqueueing alone can never fix.
 */
export async function runInline(candidateId: string, kind: "CV" | "VIDEO"): Promise<void> {
  await executeJob(candidateId, kind);
}
