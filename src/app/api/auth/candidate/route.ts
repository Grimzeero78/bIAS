import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { setSessionCookie, type Role } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { HttpError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ensureSeed } from "@/lib/seed";

export const runtime = "nodejs";

/** Candidate portal login: email + the access code issued for their application. */
export async function POST(req: NextRequest) {
  return api(async () => {
    await ensureSeed();
    const { email, accessCode } = (await req.json()) as { email?: string; accessCode?: string };
    if (!email || !accessCode) throw new HttpError(400, "Email and access code are required");

    const candidate = await db.candidate.findFirst({
      where: { email: email.toLowerCase().trim(), accessCode: accessCode.trim().toUpperCase() },
      include: { job: true },
    });
    if (!candidate) throw new HttpError(401, "No application found for that email and access code");

    // materialise a CANDIDATE-role user (scoped to their own data only)
    let user = await db.user.findFirst({ where: { role: "CANDIDATE", candidateId: candidate.id } });
    if (!user) {
      user = await db.user.create({
        data: {
          email: candidate.email,
          name: candidate.fullName,
          passwordHash: "candidate-portal", // never used for direct login
          role: "CANDIDATE",
          candidateId: candidate.id,
        },
      });
    }

    const session = { id: user.id, email: user.email, name: user.name, role: "CANDIDATE" as Role, candidateId: candidate.id };
    await setSessionCookie(session);
    await audit(session, "CANDIDATE_LOGIN", "AUTH", candidate.id, { job: candidate.job.title });
    return {
      user: session,
      candidate: { id: candidate.id, fullName: candidate.fullName, jobTitle: candidate.job.title },
    };
  });
}
