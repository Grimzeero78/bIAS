import { llmJson } from "./client";
import { weightedMean, type CriterionScore } from "./cv";
import { db } from "@/lib/db";

/**
 * RANKING & JUSTIFICATION ENGINE
 *
 * Deterministic core (code, not AI — so scores can never be "massaged"):
 *   cvScore    = weighted mean of CV criteria scores
 *   videoScore = weighted mean of VIDEO criteria scores
 *   finalScore = cvWeight·cvScore + videoWeight·videoScore  (weights % from job)
 *   penalty    = -10 per mandatory-criterion breach (score < minThreshold)
 *   rank       = dense ordering by finalScore desc (ties share higher rank)
 *
 * The AI's role is EXPLANATION ONLY: it writes the "why" narrative for each
 * ranked candidate using the computed numbers — it cannot change them.
 */

export interface Breach { criterionName: string; category: string; score: number; minThreshold: number }

export interface ComputedEvaluation {
  candidateId: string;
  fullName: string;
  cvScore: number;
  videoScore: number;
  finalScore: number;
  breaches: Breach[];
  flagsJson: string;
  cvScores: CriterionScore[];
  videoScores: CriterionScore[];
  cvParsed: unknown;
  transcript: string | null;
  observations: { t: number; category: string; observation: string; quote?: string }[];
}

export async function computeForJob(jobId: string): Promise<ComputedEvaluation[]> {
  const job = await db.jobOpening.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      criteria: true,
      candidates: {
        include: { cvAnalysis: true, videoAnalysis: true },
        where: { status: "ACTIVE" },
      },
    },
  });

  const out: ComputedEvaluation[] = [];

  for (const cand of job.candidates) {
    const cvScores: CriterionScore[] = cand.cvAnalysis?.scoresJson ? JSON.parse(cand.cvAnalysis.scoresJson) : [];
    const videoScores: CriterionScore[] = cand.videoAnalysis?.scoresJson ? JSON.parse(cand.videoAnalysis.scoresJson) : [];

    const cvCriteria = job.criteria.filter((c) => c.category === "CV");
    const videoCriteria = job.criteria.filter((c) => c.category === "VIDEO");

    const cvScore = cvScores.length
      ? weightedMean(cvScores.map((s) => ({ score: s.score, weight: cvCriteria.find((c) => c.id === s.criterionId)?.weight ?? 1 })))
      : 0;
    const videoScore = videoScores.length
      ? weightedMean(videoScores.map((s) => ({ score: s.score, weight: videoCriteria.find((c) => c.id === s.criterionId)?.weight ?? 1 })))
      : 0;

    const wCv = job.cvWeight / 100;
    const wVid = job.videoWeight / 100;
    let finalScore = cvScore * wCv + videoScore * wVid;

    // mandatory-criterion breaches (from either modality)
    const breaches: Breach[] = [];
    for (const c of job.criteria) {
      if (!c.isMandatory || c.minThreshold == null) continue;
      const s = [...cvScores, ...videoScores].find((x) => x.criterionId === c.id);
      if (s && s.score < c.minThreshold) {
        breaches.push({ criterionName: c.name, category: c.category, score: s.score, minThreshold: c.minThreshold });
      }
    }
    finalScore = Math.max(0, Math.round((finalScore - breaches.length * 10) * 10) / 10);

    out.push({
      candidateId: cand.id,
      fullName: cand.fullName,
      cvScore: Math.round(cvScore * 10) / 10,
      videoScore: Math.round(videoScore * 10) / 10,
      finalScore,
      breaches,
      flagsJson: JSON.stringify({ breaches, disqualified: false }),
      cvScores,
      videoScores,
      cvParsed: cand.cvAnalysis?.parsedJson ? JSON.parse(cand.cvAnalysis.parsedJson) : null,
      transcript: cand.videoAnalysis?.transcript ?? null,
      observations: cand.videoAnalysis?.observationsJson ? JSON.parse(cand.videoAnalysis.observationsJson) : [],
    });
  }

  return out;
}

function fmtT(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export async function rankAndJustify(jobId: string): Promise<{ evaluated: number }> {
  const job = await db.jobOpening.findUniqueOrThrow({ where: { id: jobId } });
  const computed = await computeForJob(jobId);

  // deterministic ranking
  const sorted = [...computed].sort((a, b) => b.finalScore - a.finalScore);
  const ranks = new Map<string, number>();
  sorted.forEach((c, i) => ranks.set(c.candidateId, i + 1));

  // AI justification — explanation only, computed ranks are fixed
  const brief = sorted.map((c, i) => ({
    candidateId: c.candidateId,
    assigned_rank: i + 1,
    name: c.fullName,
    final_score: c.finalScore,
    cv_score: c.cvScore,
    video_score: c.videoScore,
    mandatory_breaches: c.breaches.map((b) => `${b.criterionName}: scored ${b.score} (minimum required ${b.minThreshold})`),
    cv_criterion_scores: c.cvScores.map((s) => ({ name: s.name, score: s.score, rationale: s.rationale })),
    video_criterion_scores: c.videoScores.map((s) => ({ name: s.name, score: s.score, rationale: s.rationale })),
    evidence_highlights: c.observations.slice(0, 8).map((o) => `[${fmtT(o.t)}] ${o.category}: ${o.observation}`),
  }));

  let justifications: { candidateId: string; text: string }[] = [];
  if (sorted.length > 0) {
    try {
      const res = await llmJson<{ justifications: { candidateId: string; text: string }[] }>(
        `You are the transparency officer of an AI-assisted hiring process. You are given the FINAL computed ranking of candidates for one job (ranks and scores are fixed — you must not reorder or rescore).
For EVERY candidate write a justification of 3-6 sentences in this style:
"\<Name\> ranks #\<R\> because ...". Reference concrete criterion scores (at least 2-3), mention at least one timestamped behavioural evidence point if available (format MM:SS), and for lower-ranked candidates state the specific weaknesses that separated them. Be factual, neutral, and respectful — no speculation about personal circumstances. No markdown.
Return JSON {"justifications":[{"candidateId":"...","text":"..."}]} with one entry for every candidate.`,
        `JOB: ${job.title} — ${job.department || "General"}
WEIGHTING: CV ${job.cvWeight}% / Video ${job.videoWeight}% (mandatory breaches carry a -10 penalty each)

COMPUTED RESULTS (rank is fixed):
${JSON.stringify(brief).slice(0, 60000)}`
      );
      justifications = res.justifications || [];
    } catch (e) {
      console.error("[evaluate] justification LLM failed, falling back to deterministic text:", e);
    }
  }

  // persist evaluations
  for (const c of computed) {
    const rank = ranks.get(c.candidateId)!;
    const auto = `Ranks #${rank} with a final score of ${c.finalScore}/100 (CV ${c.cvScore} · Video ${c.videoScore}).` +
      (c.breaches.length ? ` Mandatory requirement breach: ${c.breaches.map((b) => `${b.criterionName} scored ${b.score} (min ${b.minThreshold})`).join("; ")} — penalty applied.` : "");
    const aiText =
      justifications.find((j) => j.candidateId === c.candidateId)?.text ??
      justifications.find((j) => j.text && c.fullName && j.text.startsWith(c.fullName))?.text;
    const text = aiText && aiText.length > 40 ? `${aiText}\n\n[Computed] ${auto}` : auto;

    await db.evaluation.upsert({
      where: { candidateId: c.candidateId },
      create: {
        candidateId: c.candidateId,
        cvScore: c.cvScore,
        videoScore: c.videoScore,
        finalScore: c.finalScore,
        rank,
        justification: text,
        flagsJson: c.flagsJson,
      },
      update: {
        cvScore: c.cvScore,
        videoScore: c.videoScore,
        finalScore: c.finalScore,
        rank,
        justification: text,
        flagsJson: c.flagsJson,
        computedAt: new Date(),
      },
    });
  }

  // clean up stale evaluations of removed/disqualified candidates
  const activeIds = new Set(computed.map((c) => c.candidateId));
  const existing = await db.evaluation.findMany({ where: { candidate: { jobId } } });
  for (const ev of existing) {
    if (!activeIds.has(ev.candidateId)) {
      await db.evaluation.delete({ where: { id: ev.id } }).catch(() => {});
    }
  }

  return { evaluated: computed.length };
}
