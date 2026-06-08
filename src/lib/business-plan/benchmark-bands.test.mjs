// TIM-2474: lockstep pin — labor / cogs / rent / gross-margin bands all read
// from `benchmarks.json`. Editing the JSON must ripple through every
// consumer (Ratios card label, PLCritique text, describeBandPosition output).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parsePercentRange,
  getFinancialBenchmarkBands,
} from "./benchmark-bands.ts";
import { describeBandPosition } from "../cross-suite/hiring-financials.ts";

test("parsePercentRange handles common shapes", () => {
  assert.deepEqual(parsePercentRange("28% to 35%"), { min: 0.28, max: 0.35 });
  assert.deepEqual(parsePercentRange("6% to 10%"), { min: 0.06, max: 0.10 });
  // Tolerant of whitespace + case + decimal point.
  assert.deepEqual(parsePercentRange("  2.5% to 3.0%  "), { min: 0.025, max: 0.03 });
  // Non-percent ranges in benchmarks.json should not match (e.g. "$6 to $9",
  // "1.20x to 1.25x", "150 to 350").
  assert.equal(parsePercentRange("$6 to $9"), null);
  assert.equal(parsePercentRange("1.20x to 1.25x"), null);
  assert.equal(parsePercentRange("150 to 350"), null);
});

test("getFinancialBenchmarkBands returns labor/cogs/rent + derived gross-margin", () => {
  const bands = getFinancialBenchmarkBands();
  // Bound directly to benchmarks.json — if curation changes, this test should
  // flip, not the code.
  assert.deepEqual(bands.labor, {
    min: 0.28,
    max: 0.35,
    source: "Specialty Coffee Association cafe benchmarking, Toast Restaurant Industry Report 2024",
    label: "28% to 35%",
  });
  assert.deepEqual(bands.cogs, {
    min: 0.28,
    max: 0.32,
    source: "Specialty Coffee Association annual cafe operating reports (2023, 2024)",
    label: "28% to 32%",
  });
  assert.deepEqual(bands.rent, {
    min: 0.06,
    max: 0.10,
    source: "Specialty Coffee Association cafe benchmarking",
    label: "6% to 10%",
  });
  // Gross margin is the inverse of COGS by accounting identity. Round-trip
  // tolerance is 0.5pp because the labels stringify at 1dp.
  assert.equal(Math.round((1 - bands.cogs.max) * 100), Math.round(bands.grossMargin.min * 100));
  assert.equal(Math.round((1 - bands.cogs.min) * 100), Math.round(bands.grossMargin.max * 100));
  assert.equal(bands.grossMargin.label, "68% to 72%");
  // Source threaded through from COGS so the citation matches what the
  // derivation is rooted in.
  assert.equal(bands.grossMargin.source, bands.cogs.source);
});

test("lockstep flip — edit labor JSON to '30% to 37%' and all readers move together", () => {
  // Simulate a curation edit: pass a synthetic dataset through the loader's
  // injection seam. PLCritique copy, Ratios.labor_pct.benchmarkLabel, and
  // describeBandPosition() must all use the same band numbers — that is the
  // load-bearing invariant for F1 (TIM-2454).
  const synthetic = {
    version: "test",
    benchmarks: [
      {
        key: "coffee_shop_labor_pct",
        label: "Specialty coffee labor as % of revenue",
        value_range: "30% to 37%",
        unit: "percent of revenue",
        source: "test",
        note: "",
        applicable_sections: [],
      },
      {
        key: "coffee_shop_blended_cogs_pct",
        label: "Specialty coffee blended COGS",
        value_range: "28% to 32%",
        unit: "percent of revenue",
        source: "test",
        note: "",
        applicable_sections: [],
      },
      {
        key: "coffee_shop_rent_pct",
        label: "Specialty coffee rent (occupancy) as % of revenue",
        value_range: "6% to 10%",
        unit: "percent of revenue",
        source: "test",
        note: "",
        applicable_sections: [],
      },
    ],
  };
  const bands = getFinancialBenchmarkBands(synthetic);
  assert.deepEqual(
    { min: bands.labor.min, max: bands.labor.max, label: bands.labor.label },
    { min: 0.30, max: 0.37, label: "30% to 37%" },
    "labor band reflects JSON edit",
  );
  // What the Ratios card would render as `benchmarkLabel`.
  assert.equal(bands.labor.label, "30% to 37%");
  // What PLCritique / cross-suite resolvers would say at 34% labor.
  assert.equal(
    describeBandPosition(0.34, bands.labor),
    "within the 30.0% to 37.0% benchmark band",
  );
  // Out-of-band classifications also use the new ceiling/floor.
  assert.equal(
    describeBandPosition(0.39, bands.labor),
    "above the 37.0% benchmark ceiling",
  );
  assert.equal(
    describeBandPosition(0.27, bands.labor),
    "below the 30.0% benchmark floor",
  );
});

test("ratios + critique read the same band — no separate literals", async () => {
  // Drift guard: both consumer files must import `getFinancialBenchmarkBands`
  // (the canonical accessor) AND must not carry the legacy hardcoded copy
  // strings the audit flagged (`60–70%`, `60–70% range`, `[28, 35]` etc.).
  const fs = await import("node:fs/promises");
  const ratios = await fs.readFile(
    new URL("../../app/(app)/workspace/financials/tabs/ratios-tab.tsx", import.meta.url),
    "utf8",
  );
  const pl = await fs.readFile(
    new URL("../../app/(app)/workspace/financials/tabs/pl-tab.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(
    ratios.includes("getFinancialBenchmarkBands"),
    "ratios-tab must source bands from benchmark-bands helper",
  );
  assert.ok(
    pl.includes("getFinancialBenchmarkBands"),
    "pl-tab must source bands from benchmark-bands helper",
  );
  assert.ok(
    pl.includes("describeBandPosition"),
    "pl-tab must use shared describeBandPosition voice",
  );
  // Legacy literal copy that the audit (F1) flagged for removal — these
  // exact strings were the drift surfaces. Adding a new finding here means
  // the band was re-hardcoded somewhere; flip the test only when the audit
  // mandates a new literal.
  assert.ok(!ratios.includes("\"28–35%\""), "ratios-tab — labor literal removed");
  assert.ok(!ratios.includes("\"60–70%\""), "ratios-tab — gross-margin literal removed");
  assert.ok(!pl.includes("60–70% range"), "pl-tab — gross-margin range literal removed");
});
