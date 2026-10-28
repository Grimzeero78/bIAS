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

---
Task ID: 2
Agent: Z.ai (main agent)
Task: User feedback round — serious UI redesign, password-only access (2 passwords + hints), candidate code-only transparency portal, AI-as-helper positioning, favicon, full tests, push to GitHub, deploy to Cloudflare.

Work Log:
- Auth rework: staff login by TWO passwords only (CEO-MASTER-2026 → ADMIN, PANEL-ROOM-2026 → INTERVIEWER; env-overridable via CEO_PASSWORD/PANEL_PASSWORD), public /api/auth/hints returns stems only; candidate portal login by ACCESS CODE ONLY; candidate-portal users keyed to candidate row (fixes duplicate-email crash found by tests); legacy email logins removed.
- Schema: Evaluation + decision/decisionNote/decidedByName/decidedAt/improvementJson; VideoAnalysis + precomputedKey; candidateVisibility default true + one-time marker-guarded backfill (SEED_VISIBILITY_BACKFILL).
- Scoring engine: AI-generated per-candidate improvement plans (fallback deterministic), stored on Evaluation; analysis endpoint exposes rankContext (X of N), improvement, decision fields (CEO notes hidden from candidates).
- New CEO decision workflow: PATCH /api/evaluations/[cid]/decision (ADMIN-only, audited CEO_DECISION_*).
- Complete UI redesign ("TrueMerit" brand): dark executive theme (ink/emerald/gold, glass surfaces, aurora glows), Space Grotesk + Inter via next/font; new components: atoms.tsx (ScoreRing, CriterionBar w/ threshold ticks, AiAdvisory, DecisionStamp, RankChip, ObservationRow, StatusPill, StatTile...), brand.tsx (scales-of-merit SVG logo), split-screen login (pillars + staff/candidate tabs + hints), executive dashboard, job workspace (podium leaderboard + decision dialogs, candidates tab with upload progress, criteria editor, settings incl. transparency toggle), shared "Why" report (formula strip showing the arithmetic, criterion rationale expanders, video click-to-seek timeline, transcript, CV profile, improvement plan), candidate portal (status stepper, position hero, growth plan), audit ledger (grouped filters + search). Custom favicon set: icon.svg + favicon.ico + apple-icon.png (scripts/make_favicon.py).
- Browser media preprocessing (lib/media-client.ts): canvas frame extraction (12 frames), OfflineAudioContext 16k mono decode + WAV chunking (28s × 16), integrated into upload UI with staged progress; POST /api/upload/manifest stores validated manifests; video pipeline consumes manifests first (runAnalysisFromManifest) with ffmpeg fallback — VERIFIED END-TO-END via real browser upload (7 frames, no ffmpeg).
- Cloudflare readiness: db.ts lazy proxy resolving SQLite-engine client locally vs PrismaD1+queryCompiler client (src/generated/prisma-cf, generated by scripts/make_cf_schema.mjs at cf:build) on Workers; storage.ts local-disk vs R2 driver; files route objectWebStream (Range works on both); pipeline.ts uses ctx.waitUntil + analysis endpoint self-heals PENDING jobs on poll; z-ai client supports ZAI_CONFIG_JSON env secret (workerd has no fs); CV PDF extraction switched from pdf-parse (needs DOMMatrix) to pdfjs-dist legacy pure-JS path. ALL VERIFIED LOCALLY via `wrangler dev` (miniflare): D1 migration applied, staff login (scrypt), jobs API, candidate creation, R2 upload, full CV AI analysis COMPLETED on workerd.
- Tests: 38 tests (src-test/unit + src-test/api): token/password/hint units, scoring math, traversal guard, extractJson; API suite covers RBAC matrix, code-only login, upload+manifest validation limits, evaluation, CEO decision 403/200, candidate privacy (no CEO notes), Range streaming, audit permissions, cascade cleanup. All pass; ESLint 0 errors (react-hooks issues fixed properly with refs/IIFE patterns); production build clean.
- GitHub: committed (2 commits). PAT (Grimzeero78) can push to existing repos but CANNOT create repos ("Resource not accessible by personal access token") — remote origin configured to Grimzeero78/truemerit, bundle backup at download/truemerit-main.bundle; push succeeds the moment the repo exists. Cloudflare token "cfk_…" INVALID (verify endpoint rejects it in all variants) — deploy fully scripted at scripts/cf-deploy.sh (provisions D1+R2, applies migrations, deploys via OpenNext).

Stage Summary:
- Live app: Next.js 16 on :3000 with TrueMerit branding; demo: Grace Njeri #1 (89.7, ADVANCE by CEO), Brian Otto #2 (14.2, confidence breach).
- Access: CEO password CEO-MASTER-2026, Panel password PANEL-ROOM-2026, candidate code 4RZDVZWM (Grace).
- Blocked on user: (1) create repo named "truemerit" on GitHub (or grant Administration:write to PAT) then `git push -u origin main`; (2) provide a valid Cloudflare API token, then `CLOUDFLARE_API_TOKEN=... bash scripts/cf-deploy.sh`.
