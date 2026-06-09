// TIM-2578: drift-guard for the /account/cancel hardening.
// History: production 500s on /account/cancel because
// stripe.subscriptions.retrieve(stale_id) threw "No such subscription" and
// the page had no try/catch. Vercel runtime logs at 05:54 UTC 2026-06-09
// captured two 500s with that exact message before the fix landed.
//
// If any of these guards trip, do NOT delete the guard — fix the regression.
// The whole point is that a paid cancel surface can never raw-500 a user.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

function read(rel) {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

test("TIM-2578: cancel page wraps stripe.subscriptions.retrieve in try/catch", () => {
  const src = read("src/app/account/cancel/page.tsx");
  // try block with the retrieve call inside
  const tryRetrieve = /try\s*{[\s\S]{0,400}stripe\.subscriptions\.retrieve\s*\(/;
  assert.match(src, tryRetrieve, "stripe.subscriptions.retrieve must be inside a try block");
  // catch block that redirects on failure
  assert.match(src, /catch\s*\([\s\S]{0,400}redirect\s*\(/, "catch must redirect on Stripe failure");
});

test("TIM-2578: cancel page allows past_due in cancellable statuses", () => {
  const src = read("src/app/account/cancel/page.tsx");
  // The fix is to include past_due so users with a failed payment can still
  // cancel (Consumer Protection / dispute risk if they can't).
  assert.match(src, /CANCELLABLE_STATUSES[\s\S]{0,200}["']past_due["']/, "past_due must be cancellable");
  assert.match(src, /CANCELLABLE_STATUSES[\s\S]{0,200}["']active["']/, "active must be cancellable");
  assert.match(src, /CANCELLABLE_STATUSES[\s\S]{0,200}["']trialing["']/, "trialing must be cancellable");
  assert.match(src, /CANCELLABLE_STATUSES[\s\S]{0,200}["']paused["']/, "paused must be cancellable");
});

test("TIM-2578: cancel page no-sub redirect goes to billing, not pricing", () => {
  const src = read("src/app/account/cancel/page.tsx");
  // Logged-in users with no sub should land back on /account/billing with a
  // graceful "nothing to cancel" banner, NOT be punted to /pricing.
  assert.ok(
    !/redirect\(\s*["']\/pricing["']\s*\)/.test(src),
    "no-sub redirect must NOT target /pricing — use /account/billing with a nothing_to_cancel banner",
  );
  assert.match(src, /\/account\/billing\?nothing_to_cancel=1/);
});

test("TIM-2578: /api/billing/cancel wraps stripe update in try/catch", () => {
  const src = read("src/app/api/billing/cancel/route.ts");
  assert.match(src, /try\s*{[\s\S]{0,400}stripe\.subscriptions\.update\s*\(/);
  assert.match(src, /No such subscription/);
});

test("TIM-2578: /api/billing/pause wraps both Stripe calls in try/catch", () => {
  const src = read("src/app/api/billing/pause/route.ts");
  // Two distinct try blocks: one around retrieve, one around update.
  const tryCount = (src.match(/try\s*{/g) ?? []).length;
  assert.ok(tryCount >= 2, `expected >=2 try blocks in pause route, found ${tryCount}`);
  assert.match(src, /stripe\.subscriptions\.retrieve/);
  assert.match(src, /stripe\.subscriptions\.update/);
});

test("TIM-2578: /api/billing/resume wraps both Stripe calls in try/catch", () => {
  const src = read("src/app/api/billing/resume/route.ts");
  const tryCount = (src.match(/try\s*{/g) ?? []).length;
  assert.ok(tryCount >= 2, `expected >=2 try blocks in resume route, found ${tryCount}`);
});

test("TIM-2578: billing page renders nothing_to_cancel banner", () => {
  const src = read("src/app/account/billing/page.tsx");
  assert.match(src, /readNothingToCancelParam/);
  assert.match(src, /nothing_to_cancel/);
  assert.match(src, /don(?:['’]|&apos;|&#39;)t have an active subscription to cancel/i);
});
