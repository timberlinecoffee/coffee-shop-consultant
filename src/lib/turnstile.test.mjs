// TIM-2246: Turnstile server-verify pinning tests.
//
// Verifies the no-secret skip path. Real Cloudflare verifies aren't network-
// reachable from CI, so live verifies are out of scope here.

import { test } from "node:test";
import assert from "node:assert/strict";

import { verifyTurnstileToken, turnstileEnabled, turnstileSiteKey } from "./turnstile.ts";

test("verifyTurnstileToken skips when TURNSTILE_SECRET_KEY is unset", async () => {
  const prior = process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  try {
    const r = await verifyTurnstileToken("anything", "203.0.113.1");
    assert.equal(r.ok, true);
    assert.equal("skipped" in r && r.skipped, true);
  } finally {
    if (prior !== undefined) process.env.TURNSTILE_SECRET_KEY = prior;
  }
});

test("verifyTurnstileToken fails when secret is set but token missing", async () => {
  const prior = process.env.TURNSTILE_SECRET_KEY;
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  try {
    const r = await verifyTurnstileToken("", "203.0.113.2");
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.errors.length > 0);
    }
  } finally {
    if (prior === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = prior;
  }
});

test("turnstileEnabled mirrors TURNSTILE_SECRET_KEY presence", () => {
  const prior = process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  assert.equal(turnstileEnabled(), false);
  process.env.TURNSTILE_SECRET_KEY = "x";
  assert.equal(turnstileEnabled(), true);
  if (prior === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = prior;
});

test("turnstileSiteKey returns null when env var missing", () => {
  const prior = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  assert.equal(turnstileSiteKey(), null);
  if (prior !== undefined) process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = prior;
});
