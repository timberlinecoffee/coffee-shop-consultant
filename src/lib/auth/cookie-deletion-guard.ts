// TIM-3330: suppress refresh-token-race cookie wipes.
//
// `@supabase/auth-js` `_callRefreshToken` (GoTrueClient.js:3893-3899) catches a
// non-retryable AuthError and unconditionally calls `_removeSession()`, which
// reaches our SSR `setAll` with a deletion-shape batch (every cookie
// `value==='' && maxAge===0`). Concurrent middleware passes can both attempt to
// refresh the same token within the EXPIRY_MARGIN_MS window; the loser sees
// `refresh_token_already_used` and propagates the wipe to the browser, even
// though the winner already minted valid replacements. End result on real
// Chrome: cookie jar emptied → next visit bounces to /login.
//
// The guard recognizes a deletion batch on a request that still carries a
// valid-shaped Supabase auth token and suppresses it (returns `undefined` from
// the resolver in that case). True signOut and true revocation paths still
// arrive without a valid inbound auth-token cookie, so they continue through.

import { isSupabaseAuthCookie } from "./remember-me.ts";

export interface SetCookieEntry {
  name: string;
  value: string;
  options?: { maxAge?: number; expires?: Date | number | string; [k: string]: unknown };
}

export interface InboundCookieJar {
  getAll(): Array<{ name: string; value: string }>;
}

// A "deletion-shape" batch is one where every entry is the SSR helper's
// canonical wipe pair: empty value AND maxAge===0. Non-empty value or any other
// maxAge means a real session write (refresh, signin), not a removal.
export function isAuthTokenDeletionBatch(entries: ReadonlyArray<SetCookieEntry>): boolean {
  if (entries.length === 0) return false;
  let touchedAuth = false;
  for (const entry of entries) {
    if (entry.value !== "") return false;
    if (entry.options?.maxAge !== 0) return false;
    if (isSupabaseAuthCookie(entry.name)) touchedAuth = true;
  }
  return touchedAuth;
}

// True when the inbound request still has at least one Supabase auth-token
// cookie whose value is non-empty (and not the PKCE verifier, which is a
// pre-auth handshake artifact rather than a session-bearing token).
export function requestCarriesValidAuthToken(jar: InboundCookieJar): boolean {
  for (const cookie of jar.getAll()) {
    if (!isSupabaseAuthCookie(cookie.name)) continue;
    if (cookie.name.endsWith("-code-verifier")) continue;
    if (cookie.value && cookie.value.length > 0) return true;
  }
  return false;
}

export interface SuppressionContext {
  path?: string;
  reason?: string;
}

export interface SuppressionLogger {
  (event: { tag: "tim3330_setall_deletion_suppressed"; cookieNames: string[]; ctx: SuppressionContext }): void;
}

const defaultLogger: SuppressionLogger = (event) => {
  // Stringify so Vercel log search hits the tag verbatim.
  console.warn(JSON.stringify(event));
};

// Returns true if the caller should SUPPRESS the wipe (and skip writing it to
// the response). Logs structured event on suppression so we can observe race
// frequency in prod.
export function shouldSuppressSetAll(
  entries: ReadonlyArray<SetCookieEntry>,
  jar: InboundCookieJar,
  ctx: SuppressionContext = {},
  logger: SuppressionLogger = defaultLogger,
): boolean {
  if (!isAuthTokenDeletionBatch(entries)) return false;
  if (!requestCarriesValidAuthToken(jar)) return false;
  logger({
    tag: "tim3330_setall_deletion_suppressed",
    cookieNames: entries.map((e) => e.name),
    ctx,
  });
  return true;
}
