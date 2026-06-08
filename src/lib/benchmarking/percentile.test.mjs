// TIM-2449: percentile engine + chip color tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chipColorFromPercentile,
  computePercentile,
  interpolatePercentile,
  resolveBand,
} from "./percentile.ts";

const ROW_PERCENTILE = {
  id: "r1",
  metric_id: "labor_pct_of_revenue",
  cohort_id: "c1",
  value_type: "percentile",
  p25: 26,
  p50: 30,
  p75: 34,
  low: null,
  high: null,
  sample_size: 50,
  source_url: "x",
  source_name: "SCA",
  source_publication_date: null,
  extraction_date: "2026-06-07",
  extraction_confidence: "high",
  dataset_version: "2026.Q2",
  notes: null,
};

const ROW_RANGE = {
  ...ROW_PERCENTILE,
  id: "r2",
  value_type: "range",
  p25: null,
  p50: null,
  p75: null,
  low: 28,
  high: 35,
};

test("resolveBand synthesises p25/p75 from low/high when only range present", () => {
  const band = resolveBand(ROW_RANGE);
  assert.equal(band.p25, 28);
  assert.equal(band.p75, 35);
  assert.equal(band.p50, 31.5);
});

test("interpolatePercentile clamps + interpolates correctly", () => {
  const band = { p25: 26, p50: 30, p75: 34 };
  assert.equal(interpolatePercentile(30, band), 50);
  assert.equal(interpolatePercentile(26, band), 25);
  assert.equal(interpolatePercentile(34, band), 75);
  assert.equal(interpolatePercentile(20, band), 0);  // below p25 floor
  assert.equal(interpolatePercentile(40, band), 100); // above p75 ceiling
  assert.equal(interpolatePercentile(28, band), 25 + (28 - 26) / (30 - 26) * 25);
});

test("interpolatePercentile returns null on degenerate band", () => {
  assert.equal(interpolatePercentile(10, { p25: 10, p50: 10, p75: 10 }), null);
  assert.equal(interpolatePercentile(10, { p25: null, p50: null, p75: 10 }), null);
});

test("chipColorFromPercentile higher direction", () => {
  const band = { p25: 0, p50: 50, p75: 100 };
  assert.equal(chipColorFromPercentile(80, "higher", band, 80), "green");
  assert.equal(chipColorFromPercentile(50, "higher", band, 50), "blue");
  assert.equal(chipColorFromPercentile(10, "higher", band, 10), "yellow");
  assert.equal(chipColorFromPercentile(null, "higher", band, null), "grey");
});

test("chipColorFromPercentile lower direction flips top/bottom", () => {
  const band = { p25: 26, p50: 30, p75: 34 };
  assert.equal(chipColorFromPercentile(10, "lower", band, 22), "green");
  assert.equal(chipColorFromPercentile(50, "lower", band, 30), "blue");
  assert.equal(chipColorFromPercentile(90, "lower", band, 38), "yellow");
});

test("chipColorFromPercentile range direction: inside band is green", () => {
  const band = { p25: 6, p50: 8, p75: 10 };
  assert.equal(chipColorFromPercentile(50, "range", band, 8), "green");
  assert.equal(chipColorFromPercentile(95, "range", band, 12), "yellow");
});

test("computePercentile prefers high-confidence row over low-confidence", () => {
  const result = computePercentile({
    userValue: 30,
    referenceRows: [
      { ...ROW_PERCENTILE, extraction_confidence: "low", p50: 50 },
      ROW_PERCENTILE, // high-confidence wins
    ],
    direction: "lower",
  });
  assert.equal(result.p50, 30);
  assert.equal(result.percentile, 50);
  assert.equal(result.chipColor, "blue");
});

test("computePercentile returns grey when no rows", () => {
  const result = computePercentile({ userValue: 30, referenceRows: [], direction: "lower" });
  assert.equal(result.percentile, null);
  assert.equal(result.chipColor, "grey");
});

test("computePercentile returns grey when value is null", () => {
  const result = computePercentile({
    userValue: null,
    referenceRows: [ROW_PERCENTILE],
    direction: "lower",
  });
  assert.equal(result.chipColor, "grey");
});

test("computePercentile uses range row when no percentile row available", () => {
  const result = computePercentile({
    userValue: 31.5,
    referenceRows: [ROW_RANGE],
    direction: "lower",
  });
  assert.equal(result.p50, 31.5);
  assert.equal(result.percentile, 50);
});
