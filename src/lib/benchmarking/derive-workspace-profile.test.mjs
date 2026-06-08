// TIM-2449: workspace profile derivation tests.
//
// Covers the axis derivers individually (model from shop_type, sqft bucketing,
// AUV tier from Y1 revenue, concept text matching) so a regression in one
// surface doesn't silently re-bucket every user.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveAuvTier,
  deriveConcept,
  deriveModel,
  deriveSqftBucket,
} from "./derive-workspace-profile.ts";

test("deriveModel prefers structured shop_type Drive-through", () => {
  assert.equal(
    deriveModel({
      planState: {},
      conceptContent: null,
      onboardingData: { shop_type: ["Full cafe with food", "Drive-through"] },
      menuRows: [],
    }),
    "drive_thru",
  );
});

test("deriveModel falls back to concept text for cafe", () => {
  assert.equal(
    deriveModel({
      planState: {},
      conceptContent: { components: { offering: { content: "small neighborhood cafe with food" } } },
      onboardingData: null,
      menuRows: [],
    }),
    "cafe",
  );
});

test("deriveModel returns null on empty inputs", () => {
  assert.equal(
    deriveModel({ planState: {}, conceptContent: null, onboardingData: null, menuRows: [] }),
    null,
  );
});

test("deriveSqftBucket boundaries", () => {
  assert.equal(deriveSqftBucket(null), null);
  assert.equal(deriveSqftBucket(0), null);
  assert.equal(deriveSqftBucket(499), "lt_500");
  assert.equal(deriveSqftBucket(500), "500_1500");
  assert.equal(deriveSqftBucket(1499), "500_1500");
  assert.equal(deriveSqftBucket(1500), "1500_3000");
  assert.equal(deriveSqftBucket(2999), "1500_3000");
  assert.equal(deriveSqftBucket(3000), "gt_3000");
  assert.equal(deriveSqftBucket(10000), "gt_3000");
});

test("deriveAuvTier from Y1 revenue cents", () => {
  assert.equal(deriveAuvTier(0), null);
  assert.equal(deriveAuvTier(200_000 * 100), "low");
  assert.equal(deriveAuvTier(500_000 * 100), "mid");
  assert.equal(deriveAuvTier(900_000 * 100), "high");
  assert.equal(deriveAuvTier(1_500_000 * 100), "top_decile");
});

test("deriveConcept matches keywords", () => {
  assert.equal(deriveConcept({ a: "third wave specialty roaster" }), "third_wave_specialty");
  assert.equal(deriveConcept({ a: "grab and go drive thru" }), "grab_and_go");
  assert.equal(deriveConcept({ a: "neighborhood cafe with bakery food program" }), "cafe_food_program");
  assert.equal(deriveConcept({ a: "warm neighborhood cafe" }), "neighborhood_cafe");
  assert.equal(deriveConcept(null), null);
  assert.equal(deriveConcept({}), null);
});
