"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, Users, Gauge, Gavel, Plus, ArrowUpRight, X, Loader2, Trophy, Building2, CircleSlash } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api-client";
import type { JobSummary, SessionUser } from "@/lib/types";
import { AiAdvisory, CountUp, EmptyState, SectionHead, SkeletonCard, StatTile } from "@/components/app/atoms";
import { cn } from "@/lib/utils";

export default function Dashboard({
  user,
  onOpenJob,
}: {
  user: SessionUser;
  onOpenJob: (jobId: string) => void;
}) {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const isAdmin = user.role === "ADMIN";

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ jobs: JobSummary[] }>("/api/jobs");
      setJobs(res.jobs);
    } catch {
      setJobs([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet<{ jobs: JobSummary[] }>("/api/jobs");
        setJobs(res.jobs);
      } catch {
        setJobs([]);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    const all = jobs || [];
    const candidates = all.reduce((a, j) => a + j.candidateCount, 0);
    const evaluated = all.reduce((a, j) => a + j.evaluatedCount, 0);
    const pending = all.reduce((a, j) => a + Math.max(0, j.evaluatedCount - 0), 0);
    return { roles: all.length, open: all.filter((j) => j.status === "OPEN").length, candidates, evaluated };
  }, [jobs]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      {/* header */}
      <div className="anim-fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.22em] text-slate-500">
            {isAdmin ? "Executive board" : "Interview panel"}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {isAdmin ? "The whole board, at a glance" : "Your requisitions"}
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-slate-500">
            {isAdmin
              ? "Every opening across the organisation, ranked by evidence. You make the final call on who advances — the AI only advises."
              : "Run interviews, upload evidence, and compute objective rankings. The CEO sees everything you see and makes the final decision."}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2.5 font-display text-sm font-semibold text-emerald-950 transition hover:brightness-110 glow-emerald"
        >
          <Plus className="h-4 w-4" /> New role
        </button>
      </div>

      {/* stats */}
      <div className="mt-7 grid grid-cols-2 gap-3.5 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Open roles"
          value={jobs ? <CountUp to={stats.open} /> : "—"}
          sub={`${stats.roles} total requisition${stats.roles === 1 ? "" : "s"}`}
          icon={<Briefcase className="h-4 w-4" />}
          className="anim-fade-up"
        />
        <StatTile
          label="Candidates"
          value={jobs ? <CountUp to={stats.candidates} /> : "—"}
          sub="in the pipeline"
          icon={<Users className="h-4 w-4" />}
          accent="slate"
          className="anim-fade-up"
        />
        <StatTile
          label="Evaluated"
          value={jobs ? <CountUp to={stats.evaluated} /> : "—"}
          sub="with AI-informed ranks"
          icon={<Gauge className="h-4 w-4" />}
          accent="slate"
          className="anim-fade-up"
        />
        <StatTile
          label="Your call"
          value={<span className="text-gradient-gold">CEO</span>}
          sub="final decisions, stamped in the audit trail"
          icon={<Gavel className="h-4 w-4" />}
          accent="gold"
          className="anim-fade-up"
        />
      </div>

      {/* positioning strip */}
      <div className="mt-4 anim-fade-up">
        <AiAdvisory />
      </div>

      {/* jobs */}
      <div className="mt-9">
        <SectionHead
          title={isAdmin ? "All requisitions" : "Requisitions you own"}
          sub="Open a role to review the leaderboard, evidence and criteria."
        />
        {jobs === null ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <SkeletonCard className="h-44" />
            <SkeletonCard className="h-44" />
            <SkeletonCard className="h-44" />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="h-6 w-6" />}
            title="No requisitions yet"
            sub="Create your first role to start scoring candidates against published, weighted criteria."
            action={
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-200 hover:bg-emerald-400/15"
              >
                <Plus className="h-4 w-4" /> Create a role
              </button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {jobs.map((j, i) => (
              <JobCard key={j.id} job={j} onOpen={() => onOpenJob(j.id)} delay={i * 60} />
            ))}
          </div>
        )}
      </div>

      {creating && (
        <NewJobDialog
          onClose={() => setCreating(false)}
          onCreated={(jobId) => {
            setCreating(false);
            load();
            onOpenJob(jobId);
          }}
        />
      )}
    </div>
  );
}

/* ── job card ──────────────────────────────────────────────── */
function JobCard({ job, onOpen, delay }: { job: JobSummary; onOpen: () => void; delay: number }) {
  const leader = job.leader;
  return (
    <button
      onClick={onOpen}
      className="glass group anim-fade-up relative flex w-full flex-col rounded-2xl p-5 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-400/25 hover:shadow-[0_24px_60px_-30px_rgba(16,185,129,0.35)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[16px] font-semibold tracking-tight text-slate-100">{job.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate-500">
            <Building2 className="h-3 w-3" /> {job.department || "General"}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            job.status === "OPEN" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/15 bg-white/5 text-slate-400"
          )}
        >
          {job.status}
        </span>
      </div>

      {/* weight split */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
          <span>CV {job.cvWeight}%</span>
          <span>Video {job.videoWeight}%</span>
        </div>
        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-white/6">
          <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300" style={{ width: `${job.cvWeight}%` }} />
          <div className="h-full flex-1 bg-gradient-to-r from-violet-500 to-violet-300" />
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="text-[12px] text-slate-500">
          <span className="font-semibold text-slate-300">{job.candidateCount}</span> candidate{job.candidateCount === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-slate-300">{job.criterionCount}</span> criteria ·{" "}
          <span className="font-semibold text-emerald-300">{job.evaluatedCount}</span> ranked
        </div>
        <ArrowUpRight className="h-4 w-4 text-slate-600 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-emerald-300" />
      </div>

      {leader ? (
        <div className="mt-3.5 flex items-center gap-2.5 rounded-xl border border-gold/25 bg-gold/[0.06] px-3 py-2">
          <Trophy className="h-4 w-4 shrink-0 text-gold" />
          <span className="min-w-0 flex-1 truncate text-[12px] text-slate-300">
            <span className="text-slate-500">Leader:</span> <span className="font-medium text-gold-soft">{leader.name}</span>
          </span>
          <span className="font-display text-sm font-bold tabular-nums text-gold-soft">{leader.score.toFixed(1)}</span>
        </div>
      ) : (
        <div className="mt-3.5 flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[12px] text-slate-500">
          <CircleSlash className="h-3.5 w-3.5" /> Not evaluated yet — run the ranking when evidence is in
        </div>
      )}
    </button>
  );
}

/* ── new role dialog ───────────────────────────────────────── */
function NewJobDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (jobId: string) => void }) {
  const [form, setForm] = useState({
    title: "",
    department: "",
    description: "",
    requirements: "",
    cvWeight: 40,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{ jobId: string }>("/api/jobs", "POST", {
        title: form.title,
        department: form.department,
        description: form.description,
        requirements: form.requirements,
        cvWeight: form.cvWeight,
      });
      onCreated(res.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the role");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="glass-deep anim-rise max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl p-6 sm:rounded-3xl sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight">Create a requisition</h3>
            <p className="mt-1 text-[13px] text-slate-500">
              Standard evidence-based criteria are preloaded — refine them after creation. Weights define the ranking formula for everyone.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Role title *</span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Operations Analyst"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Department</span>
              <input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                placeholder="e.g. Operations"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Role description</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="What this role is about…"
              className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Requirements the AI scores against</span>
            <textarea
              value={form.requirements}
              onChange={(e) => setForm({ ...form, requirements: e.target.value })}
              rows={3}
              placeholder="e.g. Bachelor degree, 2+ years operations experience, strong Excel, excellent spoken English…"
              className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
            />
          </label>
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium uppercase tracking-wider text-slate-500">Ranking weights</span>
              <span className="font-display text-sm font-semibold text-emerald-300">
                CV {form.cvWeight}% · Video {100 - form.cvWeight}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={form.cvWeight}
              onChange={(e) => setForm({ ...form, cvWeight: Number(e.target.value) })}
              className="mt-3 w-full accent-emerald-400"
            />
            <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-slate-600">
              <span>Document evidence</span>
              <span>Interview performance</span>
            </div>
          </div>
          {error && <p className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[13px] text-rose-300">{error}</p>}
          <div className="flex justify-end gap-2.5 pt-1">
            <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !form.title.trim()}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-5 py-2.5 font-display text-sm font-semibold text-emerald-950 hover:brightness-110 disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create role
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
