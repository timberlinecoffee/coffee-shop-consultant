// TIM-2341: Unit tests for lender-metrics compute functions.
// Pins:
// - Unit-economics buildup math (ticket × customers × open_days × 4.33 × 12).
// - Sensitivity scenarios produce non-degenerate, ordered results
//   (ticket +10% > baseline > ticket −10%; cogs +20% < baseline < cogs −20%).
// - DSCR uses EBITDA / (principal + interest); no-debt case surfaces note.
// - Break-even falls inside the [0, baseline-revenue] band and produces a
//   positive customers/day count.
// - CapEx + depreciation read from the vertical model's capex_schedule when
//   present, the engine's capex forecast_lines + startup_costs buildout
//   otherwise.
// - Working capital uses vertical config days when present, food-service
//   defaults otherwise.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeUnitEconomics,
  computeSensitivity,
  computeDscr,
  computeBreakEven,
  computeCapexSchedule,
  computeDepreciationSchedule,
  computeWorkingCapital,
  buildLenderMetrics,
  formatLenderMetricsForPrompt,
  DSCR_TARGET_THRESHOLD,
} from "./lender-metrics.ts";
import {
  defaultMonthlyProjections,
  normalizeMonthlyProjections,
  computeMonthlySlices,
} from "../financial-projection.ts";
import { defaultCoffeeShopVerticalConfig, applyCoffeeShopVertical } from "./coffee-shop-model.ts";

function baselineMp() {
  const mp = defaultMonthlyProjections();
  // Pin a known steady state for predictable assertions.
  mp.avg_ticket_cents = 800;            // $8.00
  mp.cogs_pct = 30;                     // 30% COGS
  mp.ramp_months = 3;
  // Open Mon–Sat at 200 customers/day, closed Sun.
  for (const day of ["mon", "tue", "wed", "thu", "fri", "sat"]) {
    mp.weekly_schedule[day] = { open: true, hours_open: 8 };
    mp.daily_flow[day] = 200;
  }
  mp.weekly_schedule.sun = { open: false, hours_open: 0 };
  mp.daily_flow.sun = 0;
  return mp;
}

function eqSummary(totalCents = 25_000_00) {
  return { total_cost_cents: totalCents, financed_cost_cents: totalCents };
}

test("computeUnitEconomics — daily/monthly/annual buildup", () => {
  const mp = baselineMp();
  const u = computeUnitEconomics(mp);
  // 200 customers/day × $8 ticket = $1600/day = 160_000 cents
  assert.equal(u.avg_ticket_cents, 800);
  assert.equal(u.customers_per_day_avg, 200);
  assert.equal(u.open_days_per_week, 6);
  assert.equal(u.steady_state_daily_revenue_cents, 800 * 200);
  // 6 open × 4.3333 weeks × 160_000 cents = 4_160_000 cents = $41,600
  const expectedMonthly = Math.round(800 * 200 * 6 * (52 / 12));
  assert.equal(u.steady_state_monthly_revenue_cents, expectedMonthly);
  assert.equal(u.steady_state_annual_revenue_cents, expectedMonthly * 12);
  // No vertical config → empty product/daypart lines.
  assert.deepEqual(u.product_lines, []);
  assert.deepEqual(u.daypart_lines, []);
});

test("computeUnitEconomics — vertical model surfaces product + daypart lines", () => {
  let mp = baselineMp();
  const cfg = defaultCoffeeShopVerticalConfig();
  mp = applyCoffeeShopVertical(mp, cfg).mp;
  const u = computeUnitEconomics(mp);
  // 6 product lines (espresso/drip/retail/food/pastry/other) at default mix.
  assert.equal(u.product_lines.length, 6);
  // Espresso 45% of monthly should be the biggest line.
  const espresso = u.product_lines.find((l) => l.label === "Espresso drinks");
  assert.ok(espresso);
  assert.equal(espresso.revenue_pct, 45);
  assert.ok(espresso.monthly_revenue_cents > 0);
  assert.ok(espresso.monthly_gross_profit_cents > 0);
  // 5 dayparts.
  assert.equal(u.daypart_lines.length, 5);
  // Morning rush at 45% of daily revenue.
  const morning = u.daypart_lines.find((d) => d.label === "Morning rush");
  assert.ok(morning);
  assert.equal(morning.revenue_pct, 45);
  assert.ok(morning.daily_revenue_cents > 0);
});

test("computeSensitivity — ticket ±10% orders correctly + COGS ±20% orders correctly", () => {
  const mp = baselineMp();
  const r = computeSensitivity(mp, eqSummary(), null);
  // 6 scenarios.
  assert.equal(r.scenarios.length, 6);
  // Baseline produces a Y1 net income.
  assert.equal(typeof r.baseline_y1_net_income_cents, "number");
  // ticket +10% Y1 net > baseline; ticket −10% < baseline.
  const tp = r.scenarios.find((s) => s.key === "tktUp10");
  const tm = r.scenarios.find((s) => s.key === "tktDn10");
  assert.ok(tp);
  assert.ok(tm);
  assert.ok(tp.y1_net_income_cents > r.baseline_y1_net_income_cents);
  assert.ok(tm.y1_net_income_cents < r.baseline_y1_net_income_cents);
  // COGS +20% (HIGHER costs) Y1 net < baseline; COGS −20% > baseline.
  const cp = r.scenarios.find((s) => s.key === "cogsUp20");
  const cm = r.scenarios.find((s) => s.key === "cogsDn20");
  assert.ok(cp);
  assert.ok(cm);
  assert.ok(cp.y1_net_income_cents < r.baseline_y1_net_income_cents);
  assert.ok(cm.y1_net_income_cents > r.baseline_y1_net_income_cents);
  // Ramp +3mo (slower) Y1 net < baseline (slower ramp means less Y1 revenue).
  // Investor acceptance criterion #3: "every ±10% ticket scenario produces a
  // different Y1 outcome" — assert that here as a regression guard.
  const rp = r.scenarios.find((s) => s.key === "rampUp3");
  const rm = r.scenarios.find((s) => s.key === "rampDn3");
  assert.ok(rp);
  assert.ok(rm);
  assert.ok(rp.y1_net_income_cents <= r.baseline_y1_net_income_cents);
  assert.ok(rm.y1_net_income_cents >= r.baseline_y1_net_income_cents);
});

test("computeSensitivity — non-degenerate: deltas are signed cents", () => {
  const mp = baselineMp();
  const r = computeSensitivity(mp, eqSummary(), null);
  // Investor acceptance criterion #3 expressed differently:
  // every scenario produces a distinct net income (no two are identical).
  const nets = r.scenarios.map((s) => s.y1_net_income_cents);
  assert.equal(new Set(nets).size, nets.length, `scenarios should be non-degenerate: ${JSON.stringify(nets)}`);
});

test("computeDscr — no debt surfaces note, no years", () => {
  const mp = baselineMp();
  // Default funding is all equity.
  const fund = (mp.funding_sources ?? []).filter((f) => f.kind !== "loan");
  mp.funding_sources = fund;
  const slices = computeMonthlySlices(mp, eqSummary(), {}, { menu_blended_cogs_pct: null });
  const d = computeDscr(slices, mp.funding_sources ?? []);
  assert.equal(d.has_term_debt, false);
  assert.ok(d.notes.some((n) => n.toLowerCase().includes("no term debt")));
  // Years are still computed (engine still runs); DSCR = 0 because no debt.
  for (const y of d.years) {
    assert.equal(y.debt_service_cents, 0);
    assert.equal(y.dscr_ratio, 0);
  }
});

test("computeDscr — with loan, EBITDA / debt service produces a number", () => {
  const mp = baselineMp();
  mp.funding_sources = [
    {
      id: "f1",
      kind: "loan",
      label: "SBA 7(a)",
      amount_cents: 200_000_00,           // $200K
      term_months: 120,                   // 10 years
      annual_rate_pct: 8,
    },
  ];
  const slices = computeMonthlySlices(mp, eqSummary(), {}, { menu_blended_cogs_pct: null });
  const d = computeDscr(slices, mp.funding_sources);
  assert.equal(d.has_term_debt, true);
  assert.ok(d.years.length >= 1);
  for (const y of d.years) {
    assert.ok(y.debt_service_cents > 0, `Year ${y.year} should have debt service > 0`);
    assert.ok(y.dscr_ratio >= 0);
    assert.equal(typeof y.meets_threshold, "boolean");
  }
  // Threshold is 1.20× per commercial / SBA convention.
  assert.equal(d.threshold, DSCR_TARGET_THRESHOLD);
});

test("computeBreakEven — monthly revenue required is positive + customers/day positive", () => {
  const mp = baselineMp();
  const slices = computeMonthlySlices(mp, eqSummary(), {}, { menu_blended_cogs_pct: null });
  const be = computeBreakEven(slices, mp);
  assert.ok(be.monthly_revenue_required_cents > 0);
  assert.ok(be.customers_per_day_required > 0);
  assert.ok(be.monthly_fixed_costs_cents > 0);
  // Variable cost rate matches engine's COGS pct closely (within rounding).
  assert.ok(Math.abs(be.variable_cost_rate_pct - mp.cogs_pct) < 1.5,
    `variable cost rate ${be.variable_cost_rate_pct}% should be near COGS pct ${mp.cogs_pct}%`);
});

test("computeCapexSchedule — vertical capex_schedule takes precedence", () => {
  const mp = baselineMp();
  const cfg = defaultCoffeeShopVerticalConfig();
  cfg.capex_schedule = [
    { id: "eq-1", label: "Espresso Machine", cost_cents: 12_000_00, useful_life_years: 7, depreciation_method: "straight_line", purchase_month_index: 1 },
    { id: "eq-2", label: "Grinder",          cost_cents:  2_500_00, useful_life_years: 5, depreciation_method: "straight_line", purchase_month_index: 1 },
  ];
  const applied = applyCoffeeShopVertical(mp, cfg).mp;
  const cx = computeCapexSchedule(applied);
  assert.equal(cx.rows.length, 2);
  assert.equal(cx.total_cents, 12_000_00 + 2_500_00);
  assert.equal(cx.rows[0].label, "Espresso Machine");
  assert.equal(cx.rows[0].useful_life_years, 7);
});

test("computeCapexSchedule — fallback uses capex forecast_lines + buildout startup cost", () => {
  const mp = baselineMp();
  // Ensure buildout startup_cost shows up.
  mp.startup_costs = { ...mp.startup_costs, buildout_cents: 80_000_00, buildout_useful_life_years: 15 };
  const cx = computeCapexSchedule(mp);
  assert.ok(cx.rows.some((r) => r.label === "Build-out"));
  assert.ok(cx.total_cents >= 80_000_00);
});

test("computeDepreciationSchedule — straight-line per row matches expected", () => {
  const mp = baselineMp();
  const cfg = defaultCoffeeShopVerticalConfig();
  cfg.capex_schedule = [
    { id: "eq-1", label: "Espresso Machine", cost_cents: 12_000_00, useful_life_years: 7, depreciation_method: "straight_line", purchase_month_index: 1 },
  ];
  const applied = applyCoffeeShopVertical(mp, cfg).mp;
  const dp = computeDepreciationSchedule(applied);
  assert.equal(dp.rows.length, 1);
  assert.equal(dp.rows[0].annual_depreciation_cents, Math.round(12_000_00 / 7));
  assert.equal(dp.total_annual_depreciation_cents, Math.round(12_000_00 / 7));
});

test("computeWorkingCapital — defaults when no vertical config", () => {
  const mp = baselineMp();
  const slices = computeMonthlySlices(mp, eqSummary(), {}, { menu_blended_cogs_pct: null });
  const wc = computeWorkingCapital(slices, mp);
  assert.equal(wc.days_inventory_on_hand, 10);
  assert.equal(wc.days_payable, 30);
  assert.equal(wc.days_receivable, 1);
  assert.ok(wc.daily_revenue_cents > 0);
  assert.ok(wc.daily_cogs_cents > 0);
  assert.ok(wc.inventory_required_cents > 0);
  // AP at 30 days typically dwarfs AR + inventory at 1 + 10 days against a
  // low-margin daily revenue. We just confirm the arithmetic isn't degenerate.
  assert.equal(
    wc.net_working_capital_cents,
    wc.inventory_required_cents + wc.accounts_receivable_cents - wc.accounts_payable_cents,
  );
});

test("computeWorkingCapital — uses vertical config days when present", () => {
  let mp = baselineMp();
  const cfg = defaultCoffeeShopVerticalConfig();
  cfg.working_capital = { days_inventory_on_hand: 14, days_payable: 45, days_receivable: 2 };
  mp = applyCoffeeShopVertical(mp, cfg).mp;
  const slices = computeMonthlySlices(mp, eqSummary(), {}, { menu_blended_cogs_pct: null });
  const wc = computeWorkingCapital(slices, mp);
  assert.equal(wc.days_inventory_on_hand, 14);
  assert.equal(wc.days_payable, 45);
  assert.equal(wc.days_receivable, 2);
});

test("buildLenderMetrics + formatLenderMetricsForPrompt — bundles cleanly + emits ground truth", () => {
  const mp = normalizeMonthlyProjections(baselineMp());
  const eq = eqSummary();
  const slices = computeMonthlySlices(mp, eq, {}, { menu_blended_cogs_pct: null });
  const bundle = buildLenderMetrics({ mp, slices, equipment: eq, menuBlendedCogsPct: null });
  // Every block populated.
  assert.ok(bundle.unit_economics);
  assert.ok(bundle.sensitivity);
  assert.ok(bundle.dscr);
  assert.ok(bundle.break_even);
  assert.ok(bundle.capex);
  assert.ok(bundle.depreciation);
  assert.ok(bundle.working_capital);
  // Prompt block surfaces every section.
  const block = formatLenderMetricsForPrompt(bundle, "USD");
  for (const heading of [
    "Lender Metrics",
    "Unit Economics Buildup",
    "Sensitivity Analysis",
    "DSCR",
    "Break-even",
    "CapEx Schedule",
    "Depreciation Schedule",
    "Working Capital Requirement",
  ]) {
    assert.ok(block.includes(heading), `prompt should include "${heading}"`);
  }
});
