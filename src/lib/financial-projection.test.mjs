// TIM-1102: pin computeMonthlyProjections against the new forecast_lines schema.
// TIM-1117: COGS lines can target a parent revenue stream and/or derive their
// pct from menu item costing — pinned below.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultMonthlyProjections,
  normalizeMonthlyProjections,
  computeMonthlyProjections,
  computeMonthlySlices,
  computeMenuBlendedCogsPct,
} from "./financial-projection.ts";

test("default model has forecast_lines seeded with legacy overhead keys", () => {
  const mp = defaultMonthlyProjections();
  assert.ok(Array.isArray(mp.forecast_lines));
  assert.ok(mp.forecast_lines.find((l) => l.legacy_key === "labor"));
  assert.ok(mp.forecast_lines.find((l) => l.legacy_key === "rent"));
  assert.ok(mp.forecast_lines.find((l) => l.legacy_key === "marketing"));
});

test("legacy stored payload (no forecast_lines) migrates into labeled lines", () => {
  const raw = {
    avg_ticket_cents: 700,
    cogs_pct: 30,
    labor: { mode: "pct", pct: 28, flat_cents: 0 },
    monthly_rent_cents: 500000,
    marketing: { mode: "pct", pct: 2, flat_cents: 0 },
    utilities_monthly_cents: 70000,
  };
  const mp = normalizeMonthlyProjections(raw);
  const labor = mp.forecast_lines.find((l) => l.legacy_key === "labor");
  assert.equal(labor?.value, 28);
  assert.equal(labor?.mode, "pct");
  const rent = mp.forecast_lines.find((l) => l.legacy_key === "rent");
  assert.equal(rent?.value, 500000);
  assert.equal(rent?.mode, "flat");
});

test("computeMonthlyProjections rolls overhead lines into legacy named fields", () => {
  const mp = defaultMonthlyProjections();
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows.length, 60);
  // Month 12 should have full ramp + 11 months of compounding growth
  const m12 = rows[11];
  assert.ok(m12.revenue_cents > 0);
  assert.ok(m12.labor_cents > 0, "labor rolled up");
  assert.ok(m12.rent_cents > 0, "rent rolled up");
});

test("per-line ramp: line at 50% start_pct over 3 mo doubles by month 3", () => {
  const mp = defaultMonthlyProjections();
  mp.forecast_lines = [
    {
      id: "x",
      label: "Salary",
      category: "overhead",
      mode: "flat",
      value: 100000,
      ramp: { enabled: true, start_month: 1, ramp_months: 3, start_pct: 50 },
    },
  ];
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  // m1 ≈ 50% of 100000 = 50000; m3 ≈ 100%; m4+ = 100000
  assert.equal(rows[0].other_misc_cents, 50000);
  assert.equal(rows[2].other_misc_cents, 100000);
  assert.equal(rows[3].other_misc_cents, 100000);
});

test("per-line growth compounds monthly after ramp completes", () => {
  const mp = defaultMonthlyProjections();
  mp.forecast_lines = [
    {
      id: "x",
      label: "Subscription",
      category: "overhead",
      mode: "flat",
      value: 10000,
      growth: { enabled: true, monthly_pct: 10 },
    },
  ];
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows[0].other_misc_cents, 10000); // m1: base
  assert.equal(rows[1].other_misc_cents, 11000); // m2: +10%
  assert.equal(rows[2].other_misc_cents, 12100); // m3: +10% compounded
});

test("pct-mode line: 5% of revenue scales with revenue", () => {
  const mp = defaultMonthlyProjections();
  mp.forecast_lines = [
    { id: "x", label: "Royalty", category: "overhead", mode: "pct", value: 5 },
  ];
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows[0].other_misc_cents, Math.round(rows[0].revenue_cents * 0.05));
});

test("capex line: full charge in start_month only", () => {
  const mp = defaultMonthlyProjections();
  mp.forecast_lines = [
    {
      id: "espresso",
      label: "Espresso Machine",
      category: "capex",
      mode: "flat",
      value: 1500000,
      ramp: { enabled: true, start_month: 4, ramp_months: 0, start_pct: 100 },
    },
  ];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows[2].capex_cents, 0);
  assert.equal(rows[3].capex_cents, 1500000); // month 4
  assert.equal(rows[4].capex_cents, 0);
});

// ── TIM-1101: currency persistence ────────────────────────────────────────────

test("default model has USD as default currency_code", () => {
  const mp = defaultMonthlyProjections();
  assert.equal(mp.currency_code, "USD");
});

test("normalize accepts a valid ISO 4217 code and uppercases it", () => {
  const mp = normalizeMonthlyProjections({ currency_code: "eur" });
  assert.equal(mp.currency_code, "EUR");
});

test("normalize falls back to USD for unknown / invalid currency code", () => {
  assert.equal(normalizeMonthlyProjections({ currency_code: "ZZZ" }).currency_code, "USD");
  assert.equal(normalizeMonthlyProjections({ currency_code: 42 }).currency_code, "USD");
  assert.equal(normalizeMonthlyProjections({}).currency_code, "USD");
});

// ── TIM-1117: COGS revenue stream linking + menu derivation ─────────────────

test("normalize preserves revenue_stream_id and menu_linked on COGS lines", () => {
  const mp = normalizeMonthlyProjections({
    forecast_lines: [
      { id: "rev-x", label: "Wholesale", category: "revenue", mode: "flat", value: 500000 },
      {
        id: "cogs-x",
        label: "Wholesale COGS",
        category: "cogs",
        mode: "pct",
        value: 40,
        revenue_stream_id: "rev-x",
        menu_linked: true,
      },
    ],
  });
  const cogs = mp.forecast_lines.find((l) => l.id === "cogs-x");
  assert.equal(cogs?.revenue_stream_id, "rev-x");
  assert.equal(cogs?.menu_linked, true);
});

test("COGS line linked to a specific revenue stream applies % only to that stream", () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 0;                  // disable the default base COGS rate
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  // Zero out foot-traffic so total revenue = revenue line amount only
  mp.daily_flow = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  mp.forecast_lines = [
    { id: "rev-wholesale", label: "Wholesale", category: "revenue", mode: "flat", value: 1000000 },
    { id: "rev-retail",    label: "Retail",    category: "revenue", mode: "flat", value: 500000 },
    {
      id: "cogs-wholesale",
      label: "Wholesale COGS",
      category: "cogs",
      mode: "pct",
      value: 40,
      revenue_stream_id: "rev-wholesale",
    },
  ];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  // COGS = 40% × $10,000 wholesale only = $4,000 (not 40% of $15,000 total)
  assert.equal(rows[0].cogs_cents, 400000);
});

test('COGS line with revenue_stream_id="base" applies only to foot-traffic base', () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 0;
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  // Daily flow chosen to produce a clean number: 100 cust/day × 7 days × 52 / 12 × $7.50 ticket
  // = 100*7*52/12 * 7.5 = 22750 cents-equiv? Easier to just check ratio.
  mp.forecast_lines = [
    { id: "rev-extra", label: "Wholesale", category: "revenue", mode: "flat", value: 1000000 },
    {
      id: "cogs-base",
      label: "Base COGS",
      category: "cogs",
      mode: "pct",
      value: 30,
      revenue_stream_id: "base",
    },
  ];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  const baseRev = rows[0].revenue_cents - 1000000;
  // COGS = 30% of base (excludes the $10k wholesale line)
  assert.equal(rows[0].cogs_cents, Math.round(baseRev * 0.3));
});

test("COGS line with no revenue_stream_id keeps legacy behavior (% of total)", () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 0;
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  mp.forecast_lines = [
    { id: "rev-x", label: "Wholesale", category: "revenue", mode: "flat", value: 1000000 },
    { id: "cogs-total", label: "Total COGS", category: "cogs", mode: "pct", value: 30 },
  ];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows[0].cogs_cents, Math.round(rows[0].revenue_cents * 0.3));
});

test("COGS menu_linked: uses the menu blended pct against the linked stream", () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 0;
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  mp.daily_flow = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  mp.forecast_lines = [
    { id: "rev-x", label: "Wholesale", category: "revenue", mode: "flat", value: 1000000 },
    {
      id: "cogs-menu",
      label: "Menu COGS",
      category: "cogs",
      mode: "pct",
      value: 99,             // ignored when menu_linked is true
      revenue_stream_id: "rev-x",
      menu_linked: true,
    },
  ];
  const rows = computeMonthlyProjections(
    mp,
    { total_cost_cents: 0, financed_cost_cents: 0 },
    { menu_blended_cogs_pct: 28 }
  );
  // 28% × $10,000 wholesale = $2,800
  assert.equal(rows[0].cogs_cents, 280000);
});

test("COGS menu_linked falls back to value when menu pct is null", () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 0;
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  mp.daily_flow = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  mp.forecast_lines = [
    { id: "rev-x", label: "Wholesale", category: "revenue", mode: "flat", value: 1000000 },
    {
      id: "cogs-menu",
      label: "Menu COGS",
      category: "cogs",
      mode: "pct",
      value: 35,
      revenue_stream_id: "rev-x",
      menu_linked: true,
    },
  ];
  const rows = computeMonthlyProjections(
    mp,
    { total_cost_cents: 0, financed_cost_cents: 0 },
    { menu_blended_cogs_pct: null }
  );
  // No menu data → uses line.value (35% × $10k = $3,500)
  assert.equal(rows[0].cogs_cents, 350000);
});

test("computeMenuBlendedCogsPct: weighted by mix, prefers computed_cogs_cents", () => {
  // Two items:
  //   Latte:  price $5.00, cogs $1.00, mix 70 → cost weight 70, price weight 350
  //   Bagel:  price $3.00, cogs $1.20, mix 30 → cost weight 36, price weight 90
  // Blended = (70+36) / (350+90) × 100 = 106 / 440 × 100 ≈ 24.0909%
  const pct = computeMenuBlendedCogsPct([
    { price_cents: 500, computed_cogs_cents: 100, expected_mix_pct: 70 },
    { price_cents: 300, computed_cogs_cents: 120, expected_mix_pct: 30 },
  ]);
  assert.ok(pct !== null);
  assert.ok(Math.abs(pct - (106 / 440) * 100) < 1e-9);
});

test("computeMenuBlendedCogsPct: returns null when nothing is priced", () => {
  assert.equal(computeMenuBlendedCogsPct([]), null);
  assert.equal(computeMenuBlendedCogsPct(null), null);
  assert.equal(
    computeMenuBlendedCogsPct([
      { price_cents: 0, computed_cogs_cents: 100, expected_mix_pct: 50 },
      { price_cents: 300, computed_cogs_cents: 120, expected_mix_pct: 0 },
    ]),
    null
  );
});

test("stream-linked COGS flows through to balance sheet: inventory + accounts payable", () => {
  // Acceptance criteria for TIM-1117: "Calculation flows through to net profit,
  // balance sheet, and cash flow." Inventory = cogs × days_inventory/30 (default 7),
  // accounts payable = cogs × days_payable/30 (default 30 → equal to monthly COGS).
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 0;
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  mp.daily_flow = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  mp.forecast_lines = [
    { id: "rev-w", label: "Wholesale", category: "revenue", mode: "flat", value: 1000000 },
    {
      id: "cogs-w",
      label: "Wholesale COGS",
      category: "cogs",
      mode: "pct",
      value: 40,
      revenue_stream_id: "rev-w",
    },
  ];
  const slices = computeMonthlySlices(
    mp,
    { total_cost_cents: 0, financed_cost_cents: 0 },
    {} // defaults: days_inventory=7, days_payable=30
  );
  const m1 = slices[0];
  // COGS = 40% × $10,000 = $4,000
  assert.equal(m1.cogs_cents, 400000);
  // Inventory = $4,000 × 7/30 = $933.33 → rounded to 93333 cents
  assert.equal(m1.inventory_cents, Math.round(400000 * (7 / 30)));
  // Accounts payable = $4,000 × 30/30 = $4,000 (full monthly COGS)
  assert.equal(m1.accounts_payable_cents, 400000);
});

test("COGS change flows through to cash flow (net_cash_cents)", () => {
  // Same revenue baseline; adding a stream-linked COGS line lowers net income,
  // which lowers net_cash_cents one-for-one (depreciation, loan repay, capex unchanged).
  const baseMp = () => {
    const mp = defaultMonthlyProjections();
    mp.cogs_pct = 0;
    mp.ramp_months = 0;
    mp.ramp_multipliers = [];
    mp.growth_monthly_pct = 0;
    mp.daily_flow = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
    return mp;
  };

  const mpNoCogs = baseMp();
  mpNoCogs.forecast_lines = [
    { id: "rev-w", label: "Wholesale", category: "revenue", mode: "flat", value: 1000000 },
  ];
  const noCogs = computeMonthlySlices(
    mpNoCogs,
    { total_cost_cents: 0, financed_cost_cents: 0 },
    {}
  );

  const mpWithCogs = baseMp();
  mpWithCogs.forecast_lines = [
    { id: "rev-w", label: "Wholesale", category: "revenue", mode: "flat", value: 1000000 },
    {
      id: "cogs-w",
      label: "Wholesale COGS",
      category: "cogs",
      mode: "pct",
      value: 40,
      revenue_stream_id: "rev-w",
    },
  ];
  const withCogs = computeMonthlySlices(
    mpWithCogs,
    { total_cost_cents: 0, financed_cost_cents: 0 },
    {}
  );

  // Same revenue, higher COGS → lower net income → lower net cash.
  assert.equal(noCogs[0].revenue_cents, withCogs[0].revenue_cents);
  assert.ok(withCogs[0].cogs_cents > noCogs[0].cogs_cents);
  assert.ok(withCogs[0].net_income_cents < noCogs[0].net_income_cents);
  assert.ok(withCogs[0].net_cash_cents < noCogs[0].net_cash_cents);
  // The cash delta should track the net-income delta exactly (no other lever moved).
  const dNetIncome = withCogs[0].net_income_cents - noCogs[0].net_income_cents;
  const dNetCash = withCogs[0].net_cash_cents - noCogs[0].net_cash_cents;
  assert.equal(dNetCash, dNetIncome);
});

test("net income reflects COGS change when a stream-linked line is added", () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 0;
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  mp.forecast_lines = [
    { id: "rev-x", label: "Wholesale", category: "revenue", mode: "flat", value: 1000000 },
  ];
  const rowsNoCogs = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });

  mp.forecast_lines = [
    { id: "rev-x", label: "Wholesale", category: "revenue", mode: "flat", value: 1000000 },
    {
      id: "cogs-x",
      label: "Wholesale COGS",
      category: "cogs",
      mode: "pct",
      value: 40,
      revenue_stream_id: "rev-x",
    },
  ];
  const rowsWithCogs = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });

  // Same revenue, higher COGS → lower gross profit → lower net income.
  assert.equal(rowsNoCogs[0].revenue_cents, rowsWithCogs[0].revenue_cents);
  assert.ok(rowsWithCogs[0].cogs_cents > rowsNoCogs[0].cogs_cents);
  assert.ok(rowsWithCogs[0].net_income_cents < rowsNoCogs[0].net_income_cents);
});
