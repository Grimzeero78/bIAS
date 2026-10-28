# Project Worklog

---
Task ID: 1
Agent: Z.ai (main agent)
Task: Design and build a full-stack, AI-powered recruitment & interview analysis platform ("RecruitAI") — objective CV + video-interview scoring, transparent ranking with justifications, RBAC, and audit trail.

Work Log:
- Loaded skills: fullstack-dev, LLM, video-understand, ASR; initialized environment via init-fullstack.sh; confirmed ffmpeg/ffprobe available.
- Spec adaptations (user granted autonomy): Next.js 16 API routes instead of Python backend; Prisma/SQLite with PostgreSQL-ready schema (no SQLite-specific constructs); local-disk storage behind a storage abstraction (S3-swappable); z-ai-web-dev-sdk (LLM + Vision + ASR) instead of OpenAI GPT-4o/HireVue.
- Prisma schema: User (RBAC roles ADMIN/INTERVIEWER/CANDIDATE), JobOpening (cvWeight/videoWeight/visibility), Criterion (CV|VIDEO category, weight, mandatory + minThreshold), Candidate (accessCode), Document, CvAnalysis, VideoAnalysis (transcript, timestamped observations), Evaluation (rank + justification + flags), AuditLog.
- AI pipelines:
  * CV: pdf-parse v2 / mammoth text extraction → LLM structured parse (skills/education/experience) → LLM rubric scoring per CV criterion.
  * Video: ffprobe → ffmpeg frame extraction (12 frames, timestamps) + audio segmentation (28s chunks — ASR API limits files to 30s; found via E2E debugging) → ASR transcription → vision pass on frames → fusion LLM producing per-criterion scores + timestamped observations with quotes.
  * Scoring: deterministic weighted means + mandatory-breach −10 penalties + dense ranking in code; LLM writes explanation-only justifications (cannot alter ranks); fixes applied after E2E: candidateId included in LLM brief + name-based fallback matching.
- Background job runner (in-process, status-pollable) in src/lib/pipeline.ts.
- API: auth (staff login, candidate portal login with email+accessCode, me, logout), jobs CRUD + criteria CRUD + evaluate, candidates CRUD, multipart upload (RBAC + type/size validation), analysis polling, file streaming with HTTP Range + RBAC, audit ledger.
- Frontend SPA (single page.tsx + client views per sandbox constraint): login (staff/candidate tabs), dashboards (admin sees all jobs, interviewer owns), job workspace (Ranking/Candidates/Criteria/Settings tabs, uploads with progress, criteria editor, weights slider, visibility toggle), candidate "Why" report (score composition, AI justification, video player with click-to-seek timestamped observations, criterion bars, transcript, CV parse), candidate portal, audit view. Emerald/teal theme, no blue/indigo per skill rules.
- Security fixes during E2E: file route now enforces auth.ok (candidate→other video was 200 → now 403); HttpError re-export issue resolved by direct imports; Turbopack stale-cache poisoning handled via clean restarts using .zscripts/dev.sh.
- Seeded demo data: admin@recruit.ai/admin123, interviewer@recruit.ai/interview123, "Operations Analyst" job with 8 criteria (Confidence mandatory ≥60), two demo candidates (Grace Njeri strong, Brian Otto weak) with generated CVs (reportlab) and interview videos (AI image scene + TTS speech muxed via ffmpeg).
- Full E2E verification (curl + agent-browser): uploads → AI completed in ~30s; ranking: Grace #1 (89.7: CV 92.1/Video 88.1), Brian #2 (17.8) with Confidence breach penalty; AI justifications cite scores + timestamps; RBAC matrix verified (candidate/own 200, candidate/other 403, anon 403, interviewer→admin job 403, range 206); browser-verified login, dashboards, ranking, full report, timestamp-seek (video.currentTime≈14s after clicking 00:14 observation), audit trail, candidate portal, mobile viewport; lint clean.

Stage Summary:
- Deliverable: runnable Next.js 16 app at /home/z/my-project (port 3000), all 5 spec areas implemented (roles, document mgmt, video AI analysis, weighted ranking with justification, dashboard/transparency + RBAC & audit).
- Key artifacts: prisma/schema.prisma; src/lib/{auth,storage,audit,seed,pipeline,api-helpers,types}.ts; src/lib/ai/{client,cv,video,scoring}.ts; 14 API route files; src/components/app/{login,dashboard,job-workspace,report,audit,portal}.tsx; E2E assets in scripts/e2e/.
- Demo logins: admin@recruit.ai/admin123 (CEO), interviewer@recruit.ai/interview123, candidate portal: grace.njeri@example.com + code 4RZDVZWM (visibility enabled on demo job).
