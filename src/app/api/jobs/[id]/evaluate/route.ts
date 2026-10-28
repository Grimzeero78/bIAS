import { NextRequest } from "next/server";
import { requireJobAccess } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { audit } from "@/lib/audit";
import { rankAndJustify } from "@/lib/ai/scoring";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST /api/jobs/[id]/evaluate — (re)compute scores, ranks and AI justifications
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const jobId = (await ctx.params).id;
    const user = await requireJobAccess(jobId);
    const result = await rankAndJustify(jobId);
    await audit(user, "RUN_EVALUATION", "JOB", jobId, { candidatesEvaluated: result.evaluated });
    return result;
  });
}
