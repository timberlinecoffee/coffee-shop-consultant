// TIM-2838: server-side Pro-tier gate for POST /api/companion/benchmark.
// Mirrors the page gate at src/app/(app)/workspace/benchmarks/page.tsx so
// Starter users can't bypass it by POSTing directly to the API.

import { test } from "node:test";
import assert from "node:assert/strict";
import { effectivePlanForGating, isBetaWaived } from "../../../../lib/access.ts";

// Decision tree mirrors the route handler — keep these in sync.
function checkBenchmarkAccess(profile) {
  const betaWaived = isBetaWaived(profile.beta_waiver_until);
  const tier = effectivePlanForGating({
    subscription_status: profile.subscription_status,
    subscription_tier: profile.subscription_tier,
    paused_from_tier: profile.paused_from_tier,
    trial_ends_at: profile.trial_ends_at,
  });
  if (tier !== "pro" && !betaWaived) {
    return { status: 403, reason: "pro_required", tier_required: "pro" };
  }
  return { status: 200 };
}

test("Starter (active) → 403 pro_required (bug fix: was 200)", () => {
  const result = checkBenchmarkAccess({
    subscription_status: "active",
    subscription_tier: "starter",
  });
  assert.equal(result.status, 403);
  assert.equal(result.reason, "pro_required");
  assert.equal(result.tier_required, "pro");
});

test("Pro (active) → 200", () => {
  const result = checkBenchmarkAccess({
    subscription_status: "active",
    subscription_tier: "pro",
  });
  assert.equal(result.status, 200);
});

test("Free (active) → 403 pro_required", () => {
  const result = checkBenchmarkAccess({
    subscription_status: "active",
    subscription_tier: "free",
  });
  assert.equal(result.status, 403);
});

test("Trial-as-Pro (free_trial, future trial_ends_at) → 200", () => {
  const future = new Date(Date.now() + 86400_000).toISOString();
  const result = checkBenchmarkAccess({
    subscription_status: "free_trial",
    subscription_tier: "starter",
    trial_ends_at: future,
  });
  assert.equal(result.status, 200);
});

test("Trial expired (free_trial, past trial_ends_at, Starter underneath) → 403", () => {
  const past = new Date(Date.now() - 86400_000).toISOString();
  const result = checkBenchmarkAccess({
    subscription_status: "free_trial",
    subscription_tier: "starter",
    trial_ends_at: past,
  });
  assert.equal(result.status, 403);
});

test("Paused from Pro → 200 (paused_from_tier preserves Pro reads)", () => {
  const result = checkBenchmarkAccess({
    subscription_status: "paused",
    subscription_tier: "starter",
    paused_from_tier: "pro",
  });
  assert.equal(result.status, 200);
});

test("Paused from Starter → 403", () => {
  const result = checkBenchmarkAccess({
    subscription_status: "paused",
    subscription_tier: "starter",
    paused_from_tier: "starter",
  });
  assert.equal(result.status, 403);
});

test("Beta waiver active → 200 even for Starter", () => {
  const future = new Date(Date.now() + 86400_000).toISOString();
  const result = checkBenchmarkAccess({
    subscription_status: "active",
    subscription_tier: "starter",
    beta_waiver_until: future,
  });
  assert.equal(result.status, 200);
});

test("Beta waiver expired → 403 for Starter", () => {
  const past = new Date(Date.now() - 86400_000).toISOString();
  const result = checkBenchmarkAccess({
    subscription_status: "active",
    subscription_tier: "starter",
    beta_waiver_until: past,
  });
  assert.equal(result.status, 403);
});

test("Cancelled subscription on Pro → 200 (read access retained at Pro)", () => {
  // effectivePlanForGating returns the stored tier when status isn't paused/trial,
  // so a cancelled Pro still reads as Pro — matches the page gate.
  const result = checkBenchmarkAccess({
    subscription_status: "cancelled",
    subscription_tier: "pro",
  });
  assert.equal(result.status, 200);
});
