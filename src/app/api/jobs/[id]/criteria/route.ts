import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireJobAccess } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { HttpError } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

// POST /api/jobs/[id]/criteria — add an analysis criterion
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireJobAccess((await ctx.params).id);
    const jobId = (await ctx.params).id;
    const b = (await req.json()) as {
      name?: string;
      description?: string;
      category?: string;
      weight?: number;
      isMandatory?: boolean;
      minThreshold?: number;
    };
    if (!b.name?.trim()) throw new HttpError(400, "Criterion name is required");
    const isMandatory = !!b.isMandatory;
    const crit = await db.criterion.create({
      data: {
        jobId,
        name: b.name.trim(),
        description: b.description?.trim() || "",
        category: b.category === "CV" ? "CV" : "VIDEO",
        weight: Math.max(1, Math.min(10, b.weight ?? 1)),
        isMandatory,
        minThreshold: isMandatory ? Math.max(0, Math.min(100, b.minThreshold ?? 60)) : null,
      },
    });
    await audit(user, "ADD_CRITERION", "JOB", jobId, { criterion: crit.name, category: crit.category });
    return { criterion: crit };
  });
}
