// TIM-2786: pinning tests for the OAuth diagnostic helpers. Locks the
// redaction shape (tail4 NEVER reveals the head, fixed-width corr id) and the
// public surface of logOAuthDiag so the Vercel-log filter the team uses stays
// stable as we extend the diag fields. PII discipline regressions here would
// land secrets in the team log channel.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tail4,
  newCorrId,
  browserHintFromUA,
  cookieShape,
  logOAuthDiag,
} from "./oauth-diag.ts";

test("tail4 returns 'absent' for null/undefined/empty", () => {
  assert.equal(tail4(null), "absent");
  assert.equal(tail4(undefined), "absent");
  assert.equal(tail4(""), "absent");
});

test("tail4 returns 'short' for sub-5-char values to avoid leaking the head", () => {
  assert.equal(tail4("a"), "short");
  assert.equal(tail4("abcd"), "short");
});

test("tail4 returns last 4 chars prefixed with ellipsis for long values", () => {
  assert.equal(tail4("abcdef"), "...cdef");
  assert.equal(tail4("authorization_code_long_random"), "...ndom");
});

test("tail4 never reveals the head of a long auth code", () => {
  const code = "AUTHCODE_HEAD_secret_tail_1234";
  const t = tail4(code);
  assert.equal(t, "...1234");
  assert.ok(!t.includes("AUTHCODE"));
  assert.ok(!t.includes("HEAD"));
  assert.ok(!t.includes("secret"));
});

test("newCorrId produces a 12-char hex slug", () => {
  const id = newCorrId();
  assert.match(id, /^[0-9a-f]{12}$/);
});

test("newCorrId is non-deterministic across calls", () => {
  const seen = new Set();
  for (let i = 0; i < 50; i += 1) seen.add(newCorrId());
  assert.ok(seen.size >= 49, "should rarely collide across 50 calls");
});

test("browserHintFromUA recognizes Safari, Chrome, Firefox, Edge", () => {
  assert.equal(
    browserHintFromUA(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    ),
    "safari",
  );
  assert.equal(
    browserHintFromUA(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    ),
    "chrome",
  );
  assert.equal(
    browserHintFromUA(
      "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
    ),
    "firefox",
  );
  assert.equal(
    browserHintFromUA(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
    ),
    "edge",
  );
  assert.equal(browserHintFromUA(""), "other");
});

test("cookieShape records name + length but never the value", () => {
  const out = cookieShape([
    { name: "sb-abc-auth-token", value: "very.secret.jwt.value" },
    { name: "gw_oauth_corr_id", value: "abc123abc123" },
  ]);
  assert.deepEqual(out, [
    { name: "sb-abc-auth-token", len: 21 },
    { name: "gw_oauth_corr_id", len: 12 },
  ]);
  assert.ok(!JSON.stringify(out).includes("secret"));
  assert.ok(!JSON.stringify(out).includes("jwt"));
});

test("logOAuthDiag writes a single OAUTH_DIAG-prefixed JSON line per call", () => {
  const captured = [];
  const original = console.log;
  console.log = (...args) => captured.push(args.join(" "));
  try {
    logOAuthDiag("callback_entry", { corrId: "abc", stage: "test" });
  } finally {
    console.log = original;
  }
  assert.equal(captured.length, 1);
  const line = captured[0];
  assert.ok(line.startsWith("OAUTH_DIAG "), "must start with OAUTH_DIAG prefix");
  const payload = JSON.parse(line.slice("OAUTH_DIAG ".length));
  assert.equal(payload.event, "callback_entry");
  assert.equal(payload.corrId, "abc");
  assert.equal(payload.stage, "test");
  assert.ok(typeof payload.ts === "string", "ts is ISO string");
});

test("logOAuthDiag never throws even if payload contains a circular ref", () => {
  const original = console.log;
  console.log = () => {};
  try {
    const a = {};
    a.self = a;
    assert.doesNotThrow(() => logOAuthDiag("callback_entry", { corrId: "x", bad: a }));
  } finally {
    console.log = original;
  }
});
