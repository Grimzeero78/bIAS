import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { api } from "@/lib/api-helpers";

export const runtime = "nodejs";

// GET /api/audit — transparency ledger (ADMIN only)
export async function GET(req: NextRequest) {
  return api(async () => {
    await requireRole("ADMIN");
    const limit = Math.min(300, parseInt(req.nextUrl.searchParams.get("limit") || "120", 10) || 120);
    const entries = await db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return { entries };
  });
}
