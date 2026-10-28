-- Staged AI pipeline resume support.
--
-- Workers cap background (waitUntil) work — long AI runs can be killed
-- mid-flight, leaving the row stuck in PROCESSING forever. Two additions
-- make every pipeline stage persistable and every stuck row resumable:
--
--   updatedAt  — heartbeat written at each stage; the analysis status
--                endpoint re-drives rows whose heartbeat went stale
--   visualJson — persisted vision-pass output (video pipeline stage 1)

ALTER TABLE "CvAnalysis" ADD COLUMN "updatedAt" DATETIME;
ALTER TABLE "VideoAnalysis" ADD COLUMN "updatedAt" DATETIME;
ALTER TABLE "VideoAnalysis" ADD COLUMN "visualJson" TEXT;
