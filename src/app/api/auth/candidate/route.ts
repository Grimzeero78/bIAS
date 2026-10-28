import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { setSessionCookie, type Role } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { HttpError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ensureSeed } from "@/lib/seed";

export const runtime = "nodejs";

/**
 * Candidate portal login — ACCESS CODE ONLY (no email by design).
 * Every applicant is issued a personal code (e.g. 7KQM2XRD) when they are
 * registered for an interview. Entering it reveals their full transparent
 * results: scores, what the panel saw, where they fell short, and how to grow.
 */
export async function POST(req: NextRequest) {
  return api(async () => {
    await ensureSeed();
    const { accessCode } = (await req.json()) as { accessCode?: string };
    if (!accessCode || typeof accessCode !== "string") {
      throw new HttpError(400, "Your interview access code is required");
    }

    const code = accessCode.trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,16}$/.test(code)) {
      throw new HttpError(400, "That doesn't look like a valid access code");
    }

    const candidate = await db.candidate.findUnique({
      where: { accessCode: code },
      include: { job: true },
    });
    if (!candidate) {
      await new Promise((r) => setTimeout(r, 400)); // brute-force damping
      await audit(null, "CANDIDATE_LOGIN_FAILED", "AUTH", null, { via: "access-code" });
      throw new HttpError(401, "No application found for that code — check the code your interviewer gave you");
    }

    // materialise a CANDIDATE-role user (scoped to their own data only).
    // Keyed to the candidate row — a person may apply to several openings
    // with the same email, and each application is its own scope.
    let user = await db.user.findFirst({ where: { role: "CANDIDATE", candidateId: candidate.id } });
    if (!user) {
      user = await db.user.create({
        data: {
          email: `candidate-${candidate.id}@portal.truemerit.app`,
          name: candidate.fullName,
          passwordHash: "candidate-portal", // never used for direct login
          role: "CANDIDATE",
          candidateId: candidate.id,
        },
      });
    }

    const session = { id: user.id, email: user.email, name: user.name, role: "CANDIDATE" as Role, candidateId: candidate.id };
    await setSessionCookie(session);
    await audit(session, "CANDIDATE_LOGIN", "AUTH", candidate.id, { job: candidate.job.title, via: "access-code" });
    return {
      user: session,
      candidate: {
        id: candidate.id,
        fullName: candidate.fullName,
        jobTitle: candidate.job.title,
        visibility: candidate.job.candidateVisibility,
      },
    };
  });
}
