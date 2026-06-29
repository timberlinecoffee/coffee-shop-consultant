// TIM-3369: Feature-flag infrastructure for the Hiring & Onboarding IA
// restructure (left nav of roles + role page with accordion sections).
// Parallels src/lib/ui-revamp.ts.
// TIM-3431: default flipped to TRUE per board directive on TIM-3354 —
// existing false rows backfilled, column DEFAULT true, hard fallback true so
// missing row / read error lands on v2. HiringRevertToggle in Preferences
// still writes false on per-user opt-out per feedback_big_ui_revamps_need_revert_flag.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Session-level override cookie name (set from ?hiring=v1/v2 URL param). */
export const HIRING_REVAMP_OVERRIDE_COOKIE = "gw_hiring_revamp_override";
/** Persistent mirror cookie name (mirrors users.hiring_revamp_v2). */
export const HIRING_REVAMP_COOKIE = "gw_hiring_revamp_v2";

/**
 * Resolve the effective Hiring-revamp flag from DB value + cookies.
 * Override cookie wins, then mirror cookie, then DB value. Post-TIM-3431
 * default is true (v2 left-nav-of-roles).
 */
export function resolveHiringRevamp(opts: {
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
 * Read hiring_revamp_v2 from the users row. Returns true (v2 by default) so
 * missing rows + read errors land on v2, matching the post-TIM-3431 default.
 * A row whose column is explicitly false (HiringRevertToggle opt-out) is
 * honored as-is — the fallback only fires when there's no value to read.
 */
export async function getHiringRevampSetting(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("hiring_revamp_v2")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return true;
    const row = data as { hiring_revamp_v2?: unknown };
    return typeof row.hiring_revamp_v2 === "boolean" ? row.hiring_revamp_v2 : true;
  } catch {
    return true;
  }
}
