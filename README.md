# TrueMerit — Merit decides. Not connections.

**AI-assisted recruitment and interview analysis platform** built to eliminate cronyism and
corruption from hiring. Every candidate is scored against the same published criteria by a
fixed formula; the AI analyses evidence and writes explanations — **it never decides**.
Every sensitive action lands in an append-only audit trail the CEO can inspect, and every
applicant gets a transparent, timestamped report of their own results.

---

## What it does

| Area | Details |
| --- | --- |
| **Password-only staff access** | Exactly two passwords — the **CEO password** opens the executive board (ADMIN), the **Interview Panel password** runs requisitions (INTERVIEWER). No emails, ever. |
| **Candidate transparency by code** | Every applicant receives a personal **access code** (e.g. `7KQM2XRD`). Entering it shows their full results: board position, per-criterion scores, timestamped video evidence and a growth plan. |
| **Deterministic ranking** | `final = cvWeight·cvScore + videoWeight·videoScore − 10·breaches`. Computed **in code** from weights the panel sets in advance — identical for everyone. |
| **AI as helper, never decider** | The AI parses CVs, watches interview videos (frames + speech), scores each criterion with cited evidence, and writes the "why" narrative. It cannot move a rank. The CEO records the final call (Advance / Hold / Reject) under their own name. |
| **Video analysis** | The **browser** prepares the evidence (frames via canvas, 16 kHz mono WAV audio via WebAudio) — so the platform runs even where ffmpeg doesn't (Cloudflare Workers). Full-server ffmpeg pipeline remains as fallback. |
| **Audit trail** | Append-only ledger: logins, uploads, views, evaluations and decisions — the proof the process was clean. |
| **RBAC** | ADMIN (all jobs + decisions + audit), INTERVIEWER (own jobs), CANDIDATE (own report only, only while transparency is on). |

## Access

| Role | How |
| --- | --- |
| CEO | Password `CEO-MASTER-2026` (override with `CEO_PASSWORD`) |
| Interview Panel | Password `PANEL-ROOM-2026` (override with `PANEL_PASSWORD`) |
| Candidate | Personal access code, issued when the interviewer registers them |

> The login screen shows a **hint only** (e.g. *"Starts with CEO-"*). Change the defaults via
> env vars in any real deployment.

## Tech stack

- **Next.js 16** (App Router, standalone output) + React 19 + Tailwind CSS 4 + shadcn/ui
- **Prisma** — SQLite locally / **Cloudflare D1** in production (driver adapters, auto-detected)
- **Storage abstraction** — local disk locally / **Cloudflare R2** in production (same keys)
- **z-ai-web-dev-sdk** for LLM / vision / ASR (swappable for OpenAI GPT-4o equivalents)
- **OpenNext** (`@opennextjs/cloudflare`) for Cloudflare Workers deployment

## Run locally

```bash
bun install
bun run db:push          # create SQLite db
bun run dev              # http://localhost:3000
```

## Tests

```bash
bun test src-test        # unit + API integration suite (needs dev server for API tests)
npx eslint src src-test  # lint
bun run build            # production build
```

- **Unit** — token signing/verification, password hashing, scoring math, path-traversal
  guards, AI JSON extraction.
- **API integration** — full RBAC matrix, code-only candidate login, upload validation
  (types, sizes, manifest limits), evaluation + CEO decision workflow, Range-based video
  streaming, audit ledger permissions.

## Deploy to Cloudflare Workers

One-time provisioning:

```bash
npx wrangler d1 create truemerit           # paste database_id into wrangler.jsonc
npx wrangler r2 bucket create truemerit-files
bun run cf:migrate:remote                  # apply migrations/0001_init.sql to D1
npx wrangler secret put AUTH_SECRET        # random string for session signing
npx wrangler secret put CEO_PASSWORD       # optional override
npx wrangler secret put PANEL_PASSWORD     # optional override
npx wrangler secret put ZAI_CONFIG_JSON    # AI service config (see below)
bun run cf:deploy                          # build + deploy the Worker
```

**AI service config** (`ZAI_CONFIG_JSON`) — the platform calls an OpenAI-compatible
LLM/vision/ASR service. Provide a JSON secret:

```json
{ "baseUrl": "https://…", "apiKey": "…", "chatId": "…", "token": "…", "userId": "…" }
```

(`baseUrl` + `apiKey` are required; other fields are passed through as request headers if
your provider needs them. Locally the SDK reads `.z-ai-config` instead — no env needed.)

**How the edge deployment works:** the browser pre-processes video into a *manifest*
(frames + 16 kHz WAV speech chunks, `src/lib/media-client.ts`) and the server only makes
AI API calls — no ffmpeg required. `src/lib/db.ts` and `src/lib/storage.ts` auto-detect
the Cloudflare bindings (`DB`, `R2`) and fall back to SQLite/disk elsewhere.

## Architecture notes

```
src/
  app/api/…                 REST routes (auth, jobs, candidates, upload, analysis, files, audit, decisions)
  components/app/…          Login, dashboards, workspace (leaderboard/candidates/criteria/settings),
                            candidate report ("Why"), candidate portal, audit ledger
  lib/ai/{client,cv,video,scoring}.ts   AI pipelines + deterministic ranking engine
  lib/media-client.ts       Browser-side frame/audio/CV preprocessing (edge-compatible)
  lib/{db,storage}.ts       Environment-adaptive data + file layers (SQLite/D1, disk/R2)
  lib/{auth,audit,seed,pipeline,api-helpers,types}.ts
migrations/0001_init.sql    D1 schema (matches prisma/schema.prisma)
wrangler.jsonc              Cloudflare config (D1 + R2 bindings)
```

### Integrity guarantees

1. Criteria and weights are configured **before** evidence is uploaded.
2. Ranks are computed by code — the LLM only writes explanations from the fixed numbers.
3. Mandatory criteria cost −10 final points each when missed (formula applies to all).
4. The CEO's final decision is stamped with their name, note and time into an append-only
   audit log.
5. Candidates can never see other candidates' identities — only their own standing.

## Security notes

- Sessions: HMAC-SHA256 signed httpOnly cookies, 7-day TTL, timing-safe verification.
- Passwords: scrypt with per-user salt; login failures are damped and audited.
- Files: every document request is RBAC-checked; videos serve with capped 2 MB Range chunks.
- Uploads: extension allow-lists + size caps (20 MB CV / 200 MB video) + manifest payload limits.
- Path traversal: storage keys are validated against the storage root.

> ⚠️ **Rotate any credential that has ever been pasted into a chat window.** Access codes,
> passwords and API keys in this README are defaults and should be replaced in production.
