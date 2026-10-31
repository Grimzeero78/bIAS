"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UserPlus, Upload, Film, FileText, Loader2, X, Copy, Check, Trash2, UserX, UserCheck, Eye, KeyRound, Cpu } from "lucide-react";
import { apiGet, apiSend, apiUpload } from "@/lib/api-client";
import { preprocessVideo, type PreprocessProgress } from "@/lib/media-client";
import type { CandidateRow, JobDetail } from "@/lib/types";
import { EmptyState, StatusPill } from "@/components/app/atoms";
import { cn } from "@/lib/utils";

export function CandidatesTab({ data, onChanged, onOpenReport }: { data: JobDetail; onChanged: () => void; onOpenReport: (candidateId: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [issuedCode, setIssuedCode] = useState<{ name: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // poll while any analysis is running
  const anyRunning = data.candidates.some(
    (c) =>
      c.cv?.status === "PROCESSING" ||
      c.cv?.status === "PENDING" ||
      c.video?.status === "PROCESSING" ||
      c.video?.status === "PENDING"
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (anyRunning) {
      pollRef.current = setInterval(() => {
        apiGet<JobDetail>(`/api/jobs/${data.job.id}`).then(() => onChanged()).catch(() => {});
      }, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [anyRunning, data.job.id, onChanged]);

  async function addCandidate(e: React.FormEvent) {
    e.preventDefault();
    if (addBusy) return;
    setAddBusy(true);
    setFormError(null);
    try {
      const res = await apiSend<{ candidate: { id: string; fullName: string; accessCode: string } }>("/api/candidates", "POST", {
        jobId: data.job.id,
        ...form,
      });
      setIssuedCode({ name: res.candidate.fullName, code: res.candidate.accessCode });
      setForm({ fullName: "", email: "", phone: "" });
      setAdding(false);
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not add the candidate");
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* issued code banner */}
      {issuedCode && (
        <div className="anim-fade-up rounded-2xl border border-gold/35 bg-gradient-to-r from-gold/[0.09] to-transparent p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 font-display text-[15px] font-semibold text-gold-soft">
                <KeyRound className="h-4 w-4" /> Access code issued for {issuedCode.name}
              </p>
              <p className="mt-1 text-[13px] text-slate-400">
                Share this code with the candidate — it opens their transparent results report. No email login, no password.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="code-input rounded-xl border border-gold/40 bg-black/40 px-5 py-3 font-mono text-xl font-bold text-gold-soft">{issuedCode.code}</span>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(issuedCode.code);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  } catch {}
                }}
                className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-[12px] text-slate-300 hover:border-gold/40 hover:text-gold-soft"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Candidates</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Register applicants, upload their CV and interview video — the browser prepares the video evidence for the AI.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-200 hover:bg-emerald-400/15"
        >
          <UserPlus className="h-4 w-4" /> Add candidate
        </button>
      </div>

      {adding && (
        <form onSubmit={addCandidate} className="glass anim-fade-up rounded-2xl p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Full name *</span>
              <input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="e.g. Grace Njeri"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Email (contact)</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@example.com"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-slate-500">Phone</span>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+254 …"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
              />
            </label>
          </div>
          {formError && <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[13px] text-rose-300">{formError}</p>}
          <div className="mt-4 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setFormError(null);
              }}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addBusy || !form.fullName.trim() || !form.email.trim()}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-5 py-2.5 font-display text-sm font-semibold text-emerald-950 hover:brightness-110 disabled:opacity-40"
            >
              {addBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Register & issue code
            </button>
          </div>
        </form>
      )}

      {data.candidates.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="h-6 w-6" />}
          title="No candidates registered"
          sub="Add each applicant here. They'll receive a personal access code that shows them their full transparent results once the panel has ranked the role."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.candidates.map((c, i) => (
            <CandidateCard key={c.id} c={c} index={i} onChanged={onChanged} onOpenReport={onOpenReport} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── candidate card ────────────────────────────────────────── */
function CandidateCard({ c, index, onChanged, onOpenReport }: { c: CandidateRow; index: number; onChanged: () => void; onOpenReport: (candidateId: string) => void }) {
  const [busy, setBusy] = useState<"CV" | "VIDEO" | null>(null);
  const [prep, setPrep] = useState<PreprocessProgress | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cvInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  async function upload(kind: "CV" | "VIDEO", file: File) {
    setErr(null);
    setBusy(kind);
    setPrep(null);
    setUploadPct(null);
    try {
      let manifest: unknown = undefined;
      if (kind === "VIDEO") {
        const res = await preprocessVideo(file, setPrep);
        manifest = res.manifest;
        if (res.warning) setErr(res.warning);
      }
      const fd = new FormData();
      fd.set("candidateId", c.id);
      fd.set("docType", kind);
      fd.set("file", file);
      await apiUpload("/api/upload", fd, setUploadPct);
      if (manifest) {
        setUploadPct(101); // "attaching manifest" state
        await apiSend("/api/upload/manifest", "POST", { candidateId: c.id, manifest });
      }
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
      setPrep(null);
      setUploadPct(null);
    }
  }

  async function setStatus(status: "ACTIVE" | "DISQUALIFIED") {
    await apiSend(`/api/candidates/${c.id}`, "PATCH", { status }).catch(() => {});
    onChanged();
  }

  async function remove() {
    if (!confirm(`Remove ${c.fullName}? Their documents, analyses and evaluation are deleted permanently.`)) return;
    await apiSend(`/api/candidates/${c.id}`, "DELETE").catch(() => {});
    onChanged();
  }

  return (
    <div className="glass anim-fade-up rounded-2xl p-5" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-display text-[15px] font-semibold text-slate-100">{c.fullName}</p>
            {c.status !== "ACTIVE" && (
              <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[10px] font-semibold text-rose-300">DISQUALIFIED</span>
            )}
          </div>
          <p className="truncate text-[12px] text-slate-500">{c.email}{c.phone ? ` · ${c.phone}` : ""}</p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/30 px-2 py-0.5 font-mono text-[11px] text-gold-soft">
            <KeyRound className="h-3 w-3" /> {c.accessCode}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {c.status === "ACTIVE" ? (
            <IconBtn title="Disqualify" onClick={() => setStatus("DISQUALIFIED")}><UserX className="h-3.5 w-3.5" /></IconBtn>
          ) : (
            <IconBtn title="Restore" onClick={() => setStatus("ACTIVE")}><UserCheck className="h-3.5 w-3.5 text-emerald-400" /></IconBtn>
          )}
          <IconBtn title="Remove candidate" onClick={remove} danger><Trash2 className="h-3.5 w-3.5" /></IconBtn>
        </div>
      </div>

      {/* evidence rows */}
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <EvidenceSlot
          icon={<FileText className="h-4 w-4 text-cyan-300" />}
          label="CV — any format"
          doc={c.documents.find((d) => d.type === "CV")}
          analysis={c.cv ? { status: c.cv.status, progress: c.cv.progress, error: c.cv.error } : null}
          score={c.cv?.overallScore ?? null}
          onPick={() => cvInput.current?.click()}
          busy={busy === "CV"}
        />
        <EvidenceSlot
          icon={<Film className="h-4 w-4 text-violet-300" />}
          label="Interview video"
          doc={c.documents.find((d) => d.type === "VIDEO")}
          analysis={c.video ? { status: c.video.status, progress: c.video.progress, error: c.video.error } : null}
          score={c.video?.overallScore ?? null}
          onPick={() => videoInput.current?.click()}
          busy={busy === "VIDEO"}
        />
      </div>

      {/* progress */}
      {(busy || uploadPct != null || prep) && (
        <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] px-3.5 py-3">
          <p className="flex items-center gap-2 text-[12px] font-medium text-cyan-200">
            <Cpu className="h-3.5 w-3.5" />
            {prep ? (prep.note || "Preparing evidence in your browser…") : uploadPct != null && uploadPct < 100 ? "Uploading…" : "Attaching manifest…"}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/6">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all duration-300"
              style={{ width: `${prep ? Math.max(5, prep.pct) : Math.min(100, uploadPct ?? 0)}%` }}
            />
          </div>
        </div>
      )}

      {err && <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">{err}</p>}

      {/* footer */}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/6 pt-3.5">
        <div className="flex items-center gap-2 text-[12px] text-slate-500">
          {c.evaluation ? (
            <span>
              Rank <span className="font-display font-bold text-gold-soft">#{c.evaluation.rank}</span> · final {c.evaluation.finalScore.toFixed(1)}
            </span>
          ) : (
            <span>Not ranked yet</span>
          )}
        </div>
        <button
          onClick={() => onOpenReport(c.id)}
          className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[12px] font-medium text-slate-300 transition hover:border-emerald-400/40 hover:text-emerald-200"
        >
          <Eye className="h-3.5 w-3.5" /> Open report
        </button>
      </div>

      <input
        ref={cvInput}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload("CV", f);
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept=".mp4,.mov,.webm,.mkv,.avi,.m4v"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload("VIDEO", f);
        }}
      />
    </div>
  );
}

function EvidenceSlot({
  icon,
  label,
  doc,
  analysis,
  score,
  onPick,
  busy,
}: {
  icon: React.ReactNode;
  label: string;
  doc?: { id: string; filename: string; sizeBytes: number };
  analysis: { status: string; progress?: string | null; error?: string | null } | null;
  score: number | null;
  onPick: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-medium text-slate-300">
          {icon} {label}
        </span>
        <button
          onClick={onPick}
          disabled={busy}
          className="flex items-center gap-1 rounded-lg border border-white/12 bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:border-emerald-400/40 hover:text-emerald-200 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {doc ? "Replace" : "Upload"}
        </button>
      </div>
      <div className="mt-2 flex min-h-6 flex-wrap items-center gap-2">
        {doc ? (
          <a href={`/api/files/${doc.id}`} target="_blank" rel="noreferrer" className="max-w-full truncate text-[11px] text-slate-500 underline decoration-white/20 hover:text-slate-300">
            {doc.filename}
          </a>
        ) : (
          <span className="text-[11px] text-slate-600">No file yet</span>
        )}
        {analysis && <StatusPill status={analysis.status} progress={analysis.progress} error={analysis.error} />}
        {score != null && analysis?.status === "COMPLETED" && (
          <span className={cn("rounded-md border px-1.5 py-0.5 font-display text-[11px] font-bold tabular-nums", score >= 80 ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : score >= 60 ? "border-amber-400/25 bg-amber-400/10 text-amber-300" : "border-rose-400/25 bg-rose-400/10 text-rose-300")}>
            {score.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-500 transition hover:text-slate-200",
        danger ? "hover:border-rose-400/40 hover:text-rose-300" : "hover:border-white/25"
      )}
    >
      {children}
    </button>
  );
}
