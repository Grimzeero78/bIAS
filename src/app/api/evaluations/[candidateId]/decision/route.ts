import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { HttpError } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const DECISIONS = ["ADVANCE", "HOLD", "REJECT"] as const;

/**
 * PATCH /api/evaluations/[candidateId]/decision — CEO FINAL CALL.
 *
 * The AI ranks and explains; ONLY the CEO (ADMIN) records the hiring decision.
 * Every change is stamped with the decider's name, a note and an audit entry,
 * so the final call is always attributable to a human.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ candidateId: string }> }) {
  return api(async () => {
    const user = await requireRole("ADMIN");
    const candidateId = (await ctx.params).candidateId;
    const body = (await req.json()) as { decision?: string | null; note?: string };

    const cand = await db.candidate.findUnique({
      where: { id: candidateId },
      include: { job: { select: { title: true } }, evaluation: true },
    });
    if (!cand) throw new HttpError(404, "Candidate not found");
    if (!cand.evaluation) throw new HttpError(400, "Run the evaluation first — there is nothing to decide on yet");

    let decisionValue: string | null = null;
    if (body.decision !== undefined && body.decision !== null && body.decision !== "") {
      const d = String(body.decision).toUpperCase();
      if (!(DECISIONS as readonly string[]).includes(d)) {
        throw new HttpError(400, "decision must be ADVANCE, HOLD or REJECT");
      }
      decisionValue = d;
    }

    const note = body.note ? String(body.note).slice(0, 2000) : null;
    const evaluation = await db.evaluation.update({
      where: { candidateId },
      data: {
        decision: decisionValue,
        decisionNote: decisionValue ? note : null,
        decidedByName: decisionValue ? user.name : null,
        decidedAt: decisionValue ? new Date() : null,
      },
    });

    await audit(user, decisionValue ? `CEO_DECISION_${decisionValue}` : "CEO_DECISION_CLEARED", "EVALUATION", candidateId, {
      candidate: cand.fullName,
      job: cand.job.title,
      rank: cand.evaluation.rank,
      finalScore: cand.evaluation.finalScore,
      note: note ?? undefined,
    });

    return {
      evaluation: {
        candidateId,
        decision: evaluation.decision,
        decisionNote: evaluation.decisionNote,
        decidedByName: evaluation.decidedByName,
        decidedAt: evaluation.decidedAt,
      },
    };
  });
}
