"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Briefcase, Users, Scale, Trophy, Plus, Loader2, RefreshCw, Crown, Lock, Eye } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api-client";
import type { JobSummary, SessionUser } from "@/lib/types";

interface Props {
  user: SessionUser;
  onOpenJob: (jobId: string) => void;
  onOpenAudit: () => void;
}

export default function Dashboard({ user, onOpenJob, onOpenAudit }: Props) {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);

  // new job form
  const [title, setTitle] = useState("");
  const [dept, setDept] = useState("");
  const [desc, setDesc] = useState("");
  const [reqs, setReqs] = useState("");
  const [cvWeight, setCvWeight] = useState(40);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ jobs: JobSummary[] }>("/api/jobs");
      setJobs(res.jobs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createJob() {
    if (!title.trim()) {
      toast.error("Give the job opening a title");
      return;
    }
    setCreating(true);
    try {
      const res = await apiSend<{ jobId: string }>("/api/jobs", "POST", {
        title,
        department: dept,
        description: desc,
        requirements: reqs,
        cvWeight,
      });
      toast.success("Job opening created with default analysis criteria");
      setOpen(false);
      setTitle(""); setDept(""); setDesc(""); setReqs(""); setCvWeight(40);
      onOpenJob(res.jobId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create job");
    } finally {
      setCreating(false);
    }
  }

  const stats = {
    jobs: jobs.length,
    candidates: jobs.reduce((a, j) => a + j.candidateCount, 0),
    evaluated: jobs.reduce((a, j) => a + j.evaluatedCount, 0),
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Briefcase className="h-5 w-5" /></div>
            <div><div className="text-2xl font-bold leading-none">{stats.jobs}</div><div className="text-xs text-slate-500 mt-1">Job openings</div></div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><Users className="h-5 w-5" /></div>
            <div><div className="text-2xl font-bold leading-none">{stats.candidates}</div><div className="text-xs text-slate-500 mt-1">Candidates</div></div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center"><Trophy className="h-5 w-5" /></div>
            <div><div className="text-2xl font-bold leading-none">{stats.evaluated}</div><div className="text-xs text-slate-500 mt-1">Evaluated</div></div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><Scale className="h-5 w-5" /></div>
            <div><div className="text-2xl font-bold leading-none">100%</div><div className="text-xs text-slate-500 mt-1">Evidence-logged</div></div>
          </CardContent>
        </Card>
      </div>

      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {user.role === "ADMIN" ? "Executive overview" : "Your requisitions"}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {user.role === "ADMIN"
              ? "All openings across the organisation — rankings, evidence and audit trail."
              : "Create openings, register candidates, upload CVs and interview recordings."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1.5" /> Refresh</Button>
          {user.role === "ADMIN" && (
            <Button variant="outline" size="sm" onClick={onOpenAudit}><Eye className="h-4 w-4 mr-1.5" /> Audit trail</Button>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-1.5" /> New job opening</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create job opening</DialogTitle>
                <DialogDescription>
                  A default set of CV + video analysis criteria is created automatically — you can tune weights afterwards.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3.5 py-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Job title *</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Operations Analyst" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Department</Label>
                    <Input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="e.g. Operations" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Role description</Label>
                  <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What the role is about..." />
                </div>
                <div className="space-y-1.5">
                  <Label>Requirements the AI will score CVs against</Label>
                  <Textarea rows={3} value={reqs} onChange={(e) => setReqs(e.target.value)} placeholder="e.g. Bachelor degree, 2+ years experience, Excel, fluent English..." />
                </div>
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between text-sm">
                    <Label className="flex items-center gap-1.5"><Scale className="h-3.5 w-3.5 text-emerald-600" /> CV vs Video weighting</Label>
                    <span className="font-semibold">{cvWeight}% CV · {100 - cvWeight}% Video</span>
                  </div>
                  <Slider value={[cvWeight]} min={0} max={100} step={5} onValueChange={(v) => setCvWeight(v[0])} />
                  <p className="text-xs text-slate-500">The final score blends the CV rubric and the video interview rubric with these weights.</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={createJob} disabled={creating}>
                  {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Create opening
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Job cards */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Card key={i} className="h-44 animate-pulse bg-slate-50 border-dashed" />)}
        </div>
      ) : jobs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center space-y-2">
            <Briefcase className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="font-medium text-slate-700">No job openings yet</p>
            <p className="text-sm text-slate-500">Create your first opening to start adding candidates.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((job) => (
            <Card
              key={job.id}
              className="cursor-pointer hover:shadow-md hover:border-emerald-200 transition-all"
              onClick={() => onOpenJob(job.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{job.title}</CardTitle>
                  <Badge variant={job.status === "OPEN" ? "secondary" : "outline"} className={job.status === "OPEN" ? "bg-emerald-100 text-emerald-800 shrink-0" : "shrink-0"}>
                    {job.status}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-1">{job.department || "General"} · {new Date(job.createdAt).toLocaleDateString()}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {job.candidateCount} candidates</span>
                  <span className="flex items-center gap-1"><Scale className="h-3.5 w-3.5" /> {job.cvWeight}/{job.videoWeight}</span>
                  {job.candidateVisibility && <span className="flex items-center gap-1 text-emerald-700"><Eye className="h-3.5 w-3.5" /> visible to candidates</span>}
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">Evaluation progress</span>
                    <span className="font-medium">{job.evaluatedCount}/{job.candidateCount}</span>
                  </div>
                  <Progress value={job.candidateCount ? (job.evaluatedCount / job.candidateCount) * 100 : 0} className="h-1.5" />
                </div>
                {job.leader ? (
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 w-fit">
                    <Crown className="h-3.5 w-3.5 text-amber-500" />
                    Leading: <span className="font-semibold">{job.leader.name}</span> · {job.leader.score}/100
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Lock className="h-3 w-3" /> Ranking not run yet
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
