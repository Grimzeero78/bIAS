import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireJobAccess } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { HttpError } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

function genAccessCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// POST /api/candidates — register a candidate on a job (interviewer)
export async function POST(req: NextRequest) {
  return api(async () => {
    const body = (await req.json()) as {
      jobId?: string;
      fullName?: string;
      email?: string;
      phone?: string;
    };
    if (!body.jobId) throw new HttpError(400, "jobId is required");
    const user = await requireJobAccess(body.jobId);
    if (!body.fullName?.trim()) throw new HttpError(400, "Candidate name is required");
    if (!body.email?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
      throw new HttpError(400, "A valid candidate email is required");
    }
    const accessCode = genAccessCode();
    const cand = await db.candidate.create({
      data: {
        jobId: body.jobId,
        fullName: body.fullName.trim(),
        email: body.email.toLowerCase().trim(),
        phone: body.phone?.trim() || null,
        accessCode,
      },
    });
    await db.cvAnalysis.create({ data: { candidateId: cand.id, status: "PENDING" } });
    await db.videoAnalysis.create({ data: { candidateId: cand.id, status: "PENDING" } });
    await audit(user, "ADD_CANDIDATE", "CANDIDATE", cand.id, { name: cand.fullName, job: body.jobId });
    return { candidate: { id: cand.id, fullName: cand.fullName, accessCode } };
  });
}
