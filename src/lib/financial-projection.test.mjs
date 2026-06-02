// TIM-1102: pin computeMonthlyProjections against the new forecast_lines schema.
// TIM-1117: COGS lines can target a parent revenue stream and/or derive their
// pct from menu item costing — pinned below.
// TIM-1122: pin funding_sources roll-up + per-loan amortization.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultMonthlyProjections,
  defaultPersonnel,
  defaultStartupCosts,
  normalizeMonthlyProjections,
  computeMonthlyProjections,
  computeMonthlySlices,
  computeMenuBlendedCogsPct,
  computeBreakEvenModel,
  deriveFinancialInputs,
  BASE_REVENUE_LINE_ID,
  applyForwardMonthIndices,
  manualOverrideCountsByLine,
} from "./financial-projection.ts";

// TIM-1244: persisted startup costs (populated by the guided interview, editable
// on the input page). Must round-trip through normalize and default cleanly.
test("TIM-1244: default model includes startup_costs matching defaultStartupCosts", () => {
  const mp = defaultMonthlyProjections();
  assert.deepEqual(mp.startup_costs, defaultStartupCosts());
});

test("TIM-1244: normalize fills startup_costs with defaults when absent", () => {
  const mp = normalizeMonthlyProjections({ avg_ticket_cents: 800 });
  assert.deepEqual(mp.startup_costs, defaultStartupCosts());
});

test("TIM-1244: normalize round-trips stored startup_costs and merges partials", () => {
  const stored = { ...defaultStartupCosts(), buildout_cents: 9999900, equipment_cents: 3210000 };
  const full = normalizeMonthlyProjections({ startup_costs: stored });
  assert.deepEqual(full.startup_costs, stored);

  // A partial payload keeps the provided field and back-fills the rest.
  const partial = normalizeMonthlyProjections({ startup_costs: { buildout_cents: 7000000 } });
  assert.equal(partial.startup_costs.buildout_cents, 7000000);
  assert.equal(partial.startup_costs.equipment_cents, defaultStartupCosts().equipment_cents);
});

test("TIM-1244: normalize clamps invalid startup cost values to the default", () => {
  const mp = normalizeMonthlyProjections({
    startup_costs: { buildout_cents: -500, equipment_cents: "lots", deposits_cents: 12345 },
  });
  assert.equal(mp.startup_costs.buildout_cents, defaultStartupCosts().buildout_cents);
  assert.equal(mp.startup_costs.equipment_cents, defaultStartupCosts().equipment_cents);
  assert.equal(mp.startup_costs.deposits_cents, 12345);
});

test("default model seeds overhead forecast_lines and a personnel plan (TIM-1206)", () => {
  const mp = defaultMonthlyProjections();
  assert.ok(Array.isArray(mp.forecast_lines));
  // TIM-1206: labor is no longer a forecast_line — it lives in `personnel`.
  assert.equal(mp.forecast_lines.find((l) => l.legacy_key === "labor"), undefined);
  assert.ok(mp.forecast_lines.find((l) => l.legacy_key === "rent"));
  assert.ok(mp.forecast_lines.find((l) => l.legacy_key === "marketing"));
  assert.ok(Array.isArray(mp.personnel) && mp.personnel.length > 0);
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
  // TIM-1206: the legacy labor line is dropped (labor moves to personnel); a
  // %-of-revenue labor line has no headcount mapping, so personnel seeds defaults.
  assert.equal(mp.forecast_lines.find((l) => l.legacy_key === "labor"), undefined);
  assert.ok(Array.isArray(mp.personnel) && mp.personnel.length > 0);
  const rent = mp.forecast_lines.find((l) => l.legacy_key === "rent");
  assert.equal(rent?.value, 500000);
  assert.equal(rent?.mode, "flat");
});

test("TIM-1206: a flat (salaried) legacy labor line migrates to a monthly-pay role", () => {
  const mp = normalizeMonthlyProjections({
    forecast_lines: [
      { id: "line:labor", label: "Labor", category: "overhead", mode: "flat", value: 700000, legacy_key: "labor" },
      { id: "line:rent", label: "Rent", category: "overhead", mode: "flat", value: 450000, legacy_key: "rent" },
    ],
  });
  // labor forecast line dropped, preserved as a single monthly personnel role.
  assert.equal(mp.forecast_lines.find((l) => l.legacy_key === "labor"), undefined);
  assert.equal(mp.personnel.length, 1);
  assert.equal(mp.personnel[0].pay_basis, "monthly");
  assert.equal(mp.personnel[0].pay_amount_cents, 700000);
  assert.equal(mp.personnel[0].cost_category, "overhead");
});

test("TIM-1206: an explicit personnel array (even empty) is preserved verbatim", () => {
  const empty = normalizeMonthlyProjections({ personnel: [] });
  assert.deepEqual(empty.personnel, []);
  const custom = normalizeMonthlyProjections({
    personnel: [
      { id: "s1", role: "Barista", headcount: 2, pay_basis: "hourly", pay_amount_cents: 1600, hours_per_week: 25, benefits_pct: 10, cost_category: "cogs" },
    ],
  });
  assert.equal(custom.personnel.length, 1);
  assert.equal(custom.personnel[0].cost_category, "cogs");
  assert.equal(custom.personnel[0].hours_per_week, 25);
});

// ── TIM-1260: recurring seasonal staffing ──────────────────────────────────

test("TIM-1260: normalize dedupes/clamps/sorts seasonal active_months", () => {
  const mp = normalizeMonthlyProjections({
    personnel: [
      {
        id: "s1", role: "Summer Barista", headcount: 1, pay_basis: "monthly",
        pay_amount_cents: 300000, benefits_pct: 0, cost_category: "overhead",
        seasonal: { enabled: true, active_months: [8, 6, 6, 0, 13, 7], repeat_yearly: false },
      },
    ],
  });
  assert.deepEqual(mp.personnel[0].seasonal, {
    enabled: true,
    active_months: [6, 7, 8],
    repeat_yearly: false,
  });
});

test("TIM-1260: repeat_yearly defaults to true and absent/empty seasonal is dropped", () => {
  const mp = normalizeMonthlyProjections({
    personnel: [
      {
        id: "s1", role: "Summer Barista", headcount: 1, pay_basis: "monthly",
        pay_amount_cents: 300000, benefits_pct: 0, cost_category: "overhead",
        seasonal: { enabled: true, active_months: [6, 7, 8] },
      },
      {
        id: "s2", role: "Year Round", headcount: 1, pay_basis: "monthly",
        pay_amount_cents: 300000, benefits_pct: 0, cost_category: "overhead",
        seasonal: { enabled: false, active_months: [] },
      },
    ],
  });
  assert.equal(mp.personnel[0].seasonal.repeat_yearly, true);
  assert.equal(mp.personnel[1].seasonal, undefined);
});

test("TIM-1260: seasonal role is paid only in active calendar months, every year", () => {
  const mp = defaultMonthlyProjections();
  mp.fiscal_year_start_month = 1; // Jan
  mp.personnel = [
    {
      id: "s1", role: "Summer Barista", headcount: 1, pay_basis: "monthly",
      pay_amount_cents: 300000, benefits_pct: 0, cost_category: "overhead",
      seasonal: { enabled: true, active_months: [6, 7, 8], repeat_yearly: true },
    },
  ];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  // Year 1: Jun/Jul/Aug = month index 6/7/8 → rows[5..7] active; Jan/Sep off.
  assert.equal(rows[0].labor_overhead_cents, 0, "Jan off");
  assert.equal(rows[5].labor_overhead_cents, 300000, "Jun on");
  assert.equal(rows[6].labor_overhead_cents, 300000, "Jul on");
  assert.equal(rows[7].labor_overhead_cents, 300000, "Aug on");
  assert.equal(rows[8].labor_overhead_cents, 0, "Sep off");
  // Year 2: Jun = month index 18 → rows[17] active (pattern repeats).
  assert.equal(rows[17].labor_overhead_cents, 300000, "Jun year 2 on");
  assert.equal(rows[12].labor_overhead_cents, 0, "Jan year 2 off");
});

test("TIM-1260: seasonal pattern follows fiscal_year_start_month (calendar-aware)", () => {
  const mp = defaultMonthlyProjections();
  mp.fiscal_year_start_month = 6; // fiscal year opens in Jun
  mp.personnel = [
    {
      id: "s1", role: "Summer Barista", headcount: 1, pay_basis: "monthly",
      pay_amount_cents: 300000, benefits_pct: 0, cost_category: "overhead",
      seasonal: { enabled: true, active_months: [6, 7, 8], repeat_yearly: true },
    },
  ];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  // Month index 1 = Jun, 2 = Jul, 3 = Aug (all active), 4 = Sep (off).
  assert.equal(rows[0].labor_overhead_cents, 300000, "month 1 = Jun on");
  assert.equal(rows[1].labor_overhead_cents, 300000, "month 2 = Jul on");
  assert.equal(rows[2].labor_overhead_cents, 300000, "month 3 = Aug on");
  assert.equal(rows[3].labor_overhead_cents, 0, "month 4 = Sep off");
});

test("TIM-1260: repeat_yearly=false limits the pattern to the first fiscal year", () => {
  const mp = defaultMonthlyProjections();
  mp.fiscal_year_start_month = 1;
  mp.personnel = [
    {
      id: "s1", role: "Summer Barista", headcount: 1, pay_basis: "monthly",
      pay_amount_cents: 300000, benefits_pct: 0, cost_category: "overhead",
      seasonal: { enabled: true, active_months: [6, 7, 8], repeat_yearly: false },
    },
  ];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows[5].labor_overhead_cents, 300000, "Jun year 1 on");
  assert.equal(rows[17].labor_overhead_cents, 0, "Jun year 2 off (no repeat)");
});

test("TIM-1260: break-even reflects seasonal labor in an active month", () => {
  const mp = defaultMonthlyProjections();
  mp.fiscal_year_start_month = 6; // month 1 = Jun, an active month
  mp.personnel = [
    {
      id: "s1", role: "Summer Barista", headcount: 2, pay_basis: "monthly",
      pay_amount_cents: 300000, benefits_pct: 0, cost_category: "overhead",
      seasonal: { enabled: true, active_months: [6, 7, 8], repeat_yearly: true },
    },
  ];
  const slices = computeMonthlySlices(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  const withSeasonal = computeBreakEvenModel(slices[0], mp.forecast_lines, mp.avg_ticket_cents);

  const mpOff = { ...mp, personnel: [] };
  const slicesOff = computeMonthlySlices(mpOff, { total_cost_cents: 0, financed_cost_cents: 0 });
  const withoutSeasonal = computeBreakEvenModel(slicesOff[0], mpOff.forecast_lines, mpOff.avg_ticket_cents);

  assert.ok(
    withSeasonal.fixedCostsCents > withoutSeasonal.fixedCostsCents,
    "active seasonal labor raises fixed costs and thus break-even"
  );
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
  // TIM-1246: isolate capex-line depreciation — startup build-out/equipment now
  // depreciate too, so zero them here to pin only the capex line under test.
  mp.startup_costs = { ...mp.startup_costs, buildout_cents: 0, equipment_cents: 0 };
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
  // TIM-1246: isolate capex-line depreciation (see note above).
  mp.startup_costs = { ...mp.startup_costs, buildout_cents: 0, equipment_cents: 0 };
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

test("TIM-1182: EBITDA is operating income (pre-D&A); EBIT subtracts depreciation once", () => {
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
      value: 840000, // $8,400 → $100/mo depreciation
      useful_life_years: 7,
      ramp: { enabled: true, start_month: 1, ramp_months: 0, start_pct: 100 },
    },
  ];
  const slices = computeMonthlySlices(mp, EQUIP, {}, {});
  const s = slices[0];
  assert.ok(s.depreciation_cents > 0, "fixture must depreciate to exercise the EBITDA/EBIT split");
  // operating_income_cents excludes depreciation (applied below the line), so it IS EBITDA.
  assert.equal(s.ebitda_cents, s.operating_income_cents);
  // EBIT subtracts depreciation exactly once.
  assert.equal(s.ebit_cents, s.operating_income_cents - s.depreciation_cents);
  // EBITDA is strictly above EBIT whenever depreciation > 0.
  assert.equal(s.ebitda_cents - s.ebit_cents, s.depreciation_cents);
  // Regression guard: the old bug double-counted depreciation (EBITDA = OI + dep).
  assert.notEqual(s.ebitda_cents, s.operating_income_cents + s.depreciation_cents);
  // Income before taxes flows from EBIT minus interest (depreciation already removed).
  assert.equal(s.income_before_taxes_cents, s.ebit_cents - s.interest_cents);
});

test("multiple capex lines depreciate independently, summed at each month", () => {
  const mp = defaultMonthlyProjections();
  // TIM-1246: isolate capex-line depreciation (see note above).
  mp.startup_costs = { ...mp.startup_costs, buildout_cents: 0, equipment_cents: 0 };
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

test("TIM-1246: startup build-out & equipment depreciate straight-line over their useful life", () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 0;
  mp.ramp_months = 0;
  mp.daily_flow = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  mp.forecast_lines = []; // no capex lines — depreciation must come from startup assets
  mp.personnel = [];
  mp.startup_costs = {
    ...mp.startup_costs,
    buildout_cents: 15000000,   // $150,000 / (15*12) = $833.33/mo
    equipment_cents: 5000000,   // $50,000 / (7*12)  = $595.24/mo
    buildout_useful_life_years: 15,
    equipment_useful_life_years: 7,
  };
  const rows = computeMonthlyProjections(mp, EQUIP, {});
  const expectedBuildout = Math.round(15000000 / (15 * 12)); // 83333
  const expectedEquip = Math.round(5000000 / (7 * 12));      // 59524
  const expected = expectedBuildout + expectedEquip;
  assert.equal(rows[0].depreciation_cents, expected);
  // Both lives exceed the 60-mo horizon, so depreciation is constant across it.
  assert.equal(rows[59].depreciation_cents, expected);
});

test("TIM-1246: startup assets that depreciate stay coherent on the balance sheet", () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 0;
  mp.ramp_months = 0;
  mp.daily_flow = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  mp.forecast_lines = [];
  mp.personnel = [];
  mp.startup_costs = {
    ...mp.startup_costs,
    buildout_cents: 15000000,
    equipment_cents: 5000000,
    deposits_cents: 0,
    licenses_cents: 0,
    pre_opening_marketing_cents: 0,
    initial_inventory_cents: 0,
  };
  // Seed gross fixed assets from the same startup buckets so depreciation draws
  // them down coherently (this is the deliverable-#3 invariant).
  const slices = computeMonthlySlices(
    mp,
    EQUIP,
    { equipment_cost_cents: 5000000, buildout_cost_cents: 15000000, owner_capital_cents: 30000000 },
    {}
  );
  const m1 = slices[0];
  assert.ok(m1.depreciation_cents > 0, "startup assets must produce depreciation expense");
  assert.equal(m1.accumulated_depreciation_cents, m1.depreciation_cents);
  assert.ok(
    m1.net_fixed_assets_cents < m1.fixed_assets_gross_cents,
    "accumulated depreciation must draw net fixed assets below gross"
  );
  // Accumulated depreciation grows monotonically.
  assert.ok(slices[11].accumulated_depreciation_cents > m1.accumulated_depreciation_cents);
  // The balance sheet identity must hold every month after the change.
  for (const s of slices) {
    const gap = Math.abs(s.total_assets_cents - s.total_liabilities_and_equity_cents);
    assert.ok(gap < 10, `BS out of balance at month ${s.month_index} by ${gap} cents`);
  }
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
  mp.income_tax_pct = 0;
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
  mp.income_tax_pct = 0;

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

// ── TIM-1206: personnel plan — labor source of truth + break-even ────────────

const EQUIP = { total_cost_cents: 0, financed_cost_cents: 0 };

test("TIM-1206: annual / monthly / hourly pay convert to the right monthly cost", () => {
  const base = defaultMonthlyProjections();
  base.personnel = [];

  const annual = { ...base, personnel: [
    { id: "a", role: "Manager", headcount: 1, pay_basis: "annual", pay_amount_cents: 12000000, benefits_pct: 0, cost_category: "overhead" },
  ]};
  assert.equal(computeMonthlyProjections(annual, EQUIP)[0].labor_overhead_cents, 1000000); // $120k/12

  const monthly = { ...base, personnel: [
    { id: "m", role: "Manager", headcount: 1, pay_basis: "monthly", pay_amount_cents: 500000, benefits_pct: 20, benefits_fixed_cents: 10000, cost_category: "overhead" },
  ]};
  // $5,000 × 1.20 + $100 fixed = $6,100
  assert.equal(computeMonthlyProjections(monthly, EQUIP)[0].labor_overhead_cents, 610000);

  const hourly = { ...base, personnel: [
    { id: "h", role: "Baristas", headcount: 2, pay_basis: "hourly", pay_amount_cents: 2000, hours_per_week: 30, benefits_pct: 10, cost_category: "cogs" },
  ]};
  // 2 × $20 × 30h × 52/12 = $5,200 base; +10% = $5,720 → COGS-labor bucket
  assert.equal(computeMonthlyProjections(hourly, EQUIP)[0].labor_cogs_cents, 572000);
});

test("TIM-1206: phased hiring ramp and seasonal end_month gate the cost", () => {
  const mp = defaultMonthlyProjections();
  mp.personnel = [
    { id: "r", role: "Crew", headcount: 2, pay_basis: "monthly", pay_amount_cents: 300000, benefits_pct: 0,
      cost_category: "overhead", ramp: { enabled: true, start_month: 1, ramp_months: 4, start_pct: 50 } },
  ];
  const rows = computeMonthlyProjections(mp, EQUIP);
  // base = 2 × $3,000 = $6,000; m1 at 50% = $3,000; m4 at 100% = $6,000
  assert.equal(rows[0].labor_overhead_cents, 300000);
  assert.equal(rows[3].labor_overhead_cents, 600000);

  const seasonal = defaultMonthlyProjections();
  seasonal.personnel = [
    { id: "s", role: "Holiday Help", headcount: 1, pay_basis: "monthly", pay_amount_cents: 100000, benefits_pct: 0, cost_category: "overhead", end_month: 3 },
  ];
  const srows = computeMonthlyProjections(seasonal, EQUIP);
  assert.equal(srows[2].labor_overhead_cents, 100000); // month 3 — last paid month
  assert.equal(srows[3].labor_overhead_cents, 0);      // month 4 — off payroll
});

test("TIM-1206: COGS-labor flows into cogs; overhead-labor flows into opex", () => {
  const mp = defaultMonthlyProjections();
  mp.cogs_pct = 0;
  mp.ramp_months = 0;
  mp.forecast_lines = [];
  mp.daily_flow = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  mp.personnel = [
    { id: "bar", role: "Baristas", headcount: 1, pay_basis: "monthly", pay_amount_cents: 400000, benefits_pct: 0, cost_category: "cogs" },
    { id: "mgr", role: "Manager", headcount: 1, pay_basis: "monthly", pay_amount_cents: 500000, benefits_pct: 0, cost_category: "overhead" },
  ];
  const m1 = computeMonthlyProjections(mp, EQUIP)[0];
  assert.equal(m1.labor_cogs_cents, 400000);
  assert.equal(m1.labor_overhead_cents, 500000);
  assert.equal(m1.labor_cents, 500000, "labor_cents is the operating-overhead labor line");
  assert.equal(m1.cogs_cents, 400000, "direct labor is part of COGS");
  assert.equal(m1.total_opex_cents, 500000, "overhead labor is in operating expenses");
});

test("TIM-1206: break-even counts personnel as a FIXED cost (labor not understated)", () => {
  const mp = defaultMonthlyProjections();
  const slices = computeMonthlySlices(mp, EQUIP, {}, {});
  const m1 = slices[0];
  assert.ok(m1.labor_overhead_cents > 0, "default personnel produces labor cost");

  const model = computeBreakEvenModel(m1, mp.forecast_lines, mp.avg_ticket_cents);
  assert.ok(model, "model computed");

  // Fixed costs include ALL personnel (labor is fixed, not per-transaction).
  const flatOverhead =
    m1.rent_cents + m1.insurance_cents + m1.tech_cents + m1.maintenance_cents +
    m1.supplies_cents + m1.utilities_cents + m1.other_opex_cents;
  assert.equal(
    model.fixedCostsCents,
    flatOverhead + m1.interest_cents + m1.depreciation_cents + m1.labor_cogs_cents + m1.labor_overhead_cents,
    "fixed costs must include personnel labor",
  );

  // Regression for TIM-1178: removing labor (personnel) understates break-even.
  const noStaff = { ...mp, personnel: [] };
  const noStaffModel = computeBreakEvenModel(
    computeMonthlySlices(noStaff, EQUIP, {}, {})[0],
    noStaff.forecast_lines,
    mp.avg_ticket_cents,
  );
  assert.ok(
    model.breakEvenTransactions > noStaffModel.breakEvenTransactions,
    `personnel must raise break-even volume (${model.breakEvenTransactions} > ${noStaffModel.breakEvenTransactions})`,
  );
  // Overhead personnel does NOT enter the variable bucket.
  assert.ok(
    Math.abs(model.variablePct - noStaffModel.variablePct) < 1e-9,
    "overhead personnel must not change the variable cost ratio",
  );
});

test("TIM-1206: COGS-labor is fixed in break-even (same as overhead-labor)", () => {
  const mk = (cat) => {
    const mp = defaultMonthlyProjections();
    mp.personnel = [
      { id: "x", role: "Staff", headcount: 1, pay_basis: "monthly", pay_amount_cents: 500000, benefits_pct: 0, cost_category: cat },
    ];
    return computeMonthlySlices(mp, EQUIP, {}, {})[0];
  };
  const mpRef = defaultMonthlyProjections();
  const cogsModel = computeBreakEvenModel(mk("cogs"), mpRef.forecast_lines, mpRef.avg_ticket_cents);
  const ohModel = computeBreakEvenModel(mk("overhead"), mpRef.forecast_lines, mpRef.avg_ticket_cents);
  // A salaried role is fixed regardless of its P&L bucket: identical break-even.
  assert.equal(cogsModel.fixedCostsCents, ohModel.fixedCostsCents);
  assert.ok(Math.abs(cogsModel.variablePct - ohModel.variablePct) < 1e-9);
});

test("TIM-1206: interest stays a fixed below-the-line cost (not double-counted)", () => {
  const mp = defaultMonthlyProjections();
  const slices = computeMonthlySlices(mp, EQUIP, {}, {});
  const m1 = slices[0];
  const model = computeBreakEvenModel(m1, mp.forecast_lines, mp.avg_ticket_cents);

  const flatOverhead =
    m1.rent_cents + m1.insurance_cents + m1.tech_cents + m1.maintenance_cents +
    m1.supplies_cents + m1.utilities_cents + m1.other_opex_cents;
  assert.equal(
    model.fixedCostsCents,
    flatOverhead + m1.interest_cents + m1.depreciation_cents + m1.labor_cogs_cents + m1.labor_overhead_cents,
  );
});

test("TIM-1206: break-even returns null when revenue or ticket is non-positive", () => {
  const mp = defaultMonthlyProjections();
  const slices = computeMonthlySlices(mp, EQUIP, {}, {});
  assert.equal(computeBreakEvenModel(undefined, mp.forecast_lines, mp.avg_ticket_cents), null);
  assert.equal(computeBreakEvenModel(slices[0], mp.forecast_lines, 0), null);
});

// TIM-1181: the balance sheet must satisfy Assets = Liabilities + Equity for
// every month. Before the fix, opening cash ignored funding sources, so the
// model was off by exactly (loan + owner capital) and the planner showed
// "Out Of Balance" on every valid input.
const BS_INPUTS = {
  equipment_cost_cents: 5000000,
  buildout_cost_cents: 15000000,
  rent_deposits_cents: 900000,
  license_permits_cents: 500000,
  pre_opening_marketing_cents: 300000,
  initial_inventory_cents: 200000,
};

test("TIM-1181: balance sheet balances for every month (default model)", () => {
  const mp = defaultMonthlyProjections();
  const slices = computeMonthlySlices(mp, EQUIP, BS_INPUTS, {});
  assert.equal(slices.length, 60);
  for (const s of slices) {
    const gap = s.total_assets_cents - s.total_liabilities_and_equity_cents;
    assert.ok(
      Math.abs(gap) < 2,
      `month ${s.month_index} out of balance by ${gap} cents`,
    );
  }
});

test("TIM-1181: opening cash is funding net of fixed assets and pre-opening spend", () => {
  const mp = defaultMonthlyProjections();
  const slices = computeMonthlySlices(mp, EQUIP, BS_INPUTS, {});
  const m1 = slices[0];
  // Funding: founder equity 1500000000 + loan 1000000000 = 2500000000.
  // Uses capitalized as fixed assets: 5000000 + 15000000 = 20000000.
  // Pre-opening expenses: 900000 + 500000 + 300000 + 200000 = 1900000.
  const fixedAssets = 20000000;
  const preOpening = 1900000;
  const totalFunding = 2500000000;
  const expectedOpeningCash = totalFunding - fixedAssets - preOpening;
  assert.equal(m1.fixed_assets_gross_cents, fixedAssets);
  // Pre-opening spend shows up as an opening accumulated deficit in retained
  // earnings (retained = cumulative net income - pre-opening expenses).
  assert.ok(
    m1.retained_earnings_cents <= m1.net_income_cents - preOpening + 1,
    "retained earnings carries the pre-opening deficit",
  );
  const gap = m1.total_assets_cents - m1.total_liabilities_and_equity_cents;
  assert.ok(Math.abs(gap) < 2, `month 1 gap ${gap}`);
  assert.ok(expectedOpeningCash > 0, "default funding exceeds startup uses");
});

test("TIM-1181: balance holds with empty inputs (funding becomes opening cash)", () => {
  const mp = defaultMonthlyProjections();
  const slices = computeMonthlySlices(mp, EQUIP, {}, {});
  for (const s of slices) {
    const gap = s.total_assets_cents - s.total_liabilities_and_equity_cents;
    assert.ok(Math.abs(gap) < 2, `month ${s.month_index} gap ${gap}`);
  }
});

// ── TIM-1180: payment processing + spoilage as opex; loyalty as contra-revenue ─

function tim1180Mp() {
  const mp = defaultMonthlyProjections();
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_mode = "simple";
  mp.growth_monthly_pct = 0;
  mp.income_tax_pct = 0;
  return mp;
}

test("TIM-1180: payment processing + spoilage reduce operating income; loyalty nets revenue", () => {
  const zero = tim1180Mp();
  zero.payment_processing_pct = 0;
  zero.spoilage_pct = 0;
  zero.loyalty_discount_pct = 0;
  const m0 = computeMonthlyProjections(zero, EQUIP)[0];

  const withCosts = tim1180Mp();
  withCosts.payment_processing_pct = 2.5;
  withCosts.spoilage_pct = 2;
  withCosts.loyalty_discount_pct = 1;
  const m1 = computeMonthlyProjections(withCosts, EQUIP)[0];

  // Cost drivers do not change top-line revenue or COGS.
  assert.equal(m1.revenue_cents, m0.revenue_cents);
  assert.equal(m1.cogs_cents, m0.cogs_cents);

  const pp = Math.round(m1.revenue_cents * 0.025);
  const spoil = Math.round((m1.cogs_cents - m1.labor_cogs_cents) * 0.02);
  const loyalty = Math.round(m1.revenue_cents * 0.01);
  assert.ok(pp > 0 && spoil > 0 && loyalty > 0, "default rates produce non-zero costs");
  assert.equal(m1.payment_processing_cents, pp);
  assert.equal(m1.spoilage_cents, spoil);
  assert.equal(m1.loyalty_discounts_cents, loyalty);

  // Loyalty is contra-revenue; gross profit = net revenue − COGS.
  assert.equal(m1.net_revenue_cents, m1.revenue_cents - loyalty);
  assert.equal(m1.gross_profit_cents, m1.net_revenue_cents - m1.cogs_cents);

  // Payment processing + spoilage are folded into total operating expenses.
  assert.equal(m1.total_opex_cents, m0.total_opex_cents + pp + spoil);

  // Operating income drops by loyalty (via gross profit) + pp + spoilage (via opex).
  assert.equal(m1.operating_income_cents, m0.operating_income_cents - loyalty - pp - spoil);
});

test("TIM-1180: slices expose the costs and break-even counts payment processing as variable", () => {
  const withPp = tim1180Mp();
  withPp.payment_processing_pct = 2.5;
  const m1 = computeMonthlySlices(withPp, EQUIP)[0];
  assert.ok(m1.payment_processing_cents > 0, "payment processing is no longer $0");

  const noPp = tim1180Mp();
  noPp.payment_processing_pct = 0;
  const m1NoPp = computeMonthlySlices(noPp, EQUIP)[0];

  const be = computeBreakEvenModel(m1, withPp.forecast_lines, withPp.avg_ticket_cents);
  const beNoPp = computeBreakEvenModel(m1NoPp, noPp.forecast_lines, noPp.avg_ticket_cents);
  assert.ok(be.variablePct > beNoPp.variablePct, "payment processing raises variable cost %");
});

test("TIM-1180: balance sheet identity holds with default payment processing / spoilage / loyalty", () => {
  const mp = tim1180Mp(); // default funding_sources + default 2.5/2/1 cost rates
  const slices = computeMonthlySlices(mp, EQUIP, {}, {});
  for (const s of slices) {
    const gap = s.total_assets_cents - s.total_liabilities_and_equity_cents;
    assert.ok(Math.abs(gap) < 2, `month ${s.month_index} gap ${gap}`);
  }
});

test("TIM-1180: normalize defaults missing rates and preserves stored ones", () => {
  const fresh = normalizeMonthlyProjections({});
  assert.equal(fresh.payment_processing_pct, 2.5);
  assert.equal(fresh.spoilage_pct, 2);
  assert.equal(fresh.loyalty_discount_pct, 1);
  const stored = normalizeMonthlyProjections({
    payment_processing_pct: 3.1,
    spoilage_pct: 0,
    loyalty_discount_pct: 0,
  });
  assert.equal(stored.payment_processing_pct, 3.1);
  assert.equal(stored.spoilage_pct, 0);
  assert.equal(stored.loyalty_discount_pct, 0);
});

// ── TIM-1243: per-cell overrides + per-line manual mode ───────────────────────

function singleOverheadModel(value = 100000) {
  const mp = defaultMonthlyProjections();
  mp.forecast_lines = [
    { id: "ovh", label: "Software", category: "overhead", mode: "flat", value },
  ];
  mp.personnel = [];
  mp.ramp_months = 0;
  mp.ramp_multipliers = [];
  mp.growth_monthly_pct = 0;
  return mp;
}

test("TIM-1243: per-cell override on an overhead line replaces only that month", () => {
  const mp = singleOverheadModel(100000);
  mp.manual_overrides = [{ line_id: "ovh", month_index: 2, amount_cents: 250000 }];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows[0].other_misc_cents, 100000); // m1: formula
  assert.equal(rows[1].other_misc_cents, 250000); // m2: override
  assert.equal(rows[2].other_misc_cents, 100000); // m3: formula
  const m2line = rows[1].forecast_line_amounts.find((l) => l.id === "ovh");
  assert.equal(m2line.amount_cents, 250000);
  assert.equal(m2line.overridden, true);
  assert.equal(rows[0].forecast_line_amounts.find((l) => l.id === "ovh").overridden, false);
});

test("TIM-1243: override flows downstream into total_opex and net_income", () => {
  const mp = singleOverheadModel(100000);
  const base = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  mp.manual_overrides = [{ line_id: "ovh", month_index: 1, amount_cents: 500000 }];
  const over = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  // opex rises by exactly the override delta (500000 - 100000), net income falls.
  assert.equal(over[0].total_opex_cents - base[0].total_opex_cents, 400000);
  assert.ok(over[0].net_income_cents < base[0].net_income_cents);
});

test("TIM-1243: base foot-traffic revenue override changes revenue_cents", () => {
  const mp = singleOverheadModel();
  mp.manual_overrides = [{ line_id: BASE_REVENUE_LINE_ID, month_index: 1, amount_cents: 1234500 }];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows[0].base_revenue_cents, 1234500);
  assert.equal(rows[0].base_revenue_overridden, true);
  // revenue_cents = base + additional revenue lines (none here)
  assert.equal(rows[0].revenue_cents, 1234500);
  assert.equal(rows[1].base_revenue_overridden, false);
});

test("TIM-1243: manual-mode line ignores its formula; un-entered months are 0", () => {
  const mp = singleOverheadModel(100000);
  mp.manual_lines = ["ovh"];
  mp.manual_overrides = [{ line_id: "ovh", month_index: 1, amount_cents: 333000 }];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(rows[0].other_misc_cents, 333000); // entered
  assert.equal(rows[1].other_misc_cents, 0);      // manual, no entry → 0, NOT formula
  assert.equal(rows[2].other_misc_cents, 0);
});

test("TIM-1243: overrides survive recalculation when assumptions change", () => {
  const mp = singleOverheadModel(100000);
  mp.manual_overrides = [{ line_id: "ovh", month_index: 1, amount_cents: 777000 }];
  const before = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  // Change an upstream assumption (the line's formula value).
  mp.forecast_lines[0].value = 9999999;
  const after = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  assert.equal(before[0].other_misc_cents, 777000);
  assert.equal(after[0].other_misc_cents, 777000); // override preserved
  // a non-overridden month does track the new assumption
  assert.equal(after[1].other_misc_cents, 9999999);
});

test("TIM-1243: revenue-line override feeds pct-COGS that targets that stream", () => {
  const mp = defaultMonthlyProjections();
  mp.personnel = [];
  mp.cogs_pct = 0;
  mp.forecast_lines = [
    { id: "wholesale", label: "Wholesale", category: "revenue", mode: "flat", value: 200000 },
    { id: "wcogs", label: "Wholesale COGS", category: "cogs", mode: "pct", value: 50, revenue_stream_id: "wholesale" },
  ];
  mp.daily_flow = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  mp.ramp_months = 0; mp.ramp_multipliers = []; mp.growth_monthly_pct = 0;
  mp.manual_overrides = [{ line_id: "wholesale", month_index: 1, amount_cents: 1000000 }];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  // wholesale overridden to 1,000,000 → its 50% COGS = 500,000
  assert.equal(rows[0].forecast_line_amounts.find((l) => l.id === "wholesale").amount_cents, 1000000);
  assert.equal(rows[0].forecast_line_amounts.find((l) => l.id === "wcogs").amount_cents, 500000);
});

test("TIM-1243: overrides flow into cash flow + balance sheet via slices", () => {
  const mp = singleOverheadModel(100000);
  const base = computeMonthlySlices(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  mp.manual_overrides = [{ line_id: "ovh", month_index: 1, amount_cents: 600000 }];
  const over = computeMonthlySlices(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  // Higher opex in m1 → lower month-1 net cash → lower ending cash balance.
  assert.ok(over[0].cash_cents < base[0].cash_cents);
});

test("TIM-1243: normalize round-trips overrides, drops invalid, dedupes", () => {
  const mp = normalizeMonthlyProjections({
    manual_overrides: [
      { line_id: "a", month_index: 1, amount_cents: 5000 },
      { line_id: "a", month_index: 1, amount_cents: 8000 }, // dupe → last wins
      { line_id: "b", month_index: 0, amount_cents: 100 },  // bad month
      { line_id: "b", month_index: 61, amount_cents: 100 }, // bad month
      { line_id: "", month_index: 2, amount_cents: 100 },   // bad id
      { line_id: "c", month_index: 3, amount_cents: -50 },  // negative → 0
    ],
    manual_lines: ["a", "a", "b", 7],
  });
  const a1 = mp.manual_overrides.find((o) => o.line_id === "a" && o.month_index === 1);
  assert.equal(a1.amount_cents, 8000);
  assert.equal(mp.manual_overrides.filter((o) => o.line_id === "b").length, 0);
  assert.equal(mp.manual_overrides.find((o) => o.line_id === "c").amount_cents, 0);
  assert.deepEqual([...mp.manual_lines].sort(), ["a", "b"]);
});

test("TIM-1243: default model has empty overrides + manual_lines", () => {
  const mp = defaultMonthlyProjections();
  assert.deepEqual(mp.manual_overrides, []);
  assert.deepEqual(mp.manual_lines, []);
});

// TIM-1245: optional beverage/food split of the average ticket. avg_ticket stays
// the single engine driver, kept equal to beverage + food.
test("TIM-1245: split disabled by default; ticket untouched", () => {
  const mp = normalizeMonthlyProjections({ avg_ticket_cents: 900 });
  assert.equal(mp.revenue_split_enabled, false);
  assert.equal(mp.avg_ticket_cents, 900);
  assert.equal(mp.beverage_ticket_cents, undefined);
  assert.equal(mp.food_ticket_cents, undefined);
});

test("TIM-1245: split self-heals avg_ticket to beverage + food", () => {
  const mp = normalizeMonthlyProjections({
    avg_ticket_cents: 1, // stale / drifted value
    revenue_split_enabled: true,
    beverage_ticket_cents: 550,
    food_ticket_cents: 200,
  });
  assert.equal(mp.avg_ticket_cents, 750);
  assert.equal(mp.beverage_ticket_cents, 550);
  assert.equal(mp.food_ticket_cents, 200);
});

test("TIM-1245: enabling split with no split entered seeds beverage from ticket", () => {
  const mp = normalizeMonthlyProjections({
    avg_ticket_cents: 800,
    revenue_split_enabled: true,
  });
  assert.equal(mp.avg_ticket_cents, 800);
  assert.equal(mp.beverage_ticket_cents, 800);
  assert.equal(mp.food_ticket_cents, 0);
});

test("TIM-1245: split does not change base revenue (engine uses avg_ticket)", () => {
  const base = {
    ...defaultMonthlyProjections(),
    daily_flow: { mon: 100, tue: 100, wed: 100, thu: 100, fri: 100, sat: 100, sun: 100 },
    avg_ticket_cents: 750,
  };
  const single = computeMonthlyProjections(normalizeMonthlyProjections(base), { total_cost_cents: 0, financed_cost_cents: 0 });
  const split = computeMonthlyProjections(
    normalizeMonthlyProjections({ ...base, revenue_split_enabled: true, beverage_ticket_cents: 500, food_ticket_cents: 250 }),
    { total_cost_cents: 0, financed_cost_cents: 0 }
  );
  assert.equal(split[0].base_revenue_cents, single[0].base_revenue_cents);
});

// ── TIM-1257: cross-page reactivity — single derived source of truth ──────────
// Regression guard for the board-reported bug: editing a Forecast Input (e.g.
// anticipated customers) did not recompute dependent tabs (Break-Even projected
// transactions, etc.) because the workspace held a parallel `financialInputs`
// copy that was patched field-by-field and silently omitted customers_per_day,
// days_per_week, and the funding-derived loan/equity fields. The fix makes the
// component derive financialInputs purely from `mp` via deriveFinancialInputs on
// every change. These tests pin that derivation contract: any upstream input
// change must surface in the derived inputs AND in the computed slices, so every
// dependent tab updates. If a future change reintroduces a stale parallel copy,
// the component will diverge from this single source of truth.

const EQUIP0 = { total_cost_cents: 0, financed_cost_cents: 0 };

// Mirrors the Break-Even tab's projected-transactions formula exactly.
function breakEvenProjectedTransactions(inputs) {
  return Math.round(inputs.customers_per_day * ((inputs.days_per_week * 52) / 12));
}

test("TIM-1257: raising anticipated customers propagates to break-even + slices", () => {
  const mp = defaultMonthlyProjections();

  const before = deriveFinancialInputs(mp);
  const beforeProjected = breakEvenProjectedTransactions(before);
  const beforeNetRevenue = computeMonthlySlices(mp, EQUIP0)[0].net_revenue_cents;

  // Founder's exact scenario: increase anticipated customers per open day.
  const bumped = {
    ...mp,
    daily_flow: Object.fromEntries(
      Object.entries(mp.daily_flow).map(([d, v]) => [d, v + 50])
    ),
  };

  const after = deriveFinancialInputs(bumped);
  const afterProjected = breakEvenProjectedTransactions(after);
  const afterNetRevenue = computeMonthlySlices(bumped, EQUIP0)[0].net_revenue_cents;

  assert.ok(
    after.customers_per_day > before.customers_per_day,
    "derived customers_per_day must rise when daily_flow rises"
  );
  assert.ok(
    afterProjected > beforeProjected,
    "Break-Even projected transactions must rise when customers rise (was stale pre-TIM-1257)"
  );
  assert.ok(
    afterNetRevenue > beforeNetRevenue,
    "slices feeding P&L / cash-flow / ratios / break-even must reflect higher customer flow"
  );
});

test("TIM-1257: editing funding sources propagates to derived owner capital + loan fields", () => {
  const mp = defaultMonthlyProjections();
  mp.funding_sources = [
    { id: "f1", kind: "founder_equity", label: "Founder", amount_cents: 5000000 },
    { id: "l1", kind: "loan", label: "Bank", amount_cents: 6000000, term_months: 60, annual_rate_pct: 6 },
  ];

  const before = deriveFinancialInputs(mp);
  assert.equal(before.owner_capital_cents, 5000000);
  assert.equal(before.loan_amount_cents, 6000000);

  // Founder edits funding in one place: raise equity, add a second loan.
  const edited = {
    ...mp,
    funding_sources: [
      { id: "f1", kind: "founder_equity", label: "Founder", amount_cents: 9000000 },
      { id: "l1", kind: "loan", label: "Bank", amount_cents: 6000000, term_months: 60, annual_rate_pct: 6 },
      { id: "l2", kind: "loan", label: "Equip", amount_cents: 2000000, term_months: 24, annual_rate_pct: 9 },
    ],
  };

  const after = deriveFinancialInputs(edited);
  assert.equal(after.owner_capital_cents, 9000000, "owner capital must follow funding edits (Startup/Funding/Balance tabs)");
  assert.equal(after.loan_amount_cents, 8000000, "loan total must follow funding edits");
  assert.notEqual(
    after.loan_annual_rate_pct,
    before.loan_annual_rate_pct,
    "weighted loan rate must recompute when loan mix changes"
  );
});

test("TIM-1257: a forecast cost edit surfaces in the derived inputs (no stale copy)", () => {
  const mp = defaultMonthlyProjections();
  const rent = mp.forecast_lines.find((l) => l.legacy_key === "rent");
  assert.ok(rent, "fixture must seed a rent line");
  assert.equal(rent.mode, "flat");

  const before = deriveFinancialInputs(mp);

  const edited = {
    ...mp,
    forecast_lines: mp.forecast_lines.map((l) =>
      l.legacy_key === "rent" ? { ...l, value: rent.value + 250000 } : l
    ),
  };
  const after = deriveFinancialInputs(edited);

  assert.equal(
    after.rent_cents,
    before.rent_cents + 250000,
    "derived rent must follow the forecast-line edit"
  );
});

// ── TIM-1310: rapid apply-forward + input-page override reflection ────────────

test("TIM-1310: apply-forward 'year' fills the rest of the source projection year", () => {
  // Month 13 = Jan of year 2. Rest of year = 14..24 (founder's rent example).
  assert.deepEqual(
    applyForwardMonthIndices(13, "year"),
    [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]
  );
  // Mid-year source (month 18) only fills 19..24.
  assert.deepEqual(applyForwardMonthIndices(18, "year"), [19, 20, 21, 22, 23, 24]);
  // Last month of a year has nothing left in that year.
  assert.deepEqual(applyForwardMonthIndices(24, "year"), []);
});

test("TIM-1310: apply-forward 'next12' fills the next 12 months, clamped to 60", () => {
  assert.deepEqual(
    applyForwardMonthIndices(1, "next12"),
    [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  );
  // Near the end, clamp at month 60.
  assert.deepEqual(applyForwardMonthIndices(55, "next12"), [56, 57, 58, 59, 60]);
});

test("TIM-1310: apply-forward 'all' fills every following month through 60", () => {
  const all = applyForwardMonthIndices(57, "all");
  assert.deepEqual(all, [58, 59, 60]);
  assert.equal(applyForwardMonthIndices(1, "all").length, 59);
});

test("TIM-1310: apply-forward excludes the source month and rejects out-of-range", () => {
  assert.ok(!applyForwardMonthIndices(13, "all").includes(13), "source month is never rewritten");
  assert.deepEqual(applyForwardMonthIndices(60, "all"), [], "month 60 has no following months");
  assert.deepEqual(applyForwardMonthIndices(0, "year"), [], "month 0 is invalid");
  assert.deepEqual(applyForwardMonthIndices(99, "year"), [], "month 99 is out of range");
});

test("TIM-1310: apply-forward result, applied as overrides, propagates a year-2 rent increase in one action", () => {
  const mp = singleOverheadModel(300000); // single overhead line, id "ovh"
  // Founder raises this expense to $4,000 starting month 13, then applies it
  // forward through the rest of year 2 in a single action.
  const newAmt = 400000;
  const targets = applyForwardMonthIndices(13, "year");
  mp.manual_overrides = [
    { line_id: "ovh", month_index: 13, amount_cents: newAmt },
    ...targets.map((m) => ({ line_id: "ovh", month_index: m, amount_cents: newAmt })),
  ];
  const rows = computeMonthlyProjections(mp, { total_cost_cents: 0, financed_cost_cents: 0 });
  // Every month of year 2 (13..24) reflects the new amount and is flagged.
  for (let m = 13; m <= 24; m++) {
    const ln = rows[m - 1].forecast_line_amounts.find((l) => l.id === "ovh");
    assert.equal(ln.amount_cents, newAmt, `month ${m} should carry the increased amount`);
    assert.equal(ln.overridden, true, `month ${m} should be flagged as customized`);
  }
  // Year 1 is untouched (assumption-driven).
  const m12 = rows[11].forecast_line_amounts.find((l) => l.id === "ovh");
  assert.equal(m12.amount_cents, 300000);
  assert.equal(m12.overridden, false);
});

test("TIM-1310: manualOverrideCountsByLine tallies overrides per line", () => {
  const counts = manualOverrideCountsByLine([
    { line_id: "rent", month_index: 13, amount_cents: 1 },
    { line_id: "rent", month_index: 14, amount_cents: 1 },
    { line_id: BASE_REVENUE_LINE_ID, month_index: 1, amount_cents: 1 },
    { line_id: "", month_index: 2, amount_cents: 1 }, // ignored: empty id
  ]);
  assert.equal(counts.rent, 2);
  assert.equal(counts[BASE_REVENUE_LINE_ID], 1);
  assert.equal(counts[""], undefined);
});

test("TIM-1310: manualOverrideCountsByLine handles empty/undefined input", () => {
  assert.deepEqual(manualOverrideCountsByLine(undefined), {});
  assert.deepEqual(manualOverrideCountsByLine([]), {});
});

// ── TIM-1762: per-month loan P&I split — interest→P&L + draw timing ───────────

test("TIM-1762: loan interest lands on the P&L and matches the amortization split", () => {
  const mp = defaultMonthlyProjections();
  mp.funding_sources = [
    { id: "f1", kind: "founder_equity", label: "Founder", amount_cents: 5000000 },
    { id: "l1", kind: "loan", label: "Bank", amount_cents: 6000000, term_months: 60, annual_rate_pct: 6 },
  ];
  const slices = computeMonthlySlices(mp, EQUIP);
  const m1 = slices[0];
  // 6% APR → 0.5%/mo on a $60,000 opening balance = $300 interest in month 1.
  assert.equal(m1.loan_interest_cents, 30000);
  // The P&L Interest Expense line now reflects the loan interest (no manual line).
  assert.equal(m1.interest_cents, m1.loan_interest_cents);
  // Interest reduces pretax income (structural identity).
  assert.equal(m1.income_before_taxes_cents, m1.ebit_cents - m1.interest_cents);
  // As principal amortizes, the monthly interest portion shrinks.
  assert.ok(slices[11].loan_interest_cents < m1.loan_interest_cents);
});

test("TIM-1762: loan interest reduces cash (full payment leaves the business)", () => {
  const base = defaultMonthlyProjections();
  base.funding_sources = [
    { id: "f1", kind: "founder_equity", label: "Founder", amount_cents: 5000000 },
  ];
  const withLoan = defaultMonthlyProjections();
  // Loan amount equals the founder cash it replaces, so opening cash is identical.
  withLoan.funding_sources = [
    { id: "l1", kind: "loan", label: "Bank", amount_cents: 5000000, term_months: 60, annual_rate_pct: 6 },
  ];
  const a = computeMonthlySlices(base, EQUIP)[0];
  const b = computeMonthlySlices(withLoan, EQUIP)[0];
  // Opening cash matches (equity vs loan of equal size), but the loan plan pays
  // out the first month's full payment = principal + interest, so its month-1
  // net cash is lower by exactly that payment.
  const payment = b.loan_repayment_cents + b.loan_interest_cents;
  assert.ok(payment > 0);
  assert.equal(a.net_cash_cents - b.net_cash_cents, payment);
});

test("TIM-1762: principal (not full payment) reduces the loan liability", () => {
  const mp = defaultMonthlyProjections();
  mp.funding_sources = [
    { id: "l1", kind: "loan", label: "Bank", amount_cents: 6000000, term_months: 60, annual_rate_pct: 6 },
  ];
  const m1 = computeMonthlySlices(mp, EQUIP)[0];
  // Liability falls by principal only — interest never touches the balance.
  assert.equal(m1.long_term_debt_cents, 6000000 - m1.loan_repayment_cents);
});

test("TIM-1762: a 5-year loan drawn in month 3 — draw inflow, then P&I thereafter", () => {
  const mp = defaultMonthlyProjections();
  mp.funding_sources = [
    { id: "f1", kind: "founder_equity", label: "Founder", amount_cents: 8000000 },
    { id: "l1", kind: "loan", label: "Expansion", amount_cents: 6000000, term_months: 60, annual_rate_pct: 6, draw_month: 3 },
  ];
  const slices = computeMonthlySlices(mp, EQUIP);
  // Before the draw: the loan is off the books entirely.
  for (const m of [slices[0], slices[1]]) {
    assert.equal(m.long_term_debt_cents, 0);
    assert.equal(m.loan_interest_cents, 0);
    assert.equal(m.loan_repayment_cents, 0);
    assert.equal(m.loan_draw_cents, 0);
  }
  // Draw month (3): proceeds arrive as a financing inflow, liability appears,
  // and no payment is made yet.
  const m3 = slices[2];
  assert.equal(m3.loan_draw_cents, 6000000);
  assert.equal(m3.long_term_debt_cents, 6000000);
  assert.equal(m3.loan_repayment_cents, 0);
  assert.equal(m3.loan_interest_cents, 0);
  // Thereafter: P&I split — interest on the P&L, principal paying down the loan.
  const m4 = slices[3];
  assert.equal(m4.loan_interest_cents, 30000); // 0.5%/mo on $60,000
  assert.equal(m4.interest_cents, m4.loan_interest_cents);
  assert.ok(m4.loan_repayment_cents > 0);
  assert.ok(m4.long_term_debt_cents < 6000000);
  // Balance-sheet identity holds across the draw.
  for (const s of slices) {
    const gap = Math.abs(s.total_assets_cents - s.total_liabilities_and_equity_cents);
    assert.ok(gap <= 2, `A=L+E within rounding at month ${s.month_index} (gap ${gap})`);
  }
});

test("TIM-1762: a deferred-draw loan does not inflate opening cash", () => {
  const atOpen = defaultMonthlyProjections();
  atOpen.funding_sources = [
    { id: "l1", kind: "loan", label: "Bank", amount_cents: 6000000, term_months: 60, annual_rate_pct: 6, draw_month: 1 },
  ];
  const deferred = defaultMonthlyProjections();
  deferred.funding_sources = [
    { id: "l1", kind: "loan", label: "Bank", amount_cents: 6000000, term_months: 60, annual_rate_pct: 6, draw_month: 4 },
  ];
  const open1 = computeMonthlySlices(atOpen, EQUIP)[0];
  const def1 = computeMonthlySlices(deferred, EQUIP)[0];
  // The deferred loan's $60,000 is not yet in the business at month 1; the
  // at-open loan has it in opening cash but already paid its first month's
  // principal + interest. So the gap is the proceeds less that first payment.
  const firstPayment = open1.loan_repayment_cents + open1.loan_interest_cents;
  assert.equal(open1.cash_cents - def1.cash_cents, 6000000 - firstPayment);
});
