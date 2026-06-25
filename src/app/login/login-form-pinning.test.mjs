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

test("signOut runs BEFORE signInWithOAuth (orders the client-init refresh race out of the verifier write)", () => {
  const signOutIdx = indexOfFirst("supabase.auth.signOut");
  const signInIdx = indexOfFirst("supabase.auth.signInWithOAuth");
  assert.ok(
    signOutIdx < signInIdx,
    `signOut at index ${signOutIdx} must precede signInWithOAuth at index ${signInIdx}`,
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
test("handleGoogleSignIn calls purgeAllSupabaseCookies(defaultPurgeEnv()) after signOut, before signInWithOAuth", () => {
  assert.match(
    loginFormSrc,
    /await purgeAllSupabaseCookies\(defaultPurgeEnv\(\)\)/,
    "purgeAllSupabaseCookies call missing — TIM-2327 zombie-cookie fix regressed",
  );
  const signOutIdx = indexOfFirst("supabase.auth.signOut");
  const purgeIdx = indexOfFirst("purgeAllSupabaseCookies(");
  const signInIdx = indexOfFirst("supabase.auth.signInWithOAuth");
  assert.ok(
    signOutIdx < purgeIdx && purgeIdx < signInIdx,
    `purge at ${purgeIdx} must sit between signOut at ${signOutIdx} and signInWithOAuth at ${signInIdx}`,
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
