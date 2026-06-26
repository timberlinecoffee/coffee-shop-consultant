// TIM-3245: unit tests for the per-category COGS target resolver.
// One fixture per TIM-3243 preset category + null fallback path.

import { test } from "node:test"
import assert from "node:assert/strict"
import { resolveCogsFraction, computeMarginFloorCents, DEFAULT_COGS_FRACTION } from "./cogs-target.ts"

// --- resolveCogsFraction ---

test("beverages (15–20): midpoint 17.5% → fraction 0.175", () => {
  assert.equal(resolveCogsFraction(15, 20), 0.175)
})

test("food pastries (20–25): midpoint 22.5% → fraction 0.225", () => {
  assert.equal(resolveCogsFraction(20, 25), 0.225)
})

test("coffee beans retail (30–40): midpoint 35% → fraction 0.35", () => {
  assert.equal(resolveCogsFraction(30, 40), 0.35)
})

test("large food (30–40): midpoint 35% → fraction 0.35", () => {
  assert.equal(resolveCogsFraction(30, 40), 0.35)
})

test("retail items merch (40–50): midpoint 45% → fraction 0.45", () => {
  assert.equal(resolveCogsFraction(40, 50), 0.45)
})

test("null low falls back to default 25%", () => {
  assert.equal(resolveCogsFraction(null, 20), DEFAULT_COGS_FRACTION)
})

test("null high falls back to default 25%", () => {
  assert.equal(resolveCogsFraction(15, null), DEFAULT_COGS_FRACTION)
})

test("both null falls back to default 25%", () => {
  assert.equal(resolveCogsFraction(null, null), DEFAULT_COGS_FRACTION)
})

test("undefined both falls back to default 25%", () => {
  assert.equal(resolveCogsFraction(undefined, undefined), DEFAULT_COGS_FRACTION)
})

test("zero midpoint (0,0) falls back to default", () => {
  assert.equal(resolveCogsFraction(0, 0), DEFAULT_COGS_FRACTION)
})

// --- computeMarginFloorCents ---

test("beverages: $1.50 COGS at 17.5% → floor $8.58 (858 cents)", () => {
  // ceil(150 / 0.175) = ceil(857.14) = 858
  assert.equal(computeMarginFloorCents(150, resolveCogsFraction(15, 20)), 858)
})

test("food pastries: $2.00 COGS at 22.5% → floor $8.89 (889 cents)", () => {
  // ceil(200 / 0.225) = ceil(888.89) = 889
  assert.equal(computeMarginFloorCents(200, resolveCogsFraction(20, 25)), 889)
})

test("coffee beans retail: $12.00 COGS at 35% → floor $34.29 (3429 cents)", () => {
  // ceil(1200 / 0.35) = ceil(3428.57) = 3429
  assert.equal(computeMarginFloorCents(1200, resolveCogsFraction(30, 40)), 3429)
})

test("large food: $5.00 COGS at 35% → floor $14.29 (1429 cents)", () => {
  // ceil(500 / 0.35) = ceil(1428.57) = 1429
  assert.equal(computeMarginFloorCents(500, resolveCogsFraction(30, 40)), 1429)
})

test("retail items merch: $8.00 COGS at 45% → floor $17.78 (1778 cents)", () => {
  // ceil(800 / 0.45) = ceil(1777.78) = 1778
  assert.equal(computeMarginFloorCents(800, resolveCogsFraction(40, 50)), 1778)
})

test("fallback (null/null): $2.50 COGS at 25% → floor $10.00 (1000 cents)", () => {
  // ceil(250 / 0.25) = 1000 — matches pre-TIM-3245 behaviour
  assert.equal(computeMarginFloorCents(250, resolveCogsFraction(null, null)), 1000)
})
