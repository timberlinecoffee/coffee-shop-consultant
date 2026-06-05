// TIM-2266: expire-exports cron worker.
//
// Daily Vercel cron (see vercel.json). Sweeps every account_export_requests
// row in 'ready' status whose `expires_at` is in the past:
//   1. Removes the underlying object from the `account-exports` bucket.
//   2. Flips the row to status='expired'.
// Idempotent — re-running on the same row is a no-op (storage remove ignores
// already-missing objects; the WHERE clause filters to status='ready').
//
// Pairs with the deletion-path cleanup in TIM-2254 (which wipes the bundle on
// account delete). Together they ensure no signed-URL is replayable past the
// row's expires_at and no stale bundles linger in storage.
//
// Standing rules (TIM-2242):
//   Rule 1 — RLS deny-by-default already enforced on the table (TIM-2254 migration).
//            This route uses the service-role client to bypass RLS by design;
//            CRON_SECRET is the only authorization gate.
//   Rule 2 — Server-side authz: CRON_SECRET bearer check; no user-trustable input.
//   Rule 3 — No user input; query the DB by `expires_at < now()` and validate
//            `storage_path` is a non-empty string before removal.
//   Rule 4 — Bounded work: caps each invocation at MAX_BATCH rows so a backlog
//            cannot blow the serverless time budget. The cron re-runs daily.
//   Rule 5 — Errors caught at the route boundary; sanitised JSON; no stack traces.

import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sweepExpiredExports, type SweepClient } from "./sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Real client's chainable PostgrestQueryBuilder satisfies SweepClient at runtime;
    // cast bypasses the SupabaseClient generic depth, which trips TS2589 otherwise.
    const svc = createServiceClient() as unknown as SweepClient;
    const result = await sweepExpiredExports(svc, new Date());
    if (result.errors.some((e) => e.kind === "select_failed" || e.kind === "row_update")) {
      return Response.json(result, { status: 500 });
    }
    return Response.json(result);
  } catch (err) {
    console.error("[expire-exports] unhandled", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
