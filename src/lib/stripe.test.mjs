// TIM-1500: regression. The plan-upgrade chain only works if every paid tier
// resolves to a non-zero monthly credit allocation. A prior bug shipped
// `MONTHLY_CREDITS.pro = 0`, which made pro upgrades grant 0 credits and
// looked like the webhook was broken.
// TIM-1902: collapsed to two paid tiers (Starter / Pro) plus a 7-day trial.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MONTHLY_CREDITS,
  tierFromPriceId,
  PLANS,
  TRIAL_CREDITS,
  TRIAL_PERIOD_DAYS,
} from "./stripe.ts";

test("every paid tier has a non-zero monthly credit cap", () => {
  for (const tier of ["starter", "pro"]) {
    assert.ok(
      MONTHLY_CREDITS[tier] > 0,
      `MONTHLY_CREDITS.${tier} must be > 0, got ${MONTHLY_CREDITS[tier]}`,
    );
  }
  assert.equal(MONTHLY_CREDITS.free, 0);
});

// TIM-1954 (TIM-1944 plan rev 2 Decision 1): grants equalized — both Starter
// and Pro get 100/mo. Pro's differentiation lives in features, not in a credit
// ceiling. Trial grant (TRIAL_CREDITS=75) is unchanged.
test("monthly credit grants match the TIM-1954 equalization", () => {
  assert.equal(MONTHLY_CREDITS.starter, 100);
  assert.equal(MONTHLY_CREDITS.pro, 100);
});

test("tierFromPriceId returns free for unknown price IDs (safe fallback)", () => {
  assert.equal(tierFromPriceId(""), "free");
  assert.equal(tierFromPriceId("price_does_not_exist"), "free");
});

test("PLANS keys exist for every tier x interval combination", () => {
  for (const tier of ["starter", "pro"]) {
    for (const interval of ["monthly", "annual"]) {
      const key = `${tier}_${interval}`;
      assert.ok(key in PLANS, `missing plan key ${key}`);
      assert.equal(PLANS[key].tier, tier);
      assert.equal(PLANS[key].interval, interval);
    }
  }
});

// TIM-1902: Growth was retired — its keys must no longer be configured.
test("legacy growth plan keys are removed from PLANS", () => {
  assert.equal("growth_monthly" in PLANS, false);
  assert.equal("growth_annual" in PLANS, false);
});

// TIM-1902: trial constants. Stripe-owned timer + one-time 75-credit grant.
test("TRIAL_PERIOD_DAYS is 7 and TRIAL_CREDITS is 75", () => {
  assert.equal(TRIAL_PERIOD_DAYS, 7);
  assert.equal(TRIAL_CREDITS, 75);
});
