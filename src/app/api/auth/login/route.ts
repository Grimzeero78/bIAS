import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, setSessionCookie, type Role } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { HttpError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ensureSeed } from "@/lib/seed";
import type { User } from "@prisma/client";

export const runtime = "nodejs";

/**
 * Staff login — PASSWORD ONLY (no emails by design).
 * Two passwords exist: the CEO password grants ADMIN, the Panel password
 * grants INTERVIEWER. Both are verified timing-safely against scrypt hashes
 * kept on the seeded staff accounts.
 */
export async function POST(req: NextRequest) {
  return api(async () => {
    await ensureSeed();
    const { password } = (await req.json()) as { password?: string };
    if (!password || typeof password !== "string") {
      throw new HttpError(400, "Password is required");
    }

    const staff = await db.user.findMany({
      where: { role: { in: ["ADMIN", "INTERVIEWER"] }, active: true },
    });

    let matched: User | null = null;
    for (const user of staff) {
      if (verifyPassword(password, user.passwordHash)) {
        matched = user;
        break;
      }
    }
    if (!matched) {
      await new Promise((r) => setTimeout(r, 400)); // brute-force damping
      await audit(null, "LOGIN_FAILED", "AUTH", null, { via: "staff-password" });
      throw new HttpError(401, "Incorrect password — check the hint or ask the CEO");
    }

    const session = {
      id: matched.id,
      email: matched.email,
      name: matched.name,
      role: matched.role as Role,
      candidateId: matched.candidateId,
    };
    await setSessionCookie(session);
    await audit(session, "LOGIN", "AUTH", matched.id, { role: matched.role, via: "password" });
    return { user: session };
  });
}
