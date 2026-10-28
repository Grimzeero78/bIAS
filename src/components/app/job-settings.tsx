"use client";

import { useState } from "react";
import { Plus, Trash2, Loader2, X, ShieldAlert, Eye, Save } from "lucide-react";
import { apiSend } from "@/lib/api-client";
import type { Criterion, JobDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ═══════════════ CRITERIA TAB ═══════════════ */
export function CriteriaTab({ data, onChanged }: { data: JobDetail; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function addCriterion(payload: {
    name: string;
    description: string;
    category: "CV" | "VIDEO";
    weight: number;
    isMandatory: boolean;
    minThreshold: number;
  }) {
    await apiSend(`/api/jobs/${data.job.id}/criteria`, "POST", payload).catch(() => {});
    setAdding(false);
    onChanged();
  }

  async function updateCriterion(c: Criterion, patch: Partial<Criterion>) {
    setBusyId(c.id);
    await apiSend(`/api/jobs/${data.job.id}/criteria/${c.id}`, "PATCH", patch).catch(() => {});
    setBusyId(null);
    onChanged();
  }

  async function removeCriterion(c: Criterion) {
    if (!confirm(`Remove criterion "${c.name}"? Existing scores for it are discarded on the next ranking run.`)) return;
    setBusyId(c.id);
    await apiSend(`/api/jobs/${data.job.id}/criteria/${c.id}`, "DELETE").catch(() => {});
    setBusyId(null);
    onChanged();
  }

  const cv = data.criteria.filter((c) => c.category === "CV");
  const vid = data.criteria.filter((c) => c.category === "VIDEO");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Scoring criteria</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-slate-500">
            Every candidate is scored against the same rubric. Mandatory criteria carry a −10 final-score penalty when missed —
            the formula applies identically to everyone, which is what makes the ranking corruption-resistant.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-200 hover:bg-emerald-400/15"
        >
          <Plus className="h-4 w-4" /> Add criterion
        </button>
      </div>

      <CriterionGroup title="CV criteria" sub="Scored from the uploaded CV" items={cv} accent="cyan" onUpdate={updateCriterion} onRemove={removeCriterion} busyId={busyId} />
      <CriterionGroup
        title="Video interview criteria"
        sub="Scored from the interview video (visual + spoken evidence)"
        items={vid}
        accent="violet"
        onUpdate={updateCriterion}
        onRemove={removeCriterion}
        busyId={busyId}
      />

      {adding && <AddCriterionDialog onClose={() => setAdding(false)} onAdd={addCriterion} />}
    </div>
  );
}

function CriterionGroup({
  title,
  sub,
  items,
  accent,
  onUpdate,
  onRemove,
  busyId,
}: {
  title: string;
  sub: string;
  items: Criterion[];
  accent: "cyan" | "violet";
  onUpdate: (c: Criterion, patch: Partial<Criterion>) => void;
  onRemove: (c: Criterion) => void;
  busyId: string | null;
}) {
  const totalW = items.reduce((a, c) => a + c.weight, 0);
  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          <span className={cn("h-2 w-2 rounded-full", accent === "cyan" ? "bg-cyan-400" : "bg-violet-400")} /> {title}
        </h3>
        <span className="text-[11px] text-slate-600">total weight {totalW}</span>
      </div>
      <div className="grid gap-2.5">
        {items.length === 0 && <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-[13px] text-slate-600">No criteria in this group yet.</p>}
        {items.map((c) => (
          <div key={c.id} className="glass flex flex-wrap items-center gap-3 rounded-xl px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-200">
                {c.name}
                {c.isMandatory && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-rose-400/25 bg-rose-400/10 px-1.5 py-px text-[10px] font-semibold text-rose-300">
                    <ShieldAlert className="h-3 w-3" /> mandatory ≥ {c.minThreshold}
                  </span>
                )}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-slate-500">{c.description}</p>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              weight
              <select
                value={c.weight}
                onChange={(e) => onUpdate(c, { weight: Number(e.target.value) })}
                className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm text-slate-200 focus:border-emerald-400/50 focus:outline-none"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((w) => (
                  <option key={w} value={w} className="bg-[#0d141f]">
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <input
                type="checkbox"
                checked={c.isMandatory}
                onChange={(e) =>
                  onUpdate(c, {
                    isMandatory: e.target.checked,
                    minThreshold: e.target.checked ? (c.minThreshold ?? 60) : c.minThreshold,
                  })
                }
                className="h-3.5 w-3.5 accent-rose-400"
              />
              mandatory
            </label>
            {c.isMandatory && (
              <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                min
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={c.minThreshold ?? 60}
                  onChange={(e) => onUpdate(c, { minThreshold: Math.max(0, Math.min(100, Number(e.target.value))) })}
                  className="w-14 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm tabular-nums text-slate-200 focus:border-emerald-400/50 focus:outline-none"
                />
              </label>
            )}
            <button onClick={() => onRemove(c)} className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-500 hover:border-rose-400/40 hover:text-rose-300" title="Remove criterion">
              {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddCriterionDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (p: { name: string; description: string; category: "CV" | "VIDEO"; weight: number; isMandatory: boolean; minThreshold: number }) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "VIDEO" as "CV" | "VIDEO",
    weight: 3,
    isMandatory: false,
    minThreshold: 60,
  });
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="glass-deep anim-rise w-full max-w-lg rounded-t-3xl p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h3 className="font-display text-lg font-semibold tracking-tight">Add criterion</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Name *</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Communication Skills"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">What the AI should look for</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="Describe what strong evidence looks like for this criterion…"
              className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Scored from</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as "CV" | "VIDEO" })}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-slate-200 focus:border-emerald-400/50 focus:outline-none"
              >
                <option value="CV" className="bg-[#0d141f]">CV document</option>
                <option value="VIDEO" className="bg-[#0d141f]">Interview video</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Weight (1–10)</span>
              <input
                type="number"
                min={1}
                max={10}
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: Math.max(1, Math.min(10, Number(e.target.value))) })}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm tabular-nums text-slate-200 focus:border-emerald-400/50 focus:outline-none"
              />
            </label>
          </div>
          <label className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3 text-[13px] text-slate-300">
            <input type="checkbox" checked={form.isMandatory} onChange={(e) => setForm({ ...form, isMandatory: e.target.checked })} className="h-4 w-4 accent-rose-400" />
            Mandatory — failing it costs −10 final points
          </label>
          {form.isMandatory && (
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Minimum acceptable score (0–100)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={form.minThreshold}
                onChange={(e) => setForm({ ...form, minThreshold: Math.max(0, Math.min(100, Number(e.target.value))) })}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm tabular-nums text-slate-200 focus:border-emerald-400/50 focus:outline-none"
              />
            </label>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2.5">
          <button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={async () => {
              if (!form.name.trim() || busy) return;
              setBusy(true);
              await onAdd({ ...form, name: form.name.trim() });
            }}
            disabled={busy || !form.name.trim()}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-5 py-2.5 font-display text-sm font-semibold text-emerald-950 hover:brightness-110 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add criterion
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ SETTINGS TAB ═══════════════ */
export function SettingsTab({ data, onChanged, onClosed }: { data: JobDetail; onChanged: () => void; onClosed: () => void }) {
  const { job } = data;
  const [cvWeight, setCvWeight] = useState(job.cvWeight);
  const [reqs, setReqs] = useState(job.requirements);
  const [desc, setDesc] = useState(job.description);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setSaved(false);
    try {
      await apiSend(`/api/jobs/${job.id}`, "PATCH", patch);
      await new Promise((r) => setTimeout(r, 400));
      onChanged();
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* weights + requirements */}
      <div className="glass rounded-2xl p-5">
        <h3 className="font-display text-[15px] font-semibold tracking-tight">Ranking formula</h3>
        <p className="mt-1 text-[13px] text-slate-500">The weights define the exact formula used to rank every candidate. Changing them re-ranks on the next evaluation run.</p>
        <div className="mt-4 flex items-center justify-between text-[13px]">
          <span className="font-medium text-cyan-300">CV {cvWeight}%</span>
          <span className="font-medium text-violet-300">Video {100 - cvWeight}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={cvWeight}
          onChange={(e) => setCvWeight(Number(e.target.value))}
          className="mt-2.5 w-full accent-emerald-400"
        />
        <button
          onClick={() => save({ cvWeight })}
          disabled={busy || cvWeight === job.cvWeight}
          className="mt-3 flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-[13px] font-semibold text-emerald-950 hover:brightness-110 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {saved ? "Saved" : "Save weights"}
        </button>

        <hr className="my-5 border-white/8" />

        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Requirements the AI scores against</span>
          <textarea value={reqs} onChange={(e) => setReqs(e.target.value)} rows={4} className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-slate-100 focus:border-emerald-400/50 focus:outline-none" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Role description</span>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-slate-100 focus:border-emerald-400/50 focus:outline-none" />
        </label>
        <button
          onClick={() => save({ requirements: reqs, description: desc })}
          disabled={busy}
          className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-[13px] font-medium text-emerald-200 hover:bg-emerald-400/15 disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" /> Save text
        </button>
      </div>

      {/* transparency + lifecycle */}
      <div className="space-y-5">
        <div className="glass rounded-2xl p-5">
          <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <Eye className="h-4 w-4 text-emerald-300" /> Candidate transparency
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            When enabled, anyone holding their personal access code can open their full report: scores, evidence with timestamps and a growth plan. We default this ON —
            transparency is the whole point.
          </p>
          <button
            onClick={() => save({ candidateVisibility: !job.candidateVisibility })}
            disabled={busy}
            className={cn(
              "mt-4 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition",
              job.candidateVisibility ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.03] text-slate-400"
            )}
          >
            <span className="font-medium">{job.candidateVisibility ? "Candidates can view their results" : "Results hidden from candidates"}</span>
            <span className={cn("relative h-6 w-11 rounded-full transition", job.candidateVisibility ? "bg-emerald-500/70" : "bg-white/10")}>
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", job.candidateVisibility ? "left-[22px]" : "left-0.5")} />
            </span>
          </button>
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-display text-[15px] font-semibold tracking-tight">Requisition lifecycle</h3>
          <p className="mt-1 text-[13px] text-slate-500">Closing a role keeps all evidence and history readable but signals that hiring is complete.</p>
          <div className="mt-4 flex gap-2.5">
            <button
              onClick={async () => {
                await save({ status: job.status === "OPEN" ? "CLOSED" : "OPEN" });
              }}
              disabled={busy}
              className={cn(
                "flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:opacity-40",
                job.status === "OPEN"
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15"
                  : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15"
              )}
            >
              {job.status === "OPEN" ? "Close this role" : "Re-open this role"}
            </button>
            <button onClick={onClosed} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">
              Done
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5">
          <h3 className="font-display text-[15px] font-semibold tracking-tight text-emerald-100">How integrity is enforced</h3>
          <ul className="mt-2.5 space-y-2 text-[13px] leading-relaxed text-slate-400">
            <li className="flex gap-2"><span className="text-emerald-300">1.</span> Criteria and weights are configured <em className="not-italic text-slate-300">before</em> evidence is uploaded.</li>
            <li className="flex gap-2"><span className="text-emerald-300">2.</span> Ranks come from a fixed formula in code — the AI cannot move them.</li>
            <li className="flex gap-2"><span className="text-emerald-300">3.</span> Every view, upload and decision is stamped into an append-only audit trail.</li>
            <li className="flex gap-2"><span className="text-emerald-300">4.</span> The CEO records the final call under their own name.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
