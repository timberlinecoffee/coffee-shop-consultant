/**
 * TIM-1614: Regression guard — anon key cannot CRUD the three tables that
 * the TIM-1612 audit + CEO discovery flagged as Standing-Rule-1 violations:
 *
 *   - stripe_processed_events       (Stripe webhook idempotency — CRITICAL)
 *   - business_plan_sections_archive (customer PII snapshot — HIGH)
 *   - equipment_referrals           (affiliate/partner links — HIGH)
 *
 * All three are reached only by service_role code paths. Anon must be locked
 * out entirely (RLS enabled + REVOKE ALL from anon, authenticated).
 *
 * Run: node --test tests/tim-1614-rls-anon-deny.test.mjs
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL       (the project URL — non-secret)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  (the anon key — non-secret by design)
 *
 * When env is unset (e.g. local dev without a .env), the test is skipped
 * rather than failing — same convention used by no-prod-jwt.test.mjs.
 *
 * Hits PostgREST directly via fetch; no @supabase/supabase-js dependency.
 * Exercises exactly the request path an attacker holding the anon key would
 * use from the browser.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const PROTECTED_TABLES = [
  "stripe_processed_events",
  "business_plan_sections_archive",
  "equipment_referrals",
];

function anonHeaders(extra = {}) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function tableUrl(table) {
  return `${SUPABASE_URL}/rest/v1/${table}`;
}

// PostgREST returns:
//   200 + []  when a SELECT succeeds and matches no rows
//   401/403   when RLS or GRANT denies the request
//   42501     SQL error code surfaced when GRANT is missing
// We treat anything OTHER than an empty 200 row-set as "denied".
function isDenied(status, body) {
  if (status === 401 || status === 403) return true;
  if (status >= 400) return true;
  // 200 with a non-empty array would mean anon read DID surface rows.
  if (status === 200) {
    try {
      const parsed = JSON.parse(body);
      return Array.isArray(parsed) && parsed.length === 0
        ? false // 200 + [] = read succeeded (empty table). Still a hole.
        : false;
    } catch {
      return false;
    }
  }
  return false;
}

for (const table of PROTECTED_TABLES) {
  test(`TIM-1614: anon cannot SELECT public.${table}`, { skip: !SUPABASE_URL || !ANON_KEY }, async () => {
    const res = await fetch(`${tableUrl(table)}?select=*&limit=1`, {
      method: "GET",
      headers: anonHeaders(),
    });
    const body = await res.text();
    assert.ok(
      isDenied(res.status, body),
      `Expected anon SELECT on ${table} to be denied, got HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  });

  test(`TIM-1614: anon cannot INSERT into public.${table}`, { skip: !SUPABASE_URL || !ANON_KEY }, async () => {
    // Use an empty object — PostgREST will resolve column defaults or surface
    // a 401/403 long before the row gets validated. We only care that it's
    // not a 201/200 success.
    const res = await fetch(tableUrl(table), {
      method: "POST",
      headers: anonHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({}),
    });
    const body = await res.text();
    assert.notEqual(res.status, 200, `anon INSERT on ${table} returned 200 — RLS hole`);
    assert.notEqual(res.status, 201, `anon INSERT on ${table} returned 201 — RLS hole`);
    assert.notEqual(res.status, 204, `anon INSERT on ${table} returned 204 — RLS hole`);
    assert.ok(
      res.status === 401 || res.status === 403 || res.status >= 400,
      `Expected denial on ${table} INSERT, got HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  });

  test(`TIM-1614: anon cannot UPDATE public.${table}`, { skip: !SUPABASE_URL || !ANON_KEY }, async () => {
    const res = await fetch(`${tableUrl(table)}?id=eq.00000000-0000-0000-0000-000000000000`, {
      method: "PATCH",
      headers: anonHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({}),
    });
    const body = await res.text();
    assert.notEqual(res.status, 200, `anon UPDATE on ${table} returned 200 — RLS hole`);
    assert.notEqual(res.status, 204, `anon UPDATE on ${table} returned 204 — RLS hole`);
    assert.ok(
      res.status === 401 || res.status === 403 || res.status >= 400,
      `Expected denial on ${table} UPDATE, got HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  });

  test(`TIM-1614: anon cannot DELETE from public.${table}`, { skip: !SUPABASE_URL || !ANON_KEY }, async () => {
    const res = await fetch(`${tableUrl(table)}?id=eq.00000000-0000-0000-0000-000000000000`, {
      method: "DELETE",
      headers: anonHeaders({ Prefer: "return=minimal" }),
    });
    const body = await res.text();
    assert.notEqual(res.status, 200, `anon DELETE on ${table} returned 200 — RLS hole`);
    assert.notEqual(res.status, 204, `anon DELETE on ${table} returned 204 — RLS hole`);
    assert.ok(
      res.status === 401 || res.status === 403 || res.status >= 400,
      `Expected denial on ${table} DELETE, got HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  });
}
