// TIM-2426/TIM-2452: hiring↔financials resolver — pure-function tests.
//
// Run via node:test with --experimental-strip-types so .ts can load directly:
//   node --test --experimental-strip-types --experimental-transform-types \
//     src/lib/cross-suite/hiring-financials.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectHiringFinancialsConflict } from "./hiring-financials.ts";

// ── Fixture A: spec case — hiring OVERSHOOTS the budget ───────────────────────
// 7 hiring (cost $21,700/mo) vs 5 financials ($15,600/mo). Hiring's monthly
// cost is ABOVE the budget; canonical labor % ($15,600/$52,000) = 30.0%, which
// is INSIDE the SCA band. So "raise" is fine, but phased should NOT fire
// because the band isn't breached.
const overshootInput = {
  hiringRoles: [
    { id: "r1", role_title: "Owner / Manager", headcount: 1, monthly_cost_cents: 450_000, start_date: "2026-09-01" },
    { id: "r2", role_title: "Lead Barista", headcount: 2, monthly_cost_cents: 320_000, start_date: "2026-09-01" },
    { id: "r3", role_title: "Barista", headcount: 3, monthly_cost_cents: 280_000, start_date: "2026-09-15" },
    { id: "r4", role_title: "Part-time Shift Lead", headcount: 1, monthly_cost_cents: 240_000, start_date: "2026-09-20" },
  ],
  financialsLabor: {
    total_headcount: 5,
    monthly_loaded_cost_cents: 1_560_000, // $15,600 → 30.0% of $52,000 (within band)
  },
  monthlyRevenueCents: 5_200_000,
  laborPctBand: { min: 0.28, max: 0.35, source: "Specialty Coffee Association cafe benchmarking" },
  currencyCode: "USD",
};

// ── Fixture B: prod board case — hiring is UNDER the budget ──────────────────
// 7 hiring @ $10,085/mo total. Financials 4 @ $10,600/mo budget. Hiring's
// monthly cost ≤ budget. Revenue $27,925/mo. Canonical labor %
// ($10,600/$27,925) = 37.96%, ABOVE the 35% ceiling — band IS breached.
// This is the scenario the board flagged on the live Trent fixture.
const prodSlackInput = {
  hiringRoles: [
    { id: "r1", role_title: "Owner / Manager", headcount: 1, monthly_cost_cents: 200_000, start_date: "2026-09-01" },
    { id: "r2", role_title: "Lead Barista", headcount: 2, monthly_cost_cents: 145_000, start_date: "2026-09-01" },
    { id: "r3", role_title: "Barista", headcount: 3, monthly_cost_cents: 130_000, start_date: "2026-09-15" },
    { id: "r4", role_title: "Part-time Shift Lead", headcount: 1, monthly_cost_cents: 128_500, start_date: "2026-09-20" },
  ],
  financialsLabor: {
    total_headcount: 4,
    monthly_loaded_cost_cents: 1_060_000, // $10,600
  },
  monthlyRevenueCents: 2_792_500, // $27,925/mo → 38% labor (over 35% ceiling)
  laborPctBand: { min: 0.28, max: 0.35, source: "Specialty Coffee Association cafe benchmarking" },
  currencyCode: "USD",
};

test("returns null when both sides agree on headcount", () => {
  const result = detectHiringFinancialsConflict({
    ...overshootInput,
    financialsLabor: { total_headcount: 7, monthly_loaded_cost_cents: 2_170_000 },
  });
  assert.equal(result, null);
});

test("returns null when one side is unset (empty hiring suite)", () => {
  const result = detectHiringFinancialsConflict({ ...overshootInput, hiringRoles: [] });
  assert.equal(result, null);
});

test("overshoot fixture surfaces a conflict with snapshots populated", () => {
  const c = detectHiringFinancialsConflict(overshootInput);
  assert.ok(c, "should detect");
  assert.equal(c.id, "hiring_financials_headcount");
  assert.equal(c.suiteA.displayValue, "7 people");
  assert.match(c.suiteA.displaySubvalue ?? "", /\$21,700\/month planned payroll/);
  assert.equal(c.suiteB.displayValue, "5 people");
  assert.match(c.suiteB.displaySubvalue ?? "", /\$15,600\/month budgeted payroll/);
});

test("overshoot fixture: gap label leads with dollar overshoot (board bug #4 fix)", () => {
  const c = detectHiringFinancialsConflict(overshootInput);
  // Hiring runs $21,700 > $15,600 budget → gap label should call out the
  // overshoot, NOT slack. Difference = $6,100.
  assert.match(c.gapLabel ?? "", /\$6,100\/month over the budgeted payroll/i);
});

test("overshoot fixture: canonical labor % anchors on the FINANCIALS side (board bug #6 fix)", () => {
  const c = detectHiringFinancialsConflict(overshootInput);
  assert.ok(c.benchmark, "benchmark zone present");
  // $15,600 / $52,000 = 30.0% (financials side) — not 41.7% (hiring side).
  assert.match(c.benchmark.currentLabel, /budgeted payroll runs at 30\.0% of revenue/);
  assert.match(c.benchmark.currentLabel, /within the 28\.0% to 35\.0% benchmark band/);
  assert.equal(c.benchmark.currentValue, 1_560_000 / 5_200_000);
});

test("overshoot fixture: range label uses 'of revenue on labor' wording, no inverted from→to", () => {
  const c = detectHiringFinancialsConflict(overshootInput);
  assert.match(c.benchmark.rangeLabel, /28\.0% to 35\.0% of revenue on labor/);
  const raise = c.paths.find((p) => p.id === "raise_budget");
  assert.ok(raise);
  // Summary must state from $15,600 → $21,700 (UP) — not the v1 inverted bug.
  assert.match(raise.summary, /from \$15,600 to \$21,700\/month/);
  assert.match(raise.label, /Raise the payroll budget/);
});

test("overshoot fixture without band breach: phased path is suppressed (board bug #5 fix)", () => {
  const c = detectHiringFinancialsConflict(overshootInput);
  // 30% canonical labor is INSIDE 28-35%, so phased shouldn't fire — it would
  // read as a duplicate of trim/raise with no distinct band-breach rationale.
  const ids = c.paths.map((p) => p.id).sort();
  assert.deepEqual(ids, ["raise_budget", "trim_hiring"]);
  assert.equal(c.bandBreachAlert, undefined);
});

test("overshoot fixture: trim_hiring suggestions zero out the last 2 headcount slots", () => {
  const c = detectHiringFinancialsConflict(overshootInput);
  const trim = c.paths.find((p) => p.id === "trim_hiring");
  assert.ok(trim);
  assert.equal(trim.suggestions.length, 2);
  for (const s of trim.suggestions) {
    assert.match(s.fieldId, /^cross_suite:hiring_financials_headcount:trim_hiring:hiring:r[34]:headcount$/);
    assert.equal(s.proposedValue, "0");
  }
});

test("overshoot fixture: raise_budget emits BOTH payroll AND headcount suggestions", () => {
  const c = detectHiringFinancialsConflict(overshootInput);
  const raise = c.paths.find((p) => p.id === "raise_budget");
  assert.ok(raise);
  const fieldIds = raise.suggestions.map((s) => s.fieldId).sort();
  // Both cards present so accepting the path actually resolves both sides
  // of the conflict (not just dollars, leaving headcount mismatch).
  assert.deepEqual(fieldIds, [
    "cross_suite:hiring_financials_headcount:raise_budget:financials:payroll:monthly_cents",
    "cross_suite:hiring_financials_headcount:raise_budget:financials:personnel:headcount",
  ]);
  const headcount = raise.suggestions.find((s) => /personnel:headcount$/.test(s.fieldId));
  assert.equal(headcount.proposedValue, "7");
  const payroll = raise.suggestions.find((s) => /payroll:monthly_cents$/.test(s.fieldId));
  assert.match(payroll.proposedValue, /\$21,700/);
});

// ── Board's production case: budget already covers hiring (slack + breach) ──

test("prod-slack fixture: detects the conflict", () => {
  const c = detectHiringFinancialsConflict(prodSlackInput);
  assert.ok(c);
  assert.equal(c.suiteA.displayValue, "7 people");
  assert.match(c.suiteA.displaySubvalue ?? "", /\$10,085\/month planned payroll/);
  assert.equal(c.suiteB.displayValue, "4 people");
  assert.match(c.suiteB.displaySubvalue ?? "", /\$10,600\/month budgeted payroll/);
});

test("prod-slack fixture: gap label leads with headcount, not 'under budget' (board bug #4 fix)", () => {
  const c = detectHiringFinancialsConflict(prodSlackInput);
  // Hiring is LOWER cost than budget — but the board flagged that v1's
  // "$515/month under budget" reads as exonerating when the band breach is
  // the real problem. Lead with the headcount gap.
  assert.match(c.gapLabel ?? "", /Headcount gap: hiring plan \+3 people vs financials/);
  // The slack itself can be mentioned as a footnote but must NOT be the lead.
  assert.match(c.gapLabel ?? "", /\$515\/month of slack/);
  assert.doesNotMatch(c.gapLabel ?? "", /^Gap: .* under budget$/);
});

test("prod-slack fixture: emits a bandBreachAlert (board bug #4 fix)", () => {
  const c = detectHiringFinancialsConflict(prodSlackInput);
  // 10,600 / 27,925 = 37.96% → above 35% ceiling. Alert must headline this.
  assert.ok(c.bandBreachAlert, "bandBreachAlert should fire when canonical > band.max");
  assert.match(c.bandBreachAlert, /budgeted payroll runs at 38\.0% of revenue/);
  assert.match(c.bandBreachAlert, /above the 35\.0% ceiling/);
});

test("prod-slack fixture: canonical labor % uses financials side, not hiring side (board bug #6 fix)", () => {
  const c = detectHiringFinancialsConflict(prodSlackInput);
  assert.ok(c.benchmark);
  // 10,600 / 27,925 = 37.96% (financials/canonical). Hiring side would be
  // 10,085 / 27,925 = 36.1%. v1 displayed the hiring side and called it the
  // user's number, drifting from the consistency engine.
  assert.match(c.benchmark.currentLabel, /budgeted payroll runs at 38\.0% of revenue/);
  assert.match(c.benchmark.currentLabel, /above the 35\.0% benchmark ceiling/);
  // currentValue numeric matches the canonical, not the hiring side.
  const expected = 1_060_000 / 2_792_500;
  assert.ok(Math.abs(c.benchmark.currentValue - expected) < 1e-9);
});

test("prod-slack fixture: raise_budget reframes as 'reflect the hiring plan' (board bug #2 fix)", () => {
  const c = detectHiringFinancialsConflict(prodSlackInput);
  const raise = c.paths.find((p) => p.id === "raise_budget");
  assert.ok(raise);
  // v1 title said "Raise the payroll budget" while the numbers went DOWN
  // ($10,600 → $10,085). Fixed copy: now reads as a downward sync.
  assert.match(raise.label, /Update your financial plan to reflect the hiring plan/);
  // Summary states the budget DROP, naming the slack amount.
  assert.match(raise.summary, /budget actually drops by \$515\/month/);
  // No "Raise" wording when dollars go down.
  assert.doesNotMatch(raise.label, /^Raise the payroll budget/);
});

test("prod-slack fixture: phased path is suppressed when budget has slack (board bug #5 fix)", () => {
  const c = detectHiringFinancialsConflict(prodSlackInput);
  // Even though canonical breaches the band, phased only makes sense when
  // hiring overshoots the budget — otherwise it duplicates the trim/sync
  // paths. v1 emitted three near-duplicate cards; v2 keeps two distinct ones.
  const ids = c.paths.map((p) => p.id).sort();
  assert.deepEqual(ids, ["raise_budget", "trim_hiring"]);
});

test("prod-slack fixture: recommendedPathId picks downward sync, not trim", () => {
  const c = detectHiringFinancialsConflict(prodSlackInput);
  // The hiring plan is cheaper than the budget — accepting it actually
  // helps the band breach by reducing modeled payroll. Recommend the sync.
  assert.equal(c.recommendedPathId, "raise_budget");
});

// ── Existing path-shape contracts (still valid) ──────────────────────────────

test("trim_hiring effects describe band position correctly (board bug #3 fix)", () => {
  const c = detectHiringFinancialsConflict(prodSlackInput);
  const trim = c.paths.find((p) => p.id === "trim_hiring");
  assert.ok(trim);
  const budgetedRow = trim.downstreamEffects.find((e) => e.field === "Budgeted labor as % of revenue");
  assert.ok(budgetedRow);
  // Must classify against ceiling numerically — 38% is above 35%, NOT within.
  assert.match(budgetedRow.note ?? "", /above the 35\.0% benchmark ceiling/);
  assert.doesNotMatch(budgetedRow.note ?? "", /within/);
});

test("buildPhaseEffects: 'within band' classification is computed, not asserted (board bug #3 fix)", () => {
  // Make a fixture where phased fires (overshoot + band breach) and the
  // post-phase pct is BELOW the floor — the row must classify accordingly.
  const breachInput = {
    ...overshootInput,
    // Push canonical above the ceiling: $20K budget / $52K revenue = 38.5%
    financialsLabor: { total_headcount: 5, monthly_loaded_cost_cents: 2_000_000 },
    // And hiring even higher so phased fires (hiringMonthlyCents > finMonthlyCents):
    hiringRoles: [
      { id: "r1", role_title: "Owner", headcount: 2, monthly_cost_cents: 600_000, start_date: "2026-09-01" },
      { id: "r2", role_title: "Lead", headcount: 3, monthly_cost_cents: 500_000, start_date: "2026-09-01" },
      { id: "r3", role_title: "Barista", headcount: 3, monthly_cost_cents: 400_000, start_date: "2026-09-15" },
    ],
  };
  const c = detectHiringFinancialsConflict(breachInput);
  const phase = c.paths.find((p) => p.id === "phased_hires");
  assert.ok(phase, "phased should fire (overshoot + breach)");
  const rows = phase.downstreamEffects;
  const startRow = rows.find((e) => /Months 1.*payroll/.test(e.field));
  assert.ok(startRow);
  // The note should describe the band position truthfully (not hardcoded
  // 'within X-Y band' regardless of value).
  assert.ok(/within|above|below/.test(startRow.note ?? ""));
});

test("hides benchmark zone when no laborPctBand is provided", () => {
  const c = detectHiringFinancialsConflict({ ...overshootInput, laborPctBand: null });
  assert.ok(c);
  assert.equal(c.benchmark, null);
  // Without a band, phased shouldn't fire; fallback recommendation = trim.
  assert.equal(c.recommendedPathId, "trim_hiring");
  assert.equal(c.bandBreachAlert, undefined);
});

test("hides benchmark zone when revenue is missing", () => {
  const c = detectHiringFinancialsConflict({ ...overshootInput, monthlyRevenueCents: 0 });
  assert.ok(c);
  assert.equal(c.benchmark, null);
});

test("when financials side is higher than hiring, paths invert", () => {
  const c = detectHiringFinancialsConflict({
    ...overshootInput,
    hiringRoles: [
      { id: "r1", role_title: "Owner", headcount: 1, monthly_cost_cents: 450_000, start_date: "2026-09-01" },
      { id: "r2", role_title: "Barista", headcount: 1, monthly_cost_cents: 320_000, start_date: "2026-09-01" },
    ],
  });
  assert.ok(c);
  assert.equal(c.suiteA.displayValue, "2 people");
  assert.equal(c.suiteB.displayValue, "5 people");
  assert.equal(c.paths.length, 2);
  const trim = c.paths.find((p) => p.id === "trim_hiring");
  assert.ok(trim);
  assert.equal(trim.suggestions.length, 0);
});

test("path summaries differ enough to not read as duplicates (board bug #5 fix)", () => {
  // Take the trent fixture but push it into the "breach + overshoot" zone so
  // all three paths fire, then assert the summaries diverge in concrete moves.
  const breachInput = {
    ...overshootInput,
    financialsLabor: { total_headcount: 5, monthly_loaded_cost_cents: 2_000_000 },
    hiringRoles: [
      { id: "r1", role_title: "Owner", headcount: 2, monthly_cost_cents: 600_000, start_date: "2026-09-01" },
      { id: "r2", role_title: "Lead", headcount: 3, monthly_cost_cents: 500_000, start_date: "2026-09-01" },
      { id: "r3", role_title: "Barista", headcount: 3, monthly_cost_cents: 400_000, start_date: "2026-09-15" },
    ],
  };
  const c = detectHiringFinancialsConflict(breachInput);
  const trim = c.paths.find((p) => p.id === "trim_hiring");
  const raise = c.paths.find((p) => p.id === "raise_budget");
  const phase = c.paths.find((p) => p.id === "phased_hires");
  assert.ok(trim && raise && phase);
  // Distinct one-line "what happens" — trim talks deferral, raise talks
  // budget increase + headcount bump, phase talks start-date staging.
  assert.match(trim.summary, /Defer/i);
  assert.match(raise.summary, /Increase Financials payroll budget/i);
  assert.match(phase.summary, /push the last .* start date/i);
});
