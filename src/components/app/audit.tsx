"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Eye, RefreshCw, ShieldCheck, FileUp, Trophy, UserPlus, Settings2, LogIn, Scale, Trash2, Ban } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import type { AuditEntry } from "@/lib/types";

const ICONS: Record<string, typeof Eye> = {
  LOGIN: LogIn, CANDIDATE_LOGIN: LogIn, LOGOUT: LogIn,
  UPLOAD_CV: FileUp, UPLOAD_VIDEO: FileUp,
  RUN_EVALUATION: Trophy, VIEW_JOB: Eye, VIEW_DOCUMENT: Eye, VIEW_OWN_REPORT: Eye,
  CREATE_JOB: UserPlus, ADD_CANDIDATE: UserPlus, REMOVE_CANDIDATE: Trash2,
  ADD_CRITERION: Scale, UPDATE_CRITERION: Settings2, DELETE_CRITERION: Trash2,
  UPDATE_JOB: Settings2, DISQUALIFY_CANDIDATE: Ban, RESTORE_CANDIDATE: ShieldCheck,
};

const TONES: Record<string, string> = {
  LOGIN: "bg-slate-100 text-slate-600", UPLOAD_CV: "bg-emerald-50 text-emerald-700", UPLOAD_VIDEO: "bg-emerald-50 text-emerald-700",
  RUN_EVALUATION: "bg-amber-50 text-amber-700", VIEW_JOB: "bg-slate-100 text-slate-500", VIEW_DOCUMENT: "bg-slate-100 text-slate-500",
  VIEW_OWN_REPORT: "bg-teal-50 text-teal-700", CREATE_JOB: "bg-emerald-50 text-emerald-700", ADD_CANDIDATE: "bg-emerald-50 text-emerald-700",
  REMOVE_CANDIDATE: "bg-rose-50 text-rose-700", DISQUALIFY_CANDIDATE: "bg-rose-50 text-rose-700",
};

export default function AuditView({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ entries: AuditEntry[] }>("/api/audit?limit=200");
      setEntries(res.entries);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-emerald-600" /> Audit trail</h1>
          <p className="text-sm text-slate-500 mt-1">Append-only ledger of every sensitive action — the transparency layer that keeps the process corruption-free.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1.5" /> Back</Button>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1.5" /> Refresh</Button>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-14 text-center text-sm text-slate-400">Loading audit entries…</div>
          ) : entries.length === 0 ? (
            <div className="py-14 text-center text-sm text-slate-400">No activity recorded yet.</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {entries.map((e) => {
                const Icon = ICONS[e.action] || Eye;
                let details: unknown = null;
                try { details = e.details ? JSON.parse(e.details) : null; } catch { details = null; }
                return (
                  <div key={e.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/60">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${TONES[e.action] || "bg-slate-100 text-slate-500"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant="outline" className="font-mono text-[11px]">{e.action}</Badge>
                        <span className="font-medium text-slate-700">{e.actorName}</span>
                        <span className="text-xs text-slate-400">({e.actorRole})</span>
                        <span className="text-slate-400 text-xs">→ {e.entityType}{e.entityId ? ` ${e.entityId.slice(0, 10)}…` : ""}</span>
                      </div>
                      {details && Object.keys(details as object).length > 0 && (
                        <div className="text-xs text-slate-400 mt-0.5 truncate font-mono">{JSON.stringify(details)}</div>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{new Date(e.createdAt).toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
