"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Gauge, Loader2, Gavel, Users, SlidersHorizontal, X, Check, Flag, Eye, FileText, Scale } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api-client";
import type { CandidateRow, Decision, JobDetail, SessionUser } from "@/lib/types";
import { AiAdvisory, DecisionStamp, EmptyState, HUE_TEXT, RankChip, ScoreRing, SectionHead, SkeletonCard } from "@/components/app/atoms";
import { CandidatesTab } from "@/components/app/job-candidates";
import { CriteriaTab, SettingsTab } from "@/components/app/job-settings";
import { cn } from "@/lib/utils";

type Tab = "ranking" | "candidates" | "criteria" | "settings";

export default function JobWorkspace({
  jobId,
  user,
  onBack,
  onOpenReport,
}: {
  jobId: string;
  user: SessionUser;
  onBack: () => void;
  onOpenReport: (candidateId: string) => void;
}) {
  const [data, setData] = useState<JobDetail | null>(null);
  const [tab, setTab] = useState<Tab>("ranking");
  const [evaluating, setEvaluating] = useState(false);
  const [decisionFor, setDecisionFor] = useState<CandidateRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<JobDetail>(`/api/jobs/${jobId}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requisition");
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runEvaluation() {
    if (evaluating) return;
    setEvaluating(true);
    setError(null);
    try {
      await apiSend(`/api/jobs/${jobId}/evaluate`, "POST");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setEvaluating(false);
    }
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState icon={<Flag className="h-6 w-6" />} title="Could not open this requisition" sub={error} action={<ButtonGhost onClick={onBack}>Back</ButtonGhost>} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-8 sm:px-6">
        <SkeletonCard className="h-24" />
        <SkeletonCard className="h-64" />
      </div>
    );
  }

  const { job, criteria, candidates, ranking } = data;
  const ranked = candidates.filter((c) => c.evaluation?.rank != null && c.status === "ACTIVE");
  const undecided = ranked.filter((c) => !c.evaluation?.decision);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-9">
      {/* header */}
      <div className="anim-fade-up">
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-slate-500 transition hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" /> All requisitions
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{job.title}</h1>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  job.status === "OPEN" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/15 bg-white/5 text-slate-400"
                )}
              >
                {job.status}
              </span>
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-500">
              <span>{job.department || "General"}</span>
              <span className="text-slate-700">•</span>
              <span>
                <span className={cn("font-semibold", HUE_TEXT.emerald)}>{ranking.length}</span> ranked ·{" "}
                <span className="font-semibold text-slate-300">{candidates.length}</span> candidates ·{" "}
                <span className="font-semibold text-slate-300">{criteria.length}</span> criteria
              </span>
              <span className="text-slate-700">•</span>
              <span>
                weights <span className="font-medium text-cyan-300">CV {job.cvWeight}%</span> / <span className="font-medium text-violet-300">Video {job.videoWeight}%</span>
              </span>
            </p>
          </div>
          <button
            onClick={runEvaluation}
            disabled={evaluating}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2.5 font-display text-sm font-semibold text-emerald-950 transition hover:brightness-110 disabled:opacity-50 glow-emerald"
          >
            {evaluating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
            {evaluating ? "Computing ranks…" : ranking.length ? "Re-run ranking" : "Run ranking"}
          </button>
        </div>
        {error && <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[13px] text-rose-300">{error}</p>}
      </div>

      {/* tabs */}
      <div className="sticky top-0 z-30 -mx-4 mt-6 bg-background/80 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/8 bg-black/30 p-1.5">
          {(
            [
              { id: "ranking", label: "Leaderboard", icon: Gauge, badge: ranking.length },
              { id: "candidates", label: "Candidates", icon: Users, badge: candidates.length },
              { id: "criteria", label: "Criteria", icon: SlidersHorizontal, badge: criteria.length },
              { id: "settings", label: "Settings", icon: Eye },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all",
                tab === t.id ? "bg-emerald-500/15 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.3)]" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {"badge" in t && t.badge != null && <span className="rounded-full bg-white/8 px-1.5 text-[10px] tabular-nums">{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* body */}
      <div className="mt-6">
        {tab === "ranking" && (
          <div className="space-y-6">
            <AiAdvisory />
            {undecided.length > 0 && user.role === "ADMIN" && (
              <div className="flex items-center gap-2.5 rounded-xl border border-gold/25 bg-gold/[0.06] px-4 py-3 text-[13px] text-slate-300">
                <Gavel className="h-4 w-4 shrink-0 text-gold" />
                <span>
                  <span className="font-semibold text-gold-soft">{undecided.length} ranked candidate{undecided.length === 1 ? "" : "s"}</span> await your final decision —
                  the AI never decides, you do.
                </span>
              </div>
            )}
            {ranking.length === 0 ? (
              <EmptyState
                icon={<Gauge className="h-6 w-6" />}
                title={candidates.length ? "Ready to rank" : "No candidates yet"}
                sub={
                  candidates.length
                    ? "Run the ranking once CV and video analyses complete. Ranks are computed deterministically from your weights — the AI only writes the explanations."
                    : "Add candidates in the Candidates tab, upload their CVs and interview videos, then run the ranking."
                }
                action={
                  candidates.length ? (
                    <button
                      onClick={runEvaluation}
                      disabled={evaluating}
                      className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-200 hover:bg-emerald-400/15 disabled:opacity-40"
                    >
                      {evaluating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />} Run the ranking
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <Leaderboard
                ranked={ranked}
                candidates={candidates}
                isAdmin={user.role === "ADMIN"}
                onWhy={onOpenReport}
                onDecide={setDecisionFor}
              />
            )}
          </div>
        )}

        {tab === "candidates" && <CandidatesTab data={data} onChanged={load} onOpenReport={onOpenReport} />}
        {tab === "criteria" && <CriteriaTab data={data} onChanged={load} />}
        {tab === "settings" && <SettingsTab data={data} onChanged={load} onClosed={onBack} />}
      </div>

      {decisionFor && (
        <DecisionDialog
          candidate={decisionFor}
          onClose={() => setDecisionFor(null)}
          onDone={async () => {
            setDecisionFor(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

/* ── leaderboard ───────────────────────────────────────────── */
function Leaderboard({
  ranked,
  candidates,
  isAdmin,
  onWhy,
  onDecide,
}: {
  ranked: CandidateRow[];
  candidates: CandidateRow[];
  isAdmin: boolean;
  onWhy: (candidateId: string) => void;
  onDecide: (c: CandidateRow) => void;
}) {
  const sorted = [...ranked].sort((a, b) => (a.evaluation?.rank ?? 99) - (b.evaluation?.rank ?? 99));
  const podium = sorted.slice(0, 3);
  const rest = sorted.slice(3);
  const disqualified = candidates.filter((c) => c.status !== "ACTIVE");

  return (
    <div className="space-y-6">
      {podium.length >= 2 && (
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
          {/* order: 2nd, 1st, 3rd */}
          {[podium[1], podium[0], podium[2]].filter(Boolean).map((c) => {
            const rank = c.evaluation!.rank!;
            const first = rank === 1;
            return (
              <div
                key={c.id}
                className={cn(
                  "anim-fade-up relative flex flex-col items-center rounded-2xl border p-5 text-center",
                  first
                    ? "border-gold/40 bg-gradient-to-b from-gold/[0.1] to-transparent glow-gold sm:-mb-2 sm:pb-10"
                    : "border-white/10 bg-white/[0.03]"
                )}
              >
                <RankChip rank={rank} className={cn("absolute -top-4 left-1/2 -translate-x-1/2", first && "h-9 w-9 text-base")} />
                <ScoreRing value={c.evaluation?.finalScore} size={first ? 110 : 88} gold={first} />
                <p className="mt-2.5 max-w-full truncate font-display text-[15px] font-semibold text-slate-100">{c.fullName}</p>
                <p className="text-[11px] text-slate-500">
                  CV {c.evaluation?.cvScore.toFixed(1)} · Video {c.evaluation?.videoScore.toFixed(1)}
                </p>
                {c.evaluation?.decision ? (
                  <div className="mt-3"><DecisionStamp decision={c.evaluation.decision} size="sm" /></div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <WhyButton onClick={() => onWhy(c.id)} />
                    {isAdmin && <DecideButton onClick={() => onDecide(c)} />}
                  </div>
                )}
                {c.evaluation && c.evaluation.flags.breaches.length > 0 && (
                  <p className="mt-2 text-[11px] text-rose-300">⚠ {c.evaluation.flags.breaches.length} mandatory breach{c.evaluation.flags.breaches.length === 1 ? "" : "es"}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* full table */}
      <div className="glass overflow-hidden rounded-2xl">
        <div className="hidden items-center gap-3 border-b border-white/6 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:flex">
          <span className="w-10">Rank</span>
          <span className="flex-1">Candidate</span>
          <span className="w-24 text-right">CV</span>
          <span className="w-24 text-right">Video</span>
          <span className="w-24 text-right">Final</span>
          <span className="w-44 text-right">Decision / actions</span>
        </div>
        {sorted.map((c) => {
          const ev = c.evaluation!;
          return (
            <div key={c.id} className="group flex flex-wrap items-center gap-3 border-b border-white/5 px-4 py-3.5 transition-colors last:border-0 hover:bg-white/[0.03] sm:flex-nowrap sm:px-5">
              <span className="w-10"><RankChip rank={ev.rank ?? 0} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-200">{c.fullName}</span>
                <span className="block text-[11px] text-slate-500">
                  {ev.flags.breaches.length > 0 ? (
                    <span className="text-rose-300">breach: {ev.flags.breaches.map((b) => b.criterionName).join(", ")}</span>
                  ) : (
                    <span className="sm:hidden">CV {ev.cvScore.toFixed(0)} · Vid {ev.videoScore.toFixed(0)}</span>
                  )}
                </span>
              </span>
              <span className="hidden w-24 text-right sm:block">
                <ScoreMini label="CV" value={ev.cvScore} hue="cyan" />
              </span>
              <span className="hidden w-24 text-right sm:block">
                <ScoreMini label="Video" value={ev.videoScore} hue="violet" />
              </span>
              <span className="ml-auto w-24 text-right sm:ml-0">
                <ScoreMini label="Final" value={ev.finalScore} highlight />
              </span>
              <span className="flex w-full items-center justify-end gap-2 sm:w-44">
                {ev.decision ? (
                  <DecisionStamp decision={ev.decision} size="sm" />
                ) : (
                  <>
                    <WhyButton onClick={() => onWhy(c.id)} />
                    {isAdmin && <DecideButton onClick={() => onDecide(c)} />}
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {podium.length < 2 && podium.length === 1 && (
        <p className="text-center text-[12px] text-slate-600">Add more candidates to build the podium.</p>
      )}

      {disqualified.length > 0 && (
        <p className="text-[12px] text-slate-600">
          {disqualified.length} disqualified candidate{disqualified.length === 1 ? "" : "s"} excluded from ranking.
        </p>
      )}
    </div>
  );
}

function ScoreMini({ label, value, hue, highlight }: { label: string; value: number; hue?: "cyan" | "violet"; highlight?: boolean }) {
  const color =
    hue === "cyan" ? "text-cyan-300" : hue === "violet" ? "text-violet-300" : value >= 80 ? "text-emerald-300" : value >= 60 ? "text-amber-300" : "text-rose-300";
  return (
    <span className="inline-flex flex-col items-end leading-none">
      <span className={cn("font-display text-[15px] font-bold tabular-nums", highlight ? color : "text-slate-300")}>{value.toFixed(1)}</span>
      <span className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-slate-600">{label}</span>
    </span>
  );
}

function WhyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[12px] font-medium text-slate-300 transition hover:border-emerald-400/40 hover:text-emerald-200"
    >
      <FileText className="h-3.5 w-3.5" /> Why?
    </button>
  );
}

function DecideButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg border border-gold/35 bg-gold/10 px-3 py-1.5 text-[12px] font-semibold text-gold-soft transition hover:bg-gold/20"
    >
      <Gavel className="h-3.5 w-3.5" /> Decide
    </button>
  );
}

function ButtonGhost({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-xl border border-white/12 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
      {children}
    </button>
  );
}

/* ── CEO decision dialog ───────────────────────────────────── */
function DecisionDialog({ candidate, onClose, onDone }: { candidate: CandidateRow; onClose: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState<Decision | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ev = candidate.evaluation;

  async function submit() {
    if (!decision || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/evaluations/${candidate.id}/decision`, "PATCH", { decision, note });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the decision");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="glass-deep anim-rise w-full max-w-lg rounded-t-3xl p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">CEO final decision</p>
            <h3 className="mt-1 font-display text-xl font-bold tracking-tight">{candidate.fullName}</h3>
            {ev && (
              <p className="mt-0.5 text-[13px] text-slate-500">
                Rank #{ev.rank} · final {ev.finalScore.toFixed(1)} (CV {ev.cvScore.toFixed(1)} · Video {ev.videoScore.toFixed(1)})
                {ev.flags.breaches.length > 0 && <span className="text-rose-300"> · {ev.flags.breaches.length} breach</span>}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3.5 py-2.5 text-[12px] leading-relaxed text-emerald-200/90">
          The AI-informed rank stays on record either way — this records <strong>your</strong> human decision, stamped with your name into the audit trail.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {(
            [
              { id: "ADVANCE", label: "Advance", cls: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" },
              { id: "HOLD", label: "Hold", cls: "border-amber-400/40 bg-amber-400/10 text-amber-200" },
              { id: "REJECT", label: "Reject", cls: "border-rose-400/40 bg-rose-400/10 text-rose-200" },
            ] as const
          ).map((d) => (
            <button
              key={d.id}
              onClick={() => setDecision(d.id)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 font-display text-sm font-semibold transition-all",
                decision === d.id ? d.cls + " shadow-[0_0_0_1px_currentColor]" : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-slate-200"
              )}
            >
              {decision === d.id && <Check className="h-4 w-4" />}
              {d.label}
            </button>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Decision note (shown in the audit trail)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Strongest evidence across all criteria; references during panel review confirmed the ranking."
            className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-gold/50 focus:outline-none"
          />
        </label>

        {error && <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[13px] text-rose-300">{error}</p>}

        <div className="mt-5 flex justify-end gap-2.5">
          <button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!decision || busy}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-gold to-gold-soft px-5 py-2.5 font-display text-sm font-semibold text-[#241a02] transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />} Record decision
          </button>
        </div>
      </div>
    </div>
  );
}
