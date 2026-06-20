// TIM-2786: structured OAuth diagnostic logger.
//
// Default-on in prod, no flag. Captures the next natural Google OAuth failure
// mechanism to Vercel runtime logs. The TIM-2750 verifier/challenge race fix
// on 1038a7e is real and stays live; this module captures additional
// mechanisms (Safari ITP, refresh-token race, state mismatch, narrow cookie
// Path/Domain, edge cache, Google double-prompt UX) without asking the board
// to do anything — the next natural login attempt that fails surfaces here.
//
// Channel: structured JSON to stdout, prefixed `OAUTH_DIAG`. Vercel ingests
// every console.log from a route handler / Server Component into the runtime
// log stream. Filter on the prefix in the Vercel Logs dashboard. No DB
// migration required (the project has neither Sentry DSN — TIM-2301 — nor
// the supabase-CLI on the agent host today, and the CEO directive explicitly
// listed Vercel logs as an approved channel).
//
// PII discipline (Standing Rule 3 + CEO directive): cookie values NEVER
// logged, only names + sizes. Auth codes and state tokens truncated to last
// 4 chars via `tail4`. Email never logged. Bearer tokens never logged.

export type OAuthDiagEvent =
  | "callback_entry"           // /auth/callback GET handler reached
  | "callback_exchange_ok"     // exchangeCodeForSession returned no error
  | "callback_exchange_fail"   // exchangeCodeForSession returned an error
  | "callback_no_code"         // /auth/callback hit with no `code` param
  | "callback_redirect"        // server emitted a redirect Location
  | "login_bounce_view"        // client landed on /login with ?error=auth_failed
  | "pre_nav_intent"           // client about to call window.location.assign(supabase /authorize url)
  | "client_beacon";           // any other client-side capture POSTed to /api/auth-diag

export type OAuthDiagPayload = Record<string, unknown> & {
  corrId?: string;
  stage?: string;
};

// Single-line JSON keeps Vercel log search reliable (one row per event).
// The prefix is the team's grep key in the Logs dashboard.
export function logOAuthDiag(event: OAuthDiagEvent, payload: OAuthDiagPayload): void {
  try {
    const row = {
      event,
      ts: new Date().toISOString(),
      ...payload,
    };
    // eslint-disable-next-line no-console -- diag-only channel per TIM-2786
    console.log("OAUTH_DIAG " + JSON.stringify(row));
  } catch {
    // Never let diag throw into a real handler — observation must not perturb
    // the system it is observing.
  }
}

// last-4 redaction for auth codes / state tokens. NEVER the full value.
// `absent` for null/undefined, `short` for sub-4-char values so the surface
// is distinguishable from "we have it" without leaking the head.
export function tail4(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "absent";
  const s = String(v);
  if (s.length <= 4) return "short";
  return "..." + s.slice(-4);
}

// 12 hex chars = ~48 bits of entropy. Plenty for correlating one login
// attempt across (login click → callback → bounce/success) when the global
// volume is bounded to a handful of attempts per minute. Short enough to
// copy/paste from a log line into a follow-up issue.
export function newCorrId(): string {
  try {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "fbk" + Math.floor((Date.now() / 1000) % 1e9).toString(16);
  }
}

// Browser-fingerprint hint for tagging Safari ITP / third-party cookie
// hypotheses. Keep coarse — no need for full UA parsing.
export function browserHintFromUA(ua: string): "safari" | "chrome" | "firefox" | "edge" | "other" {
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Edg\//.test(ua)) return "edge";
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua)) return "safari";
  return "other";
}

// Reduce a list of cookies to a name-and-size shape that's safe to log.
// `getAll()` returns `{ name, value }` from the server cookie store; we
// record value.length (a number) but NEVER the value itself.
export function cookieShape(
  cookies: ReadonlyArray<{ name: string; value: string }>,
): Array<{ name: string; len: number }> {
  return cookies.map((c) => ({ name: c.name, len: c.value.length }));
}
