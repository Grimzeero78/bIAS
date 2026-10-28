"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, Scale, FileSearch, Video, ArrowRight, Quote } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api-client";
import type { SessionUser } from "@/lib/types";
import { Logo, MeritMark } from "@/components/app/brand";

interface Hints {
  admin: string;
  interviewer: string;
}

const PILLARS = [
  {
    icon: FileSearch,
    title: "Evidence over impressions",
    body: "Every CV and every second of the interview video is analysed into criterion scores with cited evidence — nothing rests on a gut feeling.",
  },
  {
    icon: Scale,
    title: "One formula, applied to all",
    body: "Ranks are computed in code from weights the panel sets in advance. Identical rules for every candidate — no favourites, no shortcuts.",
  },
  {
    icon: Video,
    title: "Nothing to hide",
    body: "Candidates see their own full report with timestamps; the CEO sees the complete board and the reasoning behind every position.",
  },
];

export default function LoginView({ onAuthenticated }: { onAuthenticated: (u: SessionUser) => void }) {
  const [tab, setTab] = useState<"staff" | "candidate">("staff");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hints, setHints] = useState<Hints>({ admin: "Starts with “CEO-”", interviewer: "Starts with “PANEL-”" });

  useEffect(() => {
    apiGet<{ hints: Hints }>("/api/auth/hints").then((r) => setHints(r.hints)).catch(() => {});
  }, []);

  async function submitStaff(e?: React.FormEvent) {
    e?.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{ user: SessionUser }>("/api/auth/login", "POST", { password });
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitCandidate(e?: React.FormEvent) {
    e?.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{ user: SessionUser }>("/api/auth/candidate", "POST", { accessCode: code });
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* ambient glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[560px] w-[860px] -translate-x-1/2 rounded-full bg-emerald-500/[0.07] blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[520px] rounded-full bg-gold/[0.05] blur-[120px]" />
      </div>

      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
        {/* ── brand story ── */}
        <div className="anim-rise order-2 lg:order-1">
          <div className="flex items-center gap-3">
            <MeritMark size={46} className="anim-float" />
            <div>
              <p className="font-display text-xl font-bold tracking-tight">
                True<span className="text-gradient-gold">Merit</span>
              </p>
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Hiring intelligence</p>
            </div>
          </div>

          <h1 className="mt-8 font-display text-[34px] font-bold leading-[1.08] tracking-tight text-slate-50 sm:text-5xl">
            Merit decides.
            <br />
            <span className="text-gradient-emerald">Not connections.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
            TrueMerit removes favouritism from recruitment. Every application is scored against the
            same published criteria, every rank is computed by a fixed formula, and every candidate
            can see exactly why they landed where they did.
          </p>

          <div className="mt-8 grid gap-3.5 sm:grid-cols-3">
            {PILLARS.map((p, i) => (
              <div
                key={p.title}
                className="glass rounded-2xl p-4 anim-fade-up"
                style={{ animationDelay: `${140 + i * 90}ms` }}
              >
                <p.icon className="h-5 w-5 text-emerald-300" />
                <p className="mt-2.5 font-display text-[13px] font-semibold text-slate-100">{p.title}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{p.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-gold/25 bg-gold/[0.05] p-4">
            <Quote className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <p className="text-[13px] leading-relaxed text-slate-300">
              <span className="font-display font-semibold text-gold-soft">The AI is the assistant — never the judge.</span>{" "}
              It reads documents, watches footage and writes explanations. The ranking formula and the
              final hiring decision belong to people, and every step is stamped into an audit trail the CEO can inspect.
            </p>
          </div>
        </div>

        {/* ── access card ── */}
        <div className="anim-rise order-1 lg:order-2" style={{ animationDelay: "80ms" }}>
          <div className="glass-deep mx-auto w-full max-w-md rounded-3xl p-6 sm:p-7">
            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-white/8 bg-black/30 p-1.5">
              {(
                [
                  { id: "staff", label: "Staff / CEO", icon: ShieldCheck },
                  { id: "candidate", label: "My results", icon: KeyRound },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTab(t.id);
                    setError(null);
                  }}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all ${
                    tab === t.id
                      ? "bg-emerald-500/15 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.35)]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "staff" ? (
              <form onSubmit={submitStaff} className="anim-fade-in mt-6 space-y-4">
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-tight">Staff access</h2>
                  <p className="mt-1 text-[13px] text-slate-500">
                    One password per role — no emails. The CEO password opens the executive board; the panel password runs interviews.
                  </p>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your access password"
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[15px] text-slate-100 placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                  />
                </label>
                <div className="space-y-1.5 rounded-xl border border-white/6 bg-white/[0.03] p-3 text-[12px] text-slate-400">
                  <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-gold" /> CEO — hint: {hints.admin}</p>
                  <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Interview panel — hint: {hints.interviewer}</p>
                </div>
                {error && <p className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[13px] text-rose-300">{error}</p>}
                <button
                  type="submit"
                  disabled={busy || !password}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-3 font-display text-[15px] font-semibold text-emerald-950 transition-all hover:brightness-110 disabled:opacity-40 glow-emerald"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {busy ? "Verifying…" : "Enter the boardroom"}
                </button>
              </form>
            ) : (
              <form onSubmit={submitCandidate} className="anim-fade-in mt-6 space-y-4">
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-tight">Check your results</h2>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Enter the personal code your interviewer gave you to see your full interview report — your scores, the evidence, and what to improve.
                  </p>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Interview access code</span>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="E.g. 7KQM2XRD"
                    autoComplete="off"
                    maxLength={16}
                    className="code-input w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3.5 text-center text-[17px] font-semibold text-gold-soft placeholder:text-slate-600 focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/20"
                  />
                </label>
                {error && <p className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[13px] text-rose-300">{error}</p>}
                <button
                  type="submit"
                  disabled={busy || !code}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold to-gold-soft px-4 py-3 font-display text-[15px] font-semibold text-[#241a02] transition-all hover:brightness-110 disabled:opacity-40 glow-gold"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {busy ? "Opening…" : "Open my report"}
                </button>
                <p className="text-center text-[12px] text-slate-600">
                  Lost your code? Ask your interviewer — codes are issued per application.
                </p>
              </form>
            )}
          </div>

          <p className="mt-4 text-center text-[11px] text-slate-600">
            Deterministic scoring · Append-only audit trail · Candidate transparency by default
          </p>
        </div>
      </div>
    </div>
  );
}
