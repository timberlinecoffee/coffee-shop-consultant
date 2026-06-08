// TIM-2481 (F12): buildout ↔ financials equipment detector — pure-function tests.
//
// Run via node:test with --experimental-strip-types so .ts can load directly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EQUIPMENT_ABS_TOLERANCE_CENTS,
  EQUIPMENT_REL_TOLERANCE,
  detectEquipmentMismatch,
  isEquipmentDriftMeaningful,
} from "./equipment-financials.ts";

// Helper: dollars → cents. Tests are easier to read in dollars; the API is in
// cents to stay byte-exact with the rest of the financial-projection layer.
const d = (dollars) => Math.round(dollars * 100);

// ── Tolerance pinning ────────────────────────────────────────────────────────

test("tolerance constants are 1% relative AND $100 absolute floor", () => {
  // Mirrors source-suite-checks.ts Check 2 (src:capex_equipment_mismatch):
  // tolerance = max($100, 1% of capex). The audit and the detector must
  // agree on what counts as drift, otherwise the resolver fires when the
  // audit doesn't (or vice versa).
  assert.equal(EQUIPMENT_REL_TOLERANCE, 0.01);
  assert.equal(EQUIPMENT_ABS_TOLERANCE_CENTS, 10_000);
});

test("drift inside the max($100, 1%) tolerance returns false", () => {
  // $90 delta on a $50,000 financials line — abs floor wins ($100 > 1%=$500
  // when capex < $10k, but here 1%=$500 wins; either way 90 < both). Skip.
  assert.equal(isEquipmentDriftMeaningful(d(50_090), d(50_000)), false);
  // $1,000 delta on a $200,000 financials line — rel gate dominates
  // (1%=$2,000), $1,000 < $2,000. Skip.
  assert.equal(isEquipmentDriftMeaningful(d(201_000), d(200_000)), false);
});

test("drift above the tolerance returns true", () => {
  // $5,000 delta on a $50,000 financials line — 10%, clears 1% / $100.
  assert.equal(isEquipmentDriftMeaningful(d(55_000), d(50_000)), true);
  // $101 delta on a small $5,000 plan — under the rel ($50) but over the
  // abs floor ($100). The floor is what keeps small plans from being
  // silently mis-budgeted.
  assert.equal(isEquipmentDriftMeaningful(d(5_101), d(5_000)), true);
});

test("isEquipmentDriftMeaningful rejects missing inputs", () => {
  assert.equal(isEquipmentDriftMeaningful(0, d(50_000)), false);
  assert.equal(isEquipmentDriftMeaningful(d(55_000), 0), false);
  assert.equal(isEquipmentDriftMeaningful(-1, d(50_000)), false);
});

// ── Detector — grid ABOVE financials (typical "I added items, never
// re-balanced the lump sum" case) ───────────────────────────────────────────

const gridHigherInput = {
  buildoutGridTotalCents: d(55_000),
  financialsEquipmentCents: d(50_000),
  activeBuildoutItemCount: 12,
  currencyCode: "USD",
};

test("grid $55k vs financials $50k surfaces a conflict", () => {
  const c = detectEquipmentMismatch(gridHigherInput);
  assert.ok(c, "should detect");
  assert.equal(c.id, "equipment_mismatch");
  assert.equal(c.kind, "numeric");
  assert.equal(c.suiteA.suiteKey, "buildout-equipment");
  assert.equal(c.suiteB.suiteKey, "financials");
  assert.match(c.suiteA.displayValue, /\$55,000\.00/);
  assert.match(c.suiteB.displayValue, /\$50,000\.00/);
  assert.match(c.suiteA.displaySubvalue ?? "", /12 priced items/);
  assert.match(c.gapLabel ?? "", /\$5,000\.00/);
  assert.equal(c.paths.length, 2);
  assert.equal(c.recommendedPathId, "sync_financials_to_buildout");
});

test("sync path's suggestion has the correct fieldId convention", () => {
  // fieldId is what the apply route decodes — drift here breaks the write
  // path silently. Pin the exact shape route.ts expects:
  //   cross_suite:<conflictId>:<pathId>:<suiteKey>:<recordId>:<column>
  const c = detectEquipmentMismatch(gridHigherInput);
  const sync = c.paths.find((p) => p.id === "sync_financials_to_buildout");
  assert.ok(sync);
  assert.equal(sync.suggestions.length, 1);
  const s = sync.suggestions[0];
  assert.equal(
    s.fieldId,
    "cross_suite:equipment_mismatch:sync_financials_to_buildout:financials:startup:equipment_cents",
  );
  assert.equal(s.workspaceLabel, "Financials");
  // proposedValue must be the FORMATTED currency string so the apply route
  // parses it back to cents — keep parity with the menu-ticket pattern.
  assert.match(s.proposedValue, /\$55,000\.00/);
});

// ── Detector — financials ABOVE grid (rare "lender quoted more, never
// reduced items" case) ─────────────────────────────────────────────────────

test("financials $50k vs grid $40k surfaces conflict with inverted statement", () => {
  const c = detectEquipmentMismatch({
    buildoutGridTotalCents: d(40_000),
    financialsEquipmentCents: d(50_000),
    activeBuildoutItemCount: 8,
    currencyCode: "USD",
  });
  assert.ok(c);
  assert.match(c.statement, /financial plan has budgeted more/i);
  assert.equal(c.recommendedPathId, "sync_financials_to_buildout");
});

// ── Detector — null cases ──────────────────────────────────────────────────

test("empty grid returns null", () => {
  assert.equal(
    detectEquipmentMismatch({
      buildoutGridTotalCents: 0,
      financialsEquipmentCents: d(50_000),
      activeBuildoutItemCount: 0,
      currencyCode: "USD",
    }),
    null,
  );
});

test("zero financials line returns null", () => {
  assert.equal(
    detectEquipmentMismatch({
      buildoutGridTotalCents: d(55_000),
      financialsEquipmentCents: 0,
      activeBuildoutItemCount: 12,
      currencyCode: "USD",
    }),
    null,
  );
});

test("drift inside tolerance returns null", () => {
  // $50 delta on a $50,000 capex — well under max($100, 1%=$500).
  assert.equal(
    detectEquipmentMismatch({
      buildoutGridTotalCents: d(50_050),
      financialsEquipmentCents: d(50_000),
      activeBuildoutItemCount: 12,
      currencyCode: "USD",
    }),
    null,
  );
});

// ── Currency code rendering ────────────────────────────────────────────────

test("CAD currency code renders ticker prefix on values", () => {
  const c = detectEquipmentMismatch({
    ...gridHigherInput,
    currencyCode: "CAD",
  });
  assert.ok(c);
  assert.match(c.suiteA.displayValue, /CAD 55,000\.00/);
  assert.match(c.suiteB.displayValue, /CAD 50,000\.00/);
});

// ── Drift guards on consumer surfaces ──────────────────────────────────────

test("audit-mapping.ts registers src:capex_equipment_mismatch → equipment_mismatch", () => {
  // Anyone refactoring the audit-mapping table must keep this pair: the
  // Check-mode card on the audit finding routes through this map to open
  // the resolver modal. Drop the entry and the resolver becomes orphaned.
  const src = readFileSync(
    new URL("./audit-mapping.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    src,
    /"src:capex_equipment_mismatch":\s*"equipment_mismatch"/,
    "audit-mapping.ts must map src:capex_equipment_mismatch → equipment_mismatch",
  );
});

test("cross-suite-resolver route.ts wires detectEquipmentMismatch", () => {
  // Resolver route must import + invoke the detector and dispatch the
  // financials:startup:equipment_cents apply path. Drift here breaks the
  // GET → modal → POST round trip.
  const src = readFileSync(
    new URL("../../app/api/copilot/cross-suite-resolver/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(src, /detectEquipmentMismatch/, "route must import detector");
  assert.match(
    src,
    /buildoutGridTotalCents/,
    "route must compute grid total before invoking detector",
  );
  assert.match(
    src,
    /applyFinancialsEquipmentChange/,
    "route must define apply handler for equipment_cents",
  );
  assert.match(
    src,
    /field\.recordId === "startup".*field\.column === "equipment_cents"/s,
    "route must dispatch financials:startup:equipment_cents",
  );
});
