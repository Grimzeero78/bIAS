import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireJobAccess, requireRole } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { HttpError } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

// GET /api/candidates/[id] — single candidate detail (staff only)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireRole("ADMIN", "INTERVIEWER");
    const id = (await ctx.params).id;
    const cand = await db.candidate.findUnique({
      where: { id },
      include: { job: true, cvAnalysis: true, videoAnalysis: true, evaluation: true, documents: true },
    });
    if (!cand) throw new HttpError(404, "Candidate not found");
    if (user.role === "INTERVIEWER" && cand.job.createdById !== user.id) {
      throw new HttpError(403, "You do not own this candidate's job opening");
    }
    return { candidate: cand };
  });
}

// DELETE /api/candidates/[id] — remove a candidate (cascades documents + analyses)
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const id = (await ctx.params).id;
    const cand = await db.candidate.findUnique({ where: { id }, include: { job: true } });
    if (!cand) throw new HttpError(404, "Candidate not found");
    const user = await requireJobAccess(cand.jobId);
    // free stored file blobs before the cascade removes the document rows
    const docs = await db.document.findMany({ where: { candidateId: id }, select: { storedPath: true } });
    const manifests = await db.videoAnalysis.findUnique({ where: { candidateId: id }, select: { precomputedKey: true } });
    await db.candidate.delete({ where: { id } });
    const { deleteObject } = await import("@/lib/storage");
    await Promise.all([
      ...docs.map((d) => deleteObject(d.storedPath).catch(() => {})),
      manifests?.precomputedKey ? deleteObject(manifests.precomputedKey).catch(() => {}) : null,
    ]);
    await audit(user, "REMOVE_CANDIDATE", "CANDIDATE", id, { name: cand.fullName });
    return { deleted: true };
  });
}

// PATCH /api/candidates/[id] — disqualify / restore
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const id = (await ctx.params).id;
    const cand = await db.candidate.findUnique({ where: { id } });
    if (!cand) throw new HttpError(404, "Candidate not found");
    const user = await requireJobAccess(cand.jobId);
    const { status } = (await req.json()) as { status?: string };
    if (status !== "ACTIVE" && status !== "DISQUALIFIED") throw new HttpError(400, "status must be ACTIVE or DISQUALIFIED");
    const updated = await db.candidate.update({ where: { id }, data: { status } });
    await audit(user, status === "DISQUALIFIED" ? "DISQUALIFY_CANDIDATE" : "RESTORE_CANDIDATE", "CANDIDATE", id, { name: cand.fullName });
    return { candidate: { id: updated.id, status: updated.status } };
  });
}
