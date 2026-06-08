// TIM-2394 Plan Quality Check v2 — unit tests for source-suite-checks.
// Pins:
// - Cross-suite checks fire on intentional contradictions; clean state → none.
// - Benchmark checks fire on out-of-range values; in-range → none.
// - Severity tiers (info / warning / critical) scale with deviation distance.
// - USD-only benchmarks skip non-USD plans.
// - All emitted findings carry the new rule_ids and have null synthesis fields.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runCrossSuiteChecks,
  runBenchmarkChecks,
  runSourceSuiteAudit,
} from "./source-suite-checks.ts";
import { buildPlanState } from "./plan-state.ts";
import { defaultMonthlyProjections } from "../financial-projection.ts";

function baselineMp() {
  const mp = defaultMonthlyProjections();
  mp.avg_ticket_cents = 800;            // $8.00 (in benchmark $6-$9 band)
  mp.cogs_pct = 30;                     // 30% COGS (in 28-32 band)
  mp.ramp_months = 8;                   // (in 6-12 band)
  for (const day of ["mon", "tue", "wed", "thu", "fri", "sat"]) {
    mp.weekly_schedule[day] = { open: true, hours_open: 8 };
    mp.daily_flow[day] = 200;
  }
  mp.weekly_schedule.sun = { open: false, hours_open: 0 };
  mp.daily_flow.sun = 0;
  return mp;
}

function basePlanState({ totalEquipUsd = 25000, headcount = 4, addRent = true, sqFt = 1200 } = {}) {
  const mp = baselineMp();
  if (addRent) {
    const rentLine = mp.forecast_lines.find((l) => l.legacy_key === "rent");
    if (rentLine) {
      rentLine.mode = "flat";
      rentLine.value = 600_000;   // $6,000/mo — within 6-10% band for ~$80k monthly revenue
    }
  }
  mp.personnel = [
    { id: "p1", role: "Barista", headcount, pay_basis: "hourly", pay_amount_cents: 1800, hours_per_week: 28, cost_category: "cogs", benefits_pct: 15, benefits_fixed_cents: 0 },
  ];
  mp.startup_costs = {
    buildout_cents: 12_000_000,             // $120k buildout for 1200 sqft = $100/sqft (below band but legal)
    equipment_cents: totalEquipUsd * 100,
    deposits_cents: 0,
    licenses_cents: 0,
    pre_opening_marketing_cents: 0,
    initial_inventory_cents: 0,
    startup_supplies_cents: 0,
    professional_fees_cents: 0,
    working_capital_reserve_cents: 0,
    opening_cash_buffer_cents: 6_000_000,   // $60k — vs ~$15k monthly opex = 4 months
    buildout_useful_life_years: 15,
    equipment_useful_life_years: 7,
  };
  return buildPlanState({
    shopName: "Test Coffee",
    financialModel: { forecast_inputs: mp },
    locationCandidates: [{ id: "L1", name: "Test", address: "123 St", neighborhood: null, sq_ft: sqFt, asking_rent_cents: 600_000, status: "chosen", notes: null }],
    equipment: [{ id: "e1", name: "Espresso", cost_local: totalEquipUsd, category: "espresso", notes: null }],
    hiringRoles: [{ id: "h1", role_title: "Barista", headcount, start_date: "2026-01-01", monthly_cost_cents: null, status: "active" }],
    menuBlendedCogsPct: 30,
  });
}

function baseSourceInputs(overrides = {}) {
  const planState = overrides.planState ?? basePlanState();
  return {
    planState,
    hiring: overrides.hiring ?? [
      { id: "h1", role_title: "Barista", headcount: 4, start_date: "2026-01-01" },
    ],
    equipment: overrides.equipment ?? [
      { id: "e1", name: "Espresso", cost_local: 25000 },
    ],
    menu: overrides.menu ?? [
      { id: "m1", name: "Latte", price_cents: 600, expected_popularity: "high", archived: false },
      { id: "m2", name: "Cappuccino", price_cents: 550, expected_popularity: "medium", archived: false },
      { id: "m3", name: "Pastry", price_cents: 400, expected_popularity: "low", archived: false },
    ],
    launch: overrides.launch ?? [
      { id: "L1", milestone: "Grand opening", target_date: "2026-03-01", status: "planned" },
    ],
  };
}

test("clean state — no cross-suite findings, all benchmarks pass", () => {
  const out = runCrossSuiteChecks(baseSourceInputs());
  assert.deepStrictEqual(out, []);
});

test("headcount mismatch — Hiring 6 vs Financials 4 fires critical", () => {
  const inp = baseSourceInputs({
    hiring: [
      { id: "h1", role_title: "Barista", headcount: 4, start_date: "2026-01-01" },
      { id: "h2", role_title: "Manager", headcount: 2, start_date: "2026-01-01" },
    ],
  });
  const out = runCrossSuiteChecks(inp);
  const f = out.find((x) => x.id === "src:headcount_mismatch");
  assert.ok(f, "headcount mismatch should fire");
  assert.equal(f.rule_id, "cross_suite_mismatch");
  assert.equal(f.severity, "critical");
  assert.match(f.raw_message, /Hiring shows 6/);
  assert.match(f.raw_message, /payroll for 4/);
  assert.equal(f.source.workspace, "hiring");
  assert.equal(f.target.workspace, "financials");
});

test("equipment cost mismatch — sum vs capex line > 1% diff fires critical", () => {
  // Equipment workspace shows $30k but capex line $25k — $5k diff > 1% tolerance.
  const ps = basePlanState({ totalEquipUsd: 25000 });
  const inp = baseSourceInputs({
    planState: ps,
    equipment: [{ id: "e1", name: "Espresso", cost_local: 30000 }],
  });
  const out = runCrossSuiteChecks(inp);
  const f = out.find((x) => x.id === "src:capex_equipment_mismatch");
  assert.ok(f, "equipment mismatch should fire");
  assert.equal(f.severity, "critical");
  assert.equal(f.units, "currency");
});

test("equipment within 1% tolerance — no finding", () => {
  // $25,050 vs $25,000 capex = $50 diff = 0.2% — well under tolerance.
  const inp = baseSourceInputs({
    equipment: [{ id: "e1", name: "Espresso", cost_local: 25050 }],
  });
  const out = runCrossSuiteChecks(inp);
  assert.equal(out.find((x) => x.id === "src:capex_equipment_mismatch"), undefined);
});

test("avg ticket below menu min — critical", () => {
  // Menu min = $4 (400 cents); set ticket to $3 (300 cents).
  const ps = basePlanState();
  const mp = ps;
  // Force the avg_ticket via planState mutation since we already built it.
  mp.revenue.avg_ticket_cents = 300;
  const out = runCrossSuiteChecks(baseSourceInputs({ planState: mp }));
  const f = out.find((x) => x.id === "src:menu_ticket_below_min");
  assert.ok(f, "ticket-below-min should fire");
  assert.equal(f.severity, "critical");
});

test("avg ticket > 3x max menu price — warning", () => {
  // Menu max = $6 (600 cents). Set ticket to $25 (2500 cents) = 4.16x.
  const ps = basePlanState();
  ps.revenue.avg_ticket_cents = 2500;
  const out = runCrossSuiteChecks(baseSourceInputs({ planState: ps }));
  const f = out.find((x) => x.id === "src:menu_ticket_above_basket");
  assert.ok(f, "ticket-above-basket should fire");
  assert.equal(f.severity, "warning");
});

test("hiring start date after opening milestone — warning", () => {
  const inp = baseSourceInputs({
    hiring: [
      { id: "h1", role_title: "Barista", headcount: 4, start_date: "2026-01-01" },
      { id: "h2", role_title: "Manager", headcount: 0, start_date: "2026-06-01" }, // headcount 0 → not in totals, but date still flagged
    ],
    launch: [
      { id: "L1", milestone: "Soft opening", target_date: "2026-03-01", status: "planned" },
    ],
  });
  const out = runCrossSuiteChecks(inp);
  const f = out.find((x) => x.id === "src:hiring_after_opening");
  assert.ok(f, "post-opening hiring should fire");
  assert.equal(f.severity, "warning");
  assert.match(f.raw_message, /1 hiring role has/);
});

test("benchmark — COGS at 50% triggers critical (TIM-2428: reads ingredient-only menu_blended_pct, not labor-included blended_pct)", () => {
  const ps = basePlanState();
  // TIM-2428: bench reads state.cogs.menu_blended_pct (the Forecast Inputs
  // page's value) — not state.cogs.blended_pct (which includes COGS-labor and
  // would always over-fire). Setting blended_pct alone must NOT trigger.
  ps.cogs.blended_pct = 80;             // labor-included; must be IGNORED by bench
  ps.cogs.menu_blended_pct = 50;        // ingredient-only; what the bench reads
  const out = runBenchmarkChecks(baseSourceInputs({ planState: ps }));
  const f = out.find((x) => x.id === "bench:coffee_shop_blended_cogs_pct");
  assert.ok(f, "high ingredient-only COGS should fire");
  assert.equal(f.rule_id, "benchmark_out_of_range");
  assert.equal(f.severity, "critical");
  assert.equal(f.units, "percent");
  // The cited source field label points the user at the Forecast Inputs page.
  assert.equal(f.source.workspace, "financials");
  assert.match(f.source.field_label ?? "", /Forecast Inputs|blended menu COGS/);
});

test("benchmark — COGS at 30% (in band) does not fire", () => {
  const ps = basePlanState();
  ps.cogs.menu_blended_pct = 30;
  const out = runBenchmarkChecks(baseSourceInputs({ planState: ps }));
  assert.equal(out.find((x) => x.id === "bench:coffee_shop_blended_cogs_pct"), undefined);
});

test("benchmark — COGS bench IGNORES state.cogs.blended_pct (labor-included) when menu_blended_pct is in band (TIM-2428)", () => {
  // Regression guard for the original board bug. trent's fixture had
  // blended_pct=~69% (labor-included) and menu_blended_pct=31.5%
  // (ingredient-only). The bench should NOT fire at 31.5%.
  const ps = basePlanState();
  ps.cogs.blended_pct = 69;              // labor-included; would over-fire if read
  ps.cogs.menu_blended_pct = 31.5;       // matches the Forecast Inputs page exactly
  const out = runBenchmarkChecks(baseSourceInputs({ planState: ps }));
  assert.equal(
    out.find((x) => x.id === "bench:coffee_shop_blended_cogs_pct"),
    undefined,
    "should not fire when ingredient-only COGS is in band, even with labor-included blended_pct out of band",
  );
});

test("benchmark — COGS bench falls back to base_cogs_pct when menu_blended_pct is null (TIM-2428)", () => {
  const ps = basePlanState();
  ps.cogs.menu_blended_pct = null;
  ps.cogs.base_cogs_pct = 50;
  const out = runBenchmarkChecks(baseSourceInputs({ planState: ps }));
  const f = out.find((x) => x.id === "bench:coffee_shop_blended_cogs_pct");
  assert.ok(f, "should fall back to base_cogs_pct");
  assert.equal(f.severity, "critical");
});

test("benchmark — ramp 24 months above 6-12 band", () => {
  const ps = basePlanState();
  ps.revenue.ramp_months = 24;
  const out = runBenchmarkChecks(baseSourceInputs({ planState: ps }));
  const f = out.find((x) => x.id === "bench:coffee_shop_ramp_months");
  assert.ok(f, "long ramp should fire");
  assert.ok(f.severity === "warning" || f.severity === "critical");
});

test("benchmark — USD-only checks skip non-USD currency", () => {
  const ps = basePlanState();
  ps.meta.currency_code = "EUR";
  ps.revenue.avg_ticket_cents = 100;    // $1 — would normally trip avg-ticket benchmark
  const out = runBenchmarkChecks(baseSourceInputs({ planState: ps }));
  assert.equal(out.find((x) => x.id === "bench:coffee_shop_avg_ticket_usd"), undefined);
});

test("runSourceSuiteAudit composes both layers", () => {
  const ps = basePlanState();
  ps.cogs.menu_blended_pct = 50;
  const inp = baseSourceInputs({
    planState: ps,
    hiring: [
      { id: "h1", role_title: "Barista", headcount: 8, start_date: "2026-01-01" },
    ],
  });
  const findings = runSourceSuiteAudit(inp);
  assert.ok(findings.some((f) => f.rule_id === "cross_suite_mismatch"));
  assert.ok(findings.some((f) => f.rule_id === "benchmark_out_of_range"));
  // Every finding has synthesis fields nulled (to be filled by Haiku pass).
  for (const f of findings) {
    assert.equal(f.issue, null);
    assert.equal(f.why_it_matters, null);
    assert.equal(f.suggested_fix, null);
  }
});

test("benchmark — no business plan field is referenced in any finding source", () => {
  const ps = basePlanState();
  ps.cogs.menu_blended_pct = 50;
  ps.revenue.ramp_months = 24;
  const findings = runSourceSuiteAudit(baseSourceInputs({ planState: ps }));
  for (const f of findings) {
    assert.notEqual(f.source.workspace, "business-plan", `finding ${f.id} sourced to BP`);
    assert.notEqual(f.target.workspace, "business-plan", `finding ${f.id} targeted at BP`);
  }
});
