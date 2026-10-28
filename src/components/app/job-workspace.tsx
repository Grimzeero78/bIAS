"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, Loader2, Trophy, Plus, Trash2, FileText, Video, Copy, CheckCircle2,
  Clock, AlertTriangle, Crown, Medal, Settings2, Users, Scale, Eye, Ban, RotateCcw, RefreshCw, FileUp,
} from "lucide-react";
import { apiGet, apiSend, apiUpload } from "@/lib/api-client";
import { scoreColor, scoreTextColor, type JobDetail, type CandidateRow, type SessionUser, type Criterion } from "@/lib/types";

interface Props {
  jobId: string;
  user: SessionUser;
  onBack: () => void;
  onOpenReport: (candidateId: string) => void;
}

export default function JobWorkspace({ jobId, user, onBack, onOpenReport }: Props) {
  const [data, setData] = useState<JobDetail | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [tab, setTab] = useState<string>(user.role === "ADMIN" ? "ranking" : "candidates");

  // add-candidate dialog
  const [cOpen, setCOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cBusy, setCBusy] = useState(false);

  // add-criterion dialog
  const [kOpen, setKOpen] = useState(false);
  const [kName, setKName] = useState("");
  const [kDesc, setKDesc] = useState("");
  const [kCat, setKCat] = useState<"CV" | "VIDEO">("VIDEO");
  const [kWeight, setKWeight] = useState(3);
  const [kMandatory, setKMandatory] = useState(false);
  const [kMin, setKMin] = useState(60);

  // settings
  const [cvWeight, setCvWeight] = useState(40);
  const [visibility, setVisibility] = useState(false);
  const [reqs, setReqs] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const uploadTimers = useRef<Record<string, { name: string; pct: number }>>({});
  const [uploadPct, setUploadPct] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const res = await apiGet<JobDetail>(`/api/jobs/${jobId}`);
      setData(res);
      setCvWeight(res.job.cvWeight);
      setVisibility(res.job.candidateVisibility);
      setReqs(res.job.requirements);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load job");
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  // poll while any analysis is in flight
  useEffect(() => {
    if (!data) return;
    const busy = data.candidates.some(
      (c) =>
        c.cv?.status === "PENDING" || c.cv?.status === "PROCESSING" ||
        c.video?.status === "PENDING" || c.video?.status === "PROCESSING"
    );
    if (!busy) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [data, load]);

  async function addCandidate() {
    if (!cName.trim() || !cEmail.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setCBusy(true);
    try {
      const res = await apiSend<{ candidate: { accessCode: string; fullName: string } }>("/api/candidates", "POST", {
        jobId, fullName: cName, email: cEmail, phone: cPhone,
      });
      toast.success(`${res.candidate.fullName} added — access code ${res.candidate.accessCode}`, { duration: 8000 });
      setCOpen(false); setCName(""); setCEmail(""); setCPhone("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add candidate");
    } finally {
      setCBusy(false);
    }
  }

  async function addCriterion() {
    if (!kName.trim()) {
      toast.error("Criterion name is required");
      return;
    }
    try {
      await apiSend(`/api/jobs/${jobId}/criteria`, "POST", {
        name: kName, description: kDesc, category: kCat, weight: kWeight, isMandatory: kMandatory, minThreshold: kMin,
      });
      toast.success("Criterion added");
      setKOpen(false); setKName(""); setKDesc(""); setKMandatory(false); setKWeight(3); setKMin(60);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add criterion");
    }
  }

  async function removeCriterion(id: string) {
    try {
      await apiSend(`/api/jobs/${jobId}/criteria/${id}`, "DELETE");
      toast.success("Criterion removed");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove criterion");
    }
  }

  async function upload(candId: string, docType: "CV" | "VIDEO", file: File) {
    const key = `${candId}:${docType}`;
    setUploadPct((p) => ({ ...p, [key]: 1 }));
    try {
      const form = new FormData();
      form.append("candidateId", candId);
      form.append("docType", docType);
      form.append("file", file);
      await apiUpload("/api/upload", form, (pct) => setUploadPct((p) => ({ ...p, [key]: pct })));
      toast.success(`${docType === "CV" ? "CV" : "Interview video"} uploaded — AI analysis started`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setTimeout(() => setUploadPct((p) => { const n = { ...p }; delete n[key]; return n; }), 1500);
    }
  }

  async function runEvaluation() {
    setEvaluating(true);
    try {
      const res = await apiSend<{ evaluated: number }>(`/api/jobs/${jobId}/evaluate`, "POST");
      toast.success(`Ranking computed for ${res.evaluated} candidate(s) with AI justifications`);
      setTab("ranking");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setEvaluating(false);
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      await apiSend(`/api/jobs/${jobId}`, "PATCH", { cvWeight, candidateVisibility: visibility, requirements: reqs });
      toast.success("Settings saved");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function disqualify(c: CandidateRow) {
    try {
      await apiSend(`/api/candidates/${c.id}`, "PATCH", { status: c.status === "ACTIVE" ? "DISQUALIFIED" : "ACTIVE" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update candidate");
    }
  }

  async function removeCandidate(c: CandidateRow) {
    if (!confirm(`Remove ${c.fullName} and all their documents/analyses?`)) return;
    try {
      await apiSend(`/api/candidates/${c.id}`, "DELETE");
      toast.success("Candidate removed");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove candidate");
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => toast.success(`Access code ${code} copied`));
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-4">
        <div className="h-8 w-72 bg-slate-100 animate-pulse rounded" />
        <div className="h-64 bg-slate-50 animate-pulse rounded-xl border border-dashed" />
      </div>
    );
  }

  const ranked = data.candidates
    .filter((c) => c.evaluation?.rank != null && c.status === "ACTIVE")
    .sort((a, b) => (a.evaluation!.rank ?? 99) - (b.evaluation!.rank ?? 99));
  const evalBusy = data.candidates.some((c) => c.cv?.status === "PROCESSING" || c.video?.status === "PROCESSING" || c.cv?.status === "PENDING" || c.video?.status === "PENDING");

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2"><ArrowLeft className="h-4 w-4 mr-1.5" /> All openings</Button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            {data.job.title}
            <Badge variant={data.job.status === "OPEN" ? "secondary" : "outline"} className={data.job.status === "OPEN" ? "bg-emerald-100 text-emerald-800" : ""}>{data.job.status}</Badge>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {data.job.department || "General"} · {data.candidates.length} candidates · weighting <b>{data.job.cvWeight}% CV</b> / <b>{data.job.videoWeight}% video</b>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1.5" /> Refresh</Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={runEvaluation} disabled={evaluating || evalBusy}>
            {evaluating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trophy className="h-4 w-4 mr-1.5" />}
            {evaluating ? "Computing ranking…" : "Compute ranking"}
          </Button>
        </div>
      </div>

      {evalBusy && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm px-4 py-2.5 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> AI analyses are still running for some candidates — ranking is best computed once everything finishes.
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {user.role === "ADMIN" && (
            <TabsTrigger value="ranking" className="gap-1.5"><Trophy className="h-3.5 w-3.5" /> Ranking</TabsTrigger>
          )}
          <TabsTrigger value="candidates" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Candidates</TabsTrigger>
          <TabsTrigger value="criteria" className="gap-1.5"><Scale className="h-3.5 w-3.5" /> Criteria</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5"><Settings2 className="h-3.5 w-3.5" /> Settings</TabsTrigger>
        </TabsList>

        {/* RANKING */}
        <TabsContent value="ranking" className="pt-4 space-y-3">
          {ranked.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center space-y-2">
                <Trophy className="h-10 w-10 text-slate-300 mx-auto" />
                <p className="font-medium text-slate-700">No ranking yet</p>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Upload CVs and interview videos, let the AI analyses finish, then press <b>Compute ranking</b>. Scores are calculated deterministically and the AI writes the justifications.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {ranked.map((c, idx) => {
                const ev = c.evaluation!;
                const medal = idx === 0 ? <Crown className="h-5 w-5 text-amber-500" /> : idx < 3 ? <Medal className={`h-5 w-5 ${idx === 1 ? "text-slate-400" : "text-orange-400"}`} /> : null;
                return (
                  <Card key={c.id} className="shadow-sm hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer" onClick={() => onOpenReport(c.id)}>
                    <CardContent className="p-4 flex flex-wrap items-center gap-4">
                      <div className="w-12 text-center">
                        <div className="text-2xl font-bold text-slate-700 leading-none">{medal || `#${ev.rank}`}</div>
                        {!medal && <div className="text-[10px] text-slate-400 uppercase mt-0.5">rank</div>}
                      </div>
                      <div className="flex-1 min-w-44">
                        <div className="font-semibold text-slate-900">{c.fullName}</div>
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                          {ev.justification?.split("\n")[0]?.replace(/^[^a-zA-Z0-9]*/, "") || "No justification recorded"}
                        </div>
                      </div>
                      <div className="hidden md:flex items-center gap-5 text-center">
                        <div>
                          <div className="text-xs text-slate-400 uppercase">CV</div>
                          <div className={`font-semibold ${scoreTextColor(ev.cvScore)}`}>{Math.round(ev.cvScore)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 uppercase">Video</div>
                          <div className={`font-semibold ${scoreTextColor(ev.videoScore)}`}>{Math.round(ev.videoScore)}</div>
                        </div>
                      </div>
                      {ev.flags?.breaches?.length > 0 && (
                        <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 shrink-0"><AlertTriangle className="h-3 w-3 mr-1" /> mandatory breach</Badge>
                      )}
                      <div className="text-right w-16">
                        <div className={`text-2xl font-bold ${scoreTextColor(ev.finalScore)}`}>{Math.round(ev.finalScore)}</div>
                        <div className="text-[10px] text-slate-400 uppercase">final</div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* CANDIDATES */}
        <TabsContent value="candidates" className="pt-4 space-y-3">
          <div className="flex justify-end">
            <Dialog open={cOpen} onOpenChange={setCOpen}>
              <DialogTrigger asChild><Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-1.5" /> Add candidate</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add candidate</DialogTitle><DialogDescription>A personal access code is generated so they can check their own results later.</DialogDescription></DialogHeader>
                <div className="space-y-3 py-1">
                  <div className="space-y-1.5"><Label>Full name *</Label><Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="e.g. Grace Njeri" /></div>
                  <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="candidate@example.com" /></div>
                  <div className="space-y-1.5"><Label>Phone</Label><Input value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="optional" /></div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => setCOpen(false)}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700" onClick={addCandidate} disabled={cBusy}>{cBusy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Add</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {data.candidates.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-12 text-center space-y-2">
              <Users className="h-10 w-10 text-slate-300 mx-auto" />
              <p className="font-medium text-slate-700">No candidates yet</p>
              <p className="text-sm text-slate-500">Add candidates, then upload each one&apos;s CV and interview recording.</p>
            </CardContent></Card>
          ) : (
            data.candidates.map((c) => (
              <CandidateCard
                key={c.id}
                c={c}
                uploadPct={uploadPct}
                onUpload={upload}
                onOpenReport={() => onOpenReport(c.id)}
                onDisqualify={() => disqualify(c)}
                onRemove={() => removeCandidate(c)}
                onCopyCode={() => copyCode(c.accessCode)}
                canManage={user.role === "INTERVIEWER" || user.role === "ADMIN"}
              />
            ))
          )}
        </TabsContent>

        {/* CRITERIA */}
        <TabsContent value="criteria" className="pt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {(["CV", "VIDEO"] as const).map((cat) => (
              <Card key={cat} className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {cat === "CV" ? <FileText className="h-4 w-4 text-emerald-600" /> : <Video className="h-4 w-4 text-emerald-600" />}
                    {cat === "CV" ? "CV criteria" : "Video interview criteria"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.criteria.filter((k) => k.category === cat).length === 0 && (
                    <p className="text-xs text-slate-400 py-3 text-center">No {cat} criteria yet.</p>
                  )}
                  {data.criteria.filter((k) => k.category === cat).map((k) => (
                    <div key={k.id} className="rounded-lg border p-3 space-y-1.5 group">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800">{k.name}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-[11px]">weight {k.weight}</Badge>
                          {k.isMandatory && <Badge variant="outline" className="text-[11px] border-rose-200 bg-rose-50 text-rose-700">min {k.minThreshold}</Badge>}
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => removeCriterion(k.id)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{k.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
          <Dialog open={kOpen} onOpenChange={setKOpen}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1.5" /> Add criterion</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add analysis criterion</DialogTitle><DialogDescription>Describe exactly what the AI should evaluate and score.</DialogDescription></DialogHeader>
              <div className="space-y-3 py-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Name *</Label><Input value={kName} onChange={(e) => setKName(e.target.value)} placeholder="e.g. Confidence" /></div>
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={kCat} onValueChange={(v) => setKCat(v as "CV" | "VIDEO")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="CV">CV (document)</SelectItem><SelectItem value="VIDEO">Video (interview)</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5"><Label>What should the AI look for?</Label><Textarea rows={3} value={kDesc} onChange={(e) => setKDesc(e.target.value)} placeholder="e.g. Steady posture, direct eye contact, composed delivery under follow-up questions" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Weight (1-10)</Label><Input type="number" min={1} max={10} value={kWeight} onChange={(e) => setKWeight(parseInt(e.target.value) || 1)} /></div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between pt-5">
                      <Label className="flex items-center gap-1.5"><Switch checked={kMandatory} onCheckedChange={setKMandatory} className="mr-1.5" /> Mandatory</Label>
                    </div>
                    {kMandatory && <Input type="number" min={0} max={100} value={kMin} onChange={(e) => setKMin(parseInt(e.target.value) || 0)} placeholder="minimum score" />}
                  </div>
                </div>
                {kMandatory && <p className="text-xs text-rose-600 flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> If the candidate scores below {kMin} on this, a breach flag and a -10 ranking penalty are applied automatically.</p>}
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setKOpen(false)}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700" onClick={addCriterion}>Add criterion</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* SETTINGS */}
        <TabsContent value="settings" className="pt-4">
          <Card className="shadow-sm max-w-2xl">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Evaluation settings</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label className="flex items-center gap-1.5"><Scale className="h-3.5 w-3.5 text-emerald-600" /> CV vs Video weighting</Label><span className="text-sm font-semibold">{cvWeight}% CV · {100 - cvWeight}% Video</span></div>
                <Slider value={[cvWeight]} min={0} max={100} step={5} onValueChange={(v) => setCvWeight(v[0])} />
              </div>
              <div className="space-y-1.5">
                <Label>Job requirements (scored against CVs)</Label>
                <Textarea rows={4} value={reqs} onChange={(e) => setReqs(e.target.value)} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3.5">
                <div>
                  <div className="text-sm font-medium flex items-center gap-1.5"><Eye className="h-3.5 w-3.5 text-emerald-600" /> Candidates may view their own reports</div>
                  <p className="text-xs text-slate-500 mt-0.5">When enabled, candidates who sign in with their access code can see their scores, ranking and the full evidence report.</p>
                </div>
                <Switch checked={visibility} onCheckedChange={setVisibility} />
              </div>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={saveSettings} disabled={savingSettings}>
                {savingSettings ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Save settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Candidate card ───────────────────────────────────────────
function CandidateCard({
  c, uploadPct, onUpload, onOpenReport, onDisqualify, onRemove, onCopyCode, canManage,
}: {
  c: CandidateRow;
  uploadPct: Record<string, number>;
  onUpload: (candId: string, docType: "CV" | "VIDEO", file: File) => void;
  onOpenReport: () => void;
  onDisqualify: () => void;
  onRemove: () => void;
  onCopyCode: () => void;
  canManage: boolean;
}) {
  const cvInput = useRef<HTMLInputElement | null>(null);
  const vidInput = useRef<HTMLInputElement | null>(null);

  const cvPct = uploadPct[`${c.id}:CV`];
  const vidPct = uploadPct[`${c.id}:VIDEO`];

  function statusBadge(status?: string | null, progress?: string | null, error?: string | null) {
    if (!status || status === "PENDING" && !progress) return null;
    if (status === "COMPLETED") return <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> done</Badge>;
    if (status === "PROCESSING" || status === "PENDING") return <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700"><Clock className="h-3 w-3 animate-pulse" /> {progress || "queued"}</Badge>;
    if (status === "FAILED") return <Badge variant="outline" className="gap-1 border-rose-200 bg-rose-50 text-rose-700"><AlertTriangle className="h-3 w-3" /> failed</Badge>;
    return null;
  }

  return (
    <Card className={`shadow-sm ${c.status === "DISQUALIFIED" ? "opacity-60" : ""}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-700 font-semibold flex items-center justify-center shrink-0">
            {c.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </div>
          <div className="flex-1 min-w-40">
            <div className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              {c.fullName}
              {c.evaluation?.rank != null && c.status === "ACTIVE" && <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-800">#{c.evaluation.rank}</Badge>}
              {c.status === "DISQUALIFIED" && <Badge variant="destructive">disqualified</Badge>}
            </div>
            <div className="text-xs text-slate-500">{c.email}</div>
          </div>
          <button onClick={onCopyCode} className="text-xs font-mono bg-slate-50 border rounded px-2 py-1 text-slate-600 hover:bg-slate-100" title="Copy access code">
            code {c.accessCode} <Copy className="h-3 w-3 inline ml-0.5" />
          </button>
          {c.evaluation && (
            <div className="text-right">
              <span className={`text-lg font-bold ${scoreTextColor(c.evaluation.finalScore)}`}>{Math.round(c.evaluation.finalScore)}</span>
              <span className="text-xs text-slate-400">/100</span>
            </div>
          )}
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={onOpenReport}>Report</Button>
            {canManage && (
              <>
                <Button size="sm" variant="ghost" onClick={onDisqualify} title={c.status === "ACTIVE" ? "Disqualify" : "Restore"}>
                  {c.status === "ACTIVE" ? <Ban className="h-4 w-4 text-rose-500" /> : <RotateCcw className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={onRemove} title="Remove"><Trash2 className="h-4 w-4 text-rose-500" /></Button>
              </>
            )}
          </div>
        </div>

        {/* documents + statuses */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border bg-slate-50/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> CV document</span>
              {statusBadge(c.cv?.status, c.cv?.progress, c.cv?.error)}
            </div>
            {c.documents.filter((d) => d.type === "CV").map((d) => (
              <div key={d.id} className="flex items-center gap-1.5 text-xs text-slate-500">
                <FileUp className="h-3 w-3" />
                <a href={`/api/files/${d.id}`} target="_blank" rel="noreferrer" className="underline hover:text-emerald-700 truncate">{d.filename}</a>
                <span className="shrink-0">({(d.sizeBytes / 1024).toFixed(0)} KB)</span>
              </div>
            ))}
            {cvPct !== undefined ? (
              <Progress value={cvPct} className="h-1.5" />
            ) : (
              canManage && (
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => cvInput.current?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload CV (PDF/DOCX)
                </Button>
              )
            )}
            <input ref={cvInput} type="file" accept=".pdf,.docx,.doc,.txt,.md" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(c.id, "CV", f); e.target.value = ""; }} />
            {c.cv?.status === "FAILED" && c.cv.error && <p className="text-[11px] text-rose-600 leading-snug">{c.cv.error}</p>}
          </div>

          <div className="rounded-lg border bg-slate-50/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><Video className="h-3.5 w-3.5" /> Interview video</span>
              {statusBadge(c.video?.status, c.video?.progress, c.video?.error)}
            </div>
            {c.documents.filter((d) => d.type === "VIDEO").map((d) => (
              <div key={d.id} className="flex items-center gap-1.5 text-xs text-slate-500">
                <Video className="h-3 w-3" />
                <a href={`/api/files/${d.id}`} target="_blank" rel="noreferrer" className="underline hover:text-emerald-700 truncate">{d.filename}</a>
                <span className="shrink-0">({(d.sizeBytes / 1048576).toFixed(1)} MB)</span>
              </div>
            ))}
            {vidPct !== undefined ? (
              <Progress value={vidPct} className="h-1.5" />
            ) : (
              canManage && (
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => vidInput.current?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload recording (MP4/MOV/WebM)
                </Button>
              )
            )}
            <input ref={vidInput} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.mov,.webm,.mkv,.avi" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(c.id, "VIDEO", f); e.target.value = ""; }} />
            {c.video?.status === "FAILED" && c.video.error && <p className="text-[11px] text-rose-600 leading-snug">{c.video.error}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
