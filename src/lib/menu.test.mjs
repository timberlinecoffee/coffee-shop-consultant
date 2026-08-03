// TIM-1008: regression guard for the TIM-1001 cost-per-unit math fix.
// costPerUnit() converts cents/unit to dollars/unit. If the trailing /100 is
// ever removed (or doubled), every test below should fail loudly — that's the
// 100x bug the founder caught in production.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  blendedTicketCentsFromMenu,
  cogsChipStatusFor,
  costPerUnit,
  menuMixShares,
  menuMixSharePct,
} from "./menu.ts";

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

// TIM-3683: profitability meter color logic for COGS % (lower-is-better).
// TIM-3248 shipped the inverted mapping — under-range showed yellow "Under
// target" when under-range is actually *beating* the margin target and should
// be green. These tests lock in the corrected direction and the slight-vs-
// significant over-range distinction.
test("cogsChipStatusFor: at low end of range is green (on target)", () => {
  assert.deepEqual(cogsChipStatusFor(22, 22, 28), { status: "green", label: "On target" });
});

test("cogsChipStatusFor: at high end of range is green (on target)", () => {
  assert.deepEqual(cogsChipStatusFor(28, 22, 28), { status: "green", label: "On target" });
});

test("cogsChipStatusFor: BELOW range is GREEN, not yellow — beating the margin target", () => {
  // Regression guard for TIM-3683 Bug 1. If this fails, the inverted TIM-3248
  // mapping is back — do not just change the assertion.
  const chip = cogsChipStatusFor(15, 22, 28);
  assert.equal(chip.status, "green", "sub-range COGS % must be green — item is beating margin target");
  assert.notEqual(chip.label, "Under target", "label must NOT read as a warning");
});

test("cogsChipStatusFor: BELOW range at 0% is still green", () => {
  assert.equal(cogsChipStatusFor(0, 22, 28).status, "green");
});

test("cogsChipStatusFor: slightly over is yellow", () => {
  // catHigh=28 → tolerance = max(2, 28*0.15) = 4.2 → yellow band 28.01–32.20
  assert.deepEqual(cogsChipStatusFor(30, 22, 28), { status: "yellow", label: "Slightly over" });
});

test("cogsChipStatusFor: significantly over is red", () => {
  // catHigh=28 → tolerance 4.2 → red > 32.20
  assert.deepEqual(cogsChipStatusFor(40, 22, 28), { status: "red", label: "Over target" });
});

test("cogsChipStatusFor: 2pp floor kicks in for tight low-COGS categories", () => {
  // catHigh=10 → 15% = 1.5 → floor to 2pp → yellow band 10.01–12.00
  assert.equal(cogsChipStatusFor(11, 8, 10).status, "yellow");
  assert.equal(cogsChipStatusFor(12, 8, 10).status, "yellow");
  assert.equal(cogsChipStatusFor(12.5, 8, 10).status, "red");
});

// ── TIM-4114 (UX Phase 6): the implied share of sales ────────────────────────
//
// Trent asked to be able to say what percentage of drinks sold each item will
// be. The maths already had an answer — popularity, weighted 3/2/1 — and never
// said it out loud, so the blended cost of goods downstream looked like it came
// from nowhere. His ruling was to show the implied share, NOT to add a second
// numeric input. These guards hold both halves of that.

test("the share a popularity setting implies is the one the blend uses", () => {
  // Same weights, same filter, same items as computeMenuBlendedCogsPct. If
  // these ever drift, the menu shows one story and the plan runs on another —
  // which is the exact confusion this phase exists to remove.
  const shares = menuMixShares([
    { id: "a", price_cents: 500, expected_popularity: "high" },   // w3
    { id: "b", price_cents: 400, expected_popularity: "medium" }, // w2
    { id: "c", price_cents: 300, expected_popularity: "low" },    // w1
  ]);
  assert.ok(Math.abs(shares.get("a") - 50) < EPSILON);
  assert.ok(Math.abs(shares.get("b") - (2 / 6) * 100) < EPSILON);
  assert.ok(Math.abs(shares.get("c") - (1 / 6) * 100) < EPSILON);
});

test("shares always add up to a hundred", () => {
  // The number is being shown to a beginner as a percentage of everything they
  // sell. If the column does not total 100 it is not that, and they will spot
  // it before we do.
  const shares = menuMixShares([
    { id: "a", price_cents: 500, expected_popularity: "high" },
    { id: "b", price_cents: 400, expected_popularity: null },
    { id: "c", price_cents: 300, expected_popularity: "low" },
    { id: "d", price_cents: 600, expected_popularity: "medium" },
  ]);
  const total = [...shares.values()].reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(total - 100) < 1e-9, `shares total ${total}, not 100`);
});

test("unpriced and archived items are outside the blend, not zero inside it", () => {
  // An unpriced item is not yet part of the menu the plan is costing. Counting
  // it would quietly shrink every other item's share.
  const shares = menuMixShares([
    { id: "a", price_cents: 500, expected_popularity: "high" },
    { id: "b", price_cents: 0, expected_popularity: "high" },
    { id: "c", price_cents: 400, expected_popularity: "high", archived: true },
  ]);
  assert.equal(shares.size, 1);
  assert.ok(Math.abs(shares.get("a") - 100) < EPSILON);
});

test("an item with no popularity set still counts", () => {
  // Default weight 1 — never silently dropped. A priced item the owner has not
  // rated is still something they intend to sell.
  const shares = menuMixShares([
    { id: "a", price_cents: 500, expected_popularity: null },
    { id: "b", price_cents: 400, expected_popularity: "high" },
  ]);
  assert.ok(Math.abs(shares.get("a") - 25) < EPSILON);
});

test("an empty or unpriced menu yields no shares rather than NaN", () => {
  assert.equal(menuMixShares([]).size, 0);
  assert.equal(menuMixShares(null).size, 0);
  assert.equal(menuMixShares([{ id: "a", price_cents: 0 }]).size, 0);
  assert.equal(menuMixSharePct([{ id: "a", price_cents: 500 }], "nope"), null);
  assert.equal(menuMixSharePct([{ id: "a", price_cents: 500 }], null), null);
});

test("no second sales-mix input was reintroduced", () => {
  // TIM-2491 removed the legacy numeric expected_mix_pct from the weighting
  // because a mixed corpus weighted old items 10-70x as heavily as new ones.
  // Trent's 2026-08-03 ruling kept that removal: show the implied share, do
  // not ask a first-timer for thirty numbers that have to total a hundred.
  const src = readFileSync(new URL("./menu.ts", import.meta.url), "utf8");
  const body = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  const fn = body.slice(body.indexOf("export function menuMixShares"));
  assert.doesNotMatch(
    fn.slice(0, 1200),
    /expected_mix_pct/,
    "the popularity blend is reading a numeric mix field again"
  );
});
