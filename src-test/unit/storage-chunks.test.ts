/**
 * Unit tests for the D1 chunked file storage helpers (pure functions).
 * Run: bun test src-test/unit
 */
import { describe, expect, test } from "bun:test";
import {
  D1_CHUNK_SIZE,
  splitIntoChunks,
  joinChunks,
} from "../../src/lib/storage";

describe("d1 chunked storage", () => {
  test("chunk size respects the D1 2 MB row/BLOB ceiling", () => {
    expect(D1_CHUNK_SIZE).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  test("small data → single chunk, lossless round trip", () => {
    const data = new Uint8Array(Buffer.from("hello truemerit"));
    const chunks = splitIntoChunks(data);
    expect(chunks.length).toBe(1);
    expect(joinChunks(chunks).equals(Buffer.from(data))).toBe(true);
  });

  test("large data → correct chunk count and boundaries", () => {
    const size = D1_CHUNK_SIZE * 2 + 12345; // 2 full chunks + a tail
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) data[i] = i % 251; // deterministic pattern
    const chunks = splitIntoChunks(data);
    expect(chunks.length).toBe(3);
    expect(chunks[0].byteLength).toBe(D1_CHUNK_SIZE);
    expect(chunks[1].byteLength).toBe(D1_CHUNK_SIZE);
    expect(chunks[2].byteLength).toBe(12345);
    // every boundary must match the source bytes
    expect(Buffer.from(chunks[0]).equals(Buffer.from(data.slice(0, D1_CHUNK_SIZE)))).toBe(true);
    expect(Buffer.from(chunks[2]).equals(Buffer.from(data.slice(D1_CHUNK_SIZE * 2)))).toBe(true);
    expect(joinChunks(chunks).equals(Buffer.from(data))).toBe(true);
  });

  test("data exactly divisible by chunk size", () => {
    const data = new Uint8Array(D1_CHUNK_SIZE * 4);
    const chunks = splitIntoChunks(data);
    expect(chunks.length).toBe(4);
    expect(joinChunks(chunks).byteLength).toBe(D1_CHUNK_SIZE * 4);
  });

  test("empty data → one empty chunk, round trips to empty buffer", () => {
    const chunks = splitIntoChunks(new Uint8Array(0));
    expect(chunks.length).toBe(1);
    expect(chunks[0].byteLength).toBe(0);
    expect(joinChunks(chunks).byteLength).toBe(0);
  });

  test("chunks are copies, not views of the source buffer", () => {
    const data = new Uint8Array(D1_CHUNK_SIZE);
    data.fill(7);
    const chunks = splitIntoChunks(data);
    data.fill(0); // mutate source
    expect(chunks[0][0]).toBe(7); // chunk must keep the original bytes
  });

  test("custom chunk size is honored", () => {
    const data = new Uint8Array(1000);
    const chunks = splitIntoChunks(data, 300);
    expect(chunks.map((c) => c.byteLength)).toEqual([300, 300, 300, 100]);
  });
});
