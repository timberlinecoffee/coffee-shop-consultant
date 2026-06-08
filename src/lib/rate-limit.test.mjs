// TIM-2246: rate-limit primitive pinning tests.
//
// The store under test is the in-memory fallback (no Upstash env vars set).
// Upstash adapter coverage is environment-dependent and verified manually
// against a real Upstash instance.

import { test } from "node:test";
import assert from "node:assert/strict";

import { rateLimit, clientIp, enforceRateLimit } from "./rate-limit.ts";

test("rateLimit allows requests under the limit", async () => {
  const id = `t-${Math.random()}`;
  for (let i = 0; i < 3; i += 1) {
    const r = await rateLimit({ bucket: "test-under", id, limit: 5, windowSec: 60 });
    assert.equal(r.ok, true, `request ${i + 1} should pass`);
    assert.equal(r.limit, 5);
  }
});

test("rateLimit blocks once limit is exceeded", async () => {
  const id = `t-${Math.random()}`;
  for (let i = 0; i < 3; i += 1) {
    const r = await rateLimit({ bucket: "test-over", id, limit: 3, windowSec: 60 });
    assert.equal(r.ok, true);
  }
  const blocked = await rateLimit({ bucket: "test-over", id, limit: 3, windowSec: 60 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSec >= 1);
});

test("rateLimit buckets are isolated", async () => {
  const id = `t-${Math.random()}`;
  for (let i = 0; i < 5; i += 1) {
    await rateLimit({ bucket: "iso-a", id, limit: 5, windowSec: 60 });
  }
  // bucket A is now exhausted but bucket B should be fresh
  const blockedA = await rateLimit({ bucket: "iso-a", id, limit: 5, windowSec: 60 });
  const freshB = await rateLimit({ bucket: "iso-b", id, limit: 5, windowSec: 60 });
  assert.equal(blockedA.ok, false);
  assert.equal(freshB.ok, true);
});

test("rateLimit identifiers within a bucket are isolated", async () => {
  for (let i = 0; i < 3; i += 1) {
    await rateLimit({ bucket: "id-test", id: "user-a", limit: 3, windowSec: 60 });
  }
  const blockedA = await rateLimit({ bucket: "id-test", id: "user-a", limit: 3, windowSec: 60 });
  const freshB = await rateLimit({ bucket: "id-test", id: "user-b", limit: 3, windowSec: 60 });
  assert.equal(blockedA.ok, false);
  assert.equal(freshB.ok, true);
});

test("enforceRateLimit returns null on success and Response on block", async () => {
  const id = `t-${Math.random()}`;
  const ok = await enforceRateLimit({ bucket: "enforce", id, limit: 1, windowSec: 60 });
  assert.equal(ok, null);
  const blocked = await enforceRateLimit({ bucket: "enforce", id, limit: 1, windowSec: 60 });
  assert.ok(blocked instanceof Response);
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get("Retry-After"));
});

test("clientIp prefers x-forwarded-for first hop", () => {
  const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
  assert.equal(clientIp(h), "203.0.113.7");
});

test("clientIp falls back to x-real-ip", () => {
  const h = new Headers({ "x-real-ip": "203.0.113.9" });
  assert.equal(clientIp(h), "203.0.113.9");
});

test("clientIp falls back to 'anon' with no headers", () => {
  assert.equal(clientIp(new Headers()), "anon");
});
