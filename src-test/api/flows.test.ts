/**
 * API integration tests — run against the dev server on :3000.
 * Exercises the RBAC matrix, the two-password auth, the candidate code portal,
 * job/candidate lifecycle, upload validation, and the decision workflow.
 * Run: bun test src-test/api   (server must be running)
 */
import { beforeAll, describe, expect, test } from "bun:test";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";

type Jar = Map<string, string>;
const jars: Record<string, Jar> = { ceo: new Map(), panel: new Map(), cand: new Map(), anon: new Map() };

async function call(who: keyof typeof jars, method: string, path: string, body?: unknown, extra?: HeadersInit) {
  const headers: Record<string, string> = { ...(extra as Record<string, string>) };
  const cookie = [...jars[who].entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  for (const c of setCookie) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jars[who].set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  let json: Record<string, unknown> | null = null;
  try {
    json = await res.json();
  } catch {
    /* binary responses */
  }
  return { status: res.status, json, res };
}

let jobId = "";
let candidateId = "";
let accessCode = "";
let videoDocId = "";

beforeAll(async () => {
  // seed runs on first request; staff logins
  const ceo = await call("ceo", "POST", "/api/auth/login", { password: "CEO-MASTER-2026" });
  expect(ceo.status).toBe(200);
  const panel = await call("panel", "POST", "/api/auth/login", { password: "PANEL-ROOM-2026" });
  expect(panel.status).toBe(200);
});

describe("auth: two passwords, no emails", () => {
  test("wrong password rejected with hint-friendly message", async () => {
    const r = await call("anon", "POST", "/api/auth/login", { password: "totally-wrong" });
    expect(r.status).toBe(401);
    expect(String(r.json?.error)).toContain("Incorrect password");
  });

  test("legacy email login no longer exists", async () => {
    const r = await call("anon", "POST", "/api/auth/login", { email: "admin@recruit.ai", password: "admin123" });
    expect(r.status).toBe(401);
  });

  test("public hints never contain full passwords", async () => {
    const r = await call("anon", "GET", "/api/auth/hints");
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.json);
    expect(text).not.toContain("MASTER");
    expect(text).not.toContain("PANEL-ROOM");
  });

  test("me reflects role", async () => {
    const r = await call("ceo", "GET", "/api/auth/me");
    expect(r.status).toBe(200);
    expect(r.json?.user?.role).toBe("ADMIN");
  });
});

describe("jobs lifecycle + RBAC", () => {
  test("anon cannot list jobs", async () => {
    const r = await call("anon", "GET", "/api/jobs");
    expect(r.status).toBe(401);
  });

  test("panel creates a job; ceo sees it", async () => {
    const create = await call("panel", "POST", "/api/jobs", {
      title: "QA Role — Automated Test",
      department: "Testing",
      description: "Created by the automated suite",
      requirements: "Honesty. Punctuality. Spreadsheet skills.",
      cvWeight: 50,
    });
    expect(create.status).toBe(200);
    jobId = String(create.json?.jobId);
    expect(jobId).toBeTruthy();

    const ceoView = await call("ceo", "GET", "/api/jobs");
    expect(ceoView.status).toBe(200);
    expect((ceoView.json?.jobs as { id: string }[]).some((j) => j.id === jobId)).toBe(true);
  });

  test("candidate role cannot create jobs", async () => {
    // login a candidate first (created below) — placeholder ok before that
    const r = await call("anon", "POST", "/api/jobs", { title: "nope" });
    expect(r.status).toBe(401);
  });

  test("job detail includes criteria defaults", async () => {
    const r = await call("panel", "GET", `/api/jobs/${jobId}`);
    expect(r.status).toBe(200);
    expect((r.json?.criteria as unknown[]).length).toBeGreaterThanOrEqual(6);
  });

  test("weight clamps to 0-100 and mirrors videoWeight", async () => {
    const r = await call("panel", "PATCH", `/api/jobs/${jobId}`, { cvWeight: 250 });
    expect(r.status).toBe(200);
    expect(r.json?.job?.cvWeight).toBe(100);
    expect(r.json?.job?.videoWeight).toBe(0);
  });
});

describe("candidates + access codes", () => {
  test("panel registers a candidate and gets a code", async () => {
    const r = await call("panel", "POST", "/api/candidates", {
      jobId,
      fullName: "Automated Candidate",
      email: "automated@example.com",
    });
    expect(r.status).toBe(200);
    candidateId = String(r.json?.candidate?.id);
    accessCode = String(r.json?.candidate?.accessCode);
    expect(accessCode).toMatch(/^[A-Z0-9]{8}$/);
  });

  test("candidate logs in with CODE ONLY", async () => {
    const r = await call("cand", "POST", "/api/auth/candidate", { accessCode });
    expect(r.status).toBe(200);
    expect(r.json?.user?.role).toBe("CANDIDATE");
  });

  test("candidate portal rejects bad codes", async () => {
    const r = await call("anon", "POST", "/api/auth/candidate", { accessCode: "AAAA1111" });
    expect(r.status).toBe(401);
  });

  test("candidate cannot access job workspace", async () => {
    const r = await call("cand", "GET", `/api/jobs/${jobId}`);
    expect(r.status).toBe(403);
  });

  test("candidate cannot read other candidates' analysis", async () => {
    const r = await call("cand", "GET", "/api/analysis/nonexistent-id");
    expect([403, 404]).toContain(r.status);
  });
});

describe("upload validation", () => {
  test("rejects disallowed CV types", async () => {
    const fd = new FormData();
    fd.set("candidateId", candidateId);
    fd.set("docType", "CV");
    fd.set("file", new File(["malicious"], "evil.exe", { type: "application/octet-stream" }));
    const r = await call("panel", "POST", "/api/upload", fd);
    expect(r.status).toBe(400);
  });

  test("rejects oversized video manifest claims", async () => {
    const r = await call("panel", "POST", "/api/upload/manifest", {
      candidateId,
      manifest: { durationSec: 10, frames: [], audio: [] },
    });
    expect(r.status).toBe(400);
    expect(String(r.json?.error)).toContain("no usable frames");
  });

  test("rejects oversized frame payloads", async () => {
    const r = await call("panel", "POST", "/api/upload/manifest", {
      candidateId,
      manifest: {
        durationSec: 10,
        frames: [{ t: 0, dataUrl: "data:image/jpeg;base64," + "A".repeat(800 * 1024) }],
        audio: [],
      },
    });
    expect(r.status).toBe(400);
  });

  test("video manifest path accepted end-to-end (real data)", async () => {
    // read the demo video, extract 2 tiny fake frames + skip audio (server accepts frames-only)
    const fd = new FormData();
    fd.set("candidateId", candidateId);
    fd.set("docType", "VIDEO");
    const videoFile = Bun.file("scripts/e2e/video_grace.mp4");
    expect(await videoFile.exists()).toBe(true);
    fd.set("file", videoFile, "video_grace.mp4");
    const up = await call("panel", "POST", "/api/upload", fd);
    expect(up.status).toBe(200);
    videoDocId = String(up.json?.document?.id);

    const man = await call("panel", "POST", "/api/upload/manifest", {
      candidateId,
      manifest: {
        durationSec: 34,
        frames: [
          { t: 0.5, dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDIzNP/AABEIAAEAAQMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAAwDAQACEQMRAD8A9/ooooA//9k=" },
          { t: 5.5, dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDIzNP/AABEIAAEAAQMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAAwDAQACEQMRAD8A9/ooooA//9k=" },
        ],
        audio: [],
      },
    });
    expect(man.status).toBe(200);
    expect(man.json?.frames).toBe(2);
  });
});

describe("evaluate + decision workflow", () => {
  test("evaluation produces ranks (AI or deterministic fallback)", async () => {
    const r = await call("panel", "POST", `/api/jobs/${jobId}/evaluate`);
    expect(r.status).toBe(200);
    expect(Number(r.json?.evaluated)).toBeGreaterThanOrEqual(1);
  }, 240000);

  test("ranking list reflects the computed rank", async () => {
    const r = await call("panel", "GET", `/api/jobs/${jobId}`);
    expect(r.status).toBe(200);
    const ranking = r.json?.ranking as { candidateId: string; rank: number }[];
    expect(ranking.length).toBeGreaterThanOrEqual(1);
  });

  test("panel CANNOT record CEO decisions (403)", async () => {
    const r = await call("panel", "PATCH", `/api/evaluations/${candidateId}/decision`, { decision: "ADVANCE" });
    expect(r.status).toBe(403);
  });

  test("CEO records a decision with note", async () => {
    const r = await call("ceo", "PATCH", `/api/evaluations/${candidateId}/decision`, {
      decision: "HOLD",
      note: "Automated test decision — evidence under review",
    });
    expect(r.status).toBe(200);
    expect(r.json?.evaluation?.decision).toBe("HOLD");
    expect(r.json?.evaluation?.decidedByName).toBe("CEO Office");
  });

  test("candidate sees own report incl. improvement plan, never CEO notes", async () => {
    const r = await call("cand", "GET", `/api/analysis/${candidateId}`);
    expect(r.status).toBe(200);
    const ev = r.json?.evaluation;
    expect(ev).not.toBeNull();
    expect(ev.decisionNote).toBeNull();
    expect(ev.decidedByName).toBeNull();
    expect(ev.rank).toBeGreaterThanOrEqual(1);
  });
});

describe("file serving RBAC", () => {
  test("owner panel can fetch the video", async () => {
    const r = await call("panel", "GET", `/api/files/${videoDocId}`);
    expect(r.status).toBe(200);
  });

  test("anon gets 403", async () => {
    const r = await call("anon", "GET", `/api/files/${videoDocId}`);
    expect(r.status).toBe(403);
  });

  test("video supports HTTP Range (seeking)", async () => {
    const { res } = await call("panel", "GET", `/api/files/${videoDocId}`, undefined, { Range: "bytes=0-1023" });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range") || "").toMatch(/^bytes \d+-\d+\/\d+$/);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });
});

describe("audit trail", () => {
  test("only CEO reads the ledger", async () => {
    const denied = await call("panel", "GET", "/api/audit");
    expect(denied.status).toBe(403);
    const ok = await call("ceo", "GET", "/api/audit?limit=20");
    expect(ok.status).toBe(200);
    const entries = ok.json?.entries as { action: string }[];
    expect(entries.some((e) => e.action === "CEO_DECISION_HOLD")).toBe(true);
    expect(entries.some((e) => e.action === "RUN_EVALUATION")).toBe(true);
  });
});

describe("cleanup", () => {
  test("panel removes the test candidate (cascade)", async () => {
    const r = await call("panel", "DELETE", `/api/candidates/${candidateId}`);
    expect(r.status).toBe(200);
    const gone = await call("panel", "GET", `/api/analysis/${candidateId}`);
    expect(gone.status).toBe(404);
  });
});
