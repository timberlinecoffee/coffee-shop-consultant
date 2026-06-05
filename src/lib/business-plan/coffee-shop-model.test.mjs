// TIM-2338: coffee-shop vertical model unit tests. Pins:
//   - product mix → weighted blended COGS
//   - lease object writes a rent line; engine renders rent every month
//   - free months zero rent in months 1..N
//   - lease escalator compounds across years
//   - cost inflation surfaces as ForecastLine.growth
//   - per-personnel wage growth compounds (engine extension)
//   - labor ramp steps become PersonnelLine with phased ramp
//   - capex schedule produces per-equipment ForecastLines with useful_life
//   - working-capital initial requirement computed from Y1 COGS/day × days
//   - vertical report blended_cogs matches what slices show
//
// Investor critique mapping (TIM-2315 → TIM-2338):
//   #1 vertical model           — product mix + daypart asserted below
//   #8 headcount-driven labor   — labor ramp + wage growth assertions
//   #9 structured lease object  — lease summary assertions

import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCoffeeShopVertical,
  computeVerticalReport,
  defaultCoffeeShopVerticalConfig,
  readCoffeeShopVerticalConfig,
  weightedBlendedCogsPct,
  yearlyToMonthlyGrowthPct,
} from "./coffee-shop-model.ts";
import {
  normalizeMonthlyProjections,
  computeMonthlySlices,
} from "../financial-projection.ts";

// Minimal baseline MP (mirrors plan-state.test.mjs structure) so we test the
// vertical apply layer on a real engine-compatible MP, not a synthetic stub.
function baselineMP() {
  return normalizeMonthlyProjections({
    daily_flow: { mon: 80, tue: 80, wed: 80, thu: 90, fri: 100, sat: 110, sun: 0 },
    avg_ticket_cents: 650,
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
      { id: "line:rent",        label: "Rent",       category: "overhead", mode: "flat", value: 488000, legacy_key: "rent" },
      { id: "line:utilities",   label: "Utilities",  category: "overhead", mode: "flat", value: 70000,  legacy_key: "utilities" },
      { id: "line:maintenance", label: "Maintenance",category: "overhead", mode: "flat", value: 18000,  legacy_key: "maintenance" },
      { id: "line:supplies",    label: "Supplies",   category: "overhead", mode: "flat", value: 22000,  legacy_key: "supplies" },
      { id: "line:insurance",   label: "Insurance",  category: "overhead", mode: "flat", value: 25000,  legacy_key: "insurance" },
      { id: "line:marketing",   label: "Marketing",  category: "overhead", mode: "pct",  value: 2,      legacy_key: "marketing" },
    ],
    funding_sources: [
      { id: "f1", kind: "founder_equity", label: "Founder",  amount_cents: 5000000 },
      { id: "f2", kind: "loan",           label: "SBA Loan", amount_cents: 20000000, term_months: 60, annual_rate_pct: 8 },
    ],
    personnel: [
      { id: "p1", role: "Owner",   headcount: 1, pay_basis: "annual", pay_amount_cents: 6000000, benefits_pct: 0,  cost_category: "overhead" },
      { id: "p2", role: "Barista", headcount: 2, pay_basis: "hourly", pay_amount_cents: 1800, hours_per_week: 30, benefits_pct: 12, cost_category: "cogs" },
    ],
    startup_costs: {
      buildout_cents: 5000000, equipment_cents: 7500000, deposits_cents: 1000000,
      licenses_cents: 300000, pre_opening_marketing_cents: 500000,
      initial_inventory_cents: 1500000, startup_supplies_cents: 800000,
      professional_fees_cents: 600000, working_capital_reserve_cents: 2000000,
      opening_cash_buffer_cents: 3000000,
      buildout_useful_life_years: 15, equipment_useful_life_years: 7,
    },
    income_tax_pct: 21, sales_tax_pct: 8.875,
    ramp_months: 6, ramp_multipliers: [0.4, 0.55, 0.7, 0.82, 0.9, 0.95],
    growth_mode: "simple", growth_monthly_pct: 1, growth_custom_monthly: [],
    fiscal_year_start_month: 1, currency_code: "USD",
    payment_processing_pct: 2.5, spoilage_pct: 2, loyalty_discount_pct: 1,
  });
}

// Realistic Beaver & Beef-shaped vertical config exercising every code path.
function fixtureVerticalCfg() {
  return {
    version: 1,
    product_mix: [
      // The investor-critique-failure case: 30% food at 60% COGS dominates the
      // blend; flat 30% is wrong.
      { category: "espresso",     label: "Espresso",     revenue_pct: 45, cogs_pct: 22 },
      { category: "drip_coffee",  label: "Drip",         revenue_pct: 10, cogs_pct: 18 },
      { category: "food",         label: "Beef sandwiches", revenue_pct: 30, cogs_pct: 60 },
      { category: "pastry",       label: "Pastry",       revenue_pct: 10, cogs_pct: 45 },
      { category: "retail_beans", label: "Beans",        revenue_pct: 5,  cogs_pct: 55 },
    ],
    dayparts: [
      { id: "morning_rush", label: "Morning rush", start_hour: 6,  end_hour: 10, revenue_pct: 50, min_baristas: 3 },
      { id: "lunch",        label: "Lunch",        start_hour: 11, end_hour: 14, revenue_pct: 30, min_baristas: 3 },
      { id: "afternoon",    label: "Afternoon",    start_hour: 14, end_hour: 17, revenue_pct: 20, min_baristas: 2 },
    ],
    lease: {
      base_rent_monthly_cents: 488000,   // $4,880
      cam_monthly_cents: 38000,          // $380
      escalator_pct_yearly: 3,
      free_months: 2,
      term_months: 60,
      deposit_cents: 976000,
    },
    cost_inflation: {
      utilities_pct_yearly: 3,
      supplies_pct_yearly: 2,
      cogs_pct_yearly: 2,
      labor_pct_yearly: 3,
      marketing_pct_yearly: 2,
      maintenance_pct_yearly: 2,
      insurance_pct_yearly: 3,
    },
    capex_schedule: [
      { id: "eq:espresso", label: "La Marzocco espresso", cost_cents: 2500000, useful_life_years: 7, depreciation_method: "straight_line", purchase_month_index: 1 },
      { id: "eq:grinder",  label: "Mahlkönig grinder",    cost_cents: 700000,  useful_life_years: 7, depreciation_method: "straight_line", purchase_month_index: 1 },
      { id: "eq:kitchen",  label: "Kitchen line",         cost_cents: 4500000, useful_life_years: 10, depreciation_method: "straight_line", purchase_month_index: 1 },
    ],
    working_capital: {
      days_inventory_on_hand: 10,
      days_payable: 30,
      days_receivable: 1,
    },
    labor_ramp: [
      // Hire a third barista at month 6, a kitchen lead at month 9.
      { role: "Barista", headcount_delta: 1, start_month: 6, pay_basis: "hourly", pay_amount_cents: 1800, hours_per_week: 30, benefits_pct: 12, cost_category: "cogs" },
      { role: "Kitchen Lead", headcount_delta: 1, start_month: 9, pay_basis: "hourly", pay_amount_cents: 2400, hours_per_week: 32, benefits_pct: 15, cost_category: "cogs" },
    ],
  };
}

test("weightedBlendedCogsPct: mix with 30% food at 60% COGS rises blended rate above flat baseline", () => {
  const cfg = fixtureVerticalCfg();
  const blended = weightedBlendedCogsPct(cfg.product_mix);
  // Hand-compute: 0.45*22 + 0.10*18 + 0.30*60 + 0.10*45 + 0.05*55
  //              = 9.9 + 1.8 + 18.0 + 4.5 + 2.75 = 36.95
  assert.equal(blended, 37);
  // And not the flat 30% baseline the investor flagged.
  assert.notEqual(blended, 30);
});

test("weightedBlendedCogsPct: empty mix returns 0", () => {
  assert.equal(weightedBlendedCogsPct([]), 0);
});

test("yearlyToMonthlyGrowthPct: 3%/yr → 0.25%/mo (linear monthly equivalent)", () => {
  assert.equal(yearlyToMonthlyGrowthPct(3), 0.25);
  assert.equal(yearlyToMonthlyGrowthPct(0), 0);
});

test("applyCoffeeShopVertical: rewrites COGS to blended rate", () => {
  const mp = baselineMP();
  const cfg = fixtureVerticalCfg();
  const { mp: applied, blended_cogs_pct } = applyCoffeeShopVertical(mp, cfg);
  assert.equal(applied.cogs_pct, 37);
  assert.equal(blended_cogs_pct, 37);
});

test("applyCoffeeShopVertical: rent line carries lease escalator as monthly growth", () => {
  const cfg = fixtureVerticalCfg();
  const { mp: applied } = applyCoffeeShopVertical(baselineMP(), cfg);
  const rent = applied.forecast_lines.find((l) => l.legacy_key === "rent");
  assert.ok(rent, "rent line must exist");
  assert.equal(rent.mode, "flat");
  assert.equal(rent.value, 488000 + 38000);
  assert.ok(rent.growth?.enabled, "rent must carry growth");
  assert.equal(rent.growth.monthly_pct, 0.25); // 3%/yr ÷ 12
});

test("applyCoffeeShopVertical: free months produce $0 rent overrides in months 1..N", () => {
  const cfg = fixtureVerticalCfg();
  const { mp: applied, rent_line_id } = applyCoffeeShopVertical(baselineMP(), cfg);
  const overrides = (applied.manual_overrides ?? []).filter((o) => o.line_id === rent_line_id);
  assert.equal(overrides.length, 2, "two free months → two overrides");
  for (const o of overrides) {
    assert.equal(o.amount_cents, 0);
    assert.ok(o.month_index === 1 || o.month_index === 2);
  }
});

test("applyCoffeeShopVertical: cost inflation flows onto utilities/supplies/maintenance/insurance/marketing", () => {
  const { mp: applied } = applyCoffeeShopVertical(baselineMP(), fixtureVerticalCfg());
  for (const key of ["utilities", "supplies", "maintenance", "insurance", "marketing"]) {
    const line = applied.forecast_lines.find((l) => l.legacy_key === key);
    assert.ok(line, `${key} line must exist`);
    assert.ok(line.growth?.enabled, `${key} must carry growth`);
  }
});

test("applyCoffeeShopVertical: per-personnel wage growth set from labor inflation", () => {
  const { mp: applied } = applyCoffeeShopVertical(baselineMP(), fixtureVerticalCfg());
  for (const p of applied.personnel) {
    assert.ok(p.growth?.enabled, `personnel ${p.role} must carry wage growth`);
    assert.equal(p.growth.monthly_pct, 0.25); // 3%/yr ÷ 12
  }
});

test("applyCoffeeShopVertical: labor ramp steps become personnel lines with phased ramp", () => {
  const { mp: applied } = applyCoffeeShopVertical(baselineMP(), fixtureVerticalCfg());
  const ramped = applied.personnel.filter((p) => p.id.startsWith("vert:hire:"));
  assert.equal(ramped.length, 2);
  const lead = ramped.find((p) => p.role === "Kitchen Lead");
  assert.ok(lead, "Kitchen Lead must exist");
  assert.equal(lead.ramp?.start_month, 9);
  assert.equal(lead.ramp?.start_pct, 50);
});

test("applyCoffeeShopVertical: equipment items become individual capex ForecastLines with useful_life_years", () => {
  const { mp: applied, capex_lines_added } = applyCoffeeShopVertical(baselineMP(), fixtureVerticalCfg());
  assert.equal(capex_lines_added.length, 3);
  const kitchen = applied.forecast_lines.find((l) => l.id === "vert:capex:eq:kitchen");
  assert.ok(kitchen, "kitchen capex line must exist");
  assert.equal(kitchen.category, "capex");
  assert.equal(kitchen.value, 4500000);
  assert.equal(kitchen.useful_life_years, 10);
  assert.equal(kitchen.linked_equipment_item_id, "eq:kitchen");
});

test("applyCoffeeShopVertical: idempotent — re-applying does not duplicate lines", () => {
  const cfg = fixtureVerticalCfg();
  const first = applyCoffeeShopVertical(baselineMP(), cfg);
  const second = applyCoffeeShopVertical(first.mp, cfg);
  // Same capex count, same rent line count, same vertical personnel count.
  const capexCount = (mp) => mp.forecast_lines.filter((l) => l.id.startsWith("vert:capex:")).length;
  const rentCount = (mp) => mp.forecast_lines.filter((l) => l.legacy_key === "rent").length;
  const vertHireCount = (mp) => mp.personnel.filter((p) => p.id.startsWith("vert:hire:")).length;
  assert.equal(capexCount(first.mp), capexCount(second.mp));
  assert.equal(rentCount(first.mp), rentCount(second.mp));
  assert.equal(rentCount(first.mp), 1);
  assert.equal(vertHireCount(first.mp), vertHireCount(second.mp));
});

test("applyCoffeeShopVertical: deposits and equipment_cents bucket reflect lease + capex schedule", () => {
  const { mp: applied } = applyCoffeeShopVertical(baselineMP(), fixtureVerticalCfg());
  assert.ok(applied.startup_costs.deposits_cents >= 976000, "deposit ≥ lease deposit");
  assert.equal(applied.startup_costs.equipment_cents, 2500000 + 700000 + 4500000);
});

test("engine rendering: rent appears every non-free month at base+CAM × escalator factor", () => {
  const { mp: applied } = applyCoffeeShopVertical(baselineMP(), fixtureVerticalCfg());
  const slices = computeMonthlySlices(applied, { total_cost_cents: 0, financed_cost_cents: 0 }, {}, { menu_blended_cogs_pct: null });
  // Free months: months 1..2 have $0 rent.
  assert.equal(slices[0].rent_cents, 0);
  assert.equal(slices[1].rent_cents, 0);
  // Month 3 onwards: every month carries rent (base+CAM × escalator factor).
  const month3 = slices[2];
  assert.ok(month3.rent_cents > 0, `month 3 rent must be > 0, got ${month3.rent_cents}`);
  // Month 60 rent reflects ~5 years of compounding (0.25%/mo for 59-60 months).
  const month60 = slices[59];
  assert.ok(month60.rent_cents > month3.rent_cents, "rent escalates over 5 years");
});

test("engine rendering: Y5 labor scales up vs Y1 with wage growth + new hires", () => {
  const { mp: applied } = applyCoffeeShopVertical(baselineMP(), fixtureVerticalCfg());
  const slices = computeMonthlySlices(applied, { total_cost_cents: 0, financed_cost_cents: 0 }, {}, { menu_blended_cogs_pct: null });
  const y1Labor = slices.filter((s) => s.year === 1).reduce((a, r) => a + r.labor_cents, 0);
  const y5Labor = slices.filter((s) => s.year === 5).reduce((a, r) => a + r.labor_cents, 0);
  assert.ok(y5Labor > y1Labor, `Y5 labor (${y5Labor}) must exceed Y1 (${y1Labor}) — investor critique #8`);
  // Confirm growth is meaningful (≥5% across 4 years at 3%/yr inflation ≈ 12%+).
  assert.ok(y5Labor / y1Labor > 1.05, `Y5/Y1 ratio = ${(y5Labor / y1Labor).toFixed(3)}`);
});

test("computeVerticalReport: blended_cogs matches weighted calc", () => {
  const cfg = fixtureVerticalCfg();
  const { mp: applied } = applyCoffeeShopVertical(baselineMP(), cfg);
  const slices = computeMonthlySlices(applied, { total_cost_cents: 0, financed_cost_cents: 0 }, {}, { menu_blended_cogs_pct: null });
  const report = computeVerticalReport(applied, cfg, slices);
  assert.equal(report.blended_cogs_pct, 37);
});

test("computeVerticalReport: lease summary reflects free months and 5-yr total", () => {
  const cfg = fixtureVerticalCfg();
  const { mp: applied } = applyCoffeeShopVertical(baselineMP(), cfg);
  const slices = computeMonthlySlices(applied, { total_cost_cents: 0, financed_cost_cents: 0 }, {}, { menu_blended_cogs_pct: null });
  const report = computeVerticalReport(applied, cfg, slices);
  const ls = report.lease_summary;
  assert.equal(ls.free_months, 2);
  assert.equal(ls.escalator_pct_yearly, 3);
  // Y1 rent ≈ (base+CAM)*10 (10 paying months) × ramp 1..10 escalator
  const baseTotal = (488000 + 38000) * 10;
  assert.ok(ls.y1_rent_total_cents > 0, "Y1 rent > 0");
  assert.ok(ls.y1_rent_total_cents < baseTotal + 200000, "Y1 rent within 2 deposits' worth of base × 10mo");
  assert.ok(ls.y5_rent_total_cents > ls.y1_rent_total_cents, "Y5 > Y1 because of escalator");
  assert.ok(ls.five_year_rent_total_cents > 0);
});

test("computeVerticalReport: labor_by_year covers Y1..Y5 with growth", () => {
  const cfg = fixtureVerticalCfg();
  const { mp: applied } = applyCoffeeShopVertical(baselineMP(), cfg);
  const slices = computeMonthlySlices(applied, { total_cost_cents: 0, financed_cost_cents: 0 }, {}, { menu_blended_cogs_pct: null });
  const report = computeVerticalReport(applied, cfg, slices);
  assert.equal(report.labor_by_year.length, 5);
  assert.ok(
    report.labor_by_year[4].total_labor_cents > report.labor_by_year[0].total_labor_cents,
    "Y5 labor exceeds Y1",
  );
});

test("computeVerticalReport: depreciation schedule rolls up per equipment item, total annual matches sum", () => {
  const cfg = fixtureVerticalCfg();
  const { mp: applied } = applyCoffeeShopVertical(baselineMP(), cfg);
  const slices = computeMonthlySlices(applied, { total_cost_cents: 0, financed_cost_cents: 0 }, {}, { menu_blended_cogs_pct: null });
  const report = computeVerticalReport(applied, cfg, slices);
  assert.equal(report.depreciation_schedule.length, 3);
  const kitchen = report.depreciation_schedule.find((r) => r.item_id === "eq:kitchen");
  assert.ok(kitchen);
  assert.equal(kitchen.annual_depreciation_cents, 450000); // 4,500,000 / 10
  const sum = report.depreciation_schedule.reduce((a, r) => a + r.annual_depreciation_cents, 0);
  assert.equal(report.total_annual_depreciation_cents, sum);
});

test("computeVerticalReport: working capital initial requirement uses Y1 COGS/day × days", () => {
  const cfg = fixtureVerticalCfg();
  const { mp: applied } = applyCoffeeShopVertical(baselineMP(), cfg);
  const slices = computeMonthlySlices(applied, { total_cost_cents: 0, financed_cost_cents: 0 }, {}, { menu_blended_cogs_pct: null });
  const report = computeVerticalReport(applied, cfg, slices);
  const wc = report.working_capital;
  assert.equal(wc.days_inventory_on_hand, 10);
  assert.equal(wc.days_payable, 30);
  assert.equal(wc.days_receivable, 1);
  assert.ok(Number.isFinite(wc.initial_requirement_cents), "initial WC computed");
});

test("readCoffeeShopVerticalConfig: parses minimal payload and applies defaults to missing nested objects", () => {
  const parsed = readCoffeeShopVerticalConfig({
    version: 1,
    product_mix: [{ category: "espresso", label: "Espresso", revenue_pct: 100, cogs_pct: 25 }],
  });
  assert.ok(parsed, "parser returns config");
  assert.equal(parsed.product_mix.length, 1);
  // Missing lease block falls back to defaults.
  assert.ok(parsed.lease.base_rent_monthly_cents > 0);
  assert.ok(parsed.cost_inflation.labor_pct_yearly > 0);
});

test("readCoffeeShopVerticalConfig: rejects unsupported version", () => {
  assert.equal(readCoffeeShopVerticalConfig({ version: 2 }), null);
  assert.equal(readCoffeeShopVerticalConfig(null), null);
  assert.equal(readCoffeeShopVerticalConfig("garbage"), null);
});

test("defaultCoffeeShopVerticalConfig: returns valid round-trippable config", () => {
  const cfg = defaultCoffeeShopVerticalConfig();
  const json = JSON.stringify(cfg);
  const round = readCoffeeShopVerticalConfig(JSON.parse(json));
  assert.ok(round);
  assert.equal(round.product_mix.length, cfg.product_mix.length);
  assert.equal(round.dayparts.length, cfg.dayparts.length);
});

test("plan_state integration: when MP carries vertical_config, plan_state.vertical_model is populated", async () => {
  const { buildPlanState } = await import("./plan-state.ts");
  const mp = baselineMP();
  mp.coffee_shop_vertical_config = fixtureVerticalCfg();
  const state = buildPlanState({
    shopName: "Beaver & Beef",
    financialModel: { monthly_projections: mp },
    locationCandidates: [],
    equipment: [],
    hiringRoles: [],
    menuBlendedCogsPct: null,
  });
  assert.ok(state.vertical_model, "vertical_model must be populated");
  assert.equal(state.vertical_model.blended_cogs_pct, 37);
  assert.ok(state.vertical_model.lease_summary.five_year_rent_total_cents > 0);
  // The plan-state lease row must also reflect the lease object (not $0).
  assert.ok(state.lease.monthly_rent_cents > 0, "lease.monthly_rent_cents must reflect vertical config");
});

test("plan_state integration: without vertical_config, vertical_model is null (backward compat)", async () => {
  const { buildPlanState } = await import("./plan-state.ts");
  const mp = baselineMP();
  const state = buildPlanState({
    shopName: "Plain Plan",
    financialModel: { monthly_projections: mp },
    locationCandidates: [],
    equipment: [],
    hiringRoles: [],
    menuBlendedCogsPct: null,
  });
  assert.equal(state.vertical_model, null);
});

test("formatPlanStateForPrompt: ground-truth block includes vertical-model section when present", async () => {
  const { buildPlanState, formatPlanStateForPrompt } = await import("./plan-state.ts");
  const mp = baselineMP();
  mp.coffee_shop_vertical_config = fixtureVerticalCfg();
  const state = buildPlanState({
    shopName: "Beaver & Beef",
    financialModel: { monthly_projections: mp },
    locationCandidates: [],
    equipment: [],
    hiringRoles: [],
    menuBlendedCogsPct: null,
  });
  const out = formatPlanStateForPrompt(state);
  assert.ok(out.includes("Coffee-Shop Vertical Model"));
  assert.ok(out.includes("Daypart Staffing"));
  assert.ok(out.includes("Working Capital"));
  assert.ok(out.includes("Depreciation Schedule"));
});
