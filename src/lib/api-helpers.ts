import { NextResponse } from "next/server";
import { HttpError } from "@/lib/auth";


/** Wraps a route handler with uniform JSON error responses. */
export function api<T>(fn: () => Promise<T>) {
  return fn().then(
    (data) => NextResponse.json({ ok: true, ...(data as object) }),
    (err: unknown) => {
      if (err instanceof HttpError) {
        return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
      }
      console.error("[api] unexpected error:", err);
      const message = err instanceof Error ? err.message : "Internal server error";
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  );
}
