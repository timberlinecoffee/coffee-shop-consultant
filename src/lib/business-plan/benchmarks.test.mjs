// TIM-2342: benchmark loader + section-aware filter + prompt formatter.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  loadBenchmarks,
  benchmarksForSection,
  formatBenchmarksForPrompt,
} from "./benchmarks.ts";

test("loads non-empty dataset with version + benchmarks", () => {
  const ds = loadBenchmarks();
  assert.ok(typeof ds.version === "string" && ds.version.length > 0);
  assert.ok(Array.isArray(ds.benchmarks));
  assert.ok(ds.benchmarks.length >= 8, "dataset has at least 8 entries");
  // Every entry has the required fields.
  for (const b of ds.benchmarks) {
    assert.ok(typeof b.key === "string" && b.key.length > 0);
    assert.ok(typeof b.label === "string" && b.label.length > 0);
    assert.ok(typeof b.value_range === "string" && b.value_range.length > 0);
    assert.ok(Array.isArray(b.applicable_sections));
  }
});

test("contains the core lender-stakeholder benchmarks", () => {
  const ds = loadBenchmarks();
  const keys = new Set(ds.benchmarks.map((b) => b.key));
  assert.ok(keys.has("coffee_shop_blended_cogs_pct"), "blended COGS benchmark present");
  assert.ok(keys.has("coffee_shop_labor_pct"), "labor % benchmark present");
  assert.ok(keys.has("coffee_shop_rent_pct"), "rent % benchmark present");
  assert.ok(keys.has("coffee_shop_dscr_threshold"), "DSCR threshold benchmark present");
  assert.ok(keys.has("coffee_shop_opening_cash_buffer_months"), "opening cash buffer present");
});

test("benchmarksForSection filters to relevant entries", () => {
  // DSCR section should surface the DSCR threshold + opening cash buffer.
  const dscr = benchmarksForSection("financial-plan-dscr");
  assert.ok(dscr.some((b) => b.key === "coffee_shop_dscr_threshold"));
  // Should NOT include the food-waste benchmark, which isn't tagged for DSCR.
  assert.ok(!dscr.some((b) => b.key === "coffee_shop_food_waste_pct"));
});

test("benchmarksForSection falls through to full list when section has none tagged", () => {
  const full = loadBenchmarks().benchmarks;
  const orphan = benchmarksForSection("opportunity-problem-solution");
  assert.equal(orphan.length, full.length, "orphan section gets the full dataset");
});

test("formatBenchmarksForPrompt produces a non-empty prompt block with version", () => {
  const block = formatBenchmarksForPrompt("financial-plan-statements");
  assert.ok(block.includes("Industry Benchmarks"));
  assert.ok(block.includes("Dataset version"));
  // Sourcing transparency — every line that lists a benchmark also names its source.
  assert.ok(block.includes("Source:"));
  // The block should include at least the blended COGS for statements section.
  assert.ok(block.includes("blended COGS"));
});

test("benchmark prompt block explicitly bounds 'benchmark' source tagging", () => {
  const block = formatBenchmarksForPrompt(null);
  assert.ok(
    block.includes('do NOT tag it benchmark'),
    "block explicitly fences off non-listed benchmarks",
  );
});
