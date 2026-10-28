"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileText, Film, Languages, Sparkles, TrendingUp, ShieldAlert, Quote } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import type { CriterionScore, ImprovementPlan, Observation } from "@/lib/types";
import { fmtT } from "@/lib/types";
import { AiAdvisory, CriterionBar, DecisionStamp, EmptyState, ObservationRow, ScoreRing, SectionHead, SkeletonCard } from "@/components/app/atoms";
import { cn } from "@/lib/utils";

interface AnalysisPayload {
  candidate: { id: string; fullName: string; status: string };
  job: { id: string; title: string; cvWeight: number; videoWeight: number };
  documents: { id: string; type: string; filename: string }[];
  cv: { status: string; progress?: string | null; error?: string | null; overallScore?: number | null; parsed?: ParsedCv | null; scores: CriterionScore[] } | null;
  video: {
    status: string;
    progress?: string | null;
    error?: string | null;
    durationSec?: number | null;
    overallScore?: number | null;
    transcript?: string | null;
    scores: CriterionScore[];
    observations: Observation[];
  } | null;
  evaluation: {
    cvScore: number;
    videoScore: number;
    finalScore: number;
    rank?: number | null;
    rankedTotal?: number | null;
    justification?: string | null;
    improvement?: ImprovementPlan | null;
    decision?: "ADVANCE" | "HOLD" | "REJECT" | null;
    decisionNote?: string | null;
    decidedByName?: string | null;
    flags: { breaches: { criterionName: string; category: string; score: number; minThreshold: number }[] };
    computedAt: string;
  } | null;
}

interface ParsedCv {
  name?: string;
  headline?: string;
  summary?: string;
  skills?: string[];
  education?: { degree: string; institution?: string; year?: string }[];
  experience?: { role: string; organisation?: string; period?: string; highlights?: string }[];
  strengths?: string[];
  concerns?: string[];
}

export default function CandidateReport({
  candidateId,
  mode,
  onBack,
}: {
  candidateId: string;
  mode: "staff" | "candidate";
  onBack?: () => void;
}) {
  const [data, setData] = useState<AnalysisPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seek, setSeek] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeObs, setActiveObs] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<AnalysisPayload>(`/api/analysis/${candidateId}`);
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    }
  }, [candidateId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet<AnalysisPayload>(`/api/analysis/${candidateId}`);
        setData(res);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load report");
      }
    })();
  }, [candidateId]);

  // poll while analyses run (hook must be unconditional — early returns below)
  const running =
    !!data &&
    ((data.cv && ["PENDING", "PROCESSING"].includes(data.cv.status)) ||
      (data.video && ["PENDING", "PROCESSING"].includes(data.video.status)));
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(load, 5000);
    return () => clearTimeout(t);
  }, [running, load, data]);

  const videoDoc = data?.documents.find((d) => d.type === "VIDEO");
  const cvDoc = data?.documents.find((d) => d.type === "CV");

  function doSeek(t: number) {
    setSeek(t);
    setActiveObs(t);
    const v = videoRef.current;
    if (v && videoDoc) {
      v.currentTime = t;
      v.play().catch(() => {});
      v.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14">
        <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="This report isn't available" sub={error} action={onBack && <button onClick={onBack} className="rounded-xl border border-white/12 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Back</button>} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-8 sm:px-6">
        <SkeletonCard className="h-40" />
        <SkeletonCard className="h-72" />
      </div>
    );
  }

  const ev = data.evaluation;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
      {onBack && (
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-slate-500 transition hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      )}

      {/* ── header ── */}
      <div className="glass-deep anim-rise rounded-3xl p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              {mode === "candidate" ? "Your interview report" : "Candidate report"}
            </p>
            <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight sm:text-3xl">{data.candidate.fullName}</h1>
            <p className="mt-1 text-[13px] text-slate-500">
              {data.job.title} · evaluated {ev ? new Date(ev.computedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "— pending —"}
            </p>
            {ev?.rank != null && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/[0.07] px-3.5 py-1.5 text-[13px]">
                <span className="font-display font-bold text-gold-soft">Position #{ev.rank}</span>
                {ev.rankedTotal ? <span className="text-slate-500">of {ev.rankedTotal} ranked</span> : null}
              </p>
            )}
            {ev?.decision && mode === "staff" && (
              <div className="mt-3">
                <DecisionStamp decision={ev.decision} note={ev.decisionNote} by={ev.decidedByName} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-5">
            <ScoreRing value={ev?.cvScore} size={92} label="CV" />
            <ScoreRing value={ev?.videoScore} size={92} label="Video" />
            <ScoreRing value={ev?.finalScore} size={132} gold label="Final" />
          </div>
        </div>
        {ev && <FormulaStrip cv={ev.cvScore} video={ev.videoScore} cvW={data.job.cvWeight} vidW={data.job.videoWeight} penalties={ev.flags.breaches.length} final={ev.finalScore} />}
      </div>

      {!ev && (
        <div className="mt-5">
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title={running ? "Analysis in progress" : "Not ranked yet"}
            sub={
              running
                ? "The AI is analysing the evidence. This report fills in automatically — it usually takes under two minutes."
                : "The panel hasn't computed the ranking for this role yet. Check back soon."
            }
          />
        </div>
      )}

      {ev && (
        <>
          <div className="mt-5">
            <AiAdvisory />
          </div>

          {/* ── why (AI narrative) ── */}
          {ev.justification && (
            <div className="mt-6">
              <SectionHead title={mode === "candidate" ? "Why you landed here" : "Why this position"} sub="Written from the computed evidence — the AI explains, the formula decides." />
              <div className="glass anim-fade-up rounded-2xl border-l-2 border-l-gold/60 p-5 sm:p-6">
                <Quote className="mb-2.5 h-4 w-4 text-gold" />
                <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-slate-300">{ev.justification}</p>
              </div>
            </div>
          )}

          {/* ── breaches ── */}
          {ev.flags.breaches.length > 0 && (
            <div className="mt-6 rounded-2xl border border-rose-400/25 bg-rose-400/[0.06] p-5">
              <p className="flex items-center gap-2 font-display text-[15px] font-semibold text-rose-200">
                <ShieldAlert className="h-4 w-4" /> Mandatory requirements missed — −10 points each
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {ev.flags.breaches.map((b, i) => (
                  <div key={i} className="rounded-xl border border-rose-400/20 bg-black/30 px-3.5 py-2.5 text-[13px]">
                    <span className="font-medium text-rose-200">{b.criterionName}</span>
                    <span className="text-slate-400"> — scored {b.score}, required ≥ {b.minThreshold} ({b.category})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── improvement plan (candidate growth) ── */}
          {ev.improvement && (
            <div className="mt-6">
              <SectionHead
                title={mode === "candidate" ? "How to improve next time" : "Candidate growth plan"}
                sub="Constructive, private guidance generated from the weakest areas — shared with the candidate when transparency is on."
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {ev.improvement.summary && (
                  <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4 sm:col-span-2">
                    <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-200">
                      <TrendingUp className="h-4 w-4" /> {ev.improvement.summary}
                    </p>
                  </div>
                )}
                {ev.improvement.focus.map((f, i) => (
                  <div key={i} className="glass anim-fade-up rounded-2xl p-4" style={{ animationDelay: `${i * 70}ms` }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13.5px] font-semibold text-slate-200">{f.criterion}</p>
                      <span className={cn("rounded-md border px-2 py-0.5 font-display text-[12px] font-bold tabular-nums", f.score >= 80 ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : f.score >= 60 ? "border-amber-400/25 bg-amber-400/10 text-amber-300" : "border-rose-400/25 bg-rose-400/10 text-rose-300")}>
                        {f.score}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{f.tip}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── criterion breakdown ── */}
          <div className="mt-8">
            <SectionHead title="Criterion-by-criterion" sub="Click any criterion to read the AI's evidence-backed rationale." />
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2.5">
                <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-300"><FileText className="h-3.5 w-3.5" /> CV · {ev.cvScore.toFixed(1)}</p>
                {data.cv?.scores.length ? data.cv.scores.map((s) => <CriterionBar key={s.criterionId} name={s.name} score={s.score} rationale={s.rationale} />) : <p className="text-[13px] text-slate-600">No CV criteria scored.</p>}
              </div>
              <div className="space-y-2.5">
                <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-violet-300"><Film className="h-3.5 w-3.5" /> Interview video · {ev.videoScore.toFixed(1)}</p>
                {data.video?.scores.length ? data.video.scores.map((s) => <CriterionBar key={s.criterionId} name={s.name} score={s.score} rationale={s.rationale} />) : <p className="text-[13px] text-slate-600">No video criteria scored.</p>}
              </div>
            </div>
          </div>

          {/* ── video evidence ── */}
          {videoDoc && (
            <div className="mt-8">
              <SectionHead title="Interview video evidence" sub="Click any timestamped observation to jump straight to that moment." />
              <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="glass overflow-hidden rounded-2xl">
                  <video
                    ref={videoRef}
                    controls
                    playsInline
                    src={`/api/files/${videoDoc.id}`}
                    className="aspect-video w-full bg-black"
                    onTimeUpdate={() => {
                      const v = videoRef.current;
                      if (!v) return;
                      const obs = data.video?.observations ?? [];
                      const cur = obs.find((o) => Math.abs(o.t - v.currentTime) < 1.25);
                      setActiveObs(cur ? cur.t : null);
                    }}
                  />
                </div>
                <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  {(data.video?.observations ?? []).map((o, i) => (
                    <ObservationRow key={i} t={o.t} category={o.category} observation={o.observation} quote={o.quote} onSeek={doSeek} active={activeObs === o.t} />
                  ))}
                  {(data.video?.observations ?? []).length === 0 && <p className="text-[13px] text-slate-600">No timestamped observations were recorded.</p>}
                </div>
              </div>
            </div>
          )}

          {/* ── transcript ── */}
          {data.video?.transcript && (
            <div className="mt-8">
              <SectionHead title="Spoken transcript" sub="What the AI heard — the basis of verbal criterion scores." />
              <div className="glass max-h-72 overflow-y-auto whitespace-pre-line rounded-2xl p-5 font-mono text-[12.5px] leading-relaxed text-slate-400">{data.video.transcript}</div>
            </div>
          )}

          {/* ── CV profile ── */}
          {data.cv?.parsed && <CvProfile parsed={data.cv.parsed} docId={cvDoc?.id} />}

          {/* candidate-mode footer note */}
          {mode === "candidate" && (
            <p className="mt-10 rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4 text-center text-[12.5px] leading-relaxed text-slate-500">
              This report was produced by a fixed scoring formula applied to every candidate for this role. The AI only analysed evidence and wrote the explanations —
              the final hiring decision is made by the panel's CEO, who reviews this same report for every candidate.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ── formula strip: shows the arithmetic honestly ──────────── */
function FormulaStrip({ cv, video, cvW, vidW, penalties, final }: { cv: number; video: number; cvW: number; vidW: number; penalties: number; final: number }) {
  const parts = [
    { label: "CV", value: cv, w: cvW, cls: "text-cyan-300" },
    { label: "Video", value: video, w: vidW, cls: "text-violet-300" },
  ];
  return (
    <div className="mt-5 overflow-x-auto rounded-2xl border border-white/8 bg-black/30 px-4 py-3.5">
      <div className="flex min-w-max items-center gap-2 font-display text-sm">
        {parts.map((p, i) => (
          <span key={p.label} className="flex items-center gap-2">
            {i > 0 && <span className="text-slate-600">+</span>}
            <span className="text-slate-500">{p.w}%·</span>
            <span className={cn("font-bold tabular-nums", p.cls)}>{p.value.toFixed(1)}</span>
          </span>
        ))}
        {penalties > 0 && (
          <span className="flex items-center gap-1 text-rose-300">
            <span className="text-slate-600">−</span>
            <span className="font-bold tabular-nums">{penalties * 10}</span>
            <span className="text-[11px] text-slate-500">penalties</span>
          </span>
        )}
        <span className="mx-1.5 text-slate-600">=</span>
        <span className="rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 font-bold tabular-nums text-gold-soft">{final.toFixed(1)}</span>
        <span className="ml-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-600">final score</span>
      </div>
    </div>
  );
}

/* ── CV parsed profile ─────────────────────────────────────── */
function CvProfile({ parsed, docId }: { parsed: ParsedCv; docId?: string }) {
  return (
    <div className="mt-8">
      <SectionHead title="CV profile" sub="Structured from the uploaded document by the AI parse pass." right={docId && <a href={`/api/files/${docId}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[12px] text-slate-400 underline decoration-white/20 hover:text-slate-200"><FileText className="h-3.5 w-3.5" /> Open original</a>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          {parsed.headline && <p className="text-[13px] font-medium text-slate-300">{parsed.headline}</p>}
          {parsed.summary && <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{parsed.summary}</p>}
          {parsed.skills && parsed.skills.length > 0 && (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"><Languages className="h-3.5 w-3.5" /> Skills</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {parsed.skills.slice(0, 24).map((s, i) => (
                  <span key={i} className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.07] px-2 py-1 text-[12px] text-cyan-200">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="space-y-4">
          {parsed.education && parsed.education.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Education</p>
              <div className="mt-2.5 space-y-2">
                {parsed.education.map((e, i) => (
                  <div key={i} className="text-[13px]">
                    <p className="font-medium text-slate-300">{e.degree}</p>
                    <p className="text-[12px] text-slate-500">{[e.institution, e.year].filter(Boolean).join(" · ")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {parsed.experience && parsed.experience.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Experience</p>
              <div className="mt-2.5 space-y-3">
                {parsed.experience.slice(0, 6).map((x, i) => (
                  <div key={i} className="border-l-2 border-emerald-400/25 pl-3 text-[13px]">
                    <p className="font-medium text-slate-300">
                      {x.role}
                      {x.organisation ? <span className="text-slate-500"> · {x.organisation}</span> : null}
                    </p>
                    <p className="text-[12px] text-slate-500">{x.period}</p>
                    {x.highlights && <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{x.highlights}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {((parsed.strengths && parsed.strengths.length) || (parsed.concerns && parsed.concerns.length)) ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {parsed.strengths && parsed.strengths.length > 0 && (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Strengths</p>
                  <ul className="mt-2 space-y-1.5">
                    {parsed.strengths.slice(0, 6).map((s, i) => (
                      <li key={i} className="text-[12.5px] leading-relaxed text-slate-300">• {s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {parsed.concerns && parsed.concerns.length > 0 && (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">Concerns</p>
                  <ul className="mt-2 space-y-1.5">
                    {parsed.concerns.slice(0, 6).map((s, i) => (
                      <li key={i} className="text-[12.5px] leading-relaxed text-slate-300">• {s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
