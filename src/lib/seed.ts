import { db } from "@/lib/db";
import { hashPassword, staffPassword } from "@/lib/auth";

/**
 * Idempotent auto-seed so the platform is usable immediately.
 *
 * Staff access uses exactly TWO shared passwords (no emails):
 *   CEO password        → ADMIN   ("CEO Office"      actor in the audit trail)
 *   Interview Panel pwd → INTERVIEWER ("Interview Panel" actor in the audit trail)
 * Hashes are re-synced on boot so changing CEO_PASSWORD / PANEL_PASSWORD env
 * vars (or the defaults) takes effect on next start.
 *
 * A demo job opening with default analysis criteria is created on first boot.
 */
export async function ensureSeed() {
  // ── staff accounts (password-only login) ──
  const staffDefs = [
    { role: "ADMIN", email: "ceo@truemerit.app", name: "CEO Office", password: staffPassword("ADMIN") },
    { role: "INTERVIEWER", email: "panel@truemerit.app", name: "Interview Panel", password: staffPassword("INTERVIEWER") },
  ] as const;

  for (const def of staffDefs) {
    const existing = await db.user.findFirst({ where: { role: def.role, active: true }, orderBy: { createdAt: "asc" } });
    if (existing) {
      const patch: Record<string, unknown> = { passwordHash: hashPassword(def.password), name: def.name, active: true };
      if (existing.email.includes("@recruit.ai") || existing.email.includes("@truemerit.app")) {
        patch.email = def.email; // migrate legacy sandbox emails
      }
      await db.user.update({ where: { id: existing.id }, data: patch });
    } else {
      await db.user.create({
        data: { email: def.email, name: def.name, passwordHash: hashPassword(def.password), role: def.role },
      });
    }
  }

  const jobCount = await db.jobOpening.count();
  if (jobCount === 0) {
    // The demo requisition is owned by the interviewer (they run the interviews),
    // while the CEO/Admin can see all openings across the organisation.
    const owner = (await db.user.findFirst({ where: { role: "INTERVIEWER" } })) ??
      (await db.user.findFirst({ where: { role: "ADMIN" } }));
    if (!owner) return;
    await db.jobOpening.create({
      data: {
        title: "Operations Analyst",
        department: "Operations",
        description:
          "We are hiring an Operations Analyst to support process optimisation, reporting and cross-team coordination. This requisition uses AI-assisted analysis to keep the shortlist objective.",
        requirements:
          "Bachelor degree required. 2+ years experience in operations, data analysis or consulting. Strong Excel and reporting skills. Excellent written and spoken English. Professional presence.",
        cvWeight: 40,
        videoWeight: 60,
        candidateVisibility: true,
        createdById: owner.id,
        createdByName: owner.name,
        criteria: {
          create: [
            {
              name: "Education & Qualifications",
              description:
                "Degree relevance and level, certifications, alignment with the role requirements.",
              category: "CV",
              weight: 3,
            },
            {
              name: "Relevant Experience",
              description:
                "Years and depth of directly relevant operations/analysis experience vs the job requirements.",
              category: "CV",
              weight: 5,
            },
            {
              name: "Skills Match",
              description:
                "Coverage of the skills listed in the job requirements (Excel, reporting, analytics...).",
              category: "CV",
              weight: 4,
            },
            {
              name: "Confidence",
              description:
                "Self-assurance, composure, steady posture, steady voice, assertive but respectful delivery.",
              category: "VIDEO",
              weight: 5,
              isMandatory: true,
              minThreshold: 60,
            },
            {
              name: "English Proficiency",
              description:
                "Fluency, grammar, vocabulary range, clarity of pronunciation and coherence of spoken answers.",
              category: "VIDEO",
              weight: 4,
            },
            {
              name: "Professional Dressing",
              description:
                "Business-appropriate attire and grooming suitable for a client-facing corporate role.",
              category: "VIDEO",
              weight: 2,
            },
            {
              name: "Body Language & Eye Contact",
              description:
                "Posture, eye contact with the camera/interviewer, hand gestures, fidgeting or distractions.",
              category: "VIDEO",
              weight: 3,
            },
            {
              name: "Answer Quality & Sentiment",
              description:
                "Relevance, structure and positivity of spoken answers; sentiment of the content.",
              category: "VIDEO",
              weight: 4,
            },
          ],
        },
      },
    });
  } else {
    // One-time transparency backfill (marker-guarded so deliberate opt-outs made
    // later by the CEO are never overwritten):
    const backfilled = await db.auditLog.findFirst({ where: { action: "SEED_VISIBILITY_BACKFILL" } });
    if (!backfilled) {
      await db.jobOpening.updateMany({ where: { candidateVisibility: false }, data: { candidateVisibility: true } });
      await db.auditLog.create({
        data: {
          actorName: "system",
          actorRole: "SYSTEM",
          action: "SEED_VISIBILITY_BACKFILL",
          entityType: "JOB",
          details: "One-time backfill: candidate result visibility enabled by default on all openings",
        },
      });
    }
  }
}
