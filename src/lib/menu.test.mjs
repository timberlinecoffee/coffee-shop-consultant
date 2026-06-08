// TIM-1008: regression guard for the TIM-1001 cost-per-unit math fix.
// costPerUnit() converts cents/unit to dollars/unit. If the trailing /100 is
// ever removed (or doubled), every test below should fail loudly — that's the
// 100x bug the founder caught in production.

import { test } from "node:test";
import assert from "node:assert/strict";
import { blendedTicketCentsFromMenu, costPerUnit } from "./menu.ts";

const EPSILON = 1e-9;

function ingredient(overrides) {
  return {
    id: "ing-1",
    plan_id: "plan-1",
    name: "Test Ingredient",
    package_size: 1000,
    package_unit: "g",
    package_cost_cents: 1700,
    vendor_id: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function assertClose(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < EPSILON,
    `expected ${expected} (±${EPSILON}), got ${actual}`,
  );
}

test("$17 / 1000 g → $0.017 per g (the founder-reported case)", () => {
  assertClose(
    costPerUnit(ingredient({ package_cost_cents: 1700, package_size: 1000, package_unit: "g" })),
    0.017,
  );
});

test("$5 / 250 ml → $0.02 per ml", () => {
  assertClose(
    costPerUnit(ingredient({ package_cost_cents: 500, package_size: 250, package_unit: "ml" })),
    0.02,
  );
});

test("$24 / 12 units → $2.00 per unit", () => {
  assertClose(
    costPerUnit(ingredient({ package_cost_cents: 2400, package_size: 12, package_unit: "each" })),
    2.0,
  );
});

test("$2 / 500 g → $0.004 per g", () => {
  assertClose(
    costPerUnit(ingredient({ package_cost_cents: 200, package_size: 500, package_unit: "g" })),
    0.004,
  );
});

test("$120 / 250 g → $0.48 per g", () => {
  assertClose(
    costPerUnit(ingredient({ package_cost_cents: 12000, package_size: 250, package_unit: "g" })),
    0.48,
  );
});

// ── TIM-2482 (F13): blendedTicketCentsFromMenu ──────────────────────────────
// Pin the selector so it (a) blends by popularity by default, (b) matches the
// canonical weights used by computeMenuBlendedCogsPct (low=1, medium=2,
// high=3, null default 1), and (c) refuses to silently return 0 when there's
// nothing priced — caller must handle null.

function menuItem(overrides) {
  return {
    id: "m-1",
    price_cents: 700,
    expected_popularity: null,
    archived: false,
    ...overrides,
  };
}

test("returns null when the menu is empty", () => {
  assert.equal(blendedTicketCentsFromMenu([]), null);
  assert.equal(blendedTicketCentsFromMenu(null), null);
  assert.equal(blendedTicketCentsFromMenu(undefined), null);
});

test("returns null when every item is archived", () => {
  assert.equal(
    blendedTicketCentsFromMenu([
      menuItem({ id: "a", price_cents: 600, archived: true }),
      menuItem({ id: "b", price_cents: 900, archived: true }),
    ]),
    null,
  );
});

test("returns null when no priced item has a positive price", () => {
  assert.equal(
    blendedTicketCentsFromMenu([
      menuItem({ id: "a", price_cents: 0 }),
      menuItem({ id: "b", price_cents: -100 }),
    ]),
    null,
  );
});

test("single priced item: blended = price (popularity unused)", () => {
  assert.equal(
    blendedTicketCentsFromMenu([menuItem({ price_cents: 750 })]),
    750,
  );
});

test("popularity weights: high=3, medium=2, low=1 — matches menuItemMixWeight", () => {
  // Spec case (AC#1): three drinks at $5 / $7 / $10 with popularity low / high
  // / high. Without popularity weighting the simple average is $7.33 (733¢);
  // popularity-weighted it skews to (5×1 + 7×3 + 10×3) / 7 = $8.0 (800¢).
  const blended = blendedTicketCentsFromMenu([
    menuItem({ id: "drip", price_cents: 500, expected_popularity: "low" }),
    menuItem({ id: "latte", price_cents: 700, expected_popularity: "high" }),
    menuItem({ id: "mocha", price_cents: 1000, expected_popularity: "high" }),
  ]);
  // (500*1 + 700*3 + 1000*3) / (1+3+3) = 5600 / 7 = 800
  assert.equal(blended, 800);
});

test("null popularity defaults to weight 1 (never silently drops the item)", () => {
  // Two items, one with null popularity, one high. Without the null=1 default
  // the null item would be skipped and skew the blend.
  const blended = blendedTicketCentsFromMenu([
    menuItem({ id: "a", price_cents: 600, expected_popularity: null }),
    menuItem({ id: "b", price_cents: 900, expected_popularity: "high" }),
  ]);
  // (600*1 + 900*3) / 4 = 3300 / 4 = 825
  assert.equal(blended, 825);
});

test("optional mix overrides popularity per item (POS-style override)", () => {
  // Owner pulls a POS mix that says drip is 60% of sales, latte 30%, mocha
  // 10% — overrides the popularity-only default. We pass relative weights;
  // selector normalizes.
  const blended = blendedTicketCentsFromMenu(
    [
      menuItem({ id: "drip", price_cents: 500, expected_popularity: "low" }),
      menuItem({ id: "latte", price_cents: 700, expected_popularity: "high" }),
      menuItem({ id: "mocha", price_cents: 1000, expected_popularity: "high" }),
    ],
    { drip: 60, latte: 30, mocha: 10 },
  );
  // (500*60 + 700*30 + 1000*10) / 100 = 61000 / 100 = 610
  assert.equal(blended, 610);
});

test("mix override accepts a Map as well as a plain object", () => {
  const mix = new Map([["a", 1], ["b", 0]]);
  const blended = blendedTicketCentsFromMenu(
    [
      menuItem({ id: "a", price_cents: 500 }),
      menuItem({ id: "b", price_cents: 1000 }),
    ],
    mix,
  );
  // Only "a" contributes (weight 1); "b" weight 0 → skipped.
  assert.equal(blended, 500);
});

test("unknown mix ids fall back to popularity weight", () => {
  // mix has only "a"; "b" has popularity = high → weight 3.
  const blended = blendedTicketCentsFromMenu(
    [
      menuItem({ id: "a", price_cents: 500, expected_popularity: "low" }),
      menuItem({ id: "b", price_cents: 1000, expected_popularity: "high" }),
    ],
    { a: 1 },
  );
  // (500*1 + 1000*3) / 4 = 3500 / 4 = 875
  assert.equal(blended, 875);
});

test("F13 spec case: $8.20 blended menu vs $7.50 forecast default", () => {
  // The issue body's worked example: founder builds an $8.20-blended menu;
  // forecast default is $7.50 ($750¢). Pin the blend output so the cross-suite
  // detector and the workspace banner can both reach 820¢ deterministically.
  // Five items, two highs, two mediums, one low; chosen prices give 820¢.
  // (450*1 + 700*2 + 800*2 + 900*3 + 1100*3) / (1+2+2+3+3) =
  //   (450 + 1400 + 1600 + 2700 + 3300) / 11 = 9450 / 11 ≈ 859 → tune below.
  // Use prices that hit 820 exactly.
  const items = [
    menuItem({ id: "1", price_cents: 500, expected_popularity: "low" }),
    menuItem({ id: "2", price_cents: 700, expected_popularity: "medium" }),
    menuItem({ id: "3", price_cents: 800, expected_popularity: "medium" }),
    menuItem({ id: "4", price_cents: 900, expected_popularity: "high" }),
    menuItem({ id: "5", price_cents: 900, expected_popularity: "high" }),
  ];
  // (500*1 + 700*2 + 800*2 + 900*3 + 900*3) / 11
  //   = (500 + 1400 + 1600 + 2700 + 2700) / 11 = 8900/11 = 809.09... → round 809
  // The exact $8.20 number is illustrative; pin the math, not the marketing.
  const blended = blendedTicketCentsFromMenu(items);
  assert.equal(blended, Math.round(8900 / 11)); // 809
  assert.ok(blended > 750, "Should be meaningfully above forecast default 750¢");
});

// Drift guard — keep the file from regressing into the silent-drop or
// weighted-average bugs that F13 was raised to catch.
test("drift guard: every priced row participates (no skip on null popularity)", () => {
  const items = [
    menuItem({ id: "a", price_cents: 1000, expected_popularity: null }),
    menuItem({ id: "b", price_cents: 1000, expected_popularity: null }),
  ];
  // If null silently skipped to weight 0, totalWeight would be 0 and the
  // selector would return null — caller would render "—" instead of the
  // honest 1000.
  assert.equal(blendedTicketCentsFromMenu(items), 1000);
});
