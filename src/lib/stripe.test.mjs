// TIM-1500: regression. The plan-upgrade chain only works if every paid tier
// resolves to a non-zero monthly credit allocation. A prior bug shipped
// `MONTHLY_CREDITS.pro = 0`, which made pro upgrades grant 0 credits and
// looked like the webhook was broken.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MONTHLY_CREDITS, tierFromPriceId, PLANS } from "./stripe.ts";

test("every paid tier has a non-zero monthly credit cap", () => {
  for (const tier of ["starter", "growth", "pro"]) {
    assert.ok(
      MONTHLY_CREDITS[tier] > 0,
      `MONTHLY_CREDITS.${tier} must be > 0, got ${MONTHLY_CREDITS[tier]}`,
    );
  }
  assert.equal(MONTHLY_CREDITS.free, 0);
});

test("tierFromPriceId returns free for unknown price IDs (safe fallback)", () => {
  assert.equal(tierFromPriceId(""), "free");
  assert.equal(tierFromPriceId("price_does_not_exist"), "free");
});

test("PLANS keys exist for every tier x interval combination", () => {
  for (const tier of ["starter", "growth", "pro"]) {
    for (const interval of ["monthly", "annual"]) {
      const key = `${tier}_${interval}`;
      assert.ok(key in PLANS, `missing plan key ${key}`);
      assert.equal(PLANS[key].tier, tier);
      assert.equal(PLANS[key].interval, interval);
    }
  }
});
