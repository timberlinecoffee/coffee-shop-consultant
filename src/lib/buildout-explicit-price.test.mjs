// TIM-1797: pinning tests for the explicit-price round-trip guard.
//
// CRITICAL data-integrity contract: when an owner states an exact price for an
// equipment item in a free-text description, that price must survive the AI
// generation step unchanged (description -> generation -> preview -> applied).
// The original bug: "espresso machine at $24,000" was written as $9,000 because
// the model substituted its own "realistic market price" estimate.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDollarAmountToCents,
  extractPricedClauses,
  applyExplicitPrices,
} from "./buildout-explicit-price.ts";

test("parseDollarAmountToCents handles the common formats", () => {
  assert.equal(parseDollarAmountToCents("$24,000"), 2_400_000);
  assert.equal(parseDollarAmountToCents("$24k"), 2_400_000);
  assert.equal(parseDollarAmountToCents("$24K"), 2_400_000);
  assert.equal(parseDollarAmountToCents("$1,250.50"), 125_050);
  assert.equal(parseDollarAmountToCents("9000"), 900_000);
  assert.equal(parseDollarAmountToCents("24,000 dollars"), 2_400_000);
  assert.equal(parseDollarAmountToCents("not a price"), null);
});

test("extractPricedClauses pulls $-amounts but ignores bare quantities", () => {
  const clauses = extractPricedClauses(
    "two EK43 grinders and one espresso machine at $24,000",
  );
  // "two EK43" is a quantity, not a price — only the $24,000 clause counts.
  assert.equal(clauses.length, 1);
  assert.equal(clauses[0].cents, 2_400_000);
  assert.match(clauses[0].text, /espresso machine/);
});

test("THE BUG: explicit $24,000 espresso machine round-trips, not $9,000", () => {
  const description = "Add an espresso machine at $24,000.";
  // Model returned its own "realistic" estimate of $9,000.
  const rows = [{ name: "Espresso Machine", unit_cost_cents: 900_000 }];
  const out = applyExplicitPrices(description, rows);
  assert.equal(out[0].unit_cost_cents, 2_400_000, "must write exactly $24,000");
});

test("price stated before the item name also binds", () => {
  const rows = [{ name: "Espresso Machine", unit_cost_cents: 900_000 }];
  const out = applyExplicitPrices("$24k espresso machine for the bar", rows);
  assert.equal(out[0].unit_cost_cents, 2_400_000);
});

test("items with no stated price keep the model estimate", () => {
  const description = "An espresso machine at $24,000 and a knock box.";
  const rows = [
    { name: "Espresso Machine", unit_cost_cents: 900_000 },
    { name: "Knock Box", unit_cost_cents: 4_500 },
  ];
  const out = applyExplicitPrices(description, rows);
  assert.equal(out[0].unit_cost_cents, 2_400_000);
  assert.equal(out[1].unit_cost_cents, 4_500, "untouched — no stated price");
});

test("a stated price binds only to the matching item, not siblings", () => {
  // Two items in one description, each with its own price.
  const description = "Espresso machine at $24,000, EK43 grinder at $3,000.";
  const rows = [
    { name: "Espresso Machine", unit_cost_cents: 900_000 },
    { name: "EK43 Grinder", unit_cost_cents: 250_000 },
  ];
  const out = applyExplicitPrices(description, rows);
  assert.equal(out[0].unit_cost_cents, 2_400_000);
  assert.equal(out[1].unit_cost_cents, 300_000);
});

test("no explicit prices anywhere leaves all rows untouched", () => {
  const rows = [{ name: "Espresso Machine", unit_cost_cents: 900_000 }];
  const out = applyExplicitPrices("A two-group espresso machine.", rows);
  assert.equal(out[0].unit_cost_cents, 900_000);
});

test("decimal prices round-trip exactly", () => {
  const rows = [{ name: "Milk Pitcher", unit_cost_cents: 1_200 }];
  const out = applyExplicitPrices("A milk pitcher at $18.50", rows);
  assert.equal(out[0].unit_cost_cents, 1_850);
});
