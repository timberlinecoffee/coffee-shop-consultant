// TIM-2732: pin the `?expired=1` contract — the (app) layout and src/proxy.ts
// both append `expired=1` on unauth bounce, and /login + /landing read it via
// isSessionExpiredFlag. If anyone renames the param value, this test fails
// before the symptom (silent bounce-to-login) ever lands in front of a user.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSessionExpiredFlag,
  buildSessionExpiredLoginUrl,
  SESSION_EXPIRED_QUERY_PARAM,
  SESSION_EXPIRED_QUERY_VALUE,
} from "../../lib/session-expired.ts";

test("expired flag param + value are stable", () => {
  assert.equal(SESSION_EXPIRED_QUERY_PARAM, "expired");
  assert.equal(SESSION_EXPIRED_QUERY_VALUE, "1");
});

test("isSessionExpiredFlag accepts the canonical value", () => {
  assert.equal(isSessionExpiredFlag("1"), true);
});

test("isSessionExpiredFlag rejects empty / absent / other values", () => {
  assert.equal(isSessionExpiredFlag(undefined), false);
  assert.equal(isSessionExpiredFlag(""), false);
  assert.equal(isSessionExpiredFlag("0"), false);
  assert.equal(isSessionExpiredFlag("true"), false);
  assert.equal(isSessionExpiredFlag("yes"), false);
});

test("isSessionExpiredFlag handles array form from Next searchParams", () => {
  assert.equal(isSessionExpiredFlag(["1"]), true);
  assert.equal(isSessionExpiredFlag(["0", "1"]), true);
  assert.equal(isSessionExpiredFlag(["0"]), false);
  assert.equal(isSessionExpiredFlag([]), false);
});

test("buildSessionExpiredLoginUrl with no safeNext emits bare expired=1", () => {
  assert.equal(buildSessionExpiredLoginUrl(null), "/login?expired=1");
});

test("buildSessionExpiredLoginUrl with safeNext preserves next + expired", () => {
  const url = buildSessionExpiredLoginUrl("/workspace/financials?ui=v2");
  const params = new URL(`https://example.com${url}`).searchParams;
  // pin both signals — TIM-2730 (?next=) AND TIM-2732 (?expired=1) must
  // survive the same redirect.
  assert.equal(params.get("next"), "/workspace/financials?ui=v2");
  assert.equal(params.get("expired"), "1");
});

test("buildSessionExpiredLoginUrl URL-encodes the next param", () => {
  const url = buildSessionExpiredLoginUrl("/workspace/financials?ui=v2");
  // URLSearchParams encodes / as %2F and ? as %3F — this is what we want so
  // the second pair (?expired=1) parses as a top-level query, not nested
  // inside the `next` value.
  assert.ok(url.includes("next=%2Fworkspace%2Ffinancials%3Fui%3Dv2"));
  assert.ok(url.includes("expired=1"));
});
