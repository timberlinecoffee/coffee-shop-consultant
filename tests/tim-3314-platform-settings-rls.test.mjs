/**
 * TIM-3314: Regression guard — platform_settings RLS lockdown.
 *
 * platform_settings (gst_number, business_address, business_name) feeds
 * Alberta-compliant invoice PDFs. RLS was absent since table creation
 * (20260603000000_tim1910_invoices.sql), leaving a full anon + authenticated
 * read/write path open via the PostgREST API.
 *
 * This test encodes the vulnerability and asserts it is closed:
 *   (a) anon SELECT → denied (HTTP 4xx, or 200 with non-array body)
 *   (b) anon UPDATE → denied (HTTP 4xx)
 *   (c) authenticated SELECT → denied (HTTP 4xx, or 200 with non-array body)
 *   (d) authenticated UPDATE → denied (HTTP 4xx)
 *
 * Note on pg_class check: the rowsecurity=true invariant is verified at the
 * DB level by the migration itself; a PostgREST 4xx on anon SELECT is a
 * sufficient proxy (PostgREST will return 403 when the role has no SELECT
 * grant, which is the consequence of RLS + REVOKE ALL).
 *
 * Run: node --test tests/tim-3314-platform-settings-rls.test.mjs
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 * Optional (for authenticated tests — same pattern as tim-2304):
 *   SUPABASE_TEST_JWT  or  SUPABASE_TEST_USER_EMAIL + SUPABASE_TEST_USER_PASSWORD
 *
 * Skips gracefully when env is absent (CI without secrets, local dev).
 * Hits PostgREST directly via fetch; no @supabase/supabase-js dependency.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TABLE = "platform_settings";

function tableUrl() {
  return `${SUPABASE_URL}/rest/v1/${TABLE}`;
}

function headers(token, extra = {}) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

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

// Returns true when access is denied.
// With REVOKE ALL + RLS enabled: PostgREST returns 403 (no SELECT grant).
// Guard against a regressed grant that returns 200 + []: that is still a hole.
function isReadDenied(status, body) {
  if (status >= 400) return true;
  if (status === 200) {
    try {
      const parsed = JSON.parse(body);
      // 200 + [] → role can read (empty because there happen to be no rows) → hole
      return !Array.isArray(parsed);
    } catch {
      return false;
    }
  }
  return false;
}

function assertWriteDenied(verb, status, body) {
  assert.ok(
    status >= 400,
    `Expected ${verb} on ${TABLE} to be denied (service-role-only), got HTTP ${status}: ${body.slice(0, 200)}`,
  );
}

// ── anon: fully locked out (always runs when anon key is present) ───────────

test(`TIM-3314: anon cannot SELECT ${TABLE}`, { skip: !SUPABASE_URL || !ANON_KEY }, async () => {
  const res = await fetch(`${tableUrl()}?select=*&limit=1`, {
    method: "GET",
    headers: headers(ANON_KEY),
  });
  const body = await res.text();
  assert.ok(
    isReadDenied(res.status, body),
    `Expected anon SELECT on ${TABLE} to be denied (service-role-only), got HTTP ${res.status}: ${body.slice(0, 200)}`,
  );
});

test(`TIM-3314: anon cannot UPDATE ${TABLE}`, { skip: !SUPABASE_URL || !ANON_KEY }, async () => {
  // platform_settings uses integer PK (id = 1); target the single row
  const res = await fetch(`${tableUrl()}?id=eq.1`, {
    method: "PATCH",
    headers: headers(ANON_KEY, { Prefer: "return=minimal" }),
    body: JSON.stringify({ gst_number: "INJECTED" }),
  });
  const body = await res.text();
  assertWriteDenied("UPDATE", res.status, body);
});

// ── authenticated: fully locked out ─────────────────────────────────────────

test(`TIM-3314: authenticated cannot SELECT ${TABLE}`, async (t) => {
  const token = await getAuthToken();
  if (!token) return t.skip("no authenticated token in env");
  const res = await fetch(`${tableUrl()}?select=*&limit=1`, {
    method: "GET",
    headers: headers(token),
  });
  const body = await res.text();
  assert.ok(
    isReadDenied(res.status, body),
    `Expected authenticated SELECT on ${TABLE} to be denied (service-role-only), got HTTP ${res.status}: ${body.slice(0, 200)}`,
  );
});

test(`TIM-3314: authenticated cannot UPDATE ${TABLE}`, async (t) => {
  const token = await getAuthToken();
  if (!token) return t.skip("no authenticated token in env");
  const res = await fetch(`${tableUrl()}?id=eq.1`, {
    method: "PATCH",
    headers: headers(token, { Prefer: "return=minimal" }),
    body: JSON.stringify({ gst_number: "INJECTED" }),
  });
  const body = await res.text();
  assertWriteDenied("UPDATE", res.status, body);
});
