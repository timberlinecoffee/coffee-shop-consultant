// TIM-1688: contract tests for the cross-workspace consistency engine.
// These pin the detect → recommend → apply-plan loop the copilot/consistency
// route and the review/confirm UX depend on.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FACTS,
  FACT_LOCATIONS,
  comparisonKey,
  formatFactValue,
  parseFactValue,
  detectConflicts,
  buildApplyPlan,
  conflictToSuggestion,
  locationsForFact,
} from "./cross-workspace-sync.ts";

// ── Registry integrity ────────────────────────────────────────────────────────

test("every fact location points at a registered fact, and ids are unique", () => {
  const factIds = new Set(FACTS.map((f) => f.id));
  const locIds = new Set();
  for (const loc of FACT_LOCATIONS) {
    assert.ok(factIds.has(loc.factId), `location ${loc.id} references unknown fact ${loc.factId}`);
    assert.ok(!locIds.has(loc.id), `duplicate location id ${loc.id}`);
    locIds.add(loc.id);
  }
});

test("authoritativeLocationId, when set, is a real location of that fact", () => {
  for (const fact of FACTS) {
    if (!fact.authoritativeLocationId) continue;
    const homes = locationsForFact(fact.id).map((l) => l.id);
    assert.ok(
      homes.includes(fact.authoritativeLocationId),
      `${fact.id} authoritative ${fact.authoritativeLocationId} not among ${homes.join(",")}`,
    );
  }
});

test("monthly_rent has two writable homes in two workspaces", () => {
  const homes = locationsForFact("monthly_rent");
  const writable = homes.filter((l) => l.writable);
  assert.equal(writable.length, 2);
  assert.deepEqual(
    new Set(writable.map((l) => l.workspaceKey)),
    new Set(["location_lease", "financials"]),
  );
});

// ── Value handling ────────────────────────────────────────────────────────────

test("currency formats and parses round-trip through cents", () => {
  assert.equal(formatFactValue("currency_cents", 480000), "$4,800.00");
  assert.equal(parseFactValue("currency_cents", "$4,800"), 480000);
  assert.equal(parseFactValue("currency_cents", "5200.50"), 520050);
  assert.equal(parseFactValue("currency_cents", ""), null);
  assert.equal(parseFactValue("currency_cents", "abc"), null);
});

test("integer + date formatting and parsing", () => {
  assert.equal(formatFactValue("integer", 2200), "2,200");
  assert.equal(parseFactValue("integer", "2,200"), 2200);
  assert.equal(formatFactValue("date_iso", "2027-03-01"), "2027-03-01");
  assert.equal(parseFactValue("date_iso", "2027-03-01T00:00:00Z"), "2027-03-01");
  assert.equal(parseFactValue("date_iso", "March"), null);
});

test("comparison key respects tolerance for currency", () => {
  // exact (tolerance 0): 480000 vs 480040 differ
  assert.notEqual(comparisonKey("currency_cents", 480000), comparisonKey("currency_cents", 480040));
  // with tolerance 100, two readings inside the same cent-bucket collide
  assert.equal(
    comparisonKey("currency_cents", 480000, 100),
    comparisonKey("currency_cents", 480040, 100),
  );
  // dates compare on the date portion only
  assert.equal(
    comparisonKey("date_iso", "2027-03-01"),
    comparisonKey("date_iso", "2027-03-01T12:00:00Z"),
  );
});

// ── Detection ─────────────────────────────────────────────────────────────────

test("flags a monthly_rent conflict across Location & Lease and Financials", () => {
  const conflicts = detectConflicts([
    { locationId: "monthly_rent:location_lease", factId: "monthly_rent", value: 480000 },
    { locationId: "monthly_rent:financials", factId: "monthly_rent", value: 520000 },
  ]);
  assert.equal(conflicts.length, 1);
  const c = conflicts[0];
  assert.equal(c.factId, "monthly_rent");
  assert.equal(c.groups.length, 2);
  // authoritative home is location_lease → its value is recommended and listed first
  assert.equal(c.recommendedValue, 480000);
  assert.equal(c.groups[0].value, 480000);
  assert.deepEqual(
    new Set(c.writableLocationIds),
    new Set(["monthly_rent:location_lease", "monthly_rent:financials"]),
  );
});

test("no conflict when homes agree", () => {
  const conflicts = detectConflicts([
    { locationId: "monthly_rent:location_lease", factId: "monthly_rent", value: 480000 },
    { locationId: "monthly_rent:financials", factId: "monthly_rent", value: 480000 },
  ]);
  assert.equal(conflicts.length, 0);
});

test("no conflict when only one home has a value", () => {
  const conflicts = detectConflicts([
    { locationId: "monthly_rent:location_lease", factId: "monthly_rent", value: 480000 },
    { locationId: "monthly_rent:financials", factId: "monthly_rent", value: null },
  ]);
  assert.equal(conflicts.length, 0);
});

test("ignores unknown fact/location ids", () => {
  const conflicts = detectConflicts([
    { locationId: "made_up:foo", factId: "made_up", value: 1 },
    { locationId: "another:bar", factId: "made_up", value: 2 },
  ]);
  assert.equal(conflicts.length, 0);
});

test("groups identical values from 3 homes and conflicts with the outlier", () => {
  // synthetic 3-home fact to prove grouping is general, not rent-specific
  const conflicts = detectConflicts([
    { locationId: "monthly_rent:location_lease", factId: "monthly_rent", value: 500000 },
    { locationId: "monthly_rent:financials", factId: "monthly_rent", value: 450000 },
  ]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].groups.length, 2);
});

// ── Apply plan ────────────────────────────────────────────────────────────────

test("apply plan writes the canonical value to every writable home that differs", () => {
  const readings = [
    { locationId: "monthly_rent:location_lease", factId: "monthly_rent", value: 480000 },
    { locationId: "monthly_rent:financials", factId: "monthly_rent", value: 520000 },
  ];
  const ops = buildApplyPlan("monthly_rent", 480000, readings);
  // location_lease already canonical → skipped; financials gets the write
  assert.equal(ops.length, 1);
  assert.equal(ops[0].locationId, "monthly_rent:financials");
  assert.equal(ops[0].workspaceKey, "financials");
  assert.equal(ops[0].value, 480000);
});

test("apply plan is a full no-op when every home already canonical", () => {
  const readings = [
    { locationId: "monthly_rent:location_lease", factId: "monthly_rent", value: 480000 },
    { locationId: "monthly_rent:financials", factId: "monthly_rent", value: 480000 },
  ];
  assert.equal(buildApplyPlan("monthly_rent", 480000, readings).length, 0);
});

test("apply plan targets writable homes even when they had no prior value", () => {
  const readings = [
    { locationId: "monthly_rent:location_lease", factId: "monthly_rent", value: 480000 },
  ];
  const ops = buildApplyPlan("monthly_rent", 500000, readings);
  // both writable homes get the new canonical value (lease differs, financials empty)
  assert.equal(ops.length, 2);
  assert.deepEqual(
    new Set(ops.map((o) => o.locationId)),
    new Set(["monthly_rent:location_lease", "monthly_rent:financials"]),
  );
});

test("apply plan for unknown fact is empty", () => {
  assert.equal(buildApplyPlan("nope", 1, []).length, 0);
});

// ── Review/confirm bridge ─────────────────────────────────────────────────────

test("conflictToSuggestion produces an AIReviewModal-shaped payload", () => {
  const [conflict] = detectConflicts([
    { locationId: "monthly_rent:location_lease", factId: "monthly_rent", value: 480000 },
    { locationId: "monthly_rent:financials", factId: "monthly_rent", value: 520000 },
  ]);
  const s = conflictToSuggestion(conflict);
  assert.equal(s.fieldId, "monthly_rent");
  assert.equal(s.isStructured, false);
  assert.equal(s.proposedValue, "$4,800.00"); // recommended = authoritative lease value
  assert.match(s.originalValue, /\$4,800\.00/);
  assert.match(s.originalValue, /\$5,200\.00/);
  assert.match(s.originalValue, /Location & Lease/);
  assert.match(s.originalValue, /Financials/);
});
