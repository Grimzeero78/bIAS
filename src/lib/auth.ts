import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

/**
 * Stateless HMAC-SHA256 signed session tokens carried in an httpOnly cookie.
 * (Production hardening option: swap for NextAuth/jose JWT — the surface
 *  used by the rest of the app is just getSessionUser() / requireRole().)
 */

const SECRET =
  process.env.AUTH_SECRET || "recruitai-dev-secret-change-in-production";
const COOKIE_NAME = "recruitai_session";
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export type Role = "ADMIN" | "INTERVIEWER" | "CANDIDATE";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  candidateId?: string | null;
}

// ── staff access passwords ──────────────────────────────────
/**
 * The platform has exactly TWO staff passwords (no emails):
 *   CEO password   → ADMIN role (full organisation view + final decisions)
 *   Panel password → INTERVIEWER role (runs jobs they created)
 * Both are env-overridable for real deployments. Login verifies the typed
 * password against the (scrypt-hashed) staff accounts seeded from these.
 */
export const STAFF_PASSWORD_DEFAULTS = {
  ADMIN: "CEO-MASTER-2026",
  INTERVIEWER: "PANEL-ROOM-2026",
} as const;

export function staffPassword(role: Exclude<Role, "CANDIDATE">): string {
  if (role === "ADMIN") return process.env.CEO_PASSWORD || STAFF_PASSWORD_DEFAULTS.ADMIN;
  return process.env.PANEL_PASSWORD || STAFF_PASSWORD_DEFAULTS.INTERVIEWER;
}

/** Public hint shown on the login card (first segment only, never the full secret). */
export function staffPasswordHint(role: Exclude<Role, "CANDIDATE">): string {
  const pwd = staffPassword(role);
  const stem = pwd.split("-")[0] || "";
  return stem.length >= 3 ? `Starts with “${stem}-”` : "Ask the CEO for the password";
}

// ── passwords ────────────────────────────────────────────────
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ── tokens ───────────────────────────────────────────────────
function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function signToken(payload: object): string {
  const body = b64url(Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TTL_MS })));
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token: string): SessionUser | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return data as SessionUser;
  } catch {
    return null;
  }
}

// ── cookie helpers (async in Next 15/16) ─────────────────────
export async function setSessionCookie(user: SessionUser) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, signToken(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// ── RBAC guards ──────────────────────────────────────────────
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Authentication required");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new HttpError(403, `Access denied — requires role: ${roles.join(" or ")}`);
  }
  return user;
}

/**
 * Job-level access policy:
 *  - ADMIN: full access to every job
 *  - INTERVIEWER: access to jobs they created (in a real deployment you would
 *    extend this with a membership table; single-tenant sandbox keeps it simple)
 *  - CANDIDATE: no direct job access (uses the candidate portal)
 */
export async function requireJobAccess(jobId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "CANDIDATE") throw new HttpError(403, "Access denied");
  if (user.role === "ADMIN") return user;
  const job = await db.jobOpening.findUnique({ where: { id: jobId } });
  if (!job) throw new HttpError(404, "Job not found");
  if (job.createdById !== user.id) throw new HttpError(403, "You do not own this job opening");
  return user;
}
