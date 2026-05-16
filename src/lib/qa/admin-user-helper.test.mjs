// TIM-677: Unit tests for QA fixture user lookup helper.
// Covers: zero matches → throw; one match → return; multiple matches → throw;
// non-fixture email → refuse write. No real Supabase connection required.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  lookupFixtureUserByEmail,
  assertFixtureEmail,
  QAUserLookupError,
} from "./admin-user-helper.ts";

// ── assertFixtureEmail ────────────────────────────────────────────────────────

test("assertFixtureEmail: accepts qa-*@timberline.coffee addresses", () => {
  assert.doesNotThrow(() => assertFixtureEmail("qa-alice@timberline.coffee"));
  assert.doesNotThrow(() => assertFixtureEmail("qa-fixture-123@timberline.coffee"));
});

test("assertFixtureEmail: rejects non-fixture addresses", () => {
  const bad = [
    "demo.owner@timberline.coffee",
    "alice@example.com",
    "qa@timberline.coffee",           // missing hyphen-and-suffix
    "qa-alice@timberline.coffee.evil", // wrong domain
    "",
  ];
  for (const email of bad) {
    assert.throws(
      () => assertFixtureEmail(email),
      QAUserLookupError,
      `Expected rejection for: ${email}`
    );
  }
});

// ── lookupFixtureUserByEmail ──────────────────────────────────────────────────

function makeAdminClient(users, error = null) {
  return {
    auth: {
      admin: {
        listUsers: async () => ({ data: { users }, error }),
      },
    },
  };
}

const FIXTURE_EMAIL = "qa-test@timberline.coffee";

test("lookupFixtureUserByEmail: zero matches → throws QAUserLookupError", async () => {
  const client = makeAdminClient([]);
  await assert.rejects(
    () => lookupFixtureUserByEmail(client, FIXTURE_EMAIL),
    QAUserLookupError
  );
});

test("lookupFixtureUserByEmail: one match → returns the user", async () => {
  const user = { id: "abc-123", email: FIXTURE_EMAIL };
  const client = makeAdminClient([user]);
  const result = await lookupFixtureUserByEmail(client, FIXTURE_EMAIL);
  assert.deepEqual(result, user);
});

test("lookupFixtureUserByEmail: multiple matches → throws QAUserLookupError", async () => {
  const users = [
    { id: "abc-123", email: FIXTURE_EMAIL },
    { id: "def-456", email: FIXTURE_EMAIL },
  ];
  const client = makeAdminClient(users);
  await assert.rejects(
    () => lookupFixtureUserByEmail(client, FIXTURE_EMAIL),
    QAUserLookupError
  );
});

test("lookupFixtureUserByEmail: API error → throws QAUserLookupError", async () => {
  const client = makeAdminClient([], { message: "permission denied" });
  await assert.rejects(
    () => lookupFixtureUserByEmail(client, FIXTURE_EMAIL),
    QAUserLookupError
  );
});

test("lookupFixtureUserByEmail: non-fixture email → refuses before any API call", async () => {
  let called = false;
  const client = {
    auth: {
      admin: {
        listUsers: async () => {
          called = true;
          return { data: { users: [] }, error: null };
        },
      },
    },
  };
  await assert.rejects(
    () => lookupFixtureUserByEmail(client, "demo.owner@timberline.coffee"),
    QAUserLookupError
  );
  assert.equal(called, false, "API must not be called for non-fixture addresses");
});

// ── Replay of original TIM-676 code path ─────────────────────────────────────
// Simulates the original 3-user account where email lookup returned [0]
// (first user) instead of throwing. The fix must return the correct user
// or throw — never silently match the wrong record.

test("TIM-676 regression: 3-user account, matching user present → returns correct user", async () => {
  const users = [
    { id: "u1", email: "qa-alpha@timberline.coffee" },
    { id: "u2", email: "qa-beta@timberline.coffee" },
    { id: "u3", email: "qa-gamma@timberline.coffee" },
  ];
  // Server-side filter means only the target user is returned.
  const client = makeAdminClient([users[1]]); // GoTrue returns only qa-beta
  const result = await lookupFixtureUserByEmail(client, "qa-beta@timberline.coffee");
  assert.equal(result.id, "u2");
});

test("TIM-676 regression: 3-user account, target not in filtered result → throws (no [0] fallback)", async () => {
  // Simulates the truncated list scenario: target email absent from results.
  const client = makeAdminClient([]); // GoTrue returns empty for the filtered call
  await assert.rejects(
    () => lookupFixtureUserByEmail(client, "qa-missing@timberline.coffee"),
    QAUserLookupError,
    "Must throw, not fall back to [0]"
  );
});
