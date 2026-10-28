"use client";

import { useCallback, useEffect, useState } from "react";
import { Scale, LogOut, Trophy, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiSend } from "@/lib/api-client";
import type { SessionUser } from "@/lib/types";
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
      <div className="min-h-screen flex items-center justify-center gap-2 text-slate-500">
        <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center animate-pulse"><Scale className="h-4 w-4" /></div>
        <span className="text-sm">RecruitAI is starting…</span>
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
    <div className="min-h-screen flex flex-col bg-slate-50/60">
      {/* Top navigation */}
      <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <button className="flex items-center gap-2.5" onClick={() => setView({ type: "jobs" })}>
            <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center"><Scale className="h-4 w-4" /></div>
            <span className="font-bold tracking-tight">RecruitAI</span>
            <Badge variant="outline" className="hidden sm:inline-flex border-emerald-200 text-emerald-700 bg-emerald-50">
              {isAdmin ? <Trophy className="h-3 w-3 mr-1" /> : <Users className="h-3 w-3 mr-1" />}
              {isAdmin ? "CEO / Admin" : "Interviewer"}
            </Badge>
          </button>
          <div className="flex items-center gap-2">
            {isAdmin && view.type !== "audit" && (
              <Button variant="ghost" size="sm" onClick={() => setView({ type: "audit" })}>
                <ShieldCheck className="h-4 w-4 mr-1.5" /> Audit
              </Button>
            )}
            <span className="hidden sm:inline text-xs text-slate-500">{user.name}</span>
            <Button variant="ghost" size="sm" onClick={logout} title="Sign out"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1">
        {view.type === "jobs" && (
          <Dashboard user={user} onOpenJob={(jobId) => setView({ type: "job", jobId })} onOpenAudit={() => setView({ type: "audit" })} />
        )}
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

      {/* Sticky footer */}
      <footer className="border-t bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 text-xs text-slate-400 flex flex-wrap justify-between gap-2">
          <span>RecruitAI — objective, evidence-backed hiring</span>
          <span>Deterministic scoring · AI explanations · append-only audit log</span>
        </div>
      </footer>
    </div>
  );
}
