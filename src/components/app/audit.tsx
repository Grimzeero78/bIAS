"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ShieldCheck, Search } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { EmptyState, SectionHead, SkeletonCard } from "@/components/app/atoms";
import { cn } from "@/lib/utils";

interface AuditEntry {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: string | null;
  createdAt: string;
}

const ACTION_GROUPS: Record<string, string[]> = {
  "Access": ["LOGIN", "LOGIN_FAILED", "CANDIDATE_LOGIN", "CANDIDATE_LOGIN_FAILED"],
  "Evidence": ["UPLOAD_CV", "UPLOAD_VIDEO", "VIEW_DOCUMENT"],
  "Process": ["CREATE_JOB", "UPDATE_JOB", "ADD_CANDIDATE", "REMOVE_CANDIDATE", "DISQUALIFY_CANDIDATE", "RESTORE_CANDIDATE", "RUN_EVALUATION"],
  "Decisions": ["CEO_DECISION_ADVANCE", "CEO_DECISION_HOLD", "CEO_DECISION_REJECT", "CEO_DECISION_CLEARED"],
  "Transparency": ["VIEW_JOB", "VIEW_OWN_REPORT"],
};

const GROUP_COLOR: Record<string, string> = {
  "Access": "border-cyan-400/25 bg-cyan-400/10 text-cyan-300",
  "Evidence": "border-violet-400/25 bg-violet-400/10 text-violet-300",
  "Process": "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  "Decisions": "border-gold/35 bg-gold/10 text-gold-soft",
  "Transparency": "border-white/15 bg-white/5 text-slate-300",
};

function groupOf(action: string): string {
  for (const [g, list] of Object.entries(ACTION_GROUPS)) {
    if (list.some((a) => action.startsWith(a))) return g;
  }
  return "Process";
}

function prettyAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AuditView({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [group, setGroup] = useState<string>("All");
  const [q, setQ] = useState("");

  useEffect(() => {
    apiGet<{ entries: AuditEntry[] }>("/api/audit?limit=300")
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
  }, []);

  const filtered = useMemo(() => {
    let list = entries || [];
    if (group !== "All") list = list.filter((e) => groupOf(e.action) === group);
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter((e) => `${e.actorName} ${e.action} ${e.details || ""}`.toLowerCase().includes(needle));
    }
    return list;
  }, [entries, group, q]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6 sm:py-9">
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-slate-500 transition hover:text-slate-200">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <div className="anim-fade-up">
        <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
          <ShieldCheck className="h-4 w-4" /> Integrity ledger
        </p>
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight sm:text-3xl">Audit trail</h1>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-slate-500">
          Append-only record of every sensitive action — logins, uploads, evaluations, report views and your final decisions.
          This is the proof the process was clean.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {["All", ...Object.keys(ACTION_GROUPS)].map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition",
              group === g ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200" : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-slate-200"
            )}
          >
            {g}
          </button>
        ))}
        <label className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search actor or action…"
            className="w-56 rounded-xl border border-white/10 bg-black/40 py-2 pl-9 pr-3 text-[13px] text-slate-200 placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-5">
        <SectionHead title={`${filtered.length} entr${filtered.length === 1 ? "y" : "ies"}`} sub="Newest first" />
        {entries === null ? (
          <div className="space-y-2.5">
            <SkeletonCard className="h-16" />
            <SkeletonCard className="h-16" />
            <SkeletonCard className="h-16" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="Nothing recorded here yet" sub="Actions will appear as they happen." />
        ) : (
          <div className="space-y-2">
            {filtered.map((e, i) => {
              const g = groupOf(e.action);
              let details: string = "";
              if (e.details) {
                try {
                  const parsed = JSON.parse(e.details);
                  details = Object.entries(parsed)
                    .filter(([k, v]) => v != null && k !== "0")
                    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                    .slice(0, 3)
                    .join(" · ");
                } catch {
                  details = e.details.slice(0, 120);
                }
              }
              return (
                <div key={e.id} className="glass anim-fade-up flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-4 py-3" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                  <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide", GROUP_COLOR[g])}>{prettyAction(e.action)}</span>
                  <span className="text-[13px] font-medium text-slate-200">{e.actorName}</span>
                  <span className="text-[11px] uppercase tracking-wider text-slate-600">{e.actorRole}</span>
                  {details && <span className="min-w-0 flex-1 truncate text-[12px] text-slate-500">{details}</span>}
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-slate-600">
                    {new Date(e.createdAt).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
