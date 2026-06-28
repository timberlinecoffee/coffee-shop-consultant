// TIM-2961: pin the structural invariant that handleGoogleSignIn calls
// `supabase.auth.signOut({ scope: "local" })` BEFORE `supabase.auth.signInWithOAuth`
// — and BEFORE the verifier-pre-delete step that follows it.
//
// Why a source-string pin instead of a render test: this file has no jsdom
// setup and no React test infra, but the structural property — call ordering —
// is the only thing that needs guarding against future "while-i'm-touching-this"
// edits that might drop the signOut step. A regression here is the exact
// failure mode TIM-2961 was filed for (see login-form.tsx for full context),
// so the cheapest possible test that catches re-introduction is worth it.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const loginFormSrc = readFileSync(resolve(here, "login-form.tsx"), "utf8");

function indexOfFirst(needle) {
  const i = loginFormSrc.indexOf(needle);
  if (i < 0) throw new Error(`expected to find: ${needle}`);
  return i;
}

test("handleGoogleSignIn calls supabase.auth.signOut({ scope: 'local' })", () => {
  assert.match(
    loginFormSrc,
    /await supabase\.auth\.signOut\(\{\s*scope:\s*["']local["'][\s,]*\}\)/,
    "signOut({ scope: 'local' }) call missing — TIM-2961 fix regressed",
  );
});

// TIM-3339: OAuth initiation moved server-side to /api/auth/google/start so
// the verifier lands in a Set-Cookie response header (committed before
// JS reads the response). The original "client-side signInWithOAuth" call
// is gone; the ordering invariant now pins signOut BEFORE the server fetch.
test("signOut runs BEFORE the server OAuth start fetch (orders the client-init refresh race out of the verifier write)", () => {
  const signOutIdx = indexOfFirst("supabase.auth.signOut");
  const fetchIdx = indexOfFirst('fetch("/api/auth/google/start"');
  assert.ok(
    signOutIdx < fetchIdx,
    `signOut at index ${signOutIdx} must precede /api/auth/google/start fetch at index ${fetchIdx}`,
  );
});

test("signOut runs BEFORE deleteAllVerifierVariants (so the pre-delete acts on the cleaned slot)", () => {
  const signOutIdx = indexOfFirst("supabase.auth.signOut");
  const preDeleteIdx = indexOfFirst("deleteAllVerifierVariants(");
  assert.ok(
    signOutIdx < preDeleteIdx,
    `signOut at index ${signOutIdx} must precede deleteAllVerifierVariants at index ${preDeleteIdx}`,
  );
});

test("re-entry guard (googleInFlightRef) still gates handler before signOut (TIM-2750 invariant)", () => {
  const guardIdx = indexOfFirst("googleInFlightRef.current = true");
  const signOutIdx = indexOfFirst("supabase.auth.signOut");
  assert.ok(
    guardIdx < signOutIdx,
    "re-entry guard must be set synchronously BEFORE any await — a double-click that fires two signOuts is still a race",
  );
});

// TIM-2327 (2026-06-25): pin the zombie-cookie purge between signOut and
// signInWithOAuth. Board screenshot showed `stale_verifiers=400` with
// `verifier_cookies=0` at callback — the user had 400 verifier-named cookies
// the prior per-verifier deletion could not clear because Path/Domain attrs
// did not match any tried variant. The cookie-jar overflow evicted the fresh
// verifier between pre-nav and callback. purgeAllSupabaseCookies sits in the
// gap to clear ALL sb-* zombies (verifier + auth-token) at exact attrs via
// Cookie Store API, with a broader DOM blast as fallback.
test("handleGoogleSignIn calls purgeAllSupabaseCookies(defaultPurgeEnv()) after signOut, before the server OAuth start fetch", () => {
  assert.match(
    loginFormSrc,
    /await purgeAllSupabaseCookies\(defaultPurgeEnv\(\)\)/,
    "purgeAllSupabaseCookies call missing — TIM-2327 zombie-cookie fix regressed",
  );
  const signOutIdx = indexOfFirst("supabase.auth.signOut");
  const purgeIdx = indexOfFirst("purgeAllSupabaseCookies(");
  const fetchIdx = indexOfFirst('fetch("/api/auth/google/start"');
  assert.ok(
    signOutIdx < purgeIdx && purgeIdx < fetchIdx,
    `purge at ${purgeIdx} must sit between signOut at ${signOutIdx} and /api/auth/google/start fetch at ${fetchIdx}`,
  );
});

// TIM-3339: OAuth initiation runs server-side so the PKCE verifier ships as
// Set-Cookie on the response from /api/auth/google/start. The pinning below
// guards against accidental reversion to client-side signInWithOAuth, which
// re-introduces the AuthPKCECodeVerifierMissingError pattern captured on
// TIM-3336's diag deploy (verifier_cookies=0, verifier_pre_nav=absent).
test("handleGoogleSignIn POSTs to /api/auth/google/start and does NOT call client-side signInWithOAuth", () => {
  assert.match(
    loginFormSrc,
    /fetch\("\/api\/auth\/google\/start"/,
    "server-side OAuth start fetch missing — TIM-3339 fix regressed to client-side initiation",
  );
  assert.ok(
    !/supabase\.auth\.signInWithOAuth/.test(loginFormSrc),
    "client-side signInWithOAuth reintroduced — TIM-3339 fix regressed (verifier write becomes non-durable across page-unload)",
  );
});

test("purge telemetry is handed off to the callback diag (purge_method + purge_total)", () => {
  // The handoff cookies surface in /auth/callback's exchange_failed diag so
  // the next failure shows whether the purge ran and what method (Cookie
  // Store API vs DOM blast). Without this, a recurrence is unobservable.
  assert.match(
    loginFormSrc,
    /setHandoffCookie\("gw_oauth_purge_method",\s*purgeResult\.method\)/,
    "gw_oauth_purge_method handoff missing — diag would not show whether new purge ran",
  );
  assert.match(
    loginFormSrc,
    /setHandoffCookie\("gw_oauth_purge_total",\s*String\(purgeResult\.deleted\)\)/,
    "gw_oauth_purge_total handoff missing",
  );
});
