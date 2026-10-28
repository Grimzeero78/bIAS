import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, setSessionCookie, type Role } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { HttpError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ensureSeed } from "@/lib/seed";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return api(async () => {
    await ensureSeed();
    const { email, password } = (await req.json()) as { email?: string; password?: string };
    if (!email || !password) throw new HttpError(400, "Email and password are required");

    const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, "Invalid email or password");
    }
    const session = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      candidateId: user.candidateId,
    };
    await setSessionCookie(session);
    await audit(session, "LOGIN", "AUTH", user.id, { role: user.role });
    return { user: session };
  });
}
