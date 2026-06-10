// TIM-2589: Feature-flag infrastructure for the ui_revamp_v2 rollout.
// TIM-2598 (Phase 5.0 prod merge): default flipped to FALSE per board lock
// "every existing user keeps seeing v1 untouched". Board verifies v2 by
// flipping the flag on their own account.
//
// Resolution priority (highest wins):
//   1. gw_ui_revamp_override cookie  — set by proxy.ts when ?ui=v1/v2 is in
//      the URL; persisted 365d so the board's `?ui=v2` sticks across visits.
//   2. gw_ui_revamp_v2 cookie        — mirror of the DB value, set by the
//      PATCH /api/account/ui-revamp endpoint so SSR skips a DB round-trip.
//   3. users.ui_revamp_v2 column     — persisted per-user preference.
//   4. Hard default: false           — new UI off for all default accounts.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Session-level override cookie name (set from ?ui=v1/v2 URL param). */
export const UI_REVAMP_OVERRIDE_COOKIE = "gw_ui_revamp_override";
/** Persistent mirror cookie name (mirrors users.ui_revamp_v2). */
export const UI_REVAMP_COOKIE = "gw_ui_revamp_v2";

/**
 * Resolve the effective flag from DB value + cookies.
 * Accepts the raw string values from `request.cookies.get(...)?.value`.
 */
export function resolveUiRevamp(opts: {
  dbValue: boolean;
  overrideCookie: string | undefined;
  mirrorCookie: string | undefined;
}): boolean {
  const { dbValue, overrideCookie, mirrorCookie } = opts;
  if (overrideCookie === "v1") return false;
  if (overrideCookie === "v2") return true;
  if (mirrorCookie === "0") return false;
  if (mirrorCookie === "1") return true;
  return dbValue;
}

/**
 * Read ui_revamp_v2 from the users row. Returns false (v1 by default) so
 * missing rows + read errors fall back to the current UI per the TIM-2598
 * board lock.
 */
export async function getUiRevampSetting(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("ui_revamp_v2")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return false;
    const row = data as { ui_revamp_v2?: unknown };
    return typeof row.ui_revamp_v2 === "boolean" ? row.ui_revamp_v2 : false;
  } catch {
    return false;
  }
}
