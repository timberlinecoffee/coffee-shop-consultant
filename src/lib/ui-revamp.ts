// TIM-2589: Feature-flag infrastructure for the ui_revamp_v2 rollout.
// TIM-2598 (Phase 5.0 prod merge): default flipped to FALSE per board lock
// "every existing user keeps seeing v1 untouched". Board verifies v2 by
// flipping the flag on their own account.
// TIM-2790 (BP V2 IA flag flip): DB column DEFAULT flipped back to TRUE for
// new signups after board confirmed V2 IA on preview (TIM-2759). Existing
// rows preserved at their prior value — TIM-2598's backfilled false rows
// stay false until the user opts in via Preferences or ?ui=v2.
// TIM-2993 (Phase 6 ship, SA-2 self-apply): every remaining false row
// backfilled true; v2 is now the default for every account. Hard fallback
// also flipped to true so a missing row / read error lands on v2 rather
// than the (now-deprecated) v1 chrome. RevertToggle in Preferences still
// writes false on per-user opt-out per feedback_big_ui_revamps_need_revert_flag.
//
// Resolution priority (highest wins):
//   1. gw_ui_revamp_override cookie  — set by proxy.ts when ?ui=v1/v2 is in
//      the URL; persisted 365d so the board's `?ui=v2` sticks across visits.
//   2. gw_ui_revamp_v2 cookie        — mirror of the DB value, set by the
//      PATCH /api/account/ui-revamp endpoint so SSR skips a DB round-trip.
//   3. users.ui_revamp_v2 column     — persisted per-user preference; default
//      true post-TIM-2993 for every account.
//   4. Hard fallback: true           — only hit on missing row / read error;
//      lands on v2 to match the post-Phase-6 default. Anyone who wants v1
//      flips the RevertToggle in Preferences (PATCH writes false).

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
 * Read ui_revamp_v2 from the users row. Returns true (v2 by default) so
 * missing rows + read errors land on v2, matching the post-TIM-2993 default.
 * A row whose column is explicitly false (RevertToggle opt-out) is honored
 * as-is — the fallback only fires when there's no value to read.
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
    if (error || !data) return true;
    const row = data as { ui_revamp_v2?: unknown };
    return typeof row.ui_revamp_v2 === "boolean" ? row.ui_revamp_v2 : true;
  } catch {
    return true;
  }
}
