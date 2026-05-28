// TIM-1102: pin computeMonthlyProjections against the new forecast_lines schema.
// TIM-1117: COGS lines can target a parent revenue stream and/or derive their
// pct from menu item costing — pinned below.
// TIM-1122: pin funding_sources roll-up + per-loan amortization.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultMonthlyProjections,
  normalizeMonthlyProjections,
  computeMonthlyProjections,
  computeMonthlySlices,
  computeMenuBlendedCogsPct,
  computeBreakEvenModel,
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
  // TIM-1169: zero out working-capital days so the cash delta isolates net
  // income — otherwise ΔInventory and ΔAP move alongside COGS changes.
  const wcInputs = { days_inventory: 0, days_payable: 0, days_receivable: 0 };
  const noCogs = computeMonthlySlices(
    mpNoCogs,
    { total_cost_cents: 0, financed_cost_cents: 0 },
    wcInputs
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
    wcInputs
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

// ── TIM-1118: overhead pct lines resolve to the chosen revenue stream ─────────

test("overhead pct line: undefined stream id applies against total revenue (legacy)", () => {
  const mp = defaultMonthlyProjections();
  mp.forecast_lines = [
    { id: "rl", label: "Wholesale", category: "revenue", mode: "flat", value: 100000 },
    { id: "oh", label: "Royalty", category: "overhead", mode: "pct", value: 5 },
  ];
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows[0].other_misc_cents, Math.round(rows[0].revenue_cents * 0.05));
});

test('overhead pct line: revenue_stream_id="base" scopes to foot-traffic only', () => {
  const mp = defaultMonthlyProjections();
  mp.forecast_lines = [
    { id: "rl", label: "Wholesale", category: "revenue", mode: "flat", value: 100000 },
    {
      id: "oh",
      label: "Floor Labor",
      category: "overhead",
      mode: "pct",
      value: 30,
      revenue_stream_id: "base",
    },
  ];
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  const base = rows[0].revenue_cents - 100000;
  assert.equal(rows[0].other_misc_cents, Math.round(base * 0.3));
});

test("overhead pct line: stream id pointing to a revenue line scopes to that line", () => {
  const mp = defaultMonthlyProjections();
  mp.forecast_lines = [
    { id: "wh", label: "Wholesale", category: "revenue", mode: "flat", value: 100000 },
    {
      id: "comm",
      label: "Wholesale commission",
      category: "overhead",
      mode: "pct",
      value: 10,
      revenue_stream_id: "wh",
    },
  ];
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  // 10% of $1,000 wholesale = $100 (10000 cents)
  assert.equal(rows[0].other_misc_cents, 10000);
});

test("overhead flat line ignores revenue_stream_id", () => {
  const mp = defaultMonthlyProjections();
  mp.forecast_lines = [
    {
      id: "x",
      label: "Rent",
      category: "overhead",
      mode: "flat",
      value: 250000,
      revenue_stream_id: "base",
    },
  ];
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows[0].other_misc_cents, 250000);
});

test("overhead pct: unknown stream id falls back to total revenue", () => {
  const mp = defaultMonthlyProjections();
  mp.forecast_lines = [
    {
      id: "oh",
      label: "Orphan",
      category: "overhead",
      mode: "pct",
      value: 4,
      revenue_stream_id: "deleted-line-id",
    },
  ];
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows[0].other_misc_cents, Math.round(rows[0].revenue_cents * 0.04));
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

// ── TIM-1169: per-capex-line depreciation, working-capital deltas, owner activity ─

test("capex line: depreciation uses per-line useful_life_years (default 7)", () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 0;
  mp.ramp_months = 0;
  mp.daily_flow = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  mp.forecast_lines = [
    {
      id: "cap-1",
      label: "Espresso Machine",
      category: "capex",
      mode: "flat",
      value: 840000, // $8,400
      useful_life_years: 7,
      ramp: { enabled: true, start_month: 1, ramp_months: 0, start_pct: 100 },
    },
  ];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 }, {});
  // $8,400 / (7 * 12) = $100/mo = 10000 cents
  assert.equal(rows[0].depreciation_cents, 10000);
  assert.equal(rows[11].depreciation_cents, 10000); // still depreciating in year 1
  // After year 7 = month 84 (beyond 60), so should still be depreciating at month 60
  assert.equal(rows[59].depreciation_cents, 10000);
});

test("capex line: shorter useful_life_years compresses depreciation", () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 0;
  mp.ramp_months = 0;
  mp.daily_flow = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  mp.forecast_lines = [
    {
      id: "cap-pos",
      label: "POS Tablet",
      category: "capex",
      mode: "flat",
      value: 360000, // $3,600
      useful_life_years: 3,
      ramp: { enabled: true, start_month: 1, ramp_months: 0, start_pct: 100 },
    },
  ];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 }, {});
  // $3,600 / (3 * 12) = $100/mo = 10000 cents
  assert.equal(rows[0].depreciation_cents, 10000);
  // Month 36 is the last month of depreciation; month 37 should be zero
  assert.equal(rows[35].depreciation_cents, 10000);
  assert.equal(rows[36].depreciation_cents, 0);
});

test("multiple capex lines depreciate independently, summed at each month", () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 0;
  mp.ramp_months = 0;
  mp.daily_flow = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  mp.forecast_lines = [
    {
      id: "cap-a", label: "POS", category: "capex", mode: "flat",
      value: 360000, useful_life_years: 3,
      ramp: { enabled: true, start_month: 1, ramp_months: 0, start_pct: 100 },
    },
    {
      id: "cap-b", label: "Buildout", category: "capex", mode: "flat",
      value: 2400000, useful_life_years: 10,
      ramp: { enabled: true, start_month: 1, ramp_months: 0, start_pct: 100 },
    },
  ];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 }, {});
  // POS: $3,600 / 36 = $100/mo. Buildout: $24,000 / 120 = $200/mo. Sum: $300/mo = 30000 cents.
  assert.equal(rows[0].depreciation_cents, 30000);
});

test("ΔWC: AP delta from prior month's COGS feeds into operating cash", () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 30;
  mp.ramp_months = 0;
  // Steady-state flat customers so COGS is constant — ΔAP = 0 from M2 onward.
  mp.daily_flow = { mon: 100, tue: 100, wed: 100, thu: 100, fri: 100, sat: 100, sun: 100 };
  mp.weekly_schedule = {
    mon: { open: true, open_time: "06:30", close_time: "17:00" },
    tue: { open: true, open_time: "06:30", close_time: "17:00" },
    wed: { open: true, open_time: "06:30", close_time: "17:00" },
    thu: { open: true, open_time: "06:30", close_time: "17:00" },
    fri: { open: true, open_time: "06:30", close_time: "17:00" },
    sat: { open: true, open_time: "06:30", close_time: "17:00" },
    sun: { open: true, open_time: "06:30", close_time: "17:00" },
  };
  mp.forecast_lines = [];
  mp.taxes_pct = 0;
  mp.growth_monthly_pct = 0;
  mp.growth_custom_monthly = [];

  const slices = computeMonthlySlices(
    mp,
    { total_cost_cents: 0, financed_cost_cents: 0 },
    { days_inventory: 7, days_payable: 30, days_receivable: 0 }
  );
  // M1: AP grows from 0 → AP_M1; positive ΔAP frees cash.
  assert.ok(slices[0].delta_ap_cents > 0, "M1 ΔAP should be positive");
  assert.equal(slices[0].delta_ap_cents, slices[0].accounts_payable_cents);
  // M2 (steady state, same COGS): ΔAP ≈ 0
  assert.ok(Math.abs(slices[1].delta_ap_cents) < 2);
});

test("owner draws reduce cash and equity by the monthly amount", () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 0;
  mp.ramp_months = 0;
  mp.daily_flow = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  mp.forecast_lines = [];
  mp.funding_sources = [];
  mp.owner_draws_monthly_cents = 200000; // $2,000/mo

  const withInputs = { days_inventory: 0, days_payable: 0, days_receivable: 0, owner_capital_cents: 5000000 };
  const slices = computeMonthlySlices(
    mp,
    { total_cost_cents: 0, financed_cost_cents: 0 },
    withInputs
  );
  assert.equal(slices[0].owner_draws_cents, 200000);
  // Owner equity = capital - cumulative draws (no contributions)
  assert.equal(slices[0].owner_equity_cents, 5000000 - 200000);
  assert.equal(slices[11].owner_equity_cents, 5000000 - 200000 * 12);
});

test("owner contributions inject cash and lift equity at the named month", () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 0;
  mp.ramp_months = 0;
  mp.daily_flow = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  mp.forecast_lines = [];
  mp.funding_sources = [];
  mp.owner_contributions = [{ month_index: 6, amount_cents: 1000000 }];

  const slices = computeMonthlySlices(
    mp,
    { total_cost_cents: 0, financed_cost_cents: 0 },
    { days_inventory: 0, days_payable: 0, days_receivable: 0, owner_capital_cents: 0 }
  );
  assert.equal(slices[5].owner_contributions_cents, 1000000); // month_index 6 → index 5
  assert.equal(slices[4].owner_contributions_cents, 0);
  assert.equal(slices[5].owner_equity_cents, 1000000);
});

test("balance sheet balances with depreciation + WC + owner activity", () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 30;
  mp.ramp_months = 0;
  mp.daily_flow = { mon: 100, tue: 100, wed: 100, thu: 100, fri: 100, sat: 100, sun: 100 };
  mp.weekly_schedule = {
    mon: { open: true, open_time: "06:30", close_time: "17:00" },
    tue: { open: true, open_time: "06:30", close_time: "17:00" },
    wed: { open: true, open_time: "06:30", close_time: "17:00" },
    thu: { open: true, open_time: "06:30", close_time: "17:00" },
    fri: { open: true, open_time: "06:30", close_time: "17:00" },
    sat: { open: true, open_time: "06:30", close_time: "17:00" },
    sun: { open: true, open_time: "06:30", close_time: "17:00" },
  };
  mp.forecast_lines = [
    {
      id: "cap-1", label: "Equip", category: "capex", mode: "flat",
      value: 500000, useful_life_years: 5,
      ramp: { enabled: true, start_month: 1, ramp_months: 0, start_pct: 100 },
    },
  ];
  mp.funding_sources = [];
  mp.owner_draws_monthly_cents = 100000;
  mp.owner_contributions = [{ month_index: 3, amount_cents: 500000 }];
  mp.taxes_pct = 0;

  const slices = computeMonthlySlices(
    mp,
    { total_cost_cents: 0, financed_cost_cents: 0 },
    {
      days_inventory: 7,
      days_payable: 30,
      days_receivable: 0,
      owner_capital_cents: 1000000,
      // Seed-the-pump identity: opening_cash + fixed_assets = owner + loan.
      // No loan here, so opening cash = owner capital, no other fixed assets.
      opening_cash_buffer_cents: 1000000,
    }
  );
  for (const s of slices.slice(0, 12)) {
    const diff = Math.abs(s.total_assets_cents - s.total_liabilities_and_equity_cents);
    assert.ok(diff < 10, `BS out of balance at month ${s.month_index} by ${diff}`);
  }
});

// ── TIM-1122: funding_sources ─────────────────────────────────────────────────

test("default model seeds founder equity + a starter loan in funding_sources", () => {
  const mp = defaultMonthlyProjections();
  assert.ok(Array.isArray(mp.funding_sources));
  assert.ok(mp.funding_sources.find((s) => s.kind === "founder_equity"));
  const loan = mp.funding_sources.find((s) => s.kind === "loan");
  assert.ok(loan);
  assert.ok((loan.term_months ?? 0) > 0);
});

test("normalize migrates legacy owner_capital_cents / loan_amount_cents into funding_sources", () => {
  const mp = normalizeMonthlyProjections({
    owner_capital_cents: 12000000,
    loan_amount_cents: 8000000,
    loan_term_months: 36,
    loan_annual_rate_pct: 5,
  });
  const founder = mp.funding_sources.find((s) => s.kind === "founder_equity");
  const loan = mp.funding_sources.find((s) => s.kind === "loan");
  assert.equal(founder?.amount_cents, 12000000);
  assert.equal(loan?.amount_cents, 8000000);
  assert.equal(loan?.term_months, 36);
});

test("funding_sources drive owner_equity + loan balance + amortization", () => {
  const mp = defaultMonthlyProjections();
  mp.funding_sources = [
    { id: "f1", kind: "founder_equity", label: "Founder", amount_cents: 5000000 },
    { id: "i1", kind: "investor_equity", label: "Investor", amount_cents: 2000000, pct_ownership: 20 },
    { id: "g1", kind: "grant", label: "City Grant", amount_cents: 500000 },
    { id: "l1", kind: "loan", label: "Bank", amount_cents: 6000000, term_months: 60, annual_rate_pct: 6 },
  ];
  const slices = computeMonthlySlices(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  const m1 = slices[0];
  // Equity composition
  assert.equal(m1.founder_equity_cents, 5000000);
  assert.equal(m1.investor_equity_cents, 2000000);
  assert.equal(m1.grants_cents, 500000);
  assert.equal(m1.owner_equity_cents, 7500000); // founder + investor + grant
  // Loan: starts at face value, amortizes down each month
  assert.ok(m1.long_term_debt_cents > 0);
  assert.ok(m1.long_term_debt_cents < 6000000, "balance reduced after 1st payment");
  assert.ok(m1.loan_repayment_cents > 0);
});

test("two separate loans amortize independently and sum repayments", () => {
  const mp = defaultMonthlyProjections();
  mp.funding_sources = [
    { id: "f1", kind: "founder_equity", label: "F", amount_cents: 1000000 },
    { id: "l1", kind: "loan", label: "SBA", amount_cents: 4000000, term_months: 60, annual_rate_pct: 6 },
    { id: "l2", kind: "loan", label: "Eq", amount_cents: 1000000, term_months: 24, annual_rate_pct: 9 },
  ];
  const slices = computeMonthlySlices(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  const m1 = slices[0];
  // Combined starting balance is approx 5M (less first month's principal)
  assert.ok(m1.long_term_debt_cents > 4500000 && m1.long_term_debt_cents < 5000000);
  // After 24 months the shorter loan should be fully amortized; the longer one is still outstanding
  const m24 = slices[23];
  assert.ok(m24.long_term_debt_cents > 0 && m24.long_term_debt_cents < 3000000);
  // After 60 months everything should be (nearly) paid off
  const m60 = slices[59];
  assert.ok(m60.long_term_debt_cents < 100000);
});

// ── TIM-1178: break-even cost model must count labor ─────────────────────────

const EQUIP = { total_cost_cents: 0, financed_cost_cents: 0 };

test("TIM-1178: break-even counts pct-mode labor as a variable cost", () => {
  const mp = defaultMonthlyProjections();
  const slices = computeMonthlySlices(mp, EQUIP, {}, {});
  const m1 = slices[0];

  const labor = mp.forecast_lines.find((l) => l.legacy_key === "labor");
  assert.equal(labor?.mode, "pct", "default labor line is pct-of-revenue");
  assert.ok(m1.labor_cents > 0, "labor has a nonzero month-1 amount");

  const model = computeBreakEvenModel(m1, mp.forecast_lines, mp.avg_ticket_cents);
  assert.ok(model, "model computed");

  // Labor belongs in the VARIABLE bucket: variablePct must be at least labor's
  // share of revenue (on top of COGS/processing/spoilage).
  const laborShare = m1.labor_cents / m1.net_revenue_cents;
  assert.ok(
    model.variablePct >= laborShare - 1e-9,
    `variablePct (${model.variablePct}) must include labor (${laborShare})`,
  );

  // Fixed costs must EXCLUDE labor: only flat overhead + interest + depreciation.
  const flatOverhead =
    m1.rent_cents + m1.insurance_cents + m1.tech_cents + m1.maintenance_cents +
    m1.supplies_cents + m1.utilities_cents + m1.other_opex_cents;
  assert.equal(
    model.fixedCostsCents,
    flatOverhead + m1.interest_cents + m1.depreciation_cents,
    "fixed costs must not include labor",
  );

  // Regression for the original bug: dropping labor entirely (its old behavior of
  // belonging to neither bucket) understates the break-even volume.
  const noLaborLines = mp.forecast_lines.filter((l) => l.legacy_key !== "labor");
  const noLaborSlices = computeMonthlySlices({ ...mp, forecast_lines: noLaborLines }, EQUIP, {}, {});
  const noLaborModel = computeBreakEvenModel(noLaborSlices[0], noLaborLines, mp.avg_ticket_cents);
  assert.ok(noLaborModel, "labor-free model computed");
  assert.ok(
    model.breakEvenTransactions > noLaborModel.breakEvenTransactions,
    `including labor must raise break-even volume (${model.breakEvenTransactions} > ${noLaborModel.breakEvenTransactions})`,
  );
});

test("TIM-1178: flat-mode labor is a fixed cost, not variable", () => {
  const mp = defaultMonthlyProjections();
  const pctSlices = computeMonthlySlices(mp, EQUIP, {}, {});
  const pctModel = computeBreakEvenModel(pctSlices[0], mp.forecast_lines, mp.avg_ticket_cents);

  // Pin the same month-1 labor dollars as a flat (salaried) line.
  const laborCents = pctSlices[0].labor_cents;
  const flatLines = mp.forecast_lines.map((l) =>
    l.legacy_key === "labor"
      ? { ...l, mode: "flat", value: laborCents, ramp: undefined, growth: undefined }
      : l,
  );
  const flatSlices = computeMonthlySlices({ ...mp, forecast_lines: flatLines }, EQUIP, {}, {});
  const flatModel = computeBreakEvenModel(flatSlices[0], flatLines, mp.avg_ticket_cents);

  assert.ok(flatModel.fixedCostsCents > pctModel.fixedCostsCents, "flat labor adds to fixed costs");
  assert.ok(flatModel.variablePct < pctModel.variablePct, "flat labor leaves the variable bucket");
});

test("TIM-1178: interest stays a fixed below-the-line cost (not double-counted)", () => {
  const mp = defaultMonthlyProjections();
  const slices = computeMonthlySlices(mp, EQUIP, {}, {});
  const m1 = slices[0];
  const model = computeBreakEvenModel(m1, mp.forecast_lines, mp.avg_ticket_cents);

  const flatOverhead =
    m1.rent_cents + m1.insurance_cents + m1.tech_cents + m1.maintenance_cents +
    m1.supplies_cents + m1.utilities_cents + m1.other_opex_cents;
  // interest_cents is added exactly once (via the dedicated field), even though
  // the interest line also appears in forecast_line_amounts.
  assert.equal(model.fixedCostsCents, flatOverhead + m1.interest_cents + m1.depreciation_cents);
});

test("TIM-1178: returns null when revenue or ticket is non-positive", () => {
  const mp = defaultMonthlyProjections();
  const slices = computeMonthlySlices(mp, EQUIP, {}, {});
  assert.equal(computeBreakEvenModel(undefined, mp.forecast_lines, mp.avg_ticket_cents), null);
  assert.equal(computeBreakEvenModel(slices[0], mp.forecast_lines, 0), null);
});
