import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser, getSessionUser } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { HttpError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { enqueueAnalysis, isRunning } from "@/lib/pipeline";

export const runtime = "nodejs";

function parse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

// GET /api/analysis/[candidateId] — AI status + results (polled by the UI)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ candidateId: string }> }) {
  return api(async () => {
    const user = await requireUser();
    const candidateId = (await ctx.params).candidateId;

    const cand = await db.candidate.findUnique({
      where: { id: candidateId },
      include: {
        job: { select: { id: true, title: true, createdById: true, candidateVisibility: true, cvWeight: true, videoWeight: true } },
        cvAnalysis: true,
        videoAnalysis: true,
        evaluation: true,
        documents: true,
      },
    });
    if (!cand) throw new HttpError(404, "Candidate not found");

    if (user.role === "CANDIDATE") {
      if (user.candidateId !== candidateId) throw new HttpError(403, "Access denied");
      if (!cand.job.candidateVisibility) throw new HttpError(403, "The employer has not enabled candidate score visibility for this role");
    } else if (user.role === "INTERVIEWER" && cand.job.createdById !== user.id) {
      throw new HttpError(403, "You do not own this candidate's job opening");
    }

    // Self-heal on serverless: a PENDING job with nothing in flight (e.g. its
    // waitUntil lifetime expired on Workers) resumes on this poll.
    if (cand.cvAnalysis?.status === "PENDING" && !isRunning(candidateId, "CV")) {
      enqueueAnalysis(candidateId, "CV");
    }
    if (cand.videoAnalysis?.status === "PENDING" && !isRunning(candidateId, "VIDEO")) {
      enqueueAnalysis(candidateId, "VIDEO");
    }

    if (user.role === "CANDIDATE" && cand.evaluation) {
      await audit(user, "VIEW_OWN_REPORT", "CANDIDATE", candidateId);
    }

    // ranking context: "position X of N" for the candidate's own cohort
    const rankedCount = await db.evaluation.count({
      where: { candidate: { jobId: cand.jobId, status: "ACTIVE" }, rank: { not: null } },
    });

    return {
      candidate: { id: cand.id, fullName: cand.fullName, status: cand.status },
      job: cand.job,
      documents: cand.documents.map((d) => ({ id: d.id, type: d.type, filename: d.filename })),
      cv: cand.cvAnalysis && {
        status: cand.cvAnalysis.status,
        progress: cand.cvAnalysis.progress,
        error: cand.cvAnalysis.error,
        overallScore: cand.cvAnalysis.overallScore,
        parsed: parse(cand.cvAnalysis.parsedJson, null),
        scores: parse(cand.cvAnalysis.scoresJson, []),
      },
      video: cand.videoAnalysis && {
        status: cand.videoAnalysis.status,
        progress: cand.videoAnalysis.progress,
        error: cand.videoAnalysis.error,
        durationSec: cand.videoAnalysis.durationSec,
        overallScore: cand.videoAnalysis.overallScore,
        transcript: cand.videoAnalysis.transcript,
        scores: parse(cand.videoAnalysis.scoresJson, []),
        observations: parse(cand.videoAnalysis.observationsJson, []),
      },
      evaluation: cand.evaluation && {
        cvScore: cand.evaluation.cvScore,
        videoScore: cand.evaluation.videoScore,
        finalScore: cand.evaluation.finalScore,
        rank: cand.evaluation.rank,
        rankedTotal: rankedCount,
        justification: cand.evaluation.justification,
        improvement: parse(cand.evaluation.improvementJson, null),
        decision: cand.evaluation.decision,
        decisionNote: user.role === "CANDIDATE" ? null : cand.evaluation.decisionNote,
        decidedByName: user.role === "CANDIDATE" ? null : cand.evaluation.decidedByName,
        decidedAt: cand.evaluation.decidedAt,
        flags: parse(cand.evaluation.flagsJson, { breaches: [] }),
        computedAt: cand.evaluation.computedAt,
      },
    };
  });
}
