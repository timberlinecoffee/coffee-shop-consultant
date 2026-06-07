// TIM-2430: "Keep me signed in on this device" preference.
//
// Stored as a first-party `gw_remember_me` cookie ("1" = persist long, "0" =
// session-only). Read by:
//   - proxy.ts `setAll` — when refreshing access tokens
//   - lib/supabase/server.ts `setAll` — when route handlers refresh
//   - login-form.tsx — to set the preference and rewrite freshly-issued
//     auth-token cookies into session-scope when unchecked
//
// Absent cookie = default `true` (matches pre-TIM-2430 behavior: Supabase SSR
// defaults `maxAge` to 400 days for auth-token cookies).

export const REMEMBER_ME_COOKIE = "gw_remember_me";

// 400 days — same upper-bound Chrome enforces on cookie lifetimes
// (https://developer.chrome.com/blog/cookie-max-age-expires). The preference
// itself is always long-lived so it survives the current browser session and
// can pre-fill the checkbox on the next sign-in.
export const REMEMBER_ME_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export function parseRememberPreference(raw: string | undefined | null): boolean {
  // Default to true when the cookie is absent OR set to anything other than "0"
  if (raw === "0") return false;
  return true;
}

export function isSupabaseAuthCookie(name: string): boolean {
  // Matches the SSR-generated chunks (`sb-<ref>-auth-token`, `.0`, `.1`, etc.)
  // and the PKCE verifier (`sb-<ref>-auth-token-code-verifier`). Other Supabase
  // cookies (none today) would also be covered but they all serve session state.
  return name.startsWith("sb-") && name.includes("-auth-token");
}

export interface CookieOptionsLike {
  maxAge?: number;
  expires?: Date | number | string;
  [k: string]: unknown;
}

// When the user opted out of "Keep me signed in", strip the long-lived
// attributes so the cookie becomes session-scope (cleared on browser close).
// Leaves non-auth cookies untouched.
export function adjustOptionsForRemember<T extends CookieOptionsLike | undefined>(
  name: string,
  options: T,
  remember: boolean,
): T {
  if (remember) return options;
  if (!isSupabaseAuthCookie(name)) return options;
  const base = (options ?? {}) as CookieOptionsLike;
  const { maxAge: _maxAge, expires: _expires, ...rest } = base;
  return rest as T;
}
