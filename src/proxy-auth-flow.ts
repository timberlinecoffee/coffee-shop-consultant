// TIM-2352: pure helper used by src/proxy.ts to decide whether a request
// belongs to an in-flight OAuth handshake. On those paths the middleware must
// NOT call supabase.auth.getUser() — see proxy.ts for full incident context.
//
// TIM-2327 follow-up (2026-06-07): Supabase Auth's Site URL is board-set in
// Dashboard and we have no read access. If it is `https://groundwork.cafe`
// the OAuth fallback lands on `/?code=...` which the original check covered.
// If it is `https://groundwork.cafe/coming-soon` (the apex-fallback page
// directly) or `https://groundwork.cafe/landing` (marketing preserved from
// TIM-2288) the fallback lands on a path the original check missed → proxy
// ran getUser() → stale refresh wiped the PKCE verifier → exchange failed on
// first attempt and succeeded on second after the wipe. That's the "log in
// twice" symptom Trent reported 2026-06-07T15:39Z. coming-soon/page.tsx
// already forwards `?code=` to /auth/callback from all three paths; this
// just makes the proxy bypass symmetric with that forwarder.
const APEX_FALLBACK_PATHS = new Set(["/", "/coming-soon", "/landing"]);

// Board directive 2026-07-26 (Cowork onboarding brief §1A): the TIM-2352 bypass
// covered the CONSUMING end of the handshake (/auth/callback) but not the
// MINTING end. TIM-3339 moved OAuth initiation server-side, so the PKCE
// verifier is now written by POST /api/auth/google/start via createServerClient
// and returned as Set-Cookie on that response. That path is matched by
// proxy.ts's matcher, so the proxy runs supabase.auth.getUser() on the very
// request that mints the verifier. On a visitor carrying a stale refresh token
// that call fails → _callRefreshToken → _removeSession() → setAll wipe. The
// TIM-3330 cookie-deletion-guard does NOT save us here: shouldSuppressSetAll
// requires a valid inbound auth-token cookie (cookie-deletion-guard.ts), which
// is precisely what a fresh first-attempt login does not have, and it skips
// `-code-verifier` cookies from its suppression set anyway.
//
// Net effect: verifier minted and wiped inside the same request → callback
// reports verifier_cookies=0 / verifier_chunks=0 → AuthPKCECodeVerifierMissing
// → "first Google login always fails, second succeeds". Same root cause and
// same fix as TIM-2352, applied to the other end of the handshake.
//
// Safe to bypass: this route is not under proxy.ts's protectedPaths
// (/dashboard, /plan, /account), it enforces its own rate limit and
// same-origin redirectTo validation, and it is a POST API route so neither the
// x-gw-pathname Server-Component headers nor the ?ui= / ?hiring= override
// cookies apply to it.
const AUTH_HANDSHAKE_PATHS = new Set([
  "/auth/callback",
  "/auth/signout",
  "/api/auth/google/start",
]);

export function isAuthFlowPath(pathname: string, searchParamKeys: Iterable<string>): boolean {
  if (AUTH_HANDSHAKE_PATHS.has(pathname)) {
    return true;
  }
  if (APEX_FALLBACK_PATHS.has(pathname)) {
    for (const key of searchParamKeys) {
      if (key === "code" || key === "error") return true;
    }
  }
  return false;
}
