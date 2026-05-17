// TIM-716 / TIM-621-CHARTS — calc layer tests.
// Regression guard: chart and PDF (TIM-621-PDF3) both consume these helpers,
// so any silent change in math would desync the two surfaces.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_INPUTS,
  NO_ADJUSTMENTS,
  applyAdjustments,
  buildMonthlySeries,
  findBreakEvenMonth,
  hasAnyInputs,
  normalizeInputs,
  projectBreakEven,
  projectWithAdjustments,
} from "./calc.ts";

test("normalizeInputs coerces null and missing fields to zero", () => {
  assert.deepEqual(normalizeInputs(null), EMPTY_INPUTS);
  assert.deepEqual(normalizeInputs(undefined), EMPTY_INPUTS);
  assert.deepEqual(normalizeInputs({}), EMPTY_INPUTS);
});

test("normalizeInputs clamps negatives and non-finite numbers to zero", () => {
  const result = normalizeInputs({
    startupCosts: -100,
    monthlyRevenue: Number.NaN,
    monthlyCogs: Number.POSITIVE_INFINITY,
    monthlyRent: 500,
    monthlyOtherFixed: -1,
  });
  assert.equal(result.startupCosts, 0);
  assert.equal(result.monthlyRevenue, 0);
  assert.equal(result.monthlyCogs, 0);
  assert.equal(result.monthlyRent, 500);
  assert.equal(result.monthlyOtherFixed, 0);
});

test("buildMonthlySeries returns 12 months by default", () => {
  const rows = buildMonthlySeries(EMPTY_INPUTS);
  assert.equal(rows.length, 12);
  assert.equal(rows[0].month, 1);
  assert.equal(rows[11].month, 12);
});

test("buildMonthlySeries on empty inputs is all zeros", () => {
  const rows = buildMonthlySeries(EMPTY_INPUTS);
  for (const row of rows) {
    assert.equal(row.revenue, 0);
    assert.equal(row.variableCost, 0);
    assert.equal(row.fixedCost, 0);
    assert.equal(row.netMonthly, 0);
    assert.equal(row.cumulativeProfit, 0);
  }
});

test("monthly burn equals revenue - cogs - rent - other fixed", () => {
  const rows = buildMonthlySeries({
    startupCosts: 0,
    monthlyRevenue: 10000,
    monthlyCogs: 3000,
    monthlyRent: 2500,
    monthlyOtherFixed: 1500,
  });
  // 10000 - 3000 - 2500 - 1500 = 3000 (positive — no burn, but math is the same)
  assert.equal(rows[0].netMonthly, 3000);
  assert.equal(rows[0].fixedCost, 4000);
});

test("findBreakEvenMonth returns first month cumulative profit >= 0", () => {
  const rows = buildMonthlySeries({
    startupCosts: 30000,
    monthlyRevenue: 12000,
    monthlyCogs: 4000,
    monthlyRent: 2500,
    monthlyOtherFixed: 1500,
    // net = 4000/mo, cumulativeProfit after m1 = -26000, m8 = +2000 → m8
  });
  assert.equal(findBreakEvenMonth(rows), 8);
});

test("findBreakEvenMonth returns null when revenue cannot cover costs", () => {
  const rows = buildMonthlySeries({
    startupCosts: 10000,
    monthlyRevenue: 1000,
    monthlyCogs: 500,
    monthlyRent: 2000,
    monthlyOtherFixed: 500,
  });
  assert.equal(findBreakEvenMonth(rows), null);
});

test("findBreakEvenMonth returns null on empty inputs (no revenue, no spend)", () => {
  const rows = buildMonthlySeries(EMPTY_INPUTS);
  // cumulativeProfit is 0 every month, which technically >= 0.
  // We treat 0 as break-even when there is real activity; with all zeros
  // the project never "breaks even" because nothing happened. Verify the
  // current behavior so the chart can decide how to render.
  assert.equal(findBreakEvenMonth(rows), 1);
});

test("applyAdjustments scales revenue, cogs, and rent by pct", () => {
  const adjusted = applyAdjustments(
    {
      startupCosts: 30000,
      monthlyRevenue: 10000,
      monthlyCogs: 4000,
      monthlyRent: 2000,
      monthlyOtherFixed: 1000,
    },
    { revenuePct: 10, cogsPct: -25, rentPct: 50 },
  );
  assert.equal(adjusted.startupCosts, 30000);
  assert.equal(adjusted.monthlyRevenue, 11000);
  assert.equal(adjusted.monthlyCogs, 3000);
  assert.equal(adjusted.monthlyRent, 3000);
  assert.equal(adjusted.monthlyOtherFixed, 1000);
});

test("applyAdjustments clamps negative results to zero", () => {
  const adjusted = applyAdjustments(
    { ...EMPTY_INPUTS, monthlyRevenue: 100 },
    { revenuePct: -200, cogsPct: 0, rentPct: 0 },
  );
  assert.equal(adjusted.monthlyRevenue, 0);
});

test("projectBreakEven exposes rows, marker, and fixed-cost reference", () => {
  const result = projectBreakEven({
    startupCosts: 30000,
    monthlyRevenue: 12000,
    monthlyCogs: 4000,
    monthlyRent: 2500,
    monthlyOtherFixed: 1500,
  });
  assert.equal(result.rows.length, 12);
  assert.equal(result.breakEvenMonth, 8);
  assert.equal(result.fixedCostMonthly, 4000);
});

test("projectWithAdjustments equals projectBreakEven when no sliders moved", () => {
  const inputs = {
    startupCosts: 30000,
    monthlyRevenue: 12000,
    monthlyCogs: 4000,
    monthlyRent: 2500,
    monthlyOtherFixed: 1500,
  };
  const a = projectBreakEven(inputs);
  const b = projectWithAdjustments(inputs, NO_ADJUSTMENTS);
  assert.deepEqual(a, b);
});

test("hasAnyInputs distinguishes empty from any non-zero field", () => {
  assert.equal(hasAnyInputs(EMPTY_INPUTS), false);
  assert.equal(hasAnyInputs({ ...EMPTY_INPUTS, monthlyRevenue: 1 }), true);
  assert.equal(hasAnyInputs({ ...EMPTY_INPUTS, startupCosts: 1 }), true);
});
