// TIM-717 / TIM-621-AI — sanity checks unit tests.
// Each rule gets a positive (flag fires) and negative (flag silent) case, plus
// a seeded plan test proving the acceptance criterion: under-labor + no owner
// salary surfaces ≥3 flags.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAiFindings,
  runFinancialsSanityChecks,
} from "./sanityChecks.ts";

const HEALTHY_PLAN = {
  schema_version: 1,
  startup_costs: [
    { id: "1", category: "build_out", label: "Build-out", amount_cents: 8000000 },
  ],
  monthly_pnl: {
    revenue: [
      { id: "1", stream: "coffee", label: "Coffee", monthly_cents: 5000000 },
    ],
    cogs_percent: 28,
    labor: [
      { id: "1", role: "owner", headcount: 1, monthly_cents: 600000 },
      { id: "2", role: "barista", headcount: 3, monthly_cents: 900000 },
    ],
    fixed_costs: [
      { id: "1", category: "rent", label: "Rent", monthly_cents: 500000 },
      { id: "2", category: "utilities", label: "Utilities", monthly_cents: 80000 },
    ],
  },
  funding: [
    { id: "1", source: "sba", label: "SBA loan", amount_cents: 12000000 },
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("returns empty array for non-objects and missing content", () => {
  assert.deepEqual(runFinancialsSanityChecks(null), []);
  assert.deepEqual(runFinancialsSanityChecks(undefined), []);
  assert.deepEqual(runFinancialsSanityChecks("not-an-object"), []);
  assert.deepEqual(runFinancialsSanityChecks([]), []);
});

test("healthy plan produces zero flags (negative-case smoke for every rule)", () => {
  const flags = runFinancialsSanityChecks(HEALTHY_PLAN);
  assert.deepEqual(flags, [], `expected no flags, got: ${JSON.stringify(flags, null, 2)}`);
});

test("labor_underbudget fires when labor < 25% of revenue", () => {
  const plan = clone(HEALTHY_PLAN);
  // Labor totals 300k cents on 5M revenue = 6%, well below threshold.
  plan.monthly_pnl.labor = [
    { id: "1", role: "owner", headcount: 1, monthly_cents: 200000 },
    { id: "2", role: "barista", headcount: 1, monthly_cents: 100000 },
  ];
  const flags = runFinancialsSanityChecks(plan);
  const rule = flags.find((f) => f.rule_id === "labor_underbudget");
  assert.ok(rule, "expected labor_underbudget flag");
  assert.equal(rule.severity, "warn");
});

test("labor_underbudget silent when labor ≥ 25% of revenue", () => {
  const plan = clone(HEALTHY_PLAN);
  // 1.5M / 5M = 30%.
  const flags = runFinancialsSanityChecks(plan);
  assert.equal(flags.find((f) => f.rule_id === "labor_underbudget"), undefined);
});

test("no_owner_salary fires when owner monthly_cents is 0", () => {
  const plan = clone(HEALTHY_PLAN);
  plan.monthly_pnl.labor = [
    { id: "1", role: "owner", headcount: 1, monthly_cents: 0 },
    { id: "2", role: "barista", headcount: 3, monthly_cents: 1500000 },
  ];
  const flags = runFinancialsSanityChecks(plan);
  const rule = flags.find((f) => f.rule_id === "no_owner_salary");
  assert.ok(rule, "expected no_owner_salary flag");
});

test("no_owner_salary silent when owner is paid", () => {
  const flags = runFinancialsSanityChecks(HEALTHY_PLAN);
  assert.equal(flags.find((f) => f.rule_id === "no_owner_salary"), undefined);
});

test("rent_over_threshold fires when rent > 12% of revenue", () => {
  const plan = clone(HEALTHY_PLAN);
  plan.monthly_pnl.fixed_costs = [
    { id: "1", category: "rent", label: "Rent", monthly_cents: 800000 }, // 16% of 5M
  ];
  const flags = runFinancialsSanityChecks(plan);
  const rule = flags.find((f) => f.rule_id === "rent_over_threshold");
  assert.ok(rule, "expected rent_over_threshold flag");
});

test("rent_over_threshold silent when rent ≤ 12% of revenue", () => {
  const flags = runFinancialsSanityChecks(HEALTHY_PLAN);
  assert.equal(flags.find((f) => f.rule_id === "rent_over_threshold"), undefined);
});

test("no_runway_buffer (error) fires when funding < startup costs", () => {
  const plan = clone(HEALTHY_PLAN);
  plan.funding = [{ id: "1", source: "self", label: "Savings", amount_cents: 2000000 }];
  // Startup is 8M, funding 2M.
  const flags = runFinancialsSanityChecks(plan);
  const rule = flags.find((f) => f.rule_id === "no_runway_buffer");
  assert.ok(rule, "expected no_runway_buffer flag");
  assert.equal(rule.severity, "error");
});

test("no_runway_buffer (warn) fires when reserve < 3 months of fixed costs", () => {
  const plan = clone(HEALTHY_PLAN);
  // Startup 8M, funding 8.5M → reserve 500k. Fixed = rent 500k + util 80k = 580k.
  // Reserve months = 500k / 580k ≈ 0.86 < 3.
  plan.funding = [{ id: "1", source: "sba", label: "SBA", amount_cents: 8500000 }];
  const flags = runFinancialsSanityChecks(plan);
  const rule = flags.find((f) => f.rule_id === "no_runway_buffer");
  assert.ok(rule, "expected no_runway_buffer flag");
  assert.equal(rule.severity, "warn");
});

test("no_runway_buffer silent when reserve covers ≥ 3 months of fixed costs", () => {
  const flags = runFinancialsSanityChecks(HEALTHY_PLAN);
  // funding 12M − startup 8M = 4M reserve; fixed 580k/mo → ~6.9 months.
  assert.equal(flags.find((f) => f.rule_id === "no_runway_buffer"), undefined);
});

test("break_even_too_late fires when projected break-even is past month 12", () => {
  const plan = clone(HEALTHY_PLAN);
  // Shrink revenue so break-even slips past month 12.
  plan.monthly_pnl.revenue = [
    { id: "1", stream: "coffee", label: "Coffee", monthly_cents: 2200000 },
  ];
  const flags = runFinancialsSanityChecks(plan);
  const rule = flags.find((f) => f.rule_id === "break_even_too_late");
  assert.ok(rule, "expected break_even_too_late flag");
});

test("break_even_too_late silent when break-even is within 12 months", () => {
  const flags = runFinancialsSanityChecks(HEALTHY_PLAN);
  // Healthy plan: monthly net ≈ 5M − 1.4M cogs − 1.5M labor − 580k fixed = 1.52M.
  // Startup 8M → ~6 months to break-even.
  assert.equal(flags.find((f) => f.rule_id === "break_even_too_late"), undefined);
});

test("cogs_unrealistic fires when cogs_percent is below 22", () => {
  const plan = clone(HEALTHY_PLAN);
  plan.monthly_pnl.cogs_percent = 15;
  const flags = runFinancialsSanityChecks(plan);
  const rule = flags.find((f) => f.rule_id === "cogs_unrealistic");
  assert.ok(rule, "expected cogs_unrealistic flag");
  assert.equal(rule.severity, "warn");
});

test("cogs_unrealistic fires (error) when cogs_percent is above 38", () => {
  const plan = clone(HEALTHY_PLAN);
  plan.monthly_pnl.cogs_percent = 45;
  const flags = runFinancialsSanityChecks(plan);
  const rule = flags.find((f) => f.rule_id === "cogs_unrealistic");
  assert.ok(rule, "expected cogs_unrealistic flag");
  assert.equal(rule.severity, "error");
});

test("cogs_unrealistic silent when cogs_percent is in band", () => {
  const flags = runFinancialsSanityChecks(HEALTHY_PLAN);
  assert.equal(flags.find((f) => f.rule_id === "cogs_unrealistic"), undefined);
});

test("acceptance: seeded under-labor + no-owner-salary plan surfaces ≥3 flags", () => {
  // Mirrors the issue acceptance: a plan with under-labor and no owner salary
  // must surface at least 3 flags so the AI drawer has real content to discuss.
  const plan = {
    schema_version: 1,
    startup_costs: [
      { id: "1", category: "build_out", label: "Build-out", amount_cents: 12000000 },
      { id: "2", category: "equipment", label: "Equipment", amount_cents: 4000000 },
    ],
    monthly_pnl: {
      revenue: [
        { id: "1", stream: "coffee", label: "Coffee", monthly_cents: 4000000 },
      ],
      cogs_percent: 28,
      labor: [
        // 800k / 4M = 20% — under-labor.
        { id: "1", role: "owner", headcount: 1, monthly_cents: 0 }, // no owner salary
        { id: "2", role: "barista", headcount: 2, monthly_cents: 800000 },
      ],
      fixed_costs: [
        { id: "1", category: "rent", label: "Rent", monthly_cents: 400000 },
      ],
    },
    funding: [
      { id: "1", source: "self", label: "Savings", amount_cents: 13000000 },
    ],
  };
  const flags = runFinancialsSanityChecks(plan);
  assert.ok(
    flags.length >= 3,
    `expected ≥3 flags, got ${flags.length}: ${flags.map((f) => f.rule_id).join(", ")}`,
  );
  const ids = flags.map((f) => f.rule_id);
  assert.ok(ids.includes("labor_underbudget"), "missing labor_underbudget");
  assert.ok(ids.includes("no_owner_salary"), "missing no_owner_salary");
});

test("buildAiFindings wraps flags with last_run_at timestamp", () => {
  const fixed = new Date("2026-05-17T00:00:00.000Z");
  const findings = buildAiFindings(HEALTHY_PLAN, fixed);
  assert.equal(findings.last_run_at, fixed.toISOString());
  assert.deepEqual(findings.flags, []);
});
