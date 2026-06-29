// TIM-3369: Feature-flag infrastructure for the Hiring & Onboarding IA
// restructure (left nav of roles + role page with accordion sections).
// Parallels src/lib/ui-revamp.ts. Ships to prod default-false; board flips
// per-account via Preferences toggle or ?hiring=v2 URL override. After the
// 14-day revert window passes with no holds, SA-2 flips default to true.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Session-level override cookie name (set from ?hiring=v1/v2 URL param). */
export const HIRING_REVAMP_OVERRIDE_COOKIE = "gw_hiring_revamp_override";
/** Persistent mirror cookie name (mirrors users.hiring_revamp_v2). */
export const HIRING_REVAMP_COOKIE = "gw_hiring_revamp_v2";

/**
 * Resolve the effective Hiring-revamp flag from DB value + cookies.
 * Override cookie wins, then mirror cookie, then DB value. Default is false
 * (v1 inline-expand list) until SA-2 flip.
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
 * Read hiring_revamp_v2 from the users row. Returns false on missing row /
 * read error so anyone without an explicit opt-in lands on v1 — matches the
 * "ship default-false, opt-in for revert window" plan.
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
    if (error || !data) return false;
    const row = data as { hiring_revamp_v2?: unknown };
    return typeof row.hiring_revamp_v2 === "boolean" ? row.hiring_revamp_v2 : false;
  } catch {
    return false;
  }
}
