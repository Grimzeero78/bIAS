"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOut, ShieldCheck, Gavel, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiSend } from "@/lib/api-client";
import type { SessionUser } from "@/lib/types";
import { Logo, AiChip } from "@/components/app/brand";
import LoginView from "@/components/app/login";
import Dashboard from "@/components/app/dashboard";
import JobWorkspace from "@/components/app/job-workspace";
import CandidateReport from "@/components/app/report";
import AuditView from "@/components/app/audit";
import CandidatePortal from "@/components/app/portal";

type View =
  | { type: "jobs" }
  | { type: "job"; jobId: string }
  | { type: "report"; candidateId: string; jobId?: string }
  | { type: "audit" };

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<View>({ type: "jobs" });

  // session bootstrap
  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet<{ user: SessionUser }>("/api/auth/me");
        setUser(res.user);
      } catch {
        setUser(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiSend("/api/auth/logout", "POST");
    } finally {
      setUser(null);
      setView({ type: "jobs" });
    }
  }, []);

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-slate-500">
        <Logo />
        <span className="anim-pulse-soft text-sm">starting…</span>
      </div>
    );
  }

  if (!user) {
    return <LoginView onAuthenticated={(u) => { setUser(u); setView({ type: "jobs" }); }} />;
  }

  // ── Candidate portal has its own layout ──
  if (user.role === "CANDIDATE") {
    return <CandidatePortal user={user} onLogout={logout} />;
  }

  const isAdmin = user.role === "ADMIN";

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top navigation */}
      <header className="sticky top-0 z-40 border-b border-white/6 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <button className="flex items-center gap-3" onClick={() => setView({ type: "jobs" })}>
            <Logo />
            <span
              className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold sm:inline-flex ${
                isAdmin ? "border-gold/35 bg-gold/10 text-gold-soft" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
              }`}
            >
              {isAdmin ? <Gavel className="h-3 w-3" /> : <Scale className="h-3 w-3" />}
              {isAdmin ? "CEO · Final decisions" : "Interview Panel"}
            </span>
          </button>
          <div className="flex items-center gap-2">
            <AiChip className="hidden md:inline-flex" />
            {isAdmin && view.type !== "audit" && (
              <Button variant="ghost" size="sm" onClick={() => setView({ type: "audit" })} className="text-slate-400 hover:text-slate-100 hover:bg-white/5">
                <ShieldCheck className="h-4 w-4" /> Audit trail
              </Button>
            )}
            <span className="hidden text-[13px] text-slate-400 sm:inline">{user.name}</span>
            <Button variant="ghost" size="sm" onClick={logout} title="Sign out" className="text-slate-400 hover:bg-white/5 hover:text-slate-100">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1">
        {view.type === "jobs" && <Dashboard user={user} onOpenJob={(jobId) => setView({ type: "job", jobId })} />}
        {view.type === "job" && (
          <JobWorkspace
            jobId={view.jobId}
            user={user}
            onBack={() => setView({ type: "jobs" })}
            onOpenReport={(candidateId) => setView({ type: "report", candidateId, jobId: view.jobId })}
          />
        )}
        {view.type === "report" && (
          <CandidateReport
            candidateId={view.candidateId}
            mode="staff"
            onBack={() => (view.jobId ? setView({ type: "job", jobId: view.jobId }) : setView({ type: "jobs" }))}
          />
        )}
        {view.type === "audit" && <AuditView onBack={() => setView({ type: "jobs" })} />}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11.5px] text-slate-600 sm:px-6">
          <span className="flex items-center gap-2">
            <Logo compact /> TrueMerit — hiring on merit, evidence and nothing else
          </span>
          <span>Deterministic ranks · AI explanations only · Append-only audit trail</span>
        </div>
      </footer>
    </div>
  );
}
