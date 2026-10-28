// Shared client-side types mirroring the API payloads

export type Role = "ADMIN" | "INTERVIEWER" | "CANDIDATE";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  candidateId?: string | null;
}

export interface JobSummary {
  id: string;
  title: string;
  department?: string | null;
  status: string;
  cvWeight: number;
  videoWeight: number;
  candidateVisibility: boolean;
  createdAt: string;
  candidateCount: number;
  criterionCount: number;
  evaluatedCount: number;
  leader: { name: string; score: number } | null;
}

export interface Criterion {
  id: string;
  name: string;
  description: string;
  category: "CV" | "VIDEO";
  weight: number;
  isMandatory: boolean;
  minThreshold?: number | null;
}

export interface ParsedCv {
  name?: string;
  headline?: string;
  summary?: string;
  skills?: string[];
  education?: { degree: string; institution?: string; year?: string }[];
  experience?: { role: string; organisation?: string; period?: string; highlights?: string }[];
  strengths?: string[];
  concerns?: string[];
}

export interface CriterionScore {
  criterionId: string;
  name: string;
  score: number;
  rationale: string;
}

export interface Observation {
  t: number;
  category: string;
  observation: string;
  quote?: string;
}

export interface Breach {
  criterionName: string;
  category: string;
  score: number;
  minThreshold: number;
}

export interface CandidateRow {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  accessCode: string;
  status: string;
  createdAt: string;
  documents: { id: string; type: string; filename: string; sizeBytes: number; uploadedAt: string }[];
  cv: {
    status: string;
    progress?: string | null;
    error?: string | null;
    overallScore?: number | null;
    parsed?: ParsedCv | null;
    scores?: CriterionScore[];
  } | null;
  video: {
    status: string;
    progress?: string | null;
    error?: string | null;
    durationSec?: number | null;
    overallScore?: number | null;
    transcript?: string | null;
    scores?: CriterionScore[];
    observations?: Observation[];
  } | null;
  evaluation: {
    cvScore: number;
    videoScore: number;
    finalScore: number;
    rank?: number | null;
    justification?: string | null;
    flags: { breaches: Breach[] };
    computedAt: string;
  } | null;
}

export interface JobDetail {
  job: {
    id: string;
    title: string;
    department?: string | null;
    description: string;
    requirements: string;
    cvWeight: number;
    videoWeight: number;
    status: string;
    candidateVisibility: boolean;
    createdAt: string;
  };
  criteria: Criterion[];
  candidates: CandidateRow[];
  ranking: { candidateId: string; rank: number; finalScore: number }[];
}

export interface AuditEntry {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: string | null;
  createdAt: string;
}

export function fmtT(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "bg-slate-100 text-slate-500";
  if (score >= 80) return "bg-emerald-100 text-emerald-800";
  if (score >= 60) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

export function scoreTextColor(score: number | null | undefined): string {
  if (score == null) return "text-slate-400";
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-rose-600";
}
