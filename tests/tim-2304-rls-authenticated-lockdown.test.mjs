/**
 * TIM-2304: Regression guard — the F4 follow-up to TIM-1614. Five public tables
 * carried authenticated-role policies that granted blanket USING (true) access.
 * This test locks in the corrected access model:
 *
 *   Read-only reference/seed tables (authenticated may SELECT, never WRITE):
 *     - onboarding_plan_templates
 *     - org_role_templates
 *     - pricing_benchmarks
 *     - standard_equipment_reference
 *
 *   Service-role-only (authenticated AND anon fully denied — PII/audit log):
 *     - auth_users_audit   (target_email, actor_ip, actor_jwt_sub, source_ip)
 *
 * The headline fix: before TIM-2304, the authenticated_read_only USING(true)
 * policy let ANY logged-in user read every user's email + IP + auth-change
 * history out of auth_users_audit. This test fails against the pre-migration
 * schema (authenticated SELECT returned rows) and passes after.
 *
 * Run: node --test tests/tim-2304-rls-authenticated-lockdown.test.mjs
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL        (project URL — non-secret)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY   (anon key — non-secret by design)
 *   plus ONE of, to obtain an `authenticated`-role JWT:
 *     SUPABASE_TEST_JWT                                  (a pre-minted user access token), or
 *     SUPABASE_TEST_USER_EMAIL + SUPABASE_TEST_USER_PASSWORD  (signed in via password grant)
 *
 * When env is unset (e.g. local dev without a .env), the authenticated tests
 * skip rather than fail — same convention as no-prod-jwt.test.mjs and
 * tim-1614-rls-anon-deny.test.mjs. The anon-denial test on auth_users_audit
 * runs whenever the anon key is present.
 *
 * Hits PostgREST directly via fetch; no @supabase/supabase-js dependency.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Reference/seed tables: authenticated may read, must NOT write.
const SEED_TABLES = [
  "onboarding_plan_templates",
  "org_role_templates",
  "pricing_benchmarks",
  "standard_equipment_reference",
];

// Service-role-only: authenticated and anon must be fully denied.
const SERVICE_ROLE_ONLY = "auth_users_audit";

function tableUrl(table) {
  return `${SUPABASE_URL}/rest/v1/${table}`;
}

function headers(token, extra = {}) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// Resolve an authenticated-role access token from env. Returns null when the
// test cannot obtain one (→ authenticated tests skip).
let _authToken;
async function getAuthToken() {
  if (_authToken !== undefined) return _authToken;
  if (process.env.SUPABASE_TEST_JWT) {
    _authToken = process.env.SUPABASE_TEST_JWT;
    return _authToken;
  }
  const email = process.env.SUPABASE_TEST_USER_EMAIL;
  const password = process.env.SUPABASE_TEST_USER_PASSWORD;
  if (!SUPABASE_URL || !ANON_KEY || !email || !password) {
    _authToken = null;
    return _authToken;
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    _authToken = null;
    return _authToken;
  }
  const json = await res.json().catch(() => ({}));
  _authToken = json.access_token || null;
  return _authToken;
}

// A write/read is "denied" when PostgREST refuses it: 401/403, or any 4xx/5xx,
// or a 42501 permission error surfaced as JSON. A 200/201/204 success — or a
// 200 + [] empty row-set on a table we expect to be off-limits — is a hole.
function isReadDenied(status, body) {
  if (status >= 400) return true;
  if (status === 200) {
    try {
      const parsed = JSON.parse(body);
      // 200 + rows = data leaked; 200 + [] = readable (empty) = still a hole.
      return !Array.isArray(parsed);
    } catch {
      return false;
    }
  }
  return false;
}

function assertWriteDenied(table, verb, status, body) {
  assert.notEqual(status, 200, `authenticated ${verb} on ${table} returned 200 — write hole`);
  assert.notEqual(status, 201, `authenticated ${verb} on ${table} returned 201 — write hole`);
  assert.notEqual(status, 204, `authenticated ${verb} on ${table} returned 204 — write hole`);
  assert.ok(
    status === 401 || status === 403 || status >= 400,
    `Expected authenticated ${verb} on ${table} to be denied, got HTTP ${status}: ${body.slice(0, 200)}`,
  );
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// ── auth_users_audit: anon is fully locked out (always runs with anon key) ──
test(`TIM-2304: anon cannot SELECT public.${SERVICE_ROLE_ONLY}`, { skip: !SUPABASE_URL || !ANON_KEY }, async () => {
  const res = await fetch(`${tableUrl(SERVICE_ROLE_ONLY)}?select=*&limit=1`, {
    method: "GET",
    headers: headers(ANON_KEY),
  });
  const body = await res.text();
  assert.ok(
    isReadDenied(res.status, body),
    `Expected anon SELECT on ${SERVICE_ROLE_ONLY} to be denied, got HTTP ${res.status}: ${body.slice(0, 200)}`,
  );
});

// ── auth_users_audit: authenticated is fully locked out (the headline fix) ──
test(`TIM-2304: authenticated cannot SELECT public.${SERVICE_ROLE_ONLY}`, async (t) => {
  const token = await getAuthToken();
  if (!token) return t.skip("no authenticated token in env");
  const res = await fetch(`${tableUrl(SERVICE_ROLE_ONLY)}?select=*&limit=1`, {
    method: "GET",
    headers: headers(token),
  });
  const body = await res.text();
  assert.ok(
    isReadDenied(res.status, body),
    `Expected authenticated SELECT on ${SERVICE_ROLE_ONLY} to be denied (service-role-only), got HTTP ${res.status}: ${body.slice(0, 200)}`,
  );
});

for (const verb of ["INSERT", "UPDATE", "DELETE"]) {
  test(`TIM-2304: authenticated cannot ${verb} public.${SERVICE_ROLE_ONLY}`, async (t) => {
    const token = await getAuthToken();
    if (!token) return t.skip("no authenticated token in env");
    const res = await writeRequest(SERVICE_ROLE_ONLY, verb, token);
    const body = await res.text();
    assertWriteDenied(SERVICE_ROLE_ONLY, verb, res.status, body);
  });
}

// ── seed tables: authenticated MAY read (positive control) but NEVER write ──
for (const table of SEED_TABLES) {
  test(`TIM-2304: authenticated CAN SELECT public.${table} (reference data)`, async (t) => {
    const token = await getAuthToken();
    if (!token) return t.skip("no authenticated token in env");
    const res = await fetch(`${tableUrl(table)}?select=*&limit=1`, {
      method: "GET",
      headers: headers(token),
    });
    const body = await res.text();
    assert.equal(
      res.status,
      200,
      `Expected authenticated SELECT on reference table ${table} to succeed, got HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  });

  for (const verb of ["INSERT", "UPDATE", "DELETE"]) {
    test(`TIM-2304: authenticated cannot ${verb} public.${table}`, async (t) => {
      const token = await getAuthToken();
      if (!token) return t.skip("no authenticated token in env");
      const res = await writeRequest(table, verb, token);
      const body = await res.text();
      assertWriteDenied(table, verb, res.status, body);
    });
  }
}

function writeRequest(table, verb, token) {
  if (verb === "INSERT") {
    return fetch(tableUrl(table), {
      method: "POST",
      headers: headers(token, { Prefer: "return=minimal" }),
      body: JSON.stringify({}),
    });
  }
  if (verb === "UPDATE") {
    return fetch(`${tableUrl(table)}?id=eq.${NIL_UUID}`, {
      method: "PATCH",
      headers: headers(token, { Prefer: "return=minimal" }),
      body: JSON.stringify({}),
    });
  }
  // DELETE
  return fetch(`${tableUrl(table)}?id=eq.${NIL_UUID}`, {
    method: "DELETE",
    headers: headers(token, { Prefer: "return=minimal" }),
  });
}
