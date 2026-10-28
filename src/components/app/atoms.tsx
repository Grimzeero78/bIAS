"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { fmtT } from "@/lib/types";
import type { Decision } from "@/lib/types";

/* ── score palette helpers (dark theme) ─────────────────────── */
export function scoreHue(score: number | null | undefined): "emerald" | "amber" | "rose" | "muted" {
  if (score == null) return "muted";
  if (score >= 80) return "emerald";
  if (score >= 60) return "amber";
  return "rose";
}

const HUE_TEXT: Record<string, string> = {
  emerald: "text-emerald-300",
  amber: "text-amber-300",
  rose: "text-rose-300",
  muted: "text-slate-400",
};

const HUE_CHIP: Record<string, string> = {
  emerald: "bg-emerald-400/12 text-emerald-300 border-emerald-400/25",
  amber: "bg-amber-400/12 text-amber-300 border-amber-400/25",
  rose: "bg-rose-400/12 text-rose-300 border-rose-400/25",
  muted: "bg-white/5 text-slate-400 border-white/10",
};

const HUE_BAR: Record<string, string> = {
  emerald: "from-emerald-500 to-emerald-300",
  amber: "from-amber-500 to-amber-300",
  rose: "from-rose-500 to-rose-300",
  muted: "from-slate-600 to-slate-500",
};

export { HUE_TEXT, HUE_CHIP, HUE_BAR };

/* ── animated score ring ────────────────────────────────────── */
export function ScoreRing({
  value,
  size = 120,
  stroke = 9,
  label,
  gold = false,
  className,
}: {
  value: number | null | undefined;
  size?: number;
  stroke?: number;
  label?: string;
  gold?: boolean;
  className?: string;
}) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setShown(v), 60);
    return () => clearTimeout(t);
  }, [v]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const id = `ring-${size}-${Math.round(v)}-${gold ? "g" : "n"}`;
  const hue = scoreHue(value);
  const from = gold ? "#F5D06F" : hue === "emerald" ? "#34D399" : hue === "amber" ? "#FBBF24" : hue === "rose" ? "#FB7185" : "#475569";
  const to = gold ? "#C9932F" : hue === "emerald" ? "#059669" : hue === "amber" ? "#D97706" : hue === "rose" ? "#E11D48" : "#334155";
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(148,163,184,0.15)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c - (shown / 100) * c}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-display font-bold tabular-nums leading-none", HUE_TEXT[hue])} style={{ fontSize: size * 0.26 }}>
          {value == null ? "—" : v.toFixed(1)}
        </span>
        {label !== undefined && (
          <span className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</span>
        )}
      </div>
    </div>
  );
}

/* ── criterion bar with threshold marker ────────────────────── */
export function CriterionBar({
  name,
  score,
  rationale,
  weight,
  category,
  threshold,
  breached,
}: {
  name: string;
  score: number | null | undefined;
  rationale?: string;
  weight?: number;
  category?: "CV" | "VIDEO";
  threshold?: number | null;
  breached?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hue = scoreHue(score);
  const v = score == null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <div className="group rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 transition-colors hover:border-white/10 hover:bg-white/[0.04]">
      <div className="flex items-center gap-3">
        {category && (
          <span
            className={cn(
              "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
              category === "CV" ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-300" : "border-violet-400/25 bg-violet-400/10 text-violet-300"
            )}
          >
            {category}
          </span>
        )}
        <button className="flex-1 text-left" onClick={() => rationale && setOpen((o) => !o)}>
          <span className="text-sm font-medium text-slate-200">{name}</span>
          {weight != null && <span className="ml-2 text-[11px] text-slate-500">weight {weight}</span>}
        </button>
        {threshold != null && (
          <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-slate-500">
            min {threshold}
            {breached && <span className="ml-1 text-rose-400 font-semibold">· breached</span>}
          </span>
        )}
        <span className={cn("shrink-0 rounded-md border px-2 py-0.5 font-display text-sm font-semibold tabular-nums", HUE_CHIP[hue])}>
          {score == null ? "—" : v.toFixed(0)}
        </span>
      </div>
      <div className="relative mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/6">
        <div
          className={cn("anim-grow absolute inset-y-0 left-0 rounded-full bg-gradient-to-r", HUE_BAR[hue])}
          style={{ width: `${v}%` }}
        />
        {threshold != null && (
          <div
            className="absolute inset-y-[-3px] w-[2px] bg-slate-300/60"
            style={{ left: `${Math.min(100, Math.max(0, threshold))}%` }}
            title={`Minimum required: ${threshold}`}
          />
        )}
      </div>
      {open && rationale && (
        <p className="anim-fade-in mt-2.5 border-l-2 border-emerald-400/30 pl-3 text-[13px] leading-relaxed text-slate-400">{rationale}</p>
      )}
    </div>
  );
}

/* ── AI advisory banner — the core positioning statement ────── */
export function AiAdvisory({ compact = false, className }: { compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-[12px] text-emerald-200/90", className)}>
        <SparkIcon className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <span><strong className="font-semibold">AI insight — advisory only.</strong> Final decisions rest with the panel.</span>
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-r from-emerald-400/[0.08] via-emerald-400/[0.04] to-transparent p-4 sm:p-5", className)}>
      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-2">
          <SparkIcon className="h-5 w-5 text-emerald-300" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold tracking-tight text-emerald-100">
            AI-assisted. Human-decided.
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
            Scores and ranks are computed <em className="text-slate-300 not-italic">deterministically in code</em> from the weights the panel configured —
            the AI only analyses evidence and writes explanations. It cannot change a rank, and it never makes the hiring call.
          </p>
        </div>
      </div>
    </div>
  );
}

export function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 2l1.9 5.7L20 9.6l-5 3.8 1.6 6.1L12 16l-4.6 3.5L9 13.4 4 9.6l6.1-1.9L12 2z" fill="currentColor" />
    </svg>
  );
}

/* ── CEO decision stamp ─────────────────────────────────────── */
const DECISION_STYLE: Record<Decision, string> = {
  ADVANCE: "text-emerald-300",
  HOLD: "text-amber-300",
  REJECT: "text-rose-300",
};

export function DecisionStamp({ decision, note, by, size = "md" }: { decision: Decision; note?: string | null; by?: string | null; size?: "sm" | "md" }) {
  return (
    <div className={cn("inline-flex flex-col items-start gap-1.5", size === "sm" ? "scale-90 origin-left" : "")}>
      <span className={cn("stamp anim-stamp inline-block px-3 py-1 font-display", DECISION_STYLE[decision], size === "sm" ? "text-[11px]" : "text-sm")}>
        {decision}
      </span>
      {(note || by) && (
        <span className="text-[11px] leading-snug text-slate-500">
          {by && <span className="text-slate-400">{by}</span>}
          {by && note ? " · " : ""}
          {note}
        </span>
      )}
    </div>
  );
}

/* ── analysis status pill ───────────────────────────────────── */
export function StatusPill({ status, progress, error }: { status: string; progress?: string | null; error?: string | null }) {
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    PENDING: { label: "Queued", cls: "border-white/15 bg-white/5 text-slate-300", dot: "bg-slate-400 anim-pulse-soft" },
    PROCESSING: { label: progress || "Analysing", cls: "border-cyan-400/25 bg-cyan-400/10 text-cyan-300", dot: "bg-cyan-400 anim-pulse-soft" },
    COMPLETED: { label: "Complete", cls: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300", dot: "bg-emerald-400" },
    FAILED: { label: "Failed", cls: "border-rose-400/25 bg-rose-400/10 text-rose-300", dot: "bg-rose-400" },
  };
  const s = map[status] || map.PENDING;
  return (
    <span
      className={cn("inline-flex max-w-[240px] items-center gap-1.5 truncate rounded-full border px-2.5 py-0.5 text-[11px] font-medium", s.cls)}
      title={error || progress || undefined}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.dot)} />
      {error ? `${s.label} — ${error.slice(0, 60)}` : s.label}
    </span>
  );
}

/* ── stat tile ──────────────────────────────────────────────── */
export function StatTile({
  label,
  value,
  sub,
  accent = "emerald",
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: "emerald" | "gold" | "rose" | "slate";
  icon?: React.ReactNode;
  className?: string;
}) {
  const accents: Record<string, string> = {
    emerald: "text-emerald-300",
    gold: "text-gradient-gold",
    rose: "text-rose-300",
    slate: "text-slate-200",
  };
  return (
    <div className={cn("glass rounded-2xl p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{label}</span>
        {icon && <span className="text-slate-500">{icon}</span>}
      </div>
      <div className={cn("mt-2 font-display text-3xl font-bold tabular-nums tracking-tight", accents[accent])}>{value}</div>
      {sub && <p className="mt-1 text-[12px] text-slate-500">{sub}</p>}
    </div>
  );
}

/* ── section heading ────────────────────────────────────────── */
export function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-slate-100">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-slate-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/* ── empty state ────────────────────────────────────────────── */
export function EmptyState({ icon, title, sub, action }: { icon?: React.ReactNode; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-14 text-center">
      {icon && <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-400">{icon}</div>}
      <p className="font-display text-[15px] font-semibold text-slate-200">{title}</p>
      {sub && <p className="mt-1 max-w-md text-[13px] leading-relaxed text-slate-500">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ── rank medal chip ────────────────────────────────────────── */
export function RankChip({ rank, className }: { rank: number; className?: string }) {
  const style =
    rank === 1
      ? "border-gold/50 bg-gold/15 text-gold-soft shadow-[0_0_24px_-6px_rgba(229,184,75,0.55)]"
      : rank === 2
        ? "border-slate-300/40 bg-slate-300/15 text-slate-200"
        : rank === 3
          ? "border-amber-700/50 bg-amber-700/20 text-amber-400"
          : "border-white/12 bg-white/5 text-slate-400";
  return (
    <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border font-display text-sm font-bold tabular-nums", style, className)}>
      {rank}
    </span>
  );
}

/* ── observation timeline (click-to-seek handled by parent) ── */
export function ObservationRow({
  t,
  category,
  observation,
  quote,
  onSeek,
  active,
}: {
  t: number;
  category: string;
  observation: string;
  quote?: string;
  onSeek?: (t: number) => void;
  active?: boolean;
}) {
  const catHue: Record<string, string> = {
    Confidence: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    Dressing: "border-gold/30 bg-gold/10 text-gold-soft",
    "Body Language": "border-violet-400/25 bg-violet-400/10 text-violet-300",
    Engagement: "border-cyan-400/25 bg-cyan-400/10 text-cyan-300",
  };
  return (
    <button
      onClick={() => onSeek?.(t)}
      className={cn(
        "group flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all",
        active ? "border-emerald-400/40 bg-emerald-400/[0.07]" : "border-white/6 bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.045]"
      )}
    >
      <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-300 group-hover:border-emerald-400/40">
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
        {fmtT(t)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-md border px-1.5 py-px text-[10px] font-semibold", catHue[category] || "border-white/12 bg-white/5 text-slate-400")}>
            {category}
          </span>
        </span>
        <span className="mt-1 block text-[13px] leading-relaxed text-slate-300">{observation}</span>
        {quote && <span className="mt-1 block truncate text-[12px] italic text-slate-500">“{quote}”</span>}
      </span>
    </button>
  );
}

/* ── loading skeleton ───────────────────────────────────────── */
export function SkeletonCard({ className }: { className?: string }) {
  return <div className={cn("anim-shimmer rounded-2xl border border-white/5", className)} />;
}

/* ── count-up number (subtle, used on tiles) ────────────────── */
export function CountUp({ to, decimals = 0, className }: { to: number; decimals?: number; className?: string }) {
  const [v, setV] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 900;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(to * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [to]);
  return <span className={cn("tabular-nums", className)}>{v.toFixed(decimals)}</span>;
}
