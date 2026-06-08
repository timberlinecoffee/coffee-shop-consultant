// TIM-2266: sweepExpiredExports — pure-ish helper for the expire-exports cron.
//
// Split out of the route module so it is unit-testable without the Next.js
// runtime. Takes a Supabase-shaped client and the current time; returns a
// structured result with counts and any per-step errors.

export type ExportSweepResult = {
  scanned: number;
  purged: number;
  marked: number;
  errors: Array<{ kind: string; detail: string }>;
};

// Narrow Supabase-shaped interface so callers can hand in either the real
// service-role client or a test double. We intentionally only depend on the
// chain we use, not the full PostgrestClient surface.
type StorageRemoveResult = { data: Array<unknown> | null; error: { message: string } | null };

type SelectBuilder = {
  eq(col: string, val: string): SelectBuilder;
  not(col: string, op: string, val: null): SelectBuilder;
  lt(col: string, val: string): SelectBuilder;
  order(col: string, opts: { ascending: boolean }): SelectBuilder;
  limit(n: number): Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
};

type UpdateBuilder = {
  in(col: string, vals: string[]): Promise<{ error: { message: string } | null }>;
};

type TableBuilder = {
  select(cols: string): SelectBuilder;
  update(patch: Record<string, unknown>): UpdateBuilder;
};

type StorageBucket = {
  remove(paths: string[]): Promise<StorageRemoveResult>;
};

export type SweepClient = {
  from(table: string): TableBuilder;
  storage: { from(bucket: string): StorageBucket };
};

const EXPORT_BUCKET = "account-exports";
const MAX_BATCH = 500;

export async function sweepExpiredExports(
  svc: SweepClient,
  now: Date,
): Promise<ExportSweepResult> {
  const nowIso = now.toISOString();
  const errors: Array<{ kind: string; detail: string }> = [];

  const { data, error: selectErr } = await svc
    .from("account_export_requests")
    .select("id, storage_path, expires_at")
    .eq("status", "ready")
    .not("expires_at", "is", null)
    .lt("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(MAX_BATCH);

  if (selectErr) {
    errors.push({ kind: "select_failed", detail: selectErr.message });
    return { scanned: 0, purged: 0, marked: 0, errors };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return { scanned: 0, purged: 0, marked: 0, errors };
  }

  const paths = rows
    .map((r) => r.storage_path)
    .filter(
      (p): p is string => typeof p === "string" && p.length > 0 && p.length <= 1024,
    );

  let purged = 0;
  if (paths.length > 0) {
    const { data: removed, error: removeErr } = await svc.storage
      .from(EXPORT_BUCKET)
      .remove(paths);
    if (removeErr) {
      errors.push({ kind: "storage_remove", detail: removeErr.message });
    } else {
      purged = (removed ?? []).length;
    }
  }

  const ids = rows.map((r) => r.id as string);
  const { error: updateErr } = await svc
    .from("account_export_requests")
    .update({ status: "expired", completed_at: nowIso })
    .in("id", ids);

  if (updateErr) {
    errors.push({ kind: "row_update", detail: updateErr.message });
    return { scanned: rows.length, purged, marked: 0, errors };
  }

  return { scanned: rows.length, purged, marked: ids.length, errors };
}
