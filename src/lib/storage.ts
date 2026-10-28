import { createReadStream } from "fs";
import { Readable } from "stream";
import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Storage abstraction — isolates file persistence behind a tiny interface.
 *
 *  - D1 driver (Cloudflare Workers): files are chunked into 512 KB BLOBs
 *    inside the same D1 database that holds the relational data (migration
 *    0002_file_blobs.sql). No R2 bucket needed — works on accounts without
 *    an R2 subscription. All writes use batch() (one query per batch) so we
 *    stay well inside D1 limits:
 *      • max BLOB / row size 2 MB      → 512 KB chunks
 *      • max 100 bound params/query    → 3 params per chunk insert
 *      • free plan 50 queries/invocation → ≤40 statements per batch
 *
 *  - LOCAL driver (default): files under ./storage/uploads — sandbox and
 *    any full Node deployment.
 */

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage", "uploads");

/** 512 KB — safely under D1's 2 MB row/BLOB ceiling. */
export const D1_CHUNK_SIZE = 512 * 1024;
/** Statements per D1 batch — 40 inserts × 3 bindings = 120 bindings, inside limits. */
const D1_BATCH_STATEMENTS = 40;

type D1Stmt = {
  bind: (...values: unknown[]) => D1Stmt;
  all: () => Promise<{ results?: { idx: number; data: Uint8Array | ArrayBuffer }[] }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
};

type D1Database = {
  prepare: (sql: string) => D1Stmt;
  batch: (statements: D1Stmt[]) => Promise<unknown[]>;
};

function d1(): D1Database | null {
  try {
    const env = getCloudflareContext().env as { DB?: D1Database } | undefined;
    return env?.DB ?? null;
  } catch {
    return null;
  }
}

/** Which backend is active in the current runtime. */
export function storageDriver(): "d1" | "local" {
  return d1() ? "d1" : "local";
}

/**
 * Split a byte buffer into D1-sized chunks (exported for unit tests).
 * Returns at least one chunk (possibly empty) so callers can persist 0-byte data.
 */
export function splitIntoChunks(data: Uint8Array, chunkSize: number = D1_CHUNK_SIZE): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let off = 0; off < data.byteLength; off += chunkSize) {
    // Uint8Array.slice() copies — safe to hand to the D1 binder
    out.push(data.slice(off, Math.min(off + chunkSize, data.byteLength)));
  }
  return out.length ? out : [new Uint8Array(0)];
}

/** Reassemble ordered chunks (exported for unit tests). */
export function joinChunks(chunks: Uint8Array[]): Buffer {
  const parts = chunks.map((c) => (c instanceof Uint8Array ? c : new Uint8Array(0)));
  const total = parts.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of parts) {
    out.set(c, off);
    off += c.byteLength;
  }
  return Buffer.from(out.buffer, out.byteOffset, out.byteLength);
}

function asBuffer(v: Uint8Array | ArrayBuffer): Buffer {
  return Buffer.from(v instanceof ArrayBuffer ? new Uint8Array(v) : v);
}

export async function ensureStorageRoot() {
  if (d1()) return;
  await mkdir(STORAGE_ROOT, { recursive: true });
}

export interface StoredObject {
  storedPath: string; // relative key inside the storage root
  sizeBytes: number;
}

export async function putObject(
  scope: "cv" | "video" | "frames" | "audio" | "precomputed",
  originalName: string,
  data: Buffer | Uint8Array
): Promise<StoredObject> {
  const safeExt = path.extname(originalName).toLowerCase().slice(0, 10) || "";
  const key = `${scope}/${Date.now()}-${randomBytes(6).toString("hex")}${safeExt}`;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  const binding = d1();
  if (binding) {
    const chunks = splitIntoChunks(bytes);
    const stmts: D1Stmt[] = [
      binding.prepare("DELETE FROM FileChunk WHERE key = ?").bind(key),
      binding.prepare("DELETE FROM StoredFile WHERE key = ?").bind(key),
      binding
        .prepare("INSERT INTO StoredFile (key, size, chunkCount) VALUES (?, ?, ?)")
        .bind(key, bytes.byteLength, chunks.length),
    ];
    chunks.forEach((chunk, idx) => {
      stmts.push(
        binding
          .prepare("INSERT INTO FileChunk (key, idx, data) VALUES (?, ?, ?)")
          .bind(key, idx, chunk)
      );
    });
    // batch() counts as ONE query per batch against the per-invocation cap
    for (let i = 0; i < stmts.length; i += D1_BATCH_STATEMENTS) {
      await binding.batch(stmts.slice(i, i + D1_BATCH_STATEMENTS));
    }
    return { storedPath: key, sizeBytes: bytes.byteLength };
  }

  const abs = path.join(STORAGE_ROOT, key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, bytes);
  return { storedPath: key, sizeBytes: bytes.byteLength };
}

export function absPath(storedPath: string): string {
  // Prevent path traversal — keys must stay inside the storage root
  const abs = path.resolve(STORAGE_ROOT, storedPath);
  if (!abs.startsWith(path.resolve(STORAGE_ROOT))) {
    throw new Error("Invalid storage path");
  }
  return abs;
}

export async function objectSize(storedPath: string): Promise<number> {
  const binding = d1();
  if (binding) {
    const row = await binding
      .prepare("SELECT size FROM StoredFile WHERE key = ?")
      .bind(storedPath)
      .first<{ size: number }>();
    if (!row) throw new Error(`Object not found: ${storedPath}`);
    return Number(row.size);
  }
  const s = await stat(absPath(storedPath));
  return s.size;
}

export async function getObject(storedPath: string): Promise<Buffer> {
  const binding = d1();
  if (binding) {
    const res = await binding
      .prepare("SELECT idx, data FROM FileChunk WHERE key = ? ORDER BY idx ASC")
      .bind(storedPath)
      .all();
    const rows = res.results ?? [];
    if (rows.length === 0) throw new Error(`Object not found: ${storedPath}`);
    return joinChunks(rows.map((r) => asBuffer(r.data)));
  }
  return readFile(absPath(storedPath));
}

/** Remove a stored object (no-op if it does not exist). */
export async function deleteObject(storedPath: string): Promise<void> {
  const binding = d1();
  if (binding) {
    await binding.batch([
      binding.prepare("DELETE FROM FileChunk WHERE key = ?").bind(storedPath),
      binding.prepare("DELETE FROM StoredFile WHERE key = ?").bind(storedPath),
    ]);
    return;
  }
  try {
    await rm(absPath(storedPath), { force: true });
  } catch {
    /* already gone */
  }
}

/**
 * Driver-agnostic ranged web stream — used by the files route for inline
 * previews and HTTP-Range video seeking.
 */
export async function objectWebStream(
  storedPath: string,
  range?: { start: number; end: number }
): Promise<{ stream: ReadableStream; size: number }> {
  const binding = d1();
  if (binding) {
    if (range) {
      // fetch only the chunks overlapping [start, end]
      const lo = Math.floor(range.start / D1_CHUNK_SIZE);
      const hi = Math.floor(range.end / D1_CHUNK_SIZE);
      const res = await binding
        .prepare("SELECT idx, data FROM FileChunk WHERE key = ? AND idx >= ? AND idx <= ? ORDER BY idx ASC")
        .bind(storedPath, lo, hi)
        .all();
      const rows = res.results ?? [];
      if (rows.length === 0) throw new Error(`Object not found: ${storedPath}`);
      const joined = joinChunks(rows.map((r) => asBuffer(r.data)));
      const from = range.start - lo * D1_CHUNK_SIZE;
      const to = range.end - lo * D1_CHUNK_SIZE + 1;
      const sliced = joined.subarray(from, to);
      return { stream: bufferToStream(sliced), size: sliced.byteLength };
    }

    const full = await getObject(storedPath);
    return { stream: bufferToStream(full), size: full.byteLength };
  }

  const node = createReadStream(absPath(storedPath), range);
  const size = range ? range.end - range.start + 1 : (await stat(absPath(storedPath))).size;
  return { stream: Readable.toWeb(node) as ReadableStream, size };
}

function bufferToStream(b: Uint8Array): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(b);
      controller.close();
    },
  });
}

export const STORAGE = { root: STORAGE_ROOT };
