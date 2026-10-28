import { createReadStream } from "fs";
import { Readable } from "stream";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Storage abstraction — isolates file persistence behind a tiny interface.
 *
 *  - LOCAL driver (default): files under ./storage/uploads — used by the
 *    sandbox and any full Node deployment.
 *  - R2 driver (Cloudflare Workers): uses the `env.R2` binding from
 *    wrangler.jsonc. Keys are identical, so databases stay portable.
 */

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage", "uploads");

type R2Like = {
  put: (key: string, value: Uint8Array | ArrayBuffer | string, opts?: unknown) => Promise<unknown>;
  get: (key: string, opts?: { range?: { offset: number; length: number } }) => Promise<
    { body: ReadableStream; size: number; arrayBuffer: () => Promise<ArrayBuffer> } | null
  >;
  head: (key: string) => Promise<{ size: number } | null>;
};

function r2(): R2Like | null {
  try {
    const env = getCloudflareContext().env as { R2?: R2Like } | undefined;
    return env?.R2 ?? null;
  } catch {
    return null;
  }
}

export async function ensureStorageRoot() {
  if (r2()) return;
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

  const binding = r2();
  if (binding) {
    await binding.put(key, new Uint8Array(data));
    return { storedPath: key, sizeBytes: data.byteLength };
  }

  const abs = path.join(STORAGE_ROOT, key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return { storedPath: key, sizeBytes: data.byteLength };
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
  const binding = r2();
  if (binding) {
    const head = await binding.head(storedPath);
    if (!head) throw new Error(`Object not found: ${storedPath}`);
    return head.size;
  }
  const s = await stat(absPath(storedPath));
  return s.size;
}

export async function getObject(storedPath: string): Promise<Buffer> {
  const binding = r2();
  if (binding) {
    const obj = await binding.get(storedPath);
    if (!obj) throw new Error(`Object not found: ${storedPath}`);
    return Buffer.from(await obj.arrayBuffer());
  }
  return readFile(absPath(storedPath));
}

/**
 * Driver-agnostic ranged web stream — used by the files route for inline
 * previews and HTTP-Range video seeking.
 */
export async function objectWebStream(
  storedPath: string,
  range?: { start: number; end: number }
): Promise<{ stream: ReadableStream; size: number }> {
  const binding = r2();
  if (binding) {
    if (range) {
      const obj = await binding.get(storedPath, {
        range: { offset: range.start, length: range.end - range.start + 1 },
      });
      if (!obj) throw new Error(`Object not found: ${storedPath}`);
      return { stream: obj.body, size: range.end - range.start + 1 };
    }
    const obj = await binding.get(storedPath);
    if (!obj) throw new Error(`Object not found: ${storedPath}`);
    return { stream: obj.body, size: obj.size };
  }

  const node = createReadStream(absPath(storedPath), range);
  const size = range ? range.end - range.start + 1 : (await stat(absPath(storedPath))).size;
  return { stream: Readable.toWeb(node) as ReadableStream, size };
}

export const STORAGE = { root: STORAGE_ROOT };
