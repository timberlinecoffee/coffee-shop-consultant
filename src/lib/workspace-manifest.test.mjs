// TIM-903: Pin the plan readiness formula so a near-empty plan never reads 100%.
// Imports from plan-readiness.ts (no external imports) to avoid Node ESM resolution
// issues with workspace-manifest.ts's dependency on ./modules.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computePlanReadiness, LOCKED_MODULE_WEIGHT } from "./plan-readiness.ts";

// Test manifest: 6 modules, only concept (1) has shipped sections (5).
const TEST_MANIFEST = [
  { moduleNumber: 1, totalSections: 5 },
  { moduleNumber: 2, totalSections: null },
  { moduleNumber: 3, totalSections: null },
  { moduleNumber: 4, totalSections: null },
  { moduleNumber: 5, totalSections: null },
  { moduleNumber: 6, totalSections: null },
];
// total expected = 5 + 5*5 = 30 with LOCKED_MODULE_WEIGHT=5

test("computePlanReadiness — empty plan reads 0 filled with non-zero total", () => {
  const result = computePlanReadiness(TEST_MANIFEST, new Map());
  assert.equal(result.filled, 0);
  assert.ok(result.total > 0, "total must be > 0 so 0% renders correctly");
  assert.equal(result.total, 5 + 5 * LOCKED_MODULE_WEIGHT); // 30
});

test("computePlanReadiness — full concept (5/5) is ~17%, not 100%", () => {
  const m = new Map([[1, 5]]);
  const result = computePlanReadiness(TEST_MANIFEST, m);
  assert.equal(result.filled, 5);
  const pct = Math.round((result.filled / result.total) * 100);
  assert.ok(pct < 25, `full concept should be under 25%, got ${pct}%`);
  assert.ok(pct > 0, "full concept should be above 0%");
});

test("computePlanReadiness — partial concept (3/5) gives partial score", () => {
  const m = new Map([[1, 3]]);
  const result = computePlanReadiness(TEST_MANIFEST, m);
  assert.equal(result.filled, 3);
  const pct = Math.round((result.filled / result.total) * 100);
  assert.ok(pct > 0 && pct < 20, `3/5 concept should give < 20%, got ${pct}%`);
});

test("computePlanReadiness — locked modules inflate denominator", () => {
  const result = computePlanReadiness(TEST_MANIFEST, new Map());
  // With 5 locked modules at LOCKED_MODULE_WEIGHT each, denominator >= 30
  assert.ok(result.total >= 30, `total should be >= 30, got ${result.total}`);
});

test("computePlanReadiness — 100% requires all modules fully filled", () => {
  const m = new Map();
  // fill concept to 5, and each locked module at its assumed weight
  m.set(1, 5);
  for (let i = 2; i <= 6; i++) m.set(i, LOCKED_MODULE_WEIGHT);
  const result = computePlanReadiness(TEST_MANIFEST, m);
  const pct = Math.round((result.filled / result.total) * 100);
  assert.equal(pct, 100);
});
