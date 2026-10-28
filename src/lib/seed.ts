import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

/**
 * Idempotent auto-seed so the platform is usable immediately:
 *  - CEO/Admin  : admin@recruit.ai  / admin123
 *  - Interviewer: interviewer@recruit.ai / interview123
 * A demo job opening with default analysis criteria is created on first boot.
 */
export async function ensureSeed() {
  const userCount = await db.user.count();
  if (userCount === 0) {
    await db.user.createMany({
      data: [
        {
          email: "admin@recruit.ai",
          name: "Amara Okafor (CEO)",
          passwordHash: hashPassword("admin123"),
          role: "ADMIN",
        },
        {
          email: "interviewer@recruit.ai",
          name: "Daniel Mwangi",
          passwordHash: hashPassword("interview123"),
          role: "INTERVIEWER",
        },
      ],
    });
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
  }
}
