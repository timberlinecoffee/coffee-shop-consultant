// TIM-2428 — suite-wide source-consistency tests.
//
// Rule: every audit finding's numeric claim must equal the value rendered on
// the page it cites as its source. This guards against the original bug where
// the COGS finding quoted 69% (labor-included total COGS) while citing the
// Forecast Inputs page (which shows 31.5% ingredient-only blended COGS).
//
// What we pin here:
//   1. Every BENCHMARK_SPEC entry has a matching METRIC_BINDINGS entry, so
//      no check can point at a metric that hasn't declared its source field.
//   2. For every benchmark check that fires on a fixture, the number in the
//      finding's raw_message equals (binding.read(state) → spec.format(...)).
//      i.e. the number quoted to the user equals what the audit actually read,
//      not a different aggregate generated elsewhere.
//   3. For the canonical bug repro (blended_pct=69, menu_blended_pct=31.5),
//      the audit does NOT quote 69% anywhere when the cited source is the
//      Forecast Inputs page.

import { test } from "node:test";
import assert from "node:assert/strict";

import { runBenchmarkChecks, runSourceSuiteAudit } from "./source-suite-checks.ts";
import { buildPlanState } from "./plan-state.ts";
import { defaultMonthlyProjections } from "../financial-projection.ts";

function baselineMp() {
  const mp = defaultMonthlyProjections();
  mp.avg_ticket_cents = 800;
  mp.cogs_pct = 30;
  mp.ramp_months = 8;
  for (const day of ["mon", "tue", "wed", "thu", "fri", "sat"]) {
    mp.weekly_schedule[day] = { open: true, hours_open: 8 };
    mp.daily_flow[day] = 200;
  }
  mp.weekly_schedule.sun = { open: false, hours_open: 0 };
  mp.daily_flow.sun = 0;
  return mp;
}

function buildState({ menuBlendedCogsPct = 30, headcount = 4 } = {}) {
  const mp = baselineMp();
  const rentLine = mp.forecast_lines.find((l) => l.legacy_key === "rent");
  if (rentLine) {
    rentLine.mode = "flat";
    rentLine.value = 600_000;
  }
  mp.personnel = [
    { id: "p1", role: "Barista", headcount, pay_basis: "hourly", pay_amount_cents: 1800, hours_per_week: 28, cost_category: "cogs", benefits_pct: 15, benefits_fixed_cents: 0 },
  ];
  mp.startup_costs = {
    buildout_cents: 12_000_000,
    equipment_cents: 25_000 * 100,
    deposits_cents: 0,
    licenses_cents: 0,
    pre_opening_marketing_cents: 0,
    initial_inventory_cents: 0,
    startup_supplies_cents: 0,
    professional_fees_cents: 0,
    working_capital_reserve_cents: 0,
    opening_cash_buffer_cents: 6_000_000,
    buildout_useful_life_years: 15,
    equipment_useful_life_years: 7,
  };
  return buildPlanState({
    shopName: "Test Coffee",
    financialModel: { forecast_inputs: mp },
    locationCandidates: [{ id: "L1", name: "Test", address: "123 St", neighborhood: null, sq_ft: 1200, asking_rent_cents: 600_000, status: "chosen", notes: null }],
    equipment: [{ id: "e1", name: "Espresso", cost_usd: 25000, category: "espresso", notes: null }],
    hiringRoles: [{ id: "h1", role_title: "Barista", headcount, start_date: "2026-01-01", monthly_cost_cents: null, status: "active" }],
    menuBlendedCogsPct,
  });
}

function defaultInputs(planState) {
  return {
    planState,
    hiring: [{ id: "h1", role_title: "Barista", headcount: 4, start_date: "2026-01-01" }],
    equipment: [{ id: "e1", name: "Espresso", cost_usd: 25000 }],
    menu: [
      { id: "m1", name: "Latte", price_cents: 550, expected_mix_pct: 50, expected_popularity: "high" },
      { id: "m2", name: "Drip", price_cents: 350, expected_mix_pct: 50, expected_popularity: "medium" },
    ],
    launch: [{ id: "L1", milestone: "Soft opening", target_date: "2026-03-01", status: "planned" }],
  };
}

// Extracts the actual-value token a benchmark finding quotes. The raw_message
// template is "${label} comes out to ${format(value)}, ${direction} the
// typical ${range} ${unit} range. ${note}". We scope to the "comes out to ..."
// portion so the note's example percentages don't false-positive.
function extractQuotedValue(message) {
  const m = message.match(/comes out to ([^,]+),/);
  const scoped = m ? m[1] : message;
  const pctMatch = scoped.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) return { unit: "percent", value: Number(pctMatch[1]) };
  const dollarPerSqft = scoped.match(/\$([\d,]+(?:\.\d+)?)\s*\/\s*sqft/i);
  if (dollarPerSqft) return { unit: "currency_per_sqft", value: Number(dollarPerSqft[1].replace(/,/g, "")) };
  const dollarMatch = scoped.match(/\$([\d,]+(?:\.\d+)?)/);
  if (dollarMatch) return { unit: "currency", value: Number(dollarMatch[1].replace(/,/g, "")) };
  const ratioMatch = scoped.match(/(\d+(?:\.\d+)?)\s*x/i);
  if (ratioMatch) return { unit: "ratio", value: Number(ratioMatch[1]) };
  const monthsMatch = scoped.match(/(\d+(?:\.\d+)?)\s*months?/i);
  if (monthsMatch) return { unit: "months", value: Number(monthsMatch[1]) };
  return null;
}

test("METRIC_BINDINGS has an entry for every benchmark spec key", async () => {
  const mod = await import("./source-suite-checks.ts");
  // The internals aren't exported, but we verify indirectly: every emitted
  // benchmark finding has its source field_label set (not null), proving
  // the binding lookup succeeded. If any benchKey lacked a binding, the cfg
  // construction would throw at runtime.
  const ps = buildState({ menuBlendedCogsPct: 50 });
  ps.revenue.ramp_months = 24;
  ps.revenue.avg_ticket_cents = 100;
  ps.lease.monthly_rent_cents = 10_000_00;
  ps.lender_metrics.dscr = { has_term_debt: true, years: [{ year: 1, dscr_ratio: 0.5 }] };
  const out = runBenchmarkChecks(defaultInputs(ps));
  assert.ok(out.length > 0, "expected several benchmark findings to fire");
  for (const f of out) {
    assert.ok(f.source.field_label, `finding ${f.id} has no source.field_label`);
    assert.ok(f.source.workspace, `finding ${f.id} has no source.workspace`);
  }
});

test("every benchmark finding's quoted % equals the value pulled from the cited source field", () => {
  const ps = buildState({ menuBlendedCogsPct: 50 });
  ps.revenue.ramp_months = 24;
  ps.lease.monthly_rent_cents = 10_000_00;
  const out = runBenchmarkChecks(defaultInputs(ps));

  for (const f of out) {
    const tok = extractQuotedValue(f.raw_message);
    assert.ok(tok, `finding ${f.id} raw_message had no numeric token: ${f.raw_message}`);

    // Cross-check: the quoted token must match what shows in quoted_text,
    // which is the format(value) of the live read. If those drift, the
    // raw_message and the audit's metric pointer have diverged.
    const quotedTok = extractQuotedValue(f.quoted_text ?? "");
    assert.ok(quotedTok, `finding ${f.id} quoted_text had no numeric token`);
    assert.equal(tok.unit, quotedTok.unit, `unit mismatch in ${f.id}`);
    assert.equal(tok.value, quotedTok.value, `value drift in ${f.id}: raw=${tok.value} quoted=${quotedTok.value}`);
  }
});

test("TIM-2428 canonical repro — fixture with blended_pct=69 and menu_blended_pct=31.5 does NOT produce a COGS finding quoting 69%", () => {
  const ps = buildState({ menuBlendedCogsPct: 31.5 });
  // Mimic trent's fixture: labor-included blended is way above benchmark
  // band, but ingredient-only menu blended COGS is right in the middle.
  ps.cogs.blended_pct = 69;
  ps.cogs.menu_blended_pct = 31.5;

  const out = runSourceSuiteAudit(defaultInputs(ps));
  for (const f of out) {
    if (f.source.workspace !== "financials") continue;
    const tok = extractQuotedValue(f.raw_message);
    if (!tok || tok.unit !== "percent") continue;
    // No COGS-shaped finding should quote 69% to a user on the Financials
    // workspace. (Labor or rent at 69% would still be valid quotes — but
    // not in this fixture, where labor/rent are deliberately in range.)
    assert.notEqual(tok.value, 69, `finding ${f.id} quotes 69% to Financials page: ${f.raw_message}`);
  }

  // Positive: the COGS bench should NOT have fired at all (31.5% is in band).
  const cogsBench = out.find((f) => f.id === "bench:coffee_shop_blended_cogs_pct");
  assert.equal(cogsBench, undefined, "COGS bench should not fire when ingredient-only COGS is in 28-32 band");
});

test("TIM-2428 — when COGS bench fires, the quoted % equals state.cogs.menu_blended_pct exactly", () => {
  const ps = buildState({ menuBlendedCogsPct: 45 });
  ps.cogs.blended_pct = 70;            // labor-included; should be IGNORED
  ps.cogs.menu_blended_pct = 45;       // ingredient-only; what the bench reads
  const out = runBenchmarkChecks(defaultInputs(ps));
  const f = out.find((x) => x.id === "bench:coffee_shop_blended_cogs_pct");
  assert.ok(f, "COGS bench should fire at 45%");
  const tok = extractQuotedValue(f.raw_message);
  assert.equal(tok.unit, "percent");
  assert.equal(tok.value, 45.0, `quoted % must equal menu_blended_pct (45), not blended_pct (70). Got ${tok.value}`);
});

test("TIM-2428 — when COGS bench falls back to base_cogs_pct, the quoted % equals base_cogs_pct exactly", () => {
  const ps = buildState();
  ps.cogs.blended_pct = 70;
  ps.cogs.menu_blended_pct = null;     // no menu data
  ps.cogs.base_cogs_pct = 48;
  const out = runBenchmarkChecks(defaultInputs(ps));
  const f = out.find((x) => x.id === "bench:coffee_shop_blended_cogs_pct");
  assert.ok(f, "COGS bench should fire on base_cogs_pct fallback at 48%");
  const tok = extractQuotedValue(f.raw_message);
  assert.equal(tok.value, 48.0);
});
