// TIM-2426: hiring↔financials resolver — pure-function tests.
//
// Run via node:test with --experimental-strip-types so .ts can load directly:
//   node --test --experimental-strip-types --experimental-transform-types \
//     src/lib/cross-suite/hiring-financials.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectHiringFinancialsConflict } from "./hiring-financials.ts";

// Trent's canonical 7-people case from the UX spec §2a/2b.
const trentInput = {
  hiringRoles: [
    { id: "r1", role_title: "Owner / Manager", headcount: 1, monthly_cost_cents: 450_000, start_date: "2026-09-01" },
    { id: "r2", role_title: "Lead Barista", headcount: 2, monthly_cost_cents: 320_000, start_date: "2026-09-01" },
    { id: "r3", role_title: "Barista", headcount: 3, monthly_cost_cents: 280_000, start_date: "2026-09-15" },
    { id: "r4", role_title: "Part-time Shift Lead", headcount: 1, monthly_cost_cents: 240_000, start_date: "2026-09-20" },
  ],
  financialsLabor: {
    total_headcount: 5,
    monthly_loaded_cost_cents: 1_560_000, // $15,600
  },
  monthlyRevenueCents: 5_200_000, // $52,000
  laborPctBand: {
    min: 0.28,
    max: 0.35,
    source: "Specialty Coffee Association cafe benchmarking",
  },
  currencyCode: "USD",
};

test("returns null when both sides agree on headcount", () => {
  const result = detectHiringFinancialsConflict({
    ...trentInput,
    financialsLabor: { total_headcount: 7, monthly_loaded_cost_cents: 2_170_000 },
  });
  assert.equal(result, null);
});

test("returns null when one side is unset (empty hiring suite)", () => {
  const result = detectHiringFinancialsConflict({
    ...trentInput,
    hiringRoles: [],
  });
  assert.equal(result, null);
});

test("Trent fixture surfaces a 3-path conflict with phased as recommended", () => {
  const c = detectHiringFinancialsConflict(trentInput);
  assert.ok(c, "should detect");
  assert.equal(c.id, "hiring_financials_headcount");
  assert.equal(c.kind, "numeric");
  assert.match(c.statement, /hiring plan and financial plan disagree/i);
  // Suite snapshots populated with Trent's numbers.
  assert.equal(c.suiteA.displayValue, "7 people");
  assert.match(c.suiteA.displaySubvalue ?? "", /\$21,700\/month/);
  assert.equal(c.suiteB.displayValue, "5 people");
  assert.match(c.suiteB.displaySubvalue ?? "", /\$15,600\/month/);
  assert.match(c.gapLabel ?? "", /\$6,100/);
  // Benchmark band rendered with anchors.
  assert.ok(c.benchmark, "benchmark zone present");
  assert.equal(c.benchmark.rangeLabel, "28.0% to 35.0% of revenue");
  // 21,700 / 52,000 = 41.7% (UX spec quoted 39.8% — arithmetic-spec gap).
  assert.match(c.benchmark.currentLabel, /41\.\d+%/);
  assert.match(c.benchmark.anchorMinLabel ?? "", /\$14,560/);
  assert.match(c.benchmark.anchorMaxLabel ?? "", /\$18,200/);
  // Three paths.
  assert.equal(c.paths.length, 3);
  const ids = c.paths.map((p) => p.id).sort();
  assert.deepEqual(ids, ["phased_hires", "raise_budget", "trim_hiring"]);
  // Phased is recommended for Trent (current labor pct > band ceiling).
  assert.equal(c.recommendedPathId, "phased_hires");
});

test("path A (trim) suggests cards that zero out the last 2 headcount slots", () => {
  const c = detectHiringFinancialsConflict(trentInput);
  const trim = c.paths.find((p) => p.id === "trim_hiring");
  assert.ok(trim);
  // Trent has roles ending with r3 (Barista, 3) and r4 (PT Shift Lead, 1).
  // We need to defer 2 headcount slots — r4 covers 1, then r3 covers the next 1.
  // Detector returns 2 candidate roles; each gets a "headcount → 0" suggestion.
  const fields = trim.suggestions.map((s) => s.fieldId);
  assert.equal(trim.suggestions.length, 2);
  for (const f of fields) {
    assert.match(f, /^cross_suite:hiring_financials_headcount:trim_hiring:hiring:r[34]:headcount$/);
  }
  // Each card carries originalValue = current headcount, proposed = "0".
  for (const s of trim.suggestions) {
    assert.equal(s.proposedValue, "0");
    assert.match(s.fieldLabel, /headcount$/);
  }
  // Downstream effects include payroll restoration + labor pct rollback.
  const labels = trim.downstreamEffects.map((e) => e.field);
  assert.ok(labels.includes("Monthly payroll"));
  assert.ok(labels.includes("Labor as % of revenue"));
});

test("path B (raise) flags lender risk when post-raise pct stays above band", () => {
  const c = detectHiringFinancialsConflict(trentInput);
  const raise = c.paths.find((p) => p.id === "raise_budget");
  assert.ok(raise);
  // 39.8% > 35% benchmark ceiling — labor pct effect should be "block".
  const laborPctRow = raise.downstreamEffects.find((e) => e.field === "Labor as % of revenue");
  assert.ok(laborPctRow);
  assert.equal(laborPctRow.risk, "block");
  assert.match(laborPctRow.note ?? "", /benchmark|lender/i);
  // Single suggestion card pointing at the financials payroll field.
  assert.equal(raise.suggestions.length, 1);
  assert.match(raise.suggestions[0].fieldId, /financials:payroll:monthly_cents/);
});

test("path C (phased) shifts deferred role start dates by 3 months", () => {
  const c = detectHiringFinancialsConflict(trentInput);
  const phase = c.paths.find((p) => p.id === "phased_hires");
  assert.ok(phase);
  // Phased suggestions only fire for roles with a start_date set. Trent's
  // r3 has 2026-09-15 and r4 has 2026-09-20; both should shift +3 months.
  for (const s of phase.suggestions) {
    assert.match(s.fieldId, /start_date$/);
    // YYYY-12-DD because Sep + 3 months = Dec.
    assert.match(s.proposedValue, /^\d{4}-12-/);
  }
});

test("hides benchmark zone when no laborPctBand is provided", () => {
  const c = detectHiringFinancialsConflict({ ...trentInput, laborPctBand: null });
  assert.ok(c);
  assert.equal(c.benchmark, null);
  // Without a band, phased shouldn't be auto-recommended; falls back to trim.
  assert.equal(c.recommendedPathId, "trim_hiring");
});

test("hides benchmark zone when revenue is missing", () => {
  const c = detectHiringFinancialsConflict({ ...trentInput, monthlyRevenueCents: 0 });
  assert.ok(c);
  assert.equal(c.benchmark, null);
});

test("when financials side is higher than hiring, paths invert", () => {
  const c = detectHiringFinancialsConflict({
    ...trentInput,
    hiringRoles: [
      { id: "r1", role_title: "Owner", headcount: 1, monthly_cost_cents: 450_000, start_date: "2026-09-01" },
      { id: "r2", role_title: "Barista", headcount: 1, monthly_cost_cents: 320_000, start_date: "2026-09-01" },
    ],
    // Financials models 5 people but hiring suite only plans for 2.
  });
  assert.ok(c);
  assert.equal(c.suiteA.displayValue, "2 people");
  assert.equal(c.suiteB.displayValue, "5 people");
  // Phased not meaningful when hiring is lower → only the two main paths.
  assert.equal(c.paths.length, 2);
  // "Trim" path now points at financials (reduce its headcount), no hiring cards.
  const trim = c.paths.find((p) => p.id === "trim_hiring");
  assert.ok(trim);
  assert.equal(trim.suggestions.length, 0);
});
