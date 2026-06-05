// TIM-2334: plan_state builder unit tests. Pins the contract that every
// quantitative dimension surfaces — and that the serialized ground-truth
// block carries the exact numbers the financial tables will show, so
// narrative + tables can no longer describe two different businesses
// (investor critique on TIM-2315, Beaver & Beef).

import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanState, formatPlanStateForPrompt } from "./plan-state.ts";

// Minimal fixture that exercises every dimension. Mirrors the Beaver & Beef
// failure surface investor flagged: rent on a forecast_line, personnel with
// real headcounts, funding_sources with mixed equity + debt, startup_costs
// with real use-of-funds items.
const FIXTURE_MP = {
  daily_flow: { mon: 80, tue: 80, wed: 80, thu: 90, fri: 100, sat: 110, sun: 0 },
  avg_ticket_cents: 650, // $6.50
  weekly_schedule: {
    mon: { open: true, open_time: "06:30", close_time: "17:00" },
    tue: { open: true, open_time: "06:30", close_time: "17:00" },
    wed: { open: true, open_time: "06:30", close_time: "17:00" },
    thu: { open: true, open_time: "06:30", close_time: "17:00" },
    fri: { open: true, open_time: "06:30", close_time: "17:00" },
    sat: { open: true, open_time: "07:00", close_time: "15:00" },
    sun: { open: false, open_time: "07:00", close_time: "15:00" },
  },
  cogs_pct: 30,
  forecast_lines: [
    { id: "line:rent",      label: "Rent",       category: "overhead", mode: "flat", value: 488000, legacy_key: "rent" },        // $4,880
    { id: "line:marketing", label: "Marketing",  category: "overhead", mode: "pct",  value: 2,      legacy_key: "marketing" },
    { id: "line:utilities", label: "Utilities",  category: "overhead", mode: "flat", value: 70000,  legacy_key: "utilities" },
    { id: "line:insurance", label: "Insurance",  category: "overhead", mode: "flat", value: 25000,  legacy_key: "insurance" },
  ],
  funding_sources: [
    { id: "f1", kind: "founder_equity", label: "Founder Equity", amount_cents: 8000000 },   // $80,000
    { id: "f2", kind: "investor_equity", label: "Angel Investor", amount_cents: 2000000 },  // $20,000
    { id: "f3", kind: "loan",            label: "SBA Loan",       amount_cents: 18000000,   // $180,000
      term_months: 60, annual_rate_pct: 8.5 },
  ],
  personnel: [
    { id: "p1", role: "Owner",   headcount: 1, pay_basis: "annual",  pay_amount_cents: 6000000, benefits_pct: 0,  cost_category: "overhead" },
    { id: "p2", role: "Barista", headcount: 4, pay_basis: "hourly",  pay_amount_cents: 1800, hours_per_week: 30, benefits_pct: 10, cost_category: "cogs" },
    { id: "p3", role: "Lead Barista", headcount: 2, pay_basis: "hourly", pay_amount_cents: 2200, hours_per_week: 35, benefits_pct: 15, cost_category: "cogs" },
  ],
  startup_costs: {
    buildout_cents:                 5000000,  // $50,000
    equipment_cents:                7500000,  // $75,000
    deposits_cents:                  976000,  // 2× rent
    licenses_cents:                  300000,  // $3,000
    pre_opening_marketing_cents:     500000,
    initial_inventory_cents:        1500000,
    startup_supplies_cents:          800000,
    professional_fees_cents:         600000,
    working_capital_reserve_cents:  2000000,
    opening_cash_buffer_cents:      3000000,
    buildout_useful_life_years:    15,
    equipment_useful_life_years:    7,
  },
  income_tax_pct: 21,
  sales_tax_pct: 8.875,
  ramp_months: 6,
  ramp_multipliers: [0.4, 0.55, 0.7, 0.8, 0.9, 1.0],
  growth_mode: "simple",
  growth_monthly_pct: 0.5,
  growth_custom_monthly: [],
  fiscal_year_start_month: 1,
  currency_code: "USD",
  owner_draws_monthly_cents: 0,
  owner_contributions: [],
};

const FIXTURE_INPUT = {
  shopName: "Beaver & Beef",
  financialModel: { forecast_inputs: FIXTURE_MP, startup_costs: FIXTURE_MP.startup_costs },
  locationCandidates: [
    { id: "L1", name: "488 Hyde Street", address: "488 Hyde St, San Francisco, CA",
      neighborhood: "Tenderloin", sq_ft: 1200, asking_rent_cents: 488000, status: "chosen", notes: null },
  ],
  equipment: [
    { id: "E1", name: "La Marzocco GB5",  cost_usd: 18500, category: "major", notes: null },
    { id: "E2", name: "Mahlkönig EK43",   cost_usd: 4200,  category: "major", notes: null },
    { id: "E3", name: "Bunn Brewer",      cost_usd: 1500,  category: "major", notes: null },
  ],
  hiringRoles: [],
  menuBlendedCogsPct: 32,
};

test("buildPlanState surfaces a non-zero rent line on the P&L when forecast_line is set", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  // Investor critique #3: narrative said rent $4,880/mo, P&L showed $0.
  // plan_state's lease.monthly_rent_cents must equal the rent forecast_line.
  assert.equal(st.lease.monthly_rent_cents, 488000);
  assert.equal(st.lease.chosen_location_name, "488 Hyde Street");
  assert.equal(st.lease.sq_ft, 1200);
});

test("buildPlanState reconciles capital stack across founder budget + funding_sources", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  // Equity $100k ($80k founder + $20k investor), Debt $180k → Total $280k.
  // Beaver & Beef investor saw narrative say $280K, sources $250K, uses $244K.
  // plan_state forces a single number for total raise — $280,000.
  assert.equal(st.capital_stack.total_raise_cents, 28000000);
  assert.equal(st.capital_stack.equity_cents, 10000000);
  assert.equal(st.capital_stack.debt_cents, 18000000);
  assert.equal(st.capital_stack.founder_equity_cents, 8000000);
  assert.equal(st.capital_stack.investor_equity_cents, 2000000);
  assert.equal(st.capital_stack.sources.length, 3);
});

test("buildPlanState surfaces every use-of-funds line", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  // 10 line items in the fixture's startup_costs.
  assert.equal(st.use_of_funds.lines.length, 10);
  // Total = sum of every line.
  const expectedTotal =
    5000000 + 7500000 + 976000 + 300000 + 500000 +
    1500000 + 800000 + 600000 + 2000000 + 3000000;
  assert.equal(st.use_of_funds.total_cents, expectedTotal);
});

test("buildPlanState carries the AUTHORITATIVE headcount + payroll from personnel", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  // Investor critique #2: narrative said 7 staff, table showed 1+2. plan_state
  // takes personnel as authoritative (the financial tables' source) so the
  // narrative is forced to quote whatever the tables will actually show.
  assert.equal(st.labor.total_headcount, 7); // 1 owner + 4 baristas + 2 leads
  assert.equal(st.labor.roles.length, 3);
  // Each role's loaded cost is non-zero.
  for (const r of st.labor.roles) {
    assert.ok(r.monthly_loaded_cost_cents > 0, `role ${r.role} has zero loaded cost`);
  }
  // Sums match per cost_category.
  const cogsExpected = st.labor.roles
    .filter((r) => r.cost_category === "cogs")
    .reduce((a, r) => a + r.monthly_loaded_cost_cents, 0);
  const ovhExpected = st.labor.roles
    .filter((r) => r.cost_category === "overhead")
    .reduce((a, r) => a + r.monthly_loaded_cost_cents, 0);
  assert.equal(st.labor.cogs_monthly_cents, cogsExpected);
  assert.equal(st.labor.overhead_monthly_cents, ovhExpected);
  assert.equal(st.labor.monthly_loaded_cost_cents, cogsExpected + ovhExpected);
});

test("buildPlanState 5-year summary matches the engine's slice rollups", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  // Year 1 must surface (model has 60 months → 5 years of slices).
  assert.ok(st.years.length >= 1, "expected at least year 1");
  const y1 = st.years.find((y) => y.year === 1);
  assert.ok(y1, "year 1 missing");
  // Revenue > 0 (non-zero customers × ticket).
  assert.ok(y1.revenue_cents > 0);
  // Net income = revenue - cogs - opex - depreciation - interest - tax. The
  // exact figure depends on the engine; the test asserts the FIELDS exist
  // and that gross_profit + operating_income are coherent.
  assert.equal(y1.gross_profit_cents, y1.revenue_cents - y1.cogs_cents);
  // Years are in order.
  for (let i = 1; i < st.years.length; i++) {
    assert.ok(st.years[i].year > st.years[i - 1].year);
  }
});

test("buildPlanState COGS blended_pct is computed from actual slices, not a guess", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  // The AUTHORITATIVE blended rate is what the engine actually produces from
  // the slices — narrative quotes whatever the P&L will show, including the
  // ugly cases (early-ramp months where COGS labor outsizes thin revenue).
  // base_cogs_pct + menu_blended_pct passed through as inputs for transparency.
  const y1 = st.years.find((y) => y.year === 1);
  if (y1 && y1.revenue_cents > 0) {
    const expected = Math.round((y1.cogs_cents / y1.revenue_cents) * 1000) / 10;
    assert.equal(st.cogs.blended_pct, expected);
  }
  assert.equal(st.cogs.menu_blended_pct, 32);
  assert.equal(st.cogs.base_cogs_pct, 30);
});

test("buildPlanState capex captures equipment count + asset lifetimes", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  // total_cents reflects capex forecast_lines (zero in this fixture by design —
  // startup buildout/equipment seed gross fixed assets, they don't post as
  // capex lines). The narrative quotes the equipment list from the workspace.
  assert.equal(typeof st.capex.total_cents, "number");
  assert.equal(st.capex.equipment_count, 3);
  assert.equal(st.capex.buildout_useful_life_years, 15);
  assert.equal(st.capex.equipment_useful_life_years, 7);
});

test("buildPlanState tax rates pass through", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  assert.equal(st.tax.income_tax_pct, 21);
  assert.equal(st.tax.sales_tax_pct, 8.875);
});

test("buildPlanState meta carries shop name + currency", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  assert.equal(st.meta.shop_name, "Beaver & Beef");
  assert.equal(st.meta.currency_code, "USD");
  assert.equal(st.meta.fiscal_year_start_month, 1);
});

test("formatPlanStateForPrompt renders the rule + every dimension", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  const text = formatPlanStateForPrompt(st);
  // Header rule prohibits invented numbers — narrative must quote verbatim.
  assert.match(text, /Ground Truth Numbers/);
  assert.match(text, /Quote them verbatim/);
  // Capital stack total appears.
  assert.match(text, /Total raise: USD 280,000/);
  // Rent line is on the P&L every month — the exact phrase the narrative must echo.
  assert.match(text, /Monthly rent .* P&L every month.*: USD 4,880/);
  // Headcount surfaced.
  assert.match(text, /TOTAL HEADCOUNT 7/);
  // 5-year summary header.
  assert.match(text, /5-Year Summary/);
  // Break-even line.
  assert.match(text, /Break-even/);
});

test("formatPlanStateForPrompt covers at least 20 numeric claims (acceptance #2)", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  const text = formatPlanStateForPrompt(st);
  // Match dollar-style "USD <number>" tokens. The acceptance criterion is
  // 20+ numeric claims comparable between narrative and plan_state — the
  // ground-truth block must surface at least that many for the regression
  // test to have something to compare against.
  const dollarMatches = text.match(/USD\s+[\d,.]+/g) ?? [];
  assert.ok(dollarMatches.length >= 20, `expected >=20 dollar claims, got ${dollarMatches.length}`);
  // Plus at least one percentage and one headcount integer to round out
  // the dimensions the regression test compares.
  assert.match(text, /[\d.]+%/);
  assert.match(text, /HEADCOUNT \d+/);
});

test("buildPlanState handles an empty/zero financial model without throwing", () => {
  // New plans will have nearly-empty financial_models — plan_state should
  // surface zeros, not blow up the prompt builder.
  const st = buildPlanState({
    shopName: "Empty Shop",
    financialModel: {},
    locationCandidates: [],
    equipment: [],
    hiringRoles: [],
    menuBlendedCogsPct: null,
  });
  assert.equal(st.meta.shop_name, "Empty Shop");
  assert.equal(st.lease.chosen_location_name, null);
  // Empty model falls back to defaultStartupCosts(), so the use-of-funds is
  // populated with sensible coffee-shop defaults — narrative still has real
  // numbers to quote (instead of inventing them as the regenerated B&B did).
  assert.ok(st.use_of_funds.total_cents > 0);
  // Serializer doesn't throw.
  const text = formatPlanStateForPrompt(st);
  assert.ok(text.length > 0);
});
