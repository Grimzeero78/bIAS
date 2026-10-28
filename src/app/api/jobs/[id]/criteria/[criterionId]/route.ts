import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireJobAccess } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { HttpError } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

// PATCH /api/jobs/[id]/criteria/[criterionId] — edit a criterion
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; criterionId: string }> }) {
  return api(async () => {
    const params = await ctx.params;
    await requireJobAccess(params.id);
    const b = (await req.json()) as {
      name?: string;
      description?: string;
      weight?: number;
      isMandatory?: boolean;
      minThreshold?: number;
    };
    const existing = await db.criterion.findUnique({ where: { id: params.criterionId } });
    if (!existing || existing.jobId !== params.id) throw new HttpError(404, "Criterion not found");
    const data: Record<string, unknown> = {};
    if (b.name?.trim()) data.name = b.name.trim();
    if (b.description !== undefined) data.description = b.description;
    if (b.weight !== undefined) data.weight = Math.max(1, Math.min(10, b.weight));
    if (b.isMandatory !== undefined) {
      data.isMandatory = !!b.isMandatory;
      data.minThreshold = b.isMandatory ? Math.max(0, Math.min(100, b.minThreshold ?? existing.minThreshold ?? 60)) : null;
    } else if (b.minThreshold !== undefined && existing.isMandatory) {
      data.minThreshold = Math.max(0, Math.min(100, b.minThreshold));
    }
    const crit = await db.criterion.update({ where: { id: params.criterionId }, data });
    await audit(await requireJobAccess(params.id), "UPDATE_CRITERION", "JOB", params.id, { criterion: crit.name });
    return { criterion: crit };
  });
}

// DELETE /api/jobs/[id]/criteria/[criterionId]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; criterionId: string }> }) {
  return api(async () => {
    const params = await ctx.params;
    const user = await requireJobAccess(params.id);
    const existing = await db.criterion.findUnique({ where: { id: params.criterionId } });
    if (!existing || existing.jobId !== params.id) throw new HttpError(404, "Criterion not found");
    await db.criterion.delete({ where: { id: params.criterionId } });
    await audit(user, "DELETE_CRITERION", "JOB", params.id, { criterion: existing.name });
    return { deleted: true };
  });
}
