"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Scale, ShieldCheck, Video, FileText, Trophy, Eye, Loader2, Sparkles } from "lucide-react";
import { apiSend } from "@/lib/api-client";
import type { SessionUser } from "@/lib/types";

interface Props {
  onAuthenticated: (user: SessionUser) => void;
}

export default function LoginView({ onAuthenticated }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cCode, setCCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function staffLogin() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{ user: SessionUser }>("/api/auth/login", "POST", { email, password });
      onAuthenticated(res.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function candidateLogin() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{ user: SessionUser }>("/api/auth/candidate", "POST", { email: cEmail, accessCode: cCode });
      onAuthenticated(res.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-emerald-50/40 flex flex-col">
      <header className="border-b bg-white/70 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold tracking-tight text-lg leading-none">RecruitAI</div>
              <div className="text-[11px] text-slate-500 leading-none mt-0.5">Objective Hiring Intelligence</div>
            </div>
          </div>
          <Badge variant="outline" className="gap-1.5 border-emerald-200 text-emerald-700 bg-emerald-50">
            <ShieldCheck className="h-3.5 w-3.5" /> Corruption-free by design
          </Badge>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-10 lg:py-16 grid lg:grid-cols-2 gap-10 items-start">
        {/* Pitch */}
        <section className="space-y-6">
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
              Every hire. <span className="text-emerald-600">Evidence-backed.</span>
            </h1>
            <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
              RecruitAI scores candidates on what actually matters — their CV substance and their
              recorded interview performance — then ranks them and shows the receipts. No gut feeling,
              no backdoor deals: every score carries its evidence trail.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { icon: FileText, title: "AI CV parsing", text: "Skills, education and experience extracted and scored against the role." },
              { icon: Video, title: "Video analysis", text: "Body language, dressing, English proficiency and sentiment — with timestamps." },
              { icon: Trophy, title: "Transparent ranking", text: "Weighted scoring ranks candidates 1-N with a written justification." },
              { icon: Eye, title: "Full audit trail", text: "Every upload, view and evaluation is logged for the CEO's review." },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border bg-white p-4 shadow-sm">
                <f.icon className="h-5 w-5 text-emerald-600 mb-2" />
                <div className="font-semibold text-sm text-slate-900">{f.title}</div>
                <div className="text-xs text-slate-500 mt-1 leading-relaxed">{f.text}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-slate-600 leading-relaxed">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-800 mb-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Demo accounts
            </div>
            CEO / Admin — <code className="bg-white px-1 py-0.5 rounded border">admin@recruit.ai / admin123</code>
            <br />
            Interviewer — <code className="bg-white px-1 py-0.5 rounded border">interviewer@recruit.ai / interview123</code>
            <br />
            Candidates sign in below with their email + personal access code.
          </div>
        </section>

        {/* Login card */}
        <section>
          <Card className="shadow-lg border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Sign in</CardTitle>
              <CardDescription>Choose your portal.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="staff">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="staff">Staff</TabsTrigger>
                  <TabsTrigger value="candidate">Candidate</TabsTrigger>
                </TabsList>

                <TabsContent value="staff" className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Work email</Label>
                    <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && staffLogin()} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && staffLogin()} />
                  </div>
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={staffLogin} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Sign in as staff
                  </Button>
                </TabsContent>

                <TabsContent value="candidate" className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="cemail">Application email</Label>
                    <Input id="cemail" type="email" placeholder="you@example.com" value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ccode">Access code</Label>
                    <Input id="ccode" placeholder="e.g. K7RM2QPX" value={cCode} onChange={(e) => setCCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && candidateLogin()} />
                  </div>
                  <p className="text-xs text-slate-500">
                    Your access code was issued when the interviewer registered your application. Score visibility depends on the employer&apos;s policy for the role.
                  </p>
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={candidateLogin} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    View my results
                  </Button>
                </TabsContent>
              </Tabs>

              {error && (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-sm px-3 py-2.5">{error}</div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t bg-white/70 py-4 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-xs text-slate-400 flex flex-wrap gap-x-6 gap-y-1 justify-between">
          <span>RecruitAI — AI-assisted, evidence-backed recruitment</span>
          <span>Scores are computed deterministically; AI writes explanations, not verdicts.</span>
        </div>
      </footer>
    </div>
  );
}
