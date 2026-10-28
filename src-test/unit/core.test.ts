/**
 * Unit tests for the deterministic core — pure functions, no server needed.
 * Run: bun test src-test/unit
 */
import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { signToken, verifyToken, hashPassword, verifyPassword, staffPasswordHint } from "../../src/lib/auth";
import { clampScore, weightedMean } from "../../src/lib/ai/cv";

describe("auth tokens", () => {
  test("round-trips a session payload", () => {
    const token = signToken({ id: "u1", email: "x@y.z", name: "X", role: "ADMIN" });
    const back = verifyToken(token);
    expect(back).not.toBeNull();
    expect(back?.id).toBe("u1");
    expect(back?.role).toBe("ADMIN");
  });

  test("rejects tampered payloads", () => {
    const token = signToken({ id: "u1", email: "x@y.z", name: "X", role: "ADMIN" });
    // tamper: fresh body with elevated role, old signature
    const evil = Buffer.from(JSON.stringify({ id: "u1", role: "ADMIN", exp: Date.now() + 999999 })).toString("base64url");
    expect(verifyToken(`${evil}.${token.split(".")[1]}`)).toBeNull();
    expect(verifyToken(`${token.split(".")[0]}.badsignature`)).toBeNull();
    expect(verifyToken("garbage")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });

  test("rejects expired tokens", () => {
    const secret = process.env.AUTH_SECRET || "recruitai-dev-secret-change-in-production";
    const body = Buffer.from(JSON.stringify({ id: "u1", role: "ADMIN", exp: Date.now() - 1000 })).toString("base64url");
    const sig = createHmac("sha256", secret).update(body).digest("base64url");
    expect(verifyToken(`${body}.${sig}`)).toBeNull();
  });
});

describe("password hashing", () => {
  test("hash + verify round trip", () => {
    const hash = hashPassword("CEO-MASTER-2026");
    expect(verifyPassword("CEO-MASTER-2026", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
    expect(verifyPassword("CEO-MASTER-2026", "bogus")).toBe(false);
  });

  test("hashes are salted (same password → different hashes)", () => {
    const a = hashPassword("same");
    const b = hashPassword("same");
    expect(a).not.toBe(b);
    expect(verifyPassword("same", a)).toBe(true);
    expect(verifyPassword("same", b)).toBe(true);
  });
});

describe("password hints never leak the full secret", () => {
  test("hint is a stem only", () => {
    const hint = staffPasswordHint("ADMIN");
    expect(hint.startsWith("Starts with")).toBe(true);
    expect(hint).not.toContain("MASTER");
    expect(hint).not.toContain("2026");
  });
});

describe("scoring math", () => {
  test("clampScore bounds to 0-100", () => {
    expect(clampScore(120)).toBe(100);
    expect(clampScore(-5)).toBe(0);
    expect(clampScore("73.45")).toBe(73.5);
    expect(clampScore("not-a-number", 50)).toBe(50);
  });

  test("weightedMean handles zero weights and empties", () => {
    expect(weightedMean([])).toBe(0);
    expect(weightedMean([{ score: 90, weight: 0 }])).toBe(0);
    expect(weightedMean([{ score: 90, weight: 2 }, { score: 60, weight: 2 }])).toBe(75);
    expect(weightedMean([{ score: 100, weight: 1 }, { score: 50, weight: 3 }])).toBe(62.5);
  });
});

describe("storage path traversal guard", () => {
  test("rejects escaping keys", async () => {
    const { absPath } = await import("../../src/lib/storage");
    expect(() => absPath("../../etc/passwd")).toThrow();
    expect(() => absPath("cv/../../secret")).toThrow();
    expect(absPath("cv/ok-key.pdf")).toContain("cv/ok-key.pdf");
  });
});

describe("ai client json extraction", () => {
  test("extractJson survives fences and prose", async () => {
    const { extractJson } = await import("../../src/lib/ai/client");
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"b": "x"} — done!')).toEqual({ b: "x" });
    expect(extractJson("[1,2,3]")).toEqual([1, 2, 3]);
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("")).toBeNull();
  });
});
