import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { HttpError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ensureSeed } from "@/lib/seed";

export const runtime = "nodejs";

// GET /api/jobs — list openings visible to this user
export async function GET() {
  return api(async () => {
    await ensureSeed();
    const user = await requireRole("ADMIN", "INTERVIEWER");
    const jobs = await db.jobOpening.findMany({
      where: user.role === "ADMIN" ? {} : { createdById: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { candidates: true, criteria: true } },
        candidates: {
          include: { evaluation: true },
          where: { status: "ACTIVE" },
        },
      },
    });
    const shaped = jobs.map((j) => {
      const ranked = j.candidates.filter((c) => c.evaluation?.rank != null).length;
      const top = j.candidates
        .filter((c) => c.evaluation?.rank != null)
        .sort((a, b) => (a.evaluation!.rank ?? 99) - (b.evaluation!.rank ?? 99))[0];
      return {
        id: j.id,
        title: j.title,
        department: j.department,
        status: j.status,
        cvWeight: j.cvWeight,
        videoWeight: j.videoWeight,
        candidateVisibility: j.candidateVisibility,
        createdAt: j.createdAt,
        candidateCount: j._count.candidates,
        criterionCount: j._count.criteria,
        evaluatedCount: ranked,
        leader: top ? { name: top.fullName, score: top.evaluation!.finalScore } : null,
      };
    });
    return { jobs: shaped };
  });
}

// POST /api/jobs — create an opening with its initial criteria
export async function POST(req: NextRequest) {
  return api(async () => {
    const user = await requireRole("ADMIN", "INTERVIEWER");
    const body = (await req.json()) as {
      title?: string;
      department?: string;
      description?: string;
      requirements?: string;
      cvWeight?: number;
      videoWeight?: number;
      criteria?: { name: string; description: string; category: string; weight?: number; isMandatory?: boolean; minThreshold?: number }[];
    };
    if (!body.title?.trim()) throw new HttpError(400, "Job title is required");
    const cvWeight = Math.max(0, Math.min(100, Math.round(body.cvWeight ?? 40)));
    const videoWeight = 100 - cvWeight;

    const job = await db.jobOpening.create({
      data: {
        title: body.title.trim(),
        department: body.department?.trim() || null,
        description: body.description?.trim() || "",
        requirements: body.requirements?.trim() || "",
        cvWeight,
        videoWeight,
        createdById: user.id,
        createdByName: user.name,
        criteria: {
          create: (body.criteria && body.criteria.length
            ? body.criteria
            : [
                { name: "Relevant Experience", description: "Years and depth of directly relevant experience vs the requirements.", category: "CV", weight: 5 },
                { name: "Skills Match", description: "Coverage of the skills required for the role.", category: "CV", weight: 4 },
                { name: "Education & Qualifications", description: "Degree relevance and level, certifications.", category: "CV", weight: 3 },
                { name: "Confidence", description: "Self-assurance, composure, steady delivery.", category: "VIDEO", weight: 5, isMandatory: true, minThreshold: 60 },
                { name: "English Proficiency", description: "Fluency, grammar, clarity of spoken answers.", category: "VIDEO", weight: 4 },
                { name: "Professional Dressing", description: "Business-appropriate attire for the role.", category: "VIDEO", weight: 2 },
                { name: "Body Language & Eye Contact", description: "Posture, eye contact, fidgeting.", category: "VIDEO", weight: 3 },
                { name: "Answer Quality & Sentiment", description: "Relevance, structure and positivity of answers.", category: "VIDEO", weight: 4 },
              ]
          ).map((c) => ({
            name: c.name.trim(),
            description: c.description?.trim() || "",
            category: c.category === "CV" ? "CV" : "VIDEO",
            weight: Math.max(1, Math.min(10, c.weight ?? 1)),
            isMandatory: !!c.isMandatory,
            minThreshold: c.isMandatory ? Math.max(0, Math.min(100, c.minThreshold ?? 60)) : null,
          })),
        },
      },
    });
    await audit(user, "CREATE_JOB", "JOB", job.id, { title: job.title });
    return { jobId: job.id };
  });
}
