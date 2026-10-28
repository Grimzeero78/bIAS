import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireJobAccess } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { HttpError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { putObject, ensureStorageRoot, storageDriver, deleteObject } from "@/lib/storage";
import { enqueueAnalysis } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_CV_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB
// On the D1 storage driver files live inside the database (500 MB free tier),
// so raw interview videos are capped tighter — browser-prepared analysis
// manifests are unaffected (they hold the evidence the AI actually uses).
const MAX_VIDEO_BYTES_D1 = 48 * 1024 * 1024; // 48 MB
const CV_TYPES = [".pdf", ".docx", ".doc", ".txt", ".md"];
const VIDEO_TYPES = [".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"];

// POST /api/upload  (multipart: candidateId, docType=CV|VIDEO, file)
export async function POST(req: NextRequest) {
  return api(async () => {
    await ensureStorageRoot();
    const form = await req.formData();
    const candidateId = String(form.get("candidateId") || "");
    const docType = String(form.get("docType") || "");
    const file = form.get("file") as File | null;
    if (!candidateId || !file || (docType !== "CV" && docType !== "VIDEO")) {
      throw new HttpError(400, "candidateId, docType (CV|VIDEO) and file are required");
    }

    const cand = await db.candidate.findUnique({ where: { id: candidateId }, include: { job: true } });
    if (!cand) throw new HttpError(404, "Candidate not found");
    const user = await requireJobAccess(cand.jobId);

    const ext = file.name.toLowerCase().replace(/.*(\.[^.]+)$/, "$1") || "";
    const exts = docType === "CV" ? CV_TYPES : VIDEO_TYPES;
    if (!exts.some((e) => ext.endsWith(e))) {
      throw new HttpError(400, `Unsupported ${docType} format ${ext || "(none)"} — allowed: ${exts.join(", ")}`);
    }
    const max =
      docType === "CV"
        ? MAX_CV_BYTES
        : storageDriver() === "d1"
          ? MAX_VIDEO_BYTES_D1
          : MAX_VIDEO_BYTES;
    if (file.size > max) {
      const hint =
        storageDriver() === "d1" && docType === "VIDEO"
          ? " — keep recordings to the strongest ~5 minutes"
          : "";
      throw new HttpError(400, `File too large (${(file.size / 1048576).toFixed(1)} MB) — limit ${max / 1048576} MB${hint}`);
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const stored = await putObject(docType === "CV" ? "cv" : "video", file.name, buf);

    // replace any previous document of this type (latest wins) — and free its blobs
    const previousDocs = await db.document.findMany({ where: { candidateId, type: docType } });
    await db.document.deleteMany({ where: { candidateId, type: docType } });
    await Promise.all(previousDocs.map((d) => deleteObject(d.storedPath).catch(() => {})));

    const doc = await db.document.create({
      data: {
        candidateId,
        type: docType,
        filename: file.name,
        storedPath: stored.storedPath,
        mimeType: file.type || (docType === "CV" ? "application/octet-stream" : "video/mp4"),
        sizeBytes: stored.sizeBytes,
      },
    });

    // reset + enqueue analysis
    if (docType === "CV") {
      await db.cvAnalysis.upsert({
        where: { candidateId },
        create: { candidateId, status: "PENDING" },
        update: { status: "PENDING", error: null, progress: "Queued", overallScore: null, scoresJson: null, parsedJson: null },
      });
    } else {
      await db.videoAnalysis.upsert({
        where: { candidateId },
        create: { candidateId, status: "PENDING" },
        update: {
          status: "PENDING", error: null, progress: "Queued", overallScore: null, scoresJson: null,
          observationsJson: null, transcript: null, segmentsJson: null, framesJson: null, precomputedKey: null,
        },
      });
    }
    enqueueAnalysis(candidateId, docType);

    await audit(user, docType === "CV" ? "UPLOAD_CV" : "UPLOAD_VIDEO", "DOCUMENT", doc.id, {
      candidate: cand.fullName,
      filename: file.name,
      sizeBytes: stored.sizeBytes,
    });

    return { document: { id: doc.id, filename: doc.filename, sizeBytes: doc.sizeBytes, type: doc.type } };
  });
}
