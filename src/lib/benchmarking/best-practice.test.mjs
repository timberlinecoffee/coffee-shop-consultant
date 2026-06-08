// TIM-2449: best-practice recommender tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chipColorFromBestPractice,
  classifyAgainstBestPractice,
  computeBestPracticeVerdict,
  pickBestPractice,
  rowApplies,
} from "./best-practice.ts";

const ROW_GENERIC = {
  id: "bp1",
  metric_id: "labor_pct_of_revenue",
  applicable_cohort_filter: null,
  guideline_low: 25,
  guideline_high: 30,
  guideline_target: 28,
  rationale: "SCA Operators Guide",
  source_url: "https://sca.coffee",
  source_name: "SCA",
  source_publication_date: "2024-01-01",
  dataset_version: "2026.Q2",
};

const ROW_DRIVE_THRU = {
  ...ROW_GENERIC,
  id: "bp2",
  applicable_cohort_filter: { model: "drive_thru" },
  guideline_low: 22,
  guideline_high: 27,
  guideline_target: 25,
};

const WORKSPACE_DRIVE_THRU = {
  axes: { model: "drive_thru", sqft_bucket: "500_1500" },
  userValues: {},
};
const WORKSPACE_CAFE = { axes: { model: "cafe" }, userValues: {} };

test("rowApplies: null filter applies to every workspace", () => {
  assert.equal(rowApplies(ROW_GENERIC, WORKSPACE_DRIVE_THRU), true);
  assert.equal(rowApplies(ROW_GENERIC, WORKSPACE_CAFE), true);
});

test("rowApplies: model filter must match workspace model", () => {
  assert.equal(rowApplies(ROW_DRIVE_THRU, WORKSPACE_DRIVE_THRU), true);
  assert.equal(rowApplies(ROW_DRIVE_THRU, WORKSPACE_CAFE), false);
});

test("pickBestPractice prefers most-specific applicable row", () => {
  const picked = pickBestPractice([ROW_GENERIC, ROW_DRIVE_THRU], WORKSPACE_DRIVE_THRU);
  assert.equal(picked.id, "bp2"); // drive-thru row is more specific
});

test("pickBestPractice falls back to generic when specific doesn't apply", () => {
  const picked = pickBestPractice([ROW_GENERIC, ROW_DRIVE_THRU], WORKSPACE_CAFE);
  assert.equal(picked.id, "bp1");
});

test("pickBestPractice returns null when nothing applies", () => {
  assert.equal(
    pickBestPractice([{ ...ROW_DRIVE_THRU, applicable_cohort_filter: { model: "kiosk" } }], WORKSPACE_CAFE),
    null,
  );
});

test("classifyAgainstBestPractice: inside band", () => {
  assert.deepEqual(classifyAgainstBestPractice(27, ROW_GENERIC).position, "inside");
  assert.deepEqual(classifyAgainstBestPractice(25, ROW_GENERIC).position, "inside");
});

test("classifyAgainstBestPractice: near band (<=10% outside)", () => {
  // 30 is band high, 32 = 6.7% over high -> near
  assert.deepEqual(classifyAgainstBestPractice(32, ROW_GENERIC).position, "near");
});

test("classifyAgainstBestPractice: outside band", () => {
  // 35 = 16.7% over high -> outside
  assert.deepEqual(classifyAgainstBestPractice(35, ROW_GENERIC).position, "outside");
});

test("classifyAgainstBestPractice: target-only fallback", () => {
  const targetOnly = { ...ROW_GENERIC, guideline_low: null, guideline_high: null, guideline_target: 28 };
  assert.deepEqual(classifyAgainstBestPractice(28, targetOnly).position, "inside");
  assert.deepEqual(classifyAgainstBestPractice(29.5, targetOnly).position, "near");
  assert.deepEqual(classifyAgainstBestPractice(50, targetOnly).position, "outside");
});

test("classifyAgainstBestPractice: unknown when value missing", () => {
  assert.equal(classifyAgainstBestPractice(null, ROW_GENERIC).position, "unknown");
});

test("chipColorFromBestPractice maps positions to colors", () => {
  assert.equal(chipColorFromBestPractice("inside"), "green");
  assert.equal(chipColorFromBestPractice("near"), "blue");
  assert.equal(chipColorFromBestPractice("outside"), "yellow");
  assert.equal(chipColorFromBestPractice("unknown"), "grey");
});

test("computeBestPracticeVerdict returns null when no row provided", () => {
  assert.equal(computeBestPracticeVerdict(30, null), null);
});

test("computeBestPracticeVerdict composes position + chip", () => {
  const v = computeBestPracticeVerdict(35, ROW_GENERIC);
  assert.equal(v.position, "outside");
  assert.equal(v.chipColor, "yellow");
});
