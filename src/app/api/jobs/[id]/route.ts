import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireJobAccess } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { HttpError } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

function parse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

// GET /api/jobs/[id] — full workspace payload (job, criteria, candidates, analyses, evaluations)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireJobAccess((await ctx.params).id);
    const job = await db.jobOpening.findUnique({
      where: { id: (await ctx.params).id },
      include: {
        criteria: { orderBy: [{ category: "asc" }, { weight: "desc" }] },
        candidates: {
          orderBy: { createdAt: "asc" },
          include: {
            cvAnalysis: true,
            videoAnalysis: true,
            evaluation: true,
            documents: true,
          },
        },
      },
    });
    if (!job) throw new HttpError(404, "Job not found");

    const candidates = job.candidates.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      accessCode: c.accessCode,
      status: c.status,
      createdAt: c.createdAt,
      documents: c.documents.map((d) => ({ id: d.id, type: d.type, filename: d.filename, sizeBytes: d.sizeBytes, uploadedAt: d.uploadedAt })),
      cv: c.cvAnalysis
        ? {
            status: c.cvAnalysis.status,
            progress: c.cvAnalysis.progress,
            error: c.cvAnalysis.error,
            overallScore: c.cvAnalysis.overallScore,
            parsed: parse(c.cvAnalysis.parsedJson, null),
            scores: parse(c.cvAnalysis.scoresJson, []),
          }
        : null,
      video: c.videoAnalysis
        ? {
            status: c.videoAnalysis.status,
            progress: c.videoAnalysis.progress,
            error: c.videoAnalysis.error,
            durationSec: c.videoAnalysis.durationSec,
            overallScore: c.videoAnalysis.overallScore,
            transcript: c.videoAnalysis.transcript,
            scores: parse(c.videoAnalysis.scoresJson, []),
            observations: parse(c.videoAnalysis.observationsJson, []),
          }
        : null,
      evaluation: c.evaluation
        ? {
            cvScore: c.evaluation.cvScore,
            videoScore: c.evaluation.videoScore,
            finalScore: c.evaluation.finalScore,
            rank: c.evaluation.rank,
            justification: c.evaluation.justification,
            improvement: parse(c.evaluation.improvementJson, null),
            decision: c.evaluation.decision,
            decisionNote: c.evaluation.decisionNote,
            decidedByName: c.evaluation.decidedByName,
            decidedAt: c.evaluation.decidedAt,
            flags: parse(c.evaluation.flagsJson, { breaches: [] }),
            computedAt: c.evaluation.computedAt,
          }
        : null,
    }));

    // ranking order (null ranks excluded)
    const ranking = candidates
      .filter((c) => c.evaluation?.rank != null && c.status === "ACTIVE")
      .sort((a, b) => (a.evaluation!.rank ?? 99) - (b.evaluation!.rank ?? 99))
      .map((c) => ({ candidateId: c.id, rank: c.evaluation!.rank, finalScore: c.evaluation!.finalScore }));

    await audit(user, "VIEW_JOB", "JOB", job.id, { title: job.title });

    return {
      job: {
        id: job.id,
        title: job.title,
        department: job.department,
        description: job.description,
        requirements: job.requirements,
        cvWeight: job.cvWeight,
        videoWeight: job.videoWeight,
        status: job.status,
        candidateVisibility: job.candidateVisibility,
        createdAt: job.createdAt,
      },
      criteria: job.criteria,
      candidates,
      ranking,
    };
  });
}

// PATCH /api/jobs/[id] — update settings
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireJobAccess((await ctx.params).id);
    const jobId = (await ctx.params).id;
    const body = (await req.json()) as {
      title?: string;
      department?: string;
      description?: string;
      requirements?: string;
      cvWeight?: number;
      status?: string;
      candidateVisibility?: boolean;
    };
    const data: Record<string, unknown> = {};
    if (body.title?.trim()) data.title = body.title.trim();
    if (body.department !== undefined) data.department = body.department?.trim() || null;
    if (body.description !== undefined) data.description = body.description;
    if (body.requirements !== undefined) data.requirements = body.requirements;
    if (body.candidateVisibility !== undefined) data.candidateVisibility = !!body.candidateVisibility;
    if (body.status === "OPEN" || body.status === "CLOSED") data.status = body.status;
    if (body.cvWeight !== undefined) {
      const cvWeight = Math.max(0, Math.min(100, Math.round(body.cvWeight)));
      data.cvWeight = cvWeight;
      data.videoWeight = 100 - cvWeight;
    }
    const job = await db.jobOpening.update({ where: { id: jobId }, data });
    await audit(user, "UPDATE_JOB", "JOB", jobId, data);
    return { job: { id: job.id, cvWeight: job.cvWeight, videoWeight: job.videoWeight, status: job.status, candidateVisibility: job.candidateVisibility } };
  });
}
