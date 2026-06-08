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

export function isAuthFlowPath(pathname: string, searchParamKeys: Iterable<string>): boolean {
  if (pathname === "/auth/callback" || pathname === "/auth/signout") {
    return true;
  }
  if (APEX_FALLBACK_PATHS.has(pathname)) {
    for (const key of searchParamKeys) {
      if (key === "code" || key === "error") return true;
    }
  }
  return false;
}
