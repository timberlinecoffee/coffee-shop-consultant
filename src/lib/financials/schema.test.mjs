// TIM-713: Unit tests for Financials JSONB schema + parseFinancialsContent helper.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFinancialsContent, FinancialsContentSchema } from "./schema.ts";
import { EMPTY_FINANCIALS } from "./defaults.ts";

// ── empty object → defaults ───────────────────────────────────────────────

test("empty object produces EMPTY_FINANCIALS defaults", () => {
  const result = parseFinancialsContent({});
  assert.equal(result.schema_version, 1);
  assert.deepEqual(result.startup_costs, []);
  assert.deepEqual(result.funding, []);
  assert.deepEqual(result.monthly_pnl.revenue, []);
  assert.deepEqual(result.monthly_pnl.labor, []);
  assert.deepEqual(result.monthly_pnl.fixed_costs, []);
  assert.equal(result.monthly_pnl.cogs_percent, 28);
  assert.deepEqual(result.break_even, {});
  assert.equal(result.ai_findings, undefined);
});

test("null/undefined input produces EMPTY_FINANCIALS defaults", () => {
  assert.equal(parseFinancialsContent(null).schema_version, 1);
  assert.equal(parseFinancialsContent(undefined).schema_version, 1);
  assert.equal(parseFinancialsContent("bad").schema_version, 1);
});

// ── partial object → fills missing fields with defaults ──────────────────

test("partial object merges over defaults", () => {
  const result = parseFinancialsContent({
    schema_version: 1,
    startup_costs: [
      { id: "abc", category: "equipment", label: "Espresso machine", amount_cents: 1200000 },
    ],
  });
  assert.equal(result.startup_costs.length, 1);
  assert.equal(result.startup_costs[0].amount_cents, 1200000);
  // Fields not provided should still be arrays/defaults.
  assert.deepEqual(result.funding, []);
  assert.equal(result.monthly_pnl.cogs_percent, 28);
});

test("partial monthly_pnl fills sub-fields with defaults", () => {
  const result = parseFinancialsContent({
    schema_version: 1,
    monthly_pnl: {
      revenue: [{ id: "r1", stream: "coffee", label: "Espresso bar", monthly_cents: 3000000 }],
    },
  });
  assert.equal(result.monthly_pnl.revenue.length, 1);
  assert.deepEqual(result.monthly_pnl.labor, []);
  assert.deepEqual(result.monthly_pnl.fixed_costs, []);
  assert.equal(result.monthly_pnl.cogs_percent, 28);
});

// ── full valid object round-trips ─────────────────────────────────────────

test("full valid object round-trips correctly", () => {
  const full = {
    schema_version: 1,
    startup_costs: [
      { id: "s1", category: "build_out", label: "Renovation", amount_cents: 5000000, note: "contractor quote" },
    ],
    monthly_pnl: {
      revenue: [{ id: "r1", stream: "coffee", label: "Espresso bar", monthly_cents: 3000000 }],
      cogs_percent: 30,
      labor: [{ id: "l1", role: "owner", headcount: 1, monthly_cents: 400000 }],
      fixed_costs: [{ id: "f1", category: "rent", label: "Lease", monthly_cents: 350000 }],
    },
    break_even: { assumptions_note: "steady state by month 6" },
    funding: [{ id: "fu1", source: "sba", label: "SBA 7(a)", amount_cents: 15000000, terms_note: "10yr @ 6.5%" }],
    ai_findings: {
      last_run_at: "2026-05-16T00:00:00Z",
      flags: [{ rule_id: "labor_underbudget", severity: "warn", message: "Labor < 25% of revenue", evidence: "25% threshold" }],
    },
  };
  const result = parseFinancialsContent(full);
  assert.equal(result.schema_version, 1);
  assert.equal(result.startup_costs[0].amount_cents, 5000000);
  assert.equal(result.monthly_pnl.cogs_percent, 30);
  assert.equal(result.monthly_pnl.labor[0].role, "owner");
  assert.equal(result.funding[0].source, "sba");
  assert.equal(result.ai_findings?.flags[0].rule_id, "labor_underbudget");
  assert.equal(result.ai_findings?.flags[0].severity, "warn");
});

// ── invalid types are rejected by zod schema ─────────────────────────────

test("zod schema rejects non-integer cents", () => {
  const result = FinancialsContentSchema.safeParse({
    schema_version: 1,
    startup_costs: [
      { id: "s1", category: "equipment", label: "Grinder", amount_cents: 1200.50 },
    ],
  });
  assert.equal(result.success, false);
});

test("zod schema rejects invalid category enum", () => {
  const result = FinancialsContentSchema.safeParse({
    schema_version: 1,
    startup_costs: [
      { id: "s1", category: "bad_category", label: "Something", amount_cents: 100 },
    ],
  });
  assert.equal(result.success, false);
});

test("zod schema rejects invalid severity enum", () => {
  const result = FinancialsContentSchema.safeParse({
    schema_version: 1,
    ai_findings: {
      last_run_at: "2026-05-16T00:00:00Z",
      flags: [{ rule_id: "test", severity: "critical", message: "bad" }],
    },
  });
  assert.equal(result.success, false);
});

test("zod schema rejects wrong schema_version", () => {
  const result = FinancialsContentSchema.safeParse({ schema_version: 2 });
  assert.equal(result.success, false);
});

test("zod schema rejects negative amount_cents", () => {
  const result = FinancialsContentSchema.safeParse({
    schema_version: 1,
    startup_costs: [
      { id: "s1", category: "equipment", label: "Grinder", amount_cents: -500 },
    ],
  });
  assert.equal(result.success, false);
});

// ── EMPTY_FINANCIALS is a valid seed ──────────────────────────────────────

test("EMPTY_FINANCIALS passes zod schema validation", () => {
  const result = FinancialsContentSchema.safeParse(EMPTY_FINANCIALS);
  assert.equal(result.success, true);
});

test("roundtrip: EMPTY_FINANCIALS survives JSON serialization", () => {
  const serialized = JSON.stringify(EMPTY_FINANCIALS);
  const result = parseFinancialsContent(JSON.parse(serialized));
  assert.equal(result.schema_version, 1);
  assert.deepEqual(result.startup_costs, []);
});
