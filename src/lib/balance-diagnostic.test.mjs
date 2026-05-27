// TIM-1119: balance-diagnostic — explains "out of balance" with cause + fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultMonthlyProjections,
  computeMonthlySlices,
} from "./financial-projection.ts";
import { diagnoseBalanceSheet, BALANCE_TOLERANCE_CENTS } from "./balance-diagnostic.ts";

const EQUIPMENT = { total_cost_cents: 0, financed_cost_cents: 0 };

function makeSlice(overrides = {}) {
  return {
    year: 1,
    month: 12,
    month_index: 12,
    revenue_cents: 5_000_000,
    cogs_cents: 1_500_000,
    gross_profit_cents: 3_500_000,
    labor_cents: 1_500_000,
    rent_cents: 450_000,
    marketing_cents: 100_000,
    utilities_cents: 60_000,
    insurance_cents: 20_000,
    tech_cents: 25_000,
    maintenance_cents: 15_000,
    supplies_cents: 30_000,
    other_misc_cents: 20_000,
    total_opex_cents: 2_220_000,
    operating_income_cents: 1_280_000,
    depreciation_cents: 0,
    interest_cents: 0,
    income_before_taxes_cents: 1_280_000,
    taxes_cents: 320_000,
    net_income_cents: 960_000,
    forecast_line_amounts: [],
    capex_line_amounts: [],
    capex_cents: 0,
    gross_revenue_cents: 5_000_000,
    loyalty_discounts_cents: 0,
    net_revenue_cents: 5_000_000,
    total_cogs_cents: 1_500_000,
    payment_processing_cents: 0,
    spoilage_cents: 0,
    beverage_cogs_cents: 0,
    food_cogs_cents: 0,
    retail_cogs_cents: 0,
    other_opex_cents: 0,
    ebitda_cents: 0,
    avg_ticket_cents: 750,
    net_cash_cents: 960_000,
    loan_repayment_cents: 0,
    cash_cents: 1_000_000,
    accounts_receivable_cents: 0,
    inventory_cents: 350_000,
    fixed_assets_gross_cents: 0,
    accumulated_depreciation_cents: 0,
    net_fixed_assets_cents: 0,
    other_assets_cents: 0,
    total_assets_cents: 1_350_000,
    accounts_payable_cents: 1_500_000,
    current_debt_cents: 0,
    long_term_debt_cents: 0,
    total_liabilities_cents: 1_500_000,
    owner_equity_cents: 0,
    retained_earnings_cents: -150_000,
    total_equity_cents: -150_000,
    total_liabilities_and_equity_cents: 1_350_000,
    ...overrides,
  };
}

test("balanced sheet returns balanced=true with no causes", () => {
  const slice = makeSlice();
  const result = diagnoseBalanceSheet({ slice });
  assert.equal(result.balanced, true);
  assert.equal(result.gap_cents, 0);
  assert.equal(result.causes.length, 0);
  assert.equal(result.suggested_fix, null);
});

test("tolerance: |gap| < 2 cents is treated as balanced", () => {
  const slice = makeSlice({
    total_assets_cents: 1_000_001,
    total_liabilities_and_equity_cents: 1_000_000,
  });
  const result = diagnoseBalanceSheet({ slice });
  assert.equal(result.balanced, true);
});

test("liabilities + equity exceed assets: identifies funding shortfall when inputs available", () => {
  const slice = makeSlice({
    total_assets_cents: 500_000,
    total_liabilities_and_equity_cents: 1_500_000,
  });
  const inputs = {
    buildout_cost_cents: 15_000_000,
    equipment_cost_cents: 5_000_000,
    license_permits_cents: 500_000,
    pre_opening_marketing_cents: 300_000,
    initial_inventory_cents: 200_000,
    rent_deposits_cents: 900_000,
    working_capital_reserve_cents: 1_500_000,
    opening_cash_buffer_cents: 1_000_000,
    owner_capital_cents: 5_000_000,
    loan_amount_cents: 5_000_000,
  };
  const result = diagnoseBalanceSheet({ slice, inputs });
  assert.equal(result.balanced, false);
  assert.equal(result.direction, "le_exceeds_assets");
  assert.equal(result.gap_cents, -1_000_000);
  assert.equal(result.causes[0].id, "funding_shortfall");
  assert.ok(result.suggested_fix);
  assert.equal(result.suggested_fix.adjustment.field, "owner_capital_cents");
  assert.equal(result.suggested_fix.adjustment.delta_cents, 1_000_000);
});

test("cash-trough cause is detected when allSlices show a zero cash month", () => {
  const slice = makeSlice({
    total_assets_cents: 500_000,
    total_liabilities_and_equity_cents: 800_000,
    cash_cents: 100_000,
  });
  const lowMonth = makeSlice({
    month_index: 3,
    month: 3,
    cash_cents: 0,
    total_assets_cents: 500_000,
    total_liabilities_and_equity_cents: 800_000,
  });
  const result = diagnoseBalanceSheet({ slice, allSlices: [lowMonth, slice] });
  assert.equal(result.balanced, false);
  const cashCause = result.causes.find((c) => c.id === "cash_trough");
  assert.ok(cashCause, "cash_trough should be in causes");
  assert.match(cashCause.explanation, /month 3/);
});

test("assets exceed L+E with funding surplus: recommends reducing owner capital", () => {
  const slice = makeSlice({
    total_assets_cents: 2_000_000,
    total_liabilities_and_equity_cents: 1_500_000,
  });
  const inputs = {
    buildout_cost_cents: 1_000_000,
    equipment_cost_cents: 500_000,
    license_permits_cents: 0,
    pre_opening_marketing_cents: 0,
    initial_inventory_cents: 0,
    rent_deposits_cents: 0,
    working_capital_reserve_cents: 0,
    opening_cash_buffer_cents: 0,
    owner_capital_cents: 5_000_000,
    loan_amount_cents: 0,
  };
  const result = diagnoseBalanceSheet({ slice, inputs });
  assert.equal(result.balanced, false);
  assert.equal(result.direction, "assets_exceed");
  assert.equal(result.causes[0].id, "funding_shortfall");
  assert.ok(result.suggested_fix);
  assert.equal(result.suggested_fix.adjustment.delta_cents, -500_000);
});

test("headline + summary read in plain English", () => {
  const slice = makeSlice({
    total_assets_cents: 500_000,
    total_liabilities_and_equity_cents: 1_500_000,
  });
  const result = diagnoseBalanceSheet({ slice });
  assert.match(result.headline, /\$10,000/);
  // Should not contain accounting jargon that a non-business user would
  // struggle with.
  for (const term of ["GAAP", "ledger", "double-entry", "T-account", "journal entry"]) {
    assert.ok(!result.summary.includes(term), `summary should not contain ${term}`);
  }
});

test("unknown fallback when no cause identifiable and direction is le_exceeds_assets without inputs", () => {
  const slice = makeSlice({
    total_assets_cents: 500_000,
    total_liabilities_and_equity_cents: 1_500_000,
    inventory_cents: 0,
    accounts_receivable_cents: 0,
    accounts_payable_cents: 0,
    rent_cents: 0,
    labor_cents: 0,
    utilities_cents: 0,
    cash_cents: 500_000,
  });
  const result = diagnoseBalanceSheet({ slice });
  assert.equal(result.balanced, false);
  assert.equal(result.causes[0].id, "unknown");
});

test("integration: default planner with no inputs produces a diagnostic", () => {
  const mp = defaultMonthlyProjections();
  const slices = computeMonthlySlices(mp, EQUIPMENT, {});
  const last = slices[slices.length - 1];
  const result = diagnoseBalanceSheet({ slice: last, allSlices: slices });
  assert.ok(typeof result.balanced === "boolean");
  assert.ok(typeof result.headline === "string");
  assert.ok(result.summary.length > 0);
  if (!result.balanced) {
    assert.ok(result.causes.length > 0);
  }
});

test("BALANCE_TOLERANCE_CENTS is exported as 2", () => {
  assert.equal(BALANCE_TOLERANCE_CENTS, 2);
});
