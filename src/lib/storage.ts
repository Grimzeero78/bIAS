import { createReadStream } from "fs";
import { mkdir, stat, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

/**
 * Storage abstraction — isolates file persistence behind a tiny interface so the
 * local-disk driver used in this sandbox can be swapped for S3/GCS in production
 * by reimplementing put()/getStream()/stat() without touching business logic.
 */

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage", "uploads");

export async function ensureStorageRoot() {
  await mkdir(STORAGE_ROOT, { recursive: true });
}

export interface StoredObject {
  storedPath: string; // relative key inside the storage root
  sizeBytes: number;
}

export async function putObject(
  scope: "cv" | "video" | "frames" | "audio",
  originalName: string,
  data: Buffer | Uint8Array
): Promise<StoredObject> {
  const safeExt = path.extname(originalName).toLowerCase().slice(0, 10) || "";
  const key = `${scope}/${Date.now()}-${randomBytes(6).toString("hex")}${safeExt}`;
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
  const s = await stat(absPath(storedPath));
  return s.size;
}

export function objectStream(storedPath: string, range?: { start: number; end: number }) {
  return createReadStream(absPath(storedPath), range);
}

export const STORAGE = { root: STORAGE_ROOT };
