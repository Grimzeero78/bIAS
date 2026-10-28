import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { objectWebStream } from "@/lib/storage";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * RBAC-gated file serving with HTTP Range support (needed for video seeking —
 * clicking a timestamped observation must be able to jump the player).
 *
 * Policy:
 *  - ADMIN        → any document
 *  - INTERVIEWER  → documents belonging to candidates on jobs they created
 *  - CANDIDATE    → their OWN documents, only while the job has candidateVisibility
 */

async function authorize(docId: string): Promise<{ user: SessionUser; ok: boolean } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const doc = await db.document.findUnique({
    where: { id: docId },
    include: { candidate: { include: { job: { select: { createdById: true, candidateVisibility: true } } } } },
  });
  if (!doc) return null;
  if (user.role === "ADMIN") return { user, ok: true };
  if (user.role === "INTERVIEWER") return { user, ok: doc.candidate.job.createdById === user.id };
  if (user.role === "CANDIDATE") {
    return { user, ok: user.candidateId === doc.candidateId && doc.candidate.job.candidateVisibility };
  }
  return { user, ok: false };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const auth = await authorize(id);
    if (!auth || !auth.ok) {
      return new NextResponse("Not found or access denied", { status: 403 });
    }
    const doc = await db.document.findUnique({ where: { id } });
    if (!doc) return new NextResponse("Not found", { status: 404 });

    const size = await objectSizeCompat(doc.storedPath);
    const range = req.headers.get("range");
    const isVideo = doc.type === "VIDEO";

    if (range && isVideo) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
      if (Number.isNaN(start) || start < 0) start = 0;
      if (Number.isNaN(end) || end >= size) end = size - 1;
      if (start > end) start = Math.max(0, end - 1);
      // cap chunk to 2 MB to keep memory flat
      end = Math.min(end, start + 2 * 1024 * 1024 - 1);
      const { stream } = await objectWebStream(doc.storedPath, { start, end });
      return new NextResponse(stream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(end - start + 1),
          "Content-Type": doc.mimeType || "video/mp4",
        },
      });
    }

    // full object
    const { stream } = await objectWebStream(doc.storedPath);
    if (isVideo) {
      return new NextResponse(stream, {
        status: 200,
        headers: {
          "Content-Length": String(size),
          "Content-Type": doc.mimeType || "video/mp4",
          "Accept-Ranges": "bytes",
        },
      });
    }

    // CV / small files: inline preview
    const isStaff = auth.user.role !== "CANDIDATE";
    if (isStaff) {
      await audit(auth.user, "VIEW_DOCUMENT", "DOCUMENT", doc.id, { filename: doc.filename });
    }
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Length": String(size),
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${doc.filename.replace(/"/g, "")}"`,
      },
    });
  } catch (e) {
    console.error("[files] error:", e);
    return new NextResponse("File serving error", { status: 500 });
  }
}

/** objectSize that also works for objects written by earlier local builds. */
async function objectSizeCompat(storedPath: string): Promise<number> {
  try {
    const { objectSize } = await import("@/lib/storage");
    return await objectSize(storedPath);
  } catch {
    return 0;
  }
}
