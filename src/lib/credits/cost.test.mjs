// TIM-1671: credit cost model contract. These cases pin the launch-default
// pricing so a constant change is a deliberate, reviewed act — not a silent
// drift that re-prices every customer. Update the expected numbers here in the
// same PR that changes src/lib/credits/cost.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCreditCost, describeCreditCharge } from "./cost.ts";

test("a short default-model reply costs the 1-credit floor", () => {
  // ~400 output tokens, no tools/searches → 0.57 credits → floors to 1.
  assert.equal(computeCreditCost({ modelTier: "default", outputTokens: 400 }).credits, 1);
});

test("a turn that produced nothing still costs the minimum", () => {
  assert.equal(computeCreditCost({ modelTier: "default", outputTokens: 0 }).credits, 1);
});

test("a long default-model reply scales above 1 credit", () => {
  // 1400 tokens / 700 = 2.0 → 2 credits.
  assert.equal(computeCreditCost({ modelTier: "default", outputTokens: 1400 }).credits, 2);
});

test("the complex model costs ~2x the default for the same output", () => {
  const out = 1400;
  const cheap = computeCreditCost({ modelTier: "default", outputTokens: out }).credits; // 2
  const dear = computeCreditCost({ modelTier: "complex", outputTokens: out }).credits; // 1400/350 = 4
  assert.equal(cheap, 2);
  assert.equal(dear, 4);
});

test("web searches add one credit each", () => {
  // 2000 sonnet tokens (5.71) + 6 searches = 11.71 → 12 credits.
  const b = computeCreditCost({ modelTier: "complex", outputTokens: 2000, webSearchRequests: 6 });
  assert.equal(b.credits, 12);
  assert.equal(b.searchCredits, 6);
});

test("tool calls add one credit each", () => {
  // 400 default tokens (0.57) + 1 tool call = 1.57 → 2 credits.
  assert.equal(
    computeCreditCost({ modelTier: "default", outputTokens: 400, toolCalls: 1 }).credits,
    2,
  );
});

test("negative / missing inputs are clamped, never negative credits", () => {
  assert.equal(
    computeCreditCost({ modelTier: "default", outputTokens: -50, webSearchRequests: -3 }).credits,
    1,
  );
});

test("describeCreditCharge summarizes the breakdown for the ledger", () => {
  const b = computeCreditCost({ modelTier: "complex", outputTokens: 2000, webSearchRequests: 6 });
  assert.equal(describeCreditCharge("marketing", b, 6, 0), "Scout: marketing — 12 credits (gen + 6 searches)");
  const simple = computeCreditCost({ modelTier: "default", outputTokens: 300 });
  assert.equal(describeCreditCharge("general", simple, 0, 0), "Scout: general — 1 credit (gen)");
});
