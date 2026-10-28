import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

/**
 * Append-only audit trail. Every sensitive action (uploads, evaluations,
 * report views, permission denials) is recorded so the CEO can demonstrate
 * the process was corruption-free.
 */
export async function audit(
  actor: SessionUser | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: unknown
) {
  try {
    await db.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? "system",
        actorRole: actor?.role ?? "SYSTEM",
        action,
        entityType,
        entityId: entityId ?? null,
        details: details === undefined ? null : JSON.stringify(details),
      },
    });
  } catch (e) {
    console.error("[audit] failed to write audit entry:", e);
  }
}
