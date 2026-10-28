-- FileBlob storage: keeps uploaded files (CVs, videos, analysis manifests)
-- inside the D1 database itself — no R2 bucket required.
--
-- Design constraints honored (see https://developers.cloudflare.com/d1/platform/limits/):
--   max BLOB/row 2 MB        → chunks are 512 KB
--   max 100 bound params     → 3 params per chunk insert
--   free plan: 50 queries/invocation → writes/reads use batched statements

CREATE TABLE IF NOT EXISTS "StoredFile" (
    "key"        TEXT NOT NULL PRIMARY KEY,
    "size"       INTEGER NOT NULL,
    "chunkCount" INTEGER NOT NULL,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "FileChunk" (
    "key"  TEXT NOT NULL,
    "idx"  INTEGER NOT NULL,
    "data" BLOB NOT NULL,
    PRIMARY KEY ("key", "idx")
);

CREATE INDEX IF NOT EXISTS "FileChunk_key_idx" ON "FileChunk" ("key", "idx");
