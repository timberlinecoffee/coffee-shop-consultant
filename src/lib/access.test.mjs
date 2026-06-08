// TIM-545 / TIM-701: paywall regression tests. These pin down the access
// policy contract. The /plan/[moduleNumber] route guard tests were retired
// in TIM-701 when that route was deleted; the policy unit tests remain.
// TIM-1902: Growth tier collapsed into Pro; trial unlocks Pro for everyone.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessModule,
  canAccessSection,
  isPaidTier,
  isSubscriptionActive,
  normalizeTier,
  effectiveTierForRead,
  effectivePlanForGating,
  hasWriteAccess,
  isTrialActive,
  FREE_PREVIEW_MODULE,
  FREE_PREVIEW_SECTION_KEYS,
} from "./access.ts";

// ── Policy unit tests ─────────────────────────────────────────────────────

test("free tier is not paid", () => {
  assert.equal(isPaidTier("free"), false);
  assert.equal(isPaidTier(null), false);
  assert.equal(isPaidTier(undefined), false);
  assert.equal(isPaidTier("free_trial"), false);
});

test("starter and pro are paid tiers", () => {
  assert.equal(isPaidTier("starter"), true);
  assert.equal(isPaidTier("pro"), true);
});

// TIM-1902: legacy 'growth' must no longer be recognized — it was collapsed into Pro.
test("legacy growth tier is no longer paid", () => {
  assert.equal(isPaidTier("growth"), false);
});

test("normalizeTier maps unknown values to free", () => {
  assert.equal(normalizeTier("free_trial"), "free");
  assert.equal(normalizeTier(null), "free");
  assert.equal(normalizeTier("starter"), "starter");
  assert.equal(normalizeTier("pro"), "pro");
  // Legacy names from pre-TIM-641 and TIM-1902 must no longer be recognized as paid.
  assert.equal(normalizeTier("builder"), "free");
  assert.equal(normalizeTier("accelerator"), "free");
  assert.equal(normalizeTier("growth"), "free");
});

test("free users can access the preview module only", () => {
  assert.equal(canAccessModule("free", FREE_PREVIEW_MODULE), true);
  for (const m of [2, 3, 4, 5, 6, 7, 8]) {
    assert.equal(
      canAccessModule("free", m),
      false,
      `Module ${m} must be paywalled for free users`
    );
  }
});

test("paid users can access every module", () => {
  for (const tier of ["starter", "pro"]) {
    for (let m = 1; m <= 8; m++) {
      assert.equal(canAccessModule(tier, m), true);
    }
  }
});

test("free users only see the preview section inside the preview module", () => {
  // The first section is the free preview.
  for (const key of FREE_PREVIEW_SECTION_KEYS) {
    assert.equal(canAccessSection("free", FREE_PREVIEW_MODULE, key), true);
  }
  // Every other Module 1 section is paywalled.
  for (const key of [
    "your_why",
    "target_customer",
    "competitive_analysis",
    "concept_brief",
  ]) {
    assert.equal(
      canAccessSection("free", FREE_PREVIEW_MODULE, key),
      false,
      `free users must not access Module 1 section ${key}`
    );
  }
  // No section in any other module is accessible to a free user.
  for (const key of ["startup_costs", "revenue_projections"]) {
    assert.equal(canAccessSection("free", 2, key), false);
  }
});

// TIM-1541: paused status is read-only (not active).
test("paused status is not active", () => {
  assert.equal(isSubscriptionActive("paused"), false);
  assert.equal(isSubscriptionActive("active"), true);
  assert.equal(isSubscriptionActive("free_trial"), false);
  assert.equal(isSubscriptionActive("cancelled"), false);
  assert.equal(isSubscriptionActive("expired"), false);
});

// TIM-1541: effectiveTierForRead — paused users use paused_from_tier.
test("effectiveTierForRead returns paused_from_tier when paused", () => {
  assert.equal(
    effectiveTierForRead({ subscription_status: "paused", subscription_tier: "free", paused_from_tier: "pro" }),
    "pro"
  );
});

test("effectiveTierForRead falls back to subscription_tier when paused_from_tier is null", () => {
  assert.equal(
    effectiveTierForRead({ subscription_status: "paused", subscription_tier: "pro", paused_from_tier: null }),
    "pro"
  );
});

test("effectiveTierForRead returns subscription_tier for active status", () => {
  assert.equal(
    effectiveTierForRead({ subscription_status: "active", subscription_tier: "starter", paused_from_tier: null }),
    "starter"
  );
});

test("effectiveTierForRead normalizes unknown tiers to free", () => {
  assert.equal(
    effectiveTierForRead({ subscription_status: "active", subscription_tier: null }),
    "free"
  );
});

// TIM-1902: a trial user with a future trial_ends_at always reads as Pro.
test("effectiveTierForRead returns 'pro' during an active trial regardless of chosen plan", () => {
  const future = new Date(Date.now() + 5 * 86400000).toISOString();
  assert.equal(
    effectiveTierForRead({ subscription_status: "free_trial", subscription_tier: "starter", trial_ends_at: future }),
    "pro"
  );
  assert.equal(
    effectiveTierForRead({ subscription_status: "free_trial", subscription_tier: "pro", trial_ends_at: future }),
    "pro"
  );
});

test("effectiveTierForRead returns the chosen tier after the trial window closes", () => {
  const past = new Date(Date.now() - 1000).toISOString();
  assert.equal(
    effectiveTierForRead({ subscription_status: "free_trial", subscription_tier: "starter", trial_ends_at: past }),
    "starter"
  );
});

// TIM-1902: hasWriteAccess — active OR card-on-file trial with a future trial_ends_at.
test("hasWriteAccess is true for active subscribers", () => {
  assert.equal(hasWriteAccess({ subscription_status: "active" }), true);
});

test("hasWriteAccess is true for trialists with a future trial_ends_at", () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  assert.equal(
    hasWriteAccess({ subscription_status: "free_trial", trial_ends_at: future }),
    true
  );
});

test("hasWriteAccess is false for trialists whose trial has expired", () => {
  const past = new Date(Date.now() - 1000).toISOString();
  assert.equal(
    hasWriteAccess({ subscription_status: "free_trial", trial_ends_at: past }),
    false
  );
});

test("hasWriteAccess is false for paused / cancelled / past_due", () => {
  for (const status of ["paused", "cancelled", "past_due", "expired"]) {
    assert.equal(hasWriteAccess({ subscription_status: status }), false, `status ${status}`);
  }
});

test("isTrialActive reflects whether the trial window is still open", () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();
  assert.equal(isTrialActive(future), true);
  assert.equal(isTrialActive(past), false);
  assert.equal(isTrialActive(null), false);
});

// TIM-1955: effectivePlanForGating wraps effectiveTierForRead and normalizes
// the result for strict === 'pro' comparisons in Pro-only route gates.
test("effectivePlanForGating returns 'pro' for active Pro subscribers", () => {
  assert.equal(
    effectivePlanForGating({ subscription_status: "active", subscription_tier: "pro" }),
    "pro"
  );
});

test("effectivePlanForGating returns 'starter' for active Starter subscribers", () => {
  assert.equal(
    effectivePlanForGating({ subscription_status: "active", subscription_tier: "starter" }),
    "starter"
  );
});

test("effectivePlanForGating returns 'pro' for trialists with a future trial_ends_at", () => {
  const future = new Date(Date.now() + 5 * 86400000).toISOString();
  assert.equal(
    effectivePlanForGating({
      subscription_status: "free_trial",
      subscription_tier: "starter",
      trial_ends_at: future,
    }),
    "pro"
  );
  assert.equal(
    effectivePlanForGating({
      subscription_status: "free_trial",
      subscription_tier: "pro",
      trial_ends_at: future,
    }),
    "pro"
  );
});

test("effectivePlanForGating honors paused_from_tier", () => {
  assert.equal(
    effectivePlanForGating({
      subscription_status: "paused",
      subscription_tier: "free",
      paused_from_tier: "pro",
    }),
    "pro"
  );
  assert.equal(
    effectivePlanForGating({
      subscription_status: "paused",
      subscription_tier: "free",
      paused_from_tier: "starter",
    }),
    "starter"
  );
});

test("effectivePlanForGating returns 'free' for unknown tiers and expired trials", () => {
  const past = new Date(Date.now() - 1000).toISOString();
  assert.equal(
    effectivePlanForGating({
      subscription_status: "free_trial",
      subscription_tier: "starter",
      trial_ends_at: past,
    }),
    "starter"
  );
  assert.equal(
    effectivePlanForGating({
      subscription_status: "active",
      subscription_tier: null,
    }),
    "free"
  );
});

test("paid users see every section", () => {
  for (const tier of ["starter", "pro"]) {
    for (const key of [
      "shop_type",
      "your_why",
      "concept_brief",
      "startup_costs",
      "financial_summary",
    ]) {
      assert.equal(canAccessSection(tier, 1, key), true);
      assert.equal(canAccessSection(tier, 2, key), true);
    }
  }
});
