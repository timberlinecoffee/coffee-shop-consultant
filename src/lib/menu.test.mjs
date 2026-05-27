// TIM-1008: regression guard for the TIM-1001 cost-per-unit math fix.
// costPerUnit() converts cents/unit to dollars/unit. If the trailing /100 is
// ever removed (or doubled), every test below should fail loudly — that's the
// 100x bug the founder caught in production.

import { test } from "node:test";
import assert from "node:assert/strict";
import { costPerUnit } from "./menu.ts";

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
