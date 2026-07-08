// TIM-3694: Feature-flag infrastructure for the ui_revamp_v3 rollout.
// Default-ON per feedback_revamp_flag_default_on_not_opt_in and
// feedback_big_ui_revamps_need_revert_flag. Any read failure or absent env var
// lands on v3 (true). RevertToggleV3 in Preferences writes a cookie so the
// user can opt out per-browser without a DB round-trip.
//
// Resolution priority (highest wins):
//   1. NEXT_PUBLIC_UI_REVAMP_V3 env var  — global on/off override baked at
//      build time; absence treated as true so deployments default to v3.
//   2. gw_ui_revamp_v3 cookie            — per-user opt-out; set by
//      PATCH /api/account/ui-revamp-v3 so SSR skips a round-trip.
//   3. Hard fallback: true               — missing env + missing cookie → v3.

/** Cookie name for per-user v3 opt-out (mirrors the PATCH endpoint write). */
export const UI_REVAMP_V3_COOKIE = "gw_ui_revamp_v3";

/**
 * Global v3 flag — true unless NEXT_PUBLIC_UI_REVAMP_V3 is explicitly "false".
 * Baked at build time; use resolveUiRevampV3() for per-user resolution.
 */
export const UI_REVAMP_V3: boolean =
  process.env.NEXT_PUBLIC_UI_REVAMP_V3 !== "false";

/**
 * Resolve the effective v3 flag from cookie value.
 * Accepts the raw string value from `request.cookies.get(...)?.value`.
 * Falls back to the build-time UI_REVAMP_V3 constant when no cookie is set.
 */
export function resolveUiRevampV3(opts: {
  mirrorCookie: string | undefined;
}): boolean {
  const { mirrorCookie } = opts;
  if (mirrorCookie === "0") return false;
  if (mirrorCookie === "1") return true;
  return UI_REVAMP_V3;
}
