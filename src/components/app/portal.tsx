"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Film, Gauge, Gavel, ArrowRight, BadgeCheck, ClipboardList, LogOut, UserRound } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import type { SessionUser } from "@/lib/types";
import { AiAdvisory, EmptyState, ScoreRing, SkeletonCard } from "@/components/app/atoms";
import CandidateReport from "@/components/app/report";
import { Logo } from "@/components/app/brand";
import { cn } from "@/lib/utils";

interface AnalysisPayload {
  candidate: { id: string; fullName: string; status: string };
  job: { id: string; title: string; cvWeight: number; videoWeight: number };
  documents: { id: string; type: string; filename: string }[];
  cv: { status: string; error?: string | null; overallScore?: number | null } | null;
  video: { status: string; error?: string | null; overallScore?: number | null } | null;
  evaluation: {
    finalScore: number;
    rank?: number | null;
    rankedTotal?: number | null;
    decision?: "ADVANCE" | "HOLD" | "REJECT" | null;
    improvement?: { focus: { criterion: string; tip: string }[]; summary: string } | null;
    computedAt: string;
  } | null;
}

export default function CandidatePortal({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const candidateId = user.candidateId || "";
  const [data, setData] = useState<AnalysisPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openReport, setOpenReport] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<AnalysisPayload>(`/api/analysis/${candidateId}`);
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your results");
    }
  }, [candidateId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet<AnalysisPayload>(`/api/analysis/${candidateId}`);
        setData(res);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load your results");
      }
    })();
  }, [candidateId]);

  // poll while analyses run (hook must be unconditional — early return below)
  const running =
    !!data &&
    ((data.cv && ["PENDING", "PROCESSING"].includes(data.cv.status)) ||
      (data.video && ["PENDING", "PROCESSING"].includes(data.video.status)));
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(load, 6000);
    return () => clearTimeout(t);
  }, [running, load, data]);

  if (openReport) {
    return <CandidateReport candidateId={candidateId} mode="candidate" onBack={() => { setOpenReport(false); load(); }} />;
  }

  const ev = data?.evaluation;
  const steps = [
    { label: "Application received", done: true, icon: ClipboardList },
    { label: "CV analysed", done: data?.cv?.status === "COMPLETED", active: data?.cv?.status === "PROCESSING" || data?.cv?.status === "PENDING", icon: FileText },
    { label: "Interview video analysed", done: data?.video?.status === "COMPLETED", active: data?.video?.status === "PROCESSING" || data?.video?.status === "PENDING", icon: Film },
    { label: "Board ranked", done: !!ev, active: !ev && !running, icon: Gauge },
    { label: "CEO decision", done: !!ev?.decision, active: !!ev && !ev.decision, icon: Gavel },
  ];

  return (
    <div className="min-h-screen">
      {/* portal header */}
      <header className="sticky top-0 z-40 border-b border-white/6 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 text-[13px] text-slate-400 sm:flex">
              <UserRound className="h-4 w-4 text-emerald-300" /> {user.name}
            </span>
            <button onClick={onLogout} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-slate-400 hover:border-white/25 hover:text-slate-200">
              <LogOut className="h-3.5 w-3.5" /> Exit
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="anim-fade-up">
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-gold">Your transparent results</p>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Hello, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-slate-400">
            You applied for <span className="font-medium text-slate-200">{data?.job.title || "…"}</span>. This page shows exactly what the panel
            sees about your application — the same scores, the same evidence, the same reasoning. No hidden files, no back-room decisions.
          </p>
        </div>

        {/* progress stepper */}
        <div className="glass anim-fade-up mt-6 rounded-2xl p-5">
          <div className="flex flex-wrap items-center gap-y-3">
            {steps.map((s, i) => (
              <div key={s.label} className="flex items-center">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border",
                      s.done ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300" : s.active ? "border-gold/40 bg-gold/10 text-gold-soft anim-pulse-soft" : "border-white/10 bg-white/[0.03] text-slate-600"
                    )}
                  >
                    <s.icon className="h-4 w-4" />
                  </span>
                  <span className={cn("text-[12.5px] font-medium", s.done ? "text-emerald-200" : s.active ? "text-gold-soft" : "text-slate-600")}>{s.label}</span>
                </div>
                {i < steps.length - 1 && <span className={cn("mx-2.5 h-px w-5 sm:w-8", s.done ? "bg-emerald-400/40" : "bg-white/10")} />}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-400/[0.06] p-4 text-[13px] text-rose-200">{error}</div>
        )}

        {!data ? (
          <div className="mt-5 space-y-4">
            <SkeletonCard className="h-52" />
          </div>
        ) : ev ? (
          <>
            <div className="mt-6">
              <AiAdvisory />
            </div>

            {/* result hero */}
            <div className="glass-deep anim-rise mt-6 rounded-3xl p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-6">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-slate-500">Board position</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="font-display text-5xl font-bold tracking-tight text-gradient-gold">#{ev.rank ?? "—"}</span>
                    {ev.rankedTotal ? <span className="text-lg text-slate-500">of {ev.rankedTotal}</span> : null}
                  </div>
                  {ev.decision && (
                    <p className={cn("mt-3 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium", ev.decision === "ADVANCE" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : ev.decision === "HOLD" ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-rose-400/30 bg-rose-400/10 text-rose-200")}>
                      <BadgeCheck className="h-4 w-4" />
                      {ev.decision === "ADVANCE" ? "Advancing to the next stage" : ev.decision === "HOLD" ? "On hold — see feedback below" : "Not selected this time — see feedback below"}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <ScoreRing value={ev.finalScore} size={128} gold label="Final" />
                </div>
              </div>
              <button
                onClick={() => setOpenReport(true)}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold to-gold-soft px-4 py-3.5 font-display text-[15px] font-semibold text-[#241a02] transition hover:brightness-110 glow-gold sm:w-auto"
              >
                Open my full report — scores, evidence & how to improve <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* quick improvement preview */}
            {ev.improvement && ev.improvement.focus.length > 0 && (
              <div className="mt-6">
                <h2 className="font-display text-lg font-semibold tracking-tight">Your growth plan at a glance</h2>
                <p className="mt-0.5 text-[13px] text-slate-500">The full report explains each one with evidence.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {ev.improvement.focus.slice(0, 4).map((f, i) => (
                    <div key={i} className="glass anim-fade-up rounded-2xl p-4" style={{ animationDelay: `${i * 70}ms` }}>
                      <p className="text-[13.5px] font-semibold text-slate-200">{f.criterion}</p>
                      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-slate-400">{f.tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="mt-6">
            <EmptyState
              icon={<Gauge className="h-6 w-6" />}
              title={running ? "The AI is reviewing your application" : "Results are being prepared"}
              sub="Once the panel ranks the role, your complete report — scores, evidence with timestamps, and a personal improvement plan — appears right here."
            />
          </div>
        )}

        <div className="mt-10 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
          <p className="text-[12.5px] leading-relaxed text-slate-500">
            <span className="font-display font-semibold text-slate-300">How this works.</span> Every candidate for this role is scored against the same published
            criteria using the same formula. The AI only analyses documents and footage — it cannot move the ranking, and it never makes the hiring call.
            The CEO reviews the full board with detailed evidence and records the final decision under their own name, in an audit trail that cannot be quietly edited.
          </p>
        </div>
      </main>
    </div>
  );
}
