"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ArrowLeft, FileText, Video, Loader2, AlertTriangle, ShieldAlert, Quote,
  GraduationCap, Briefcase, Wrench, ThumbsUp, ThumbsDown, Play, MessageSquareText, Scale,
} from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { fmtT, scoreColor, scoreTextColor, type CriterionScore, type Observation, type Breach, type ParsedCv } from "@/lib/types";

interface AnalysisPayload {
  candidate: { id: string; fullName: string; status: string };
  job: { id: string; title: string; cvWeight: number; videoWeight: number; candidateVisibility: boolean };
  documents?: { id: string; type: string; filename: string }[];
  cv: { status: string; progress?: string | null; error?: string | null; overallScore?: number | null; parsed?: ParsedCv | null; scores?: CriterionScore[] } | null;
  video: { status: string; progress?: string | null; error?: string | null; durationSec?: number | null; overallScore?: number | null; transcript?: string | null; scores?: CriterionScore[]; observations?: Observation[] } | null;
  evaluation: { cvScore: number; videoScore: number; finalScore: number; rank?: number | null; justification?: string | null; flags: { breaches: Breach[] } } | null;
}

interface Props {
  candidateId: string;
  mode: "staff" | "candidate";
  onBack?: () => void;
  videoDocId?: string | null;
}

function ScoreRow({ score }: { score: CriterionScore }) {
  return (
    <div className="space-y-1.5 py-2.5 border-b last:border-b-0 border-slate-100">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-800">{score.name}</span>
        <Badge variant="outline" className={`${scoreColor(score.score)} font-semibold shrink-0`}>{Math.round(score.score)}/100</Badge>
      </div>
      <Progress value={score.score} className="h-1.5" />
      {score.rationale && <p className="text-xs text-slate-500 leading-relaxed pt-0.5">{score.rationale}</p>}
    </div>
  );
}

function StatusCard({ status, progress, error }: { status: string; progress?: string | null; error?: string | null }) {
  if (status === "PROCESSING" || status === "PENDING") {
    return (
      <div className="flex items-center gap-3 text-sm text-slate-600 py-6 justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
        <span>{progress || "Working…"} — the AI engine is analysing. This page updates automatically.</span>
      </div>
    );
  }
  if (status === "FAILED") {
    return (
      <div className="flex items-start gap-2.5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3.5">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>{error || "Analysis failed."} The interviewer can re-upload the document to retry.</span>
      </div>
    );
  }
  return null;
}

export default function CandidateReport({ candidateId, mode, onBack, videoDocId }: Props) {
  const [data, setData] = useState<AnalysisPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<AnalysisPayload>(`/api/analysis/${candidateId}`);
      setData(res);
      setError(null);
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      return null;
    }
  }, [candidateId]);

  useEffect(() => {
    // async fetch on mount — setState happens after await, not synchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // poll while anything is pending
  useEffect(() => {
    if (!data) return;
    const busy =
      data.cv?.status === "PENDING" || data.cv?.status === "PROCESSING" ||
      data.video?.status === "PENDING" || data.video?.status === "PROCESSING";
    if (!busy) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [data, load]);

  function seek(t: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    v.play().catch(() => {});
    v.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-3">
        <ShieldAlert className="h-10 w-10 text-rose-400 mx-auto" />
        <p className="text-slate-700 font-medium">{error}</p>
        {onBack && <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <div className="grid lg:grid-cols-2 gap-4"><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" /></div>
      </div>
    );
  }

  const ev = data.evaluation;
  const busy = data.cv?.status === "PENDING" || data.cv?.status === "PROCESSING" || data.video?.status === "PENDING" || data.video?.status === "PROCESSING";
  const cvScores = data.cv?.scores || [];
  const videoScores = data.video?.scores || [];
  const observations = data.video?.observations || [];
  const parsed = data.cv?.parsed;
  const resolvedVideoDocId = videoDocId ?? data.documents?.find((d) => d.type === "VIDEO")?.id ?? null;
  const hasVideo = !!resolvedVideoDocId;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2"><ArrowLeft className="h-4 w-4 mr-1.5" /> Back</Button>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{data.candidate.fullName}</h1>
            {ev?.rank != null && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">Rank #{ev.rank}</Badge>
            )}
            {data.candidate.status === "DISQUALIFIED" && <Badge variant="destructive">Disqualified</Badge>}
          </div>
          <p className="text-sm text-slate-500 mt-1">{data.job.title} · CV {data.job.cvWeight}% / Video {data.job.videoWeight}% weighting</p>
        </div>
        {ev && (
          <div className="text-right">
            <div className={`text-4xl font-bold ${scoreTextColor(ev.finalScore)}`}>{Math.round(ev.finalScore)}<span className="text-lg text-slate-400">/100</span></div>
            <div className="text-xs text-slate-500">final weighted score</div>
          </div>
        )}
      </div>

      {/* Score composition */}
      {ev && (
        <Card className="shadow-sm">
          <CardContent className="p-5 grid sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-wide"><FileText className="h-3.5 w-3.5" /> CV score</div>
              <div className="text-2xl font-bold">{Math.round(ev.cvScore)}<span className="text-sm text-slate-400 font-normal">/100</span></div>
              <div className="text-xs text-slate-400">weight {data.job.cvWeight}%</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-wide"><Video className="h-3.5 w-3.5" /> Video score</div>
              <div className="text-2xl font-bold">{Math.round(ev.videoScore)}<span className="text-sm text-slate-400 font-normal">/100</span></div>
              <div className="text-xs text-slate-400">weight {data.job.videoWeight}%</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-wide"><Scale className="h-3.5 w-3.5" /> Final score</div>
              <div className={`text-2xl font-bold ${scoreTextColor(ev.finalScore)}`}>{Math.round(ev.finalScore)}<span className="text-sm text-slate-400 font-normal">/100</span></div>
              <div className="text-xs text-slate-400">rank #{ev.rank ?? "—"}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mandatory breaches */}
      {ev?.flags?.breaches?.length ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-rose-800">Mandatory requirement not met</div>
            <ul className="list-disc ml-4 mt-1 space-y-0.5 text-rose-700">
              {ev.flags.breaches.map((b, i) => (
                <li key={i}>
                  <b>{b.criterionName}</b> ({b.category}) scored {Math.round(b.score)} — the interviewer required at least {b.minThreshold}. A -10 ranking penalty was applied.
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* The "Why" */}
      {ev?.justification && (
        <Card className="shadow-sm border-emerald-100 bg-emerald-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Quote className="h-4 w-4 text-emerald-600" /> Why this ranking</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{ev.justification}</CardContent>
        </Card>
      )}

      {busy && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm px-4 py-3 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Some analyses are still running — scores will appear as the engine completes.
        </div>
      )}

      {/* Video evidence */}
      {data.video && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Video className="h-4 w-4 text-emerald-600" /> Interview video analysis
              {data.video.overallScore != null && <Badge className={`${scoreColor(data.video.overallScore)} ml-auto`}>{Math.round(data.video.overallScore)}/100</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusCard status={data.video.status} progress={data.video.progress} error={data.video.error} />
            {data.video.status === "COMPLETED" && (
              <>
                <div className="grid lg:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    {hasVideo ? (
                      <video
                        ref={videoRef}
                        controls
                        preload="metadata"
                        className="w-full rounded-lg border bg-black"
                        src={`/api/files/${resolvedVideoDocId}`}
                      />
                    ) : (
                      <div className="rounded-lg border bg-slate-50 p-8 text-center text-sm text-slate-400">Video file unavailable</div>
                    )}
                    <p className="text-xs text-slate-400">Click any timestamped observation to jump straight to that moment.</p>

                    {/* Observations timeline */}
                    {observations.length > 0 && (
                      <div className="rounded-lg border max-h-80 overflow-y-auto divide-y divide-slate-100">
                        {observations.map((o, i) => (
                          <button
                            key={i}
                            onClick={() => seek(o.t)}
                            disabled={!hasVideo}
                            className="w-full text-left px-3.5 py-2.5 hover:bg-emerald-50/60 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
                          >
                            <div className="flex items-center gap-2 text-xs">
                              <Badge variant="outline" className="font-mono text-[11px] bg-slate-50 shrink-0"><Play className="h-2.5 w-2.5 mr-0.5" />{fmtT(o.t)}</Badge>
                              <span className="text-slate-500">{o.category}</span>
                            </div>
                            <div className="text-sm text-slate-700 mt-1 leading-snug">{o.observation}</div>
                            {o.quote && <div className="text-xs text-slate-400 italic mt-1 flex gap-1"><MessageSquareText className="h-3 w-3 shrink-0 mt-0.5" />“{o.quote}”</div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Criterion breakdown</div>
                    {videoScores.length > 0 ? videoScores.map((s) => <ScoreRow key={s.criterionId} score={s} />) : <p className="text-sm text-slate-400 py-4">No video criteria were configured for this job.</p>}
                  </div>
                </div>

                {data.video.transcript && (
                  <details className="rounded-lg border bg-slate-50/60">
                    <summary className="cursor-pointer text-sm font-medium px-4 py-2.5 text-slate-700">Interview transcript (with segment timestamps)</summary>
                    <div className="px-4 pb-3.5 text-xs text-slate-600 whitespace-pre-line max-h-64 overflow-y-auto leading-relaxed">{data.video.transcript}</div>
                  </details>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* CV analysis */}
      {data.cv && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-600" /> CV analysis
              {data.cv.overallScore != null && <Badge className={`${scoreColor(data.cv.overallScore)} ml-auto`}>{Math.round(data.cv.overallScore)}/100</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusCard status={data.cv.status} progress={data.cv.progress} error={data.cv.error} />
            {data.cv.status === "COMPLETED" && (
              <div className="grid lg:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-700">Criterion breakdown</div>
                  {cvScores.length > 0 ? cvScores.map((s) => <ScoreRow key={s.criterionId} score={s} />) : <p className="text-sm text-slate-400 py-4">No CV criteria were configured for this job.</p>}
                </div>
                <div className="space-y-3.5">
                  {parsed?.headline && (
                    <div className="text-sm"><span className="text-slate-500">Headline:</span> <span className="font-medium text-slate-800">{parsed.headline}</span></div>
                  )}
                  {parsed?.summary && <p className="text-xs text-slate-500 leading-relaxed">{parsed.summary}</p>}
                  {parsed?.skills && parsed.skills.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-1.5"><Wrench className="h-3.5 w-3.5" /> Extracted skills</div>
                      <div className="flex flex-wrap gap-1.5">{parsed.skills.slice(0, 24).map((s, i) => <Badge key={i} variant="secondary" className="text-xs font-normal">{s}</Badge>)}</div>
                    </div>
                  )}
                  {parsed?.experience && parsed.experience.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-1.5"><Briefcase className="h-3.5 w-3.5" /> Experience</div>
                      <div className="space-y-2">
                        {parsed.experience.slice(0, 6).map((x, i) => (
                          <div key={i} className="text-xs border-l-2 border-emerald-200 pl-2.5">
                            <span className="font-semibold text-slate-700">{x.role}</span>
                            {x.organisation && <span className="text-slate-500"> · {x.organisation}</span>}
                            {x.period && <span className="text-slate-400"> · {x.period}</span>}
                            {x.highlights && <div className="text-slate-500 mt-0.5 leading-relaxed">{x.highlights}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {parsed?.education && parsed.education.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-1.5"><GraduationCap className="h-3.5 w-3.5" /> Education</div>
                      <div className="space-y-1">{parsed.education.slice(0, 5).map((e, i) => (
                        <div key={i} className="text-xs text-slate-600">{e.degree}{e.institution ? ` — ${e.institution}` : ""}{e.year ? ` (${e.year})` : ""}</div>
                      ))}</div>
                    </div>
                  )}
                  <Separator />
                  <div className="grid grid-cols-1 gap-3">
                    {parsed?.strengths && parsed.strengths.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5 mb-1"><ThumbsUp className="h-3.5 w-3.5" /> Strengths</div>
                        <ul className="list-disc ml-4 text-xs text-slate-600 space-y-0.5">{parsed.strengths.slice(0, 6).map((s, i) => <li key={i}>{s}</li>)}</ul>
                      </div>
                    )}
                    {parsed?.concerns && parsed.concerns.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-rose-700 flex items-center gap-1.5 mb-1"><ThumbsDown className="h-3.5 w-3.5" /> Concerns</div>
                        <ul className="list-disc ml-4 text-xs text-slate-600 space-y-0.5">{parsed.concerns.slice(0, 6).map((s, i) => <li key={i}>{s}</li>)}</ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mode === "candidate" && (
        <p className="text-xs text-slate-400 text-center pt-2">
          This report was generated automatically from your CV and recorded interview. Contact the hiring team for clarifications.
        </p>
      )}
    </div>
  );
}
