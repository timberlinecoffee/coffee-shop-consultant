// TIM-3953: v3 flag infrastructure. Cookie-only revert (no new DB column).
// When NEXT_PUBLIC_HIRING_REVAMP_V3=true (env), v3 is the default for all users.
// Cookie gw_hiring_revamp_v3_override="false" opts a session back to v1/v2.

export const HIRING_REVAMP_V3_OVERRIDE_COOKIE = "gw_hiring_revamp_v3_override";

/** Returns true when the v3 Hiring & Onboarding workspace should be shown. */
export function resolveHiringRevampV3(opts: {
  overrideCookie: string | undefined;
}): boolean {
  const envEnabled = process.env.NEXT_PUBLIC_HIRING_REVAMP_V3 === "true";
  if (opts.overrideCookie === "false") return false;
  if (opts.overrideCookie === "true") return true;
  return envEnabled;
}
