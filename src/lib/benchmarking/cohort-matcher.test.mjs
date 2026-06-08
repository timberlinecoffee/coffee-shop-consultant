// TIM-2449: cohort matcher tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SAMPLE_THRESHOLD,
  findCohort,
  pooledSampleSize,
  scoreCohort,
} from "./cohort-matcher.ts";

const COHORT_DRIVE_THRU_SMALL = {
  id: "c1",
  cohort_key: "drive_thru_500_1500_top50_1_3y",
  axes: { model: "drive_thru", sqft_bucket: "500_1500", geo_tier: "top_50_metro", age_bucket: "1_3y" },
  description: "drive-thru 500-1500 top50",
};
const COHORT_CAFE_SMALL = {
  id: "c2",
  cohort_key: "cafe_500_1500_top50_1_3y",
  axes: { model: "cafe", sqft_bucket: "500_1500", geo_tier: "top_50_metro", age_bucket: "1_3y" },
  description: "cafe 500-1500 top50",
};
const COHORT_KIOSK = {
  id: "c3",
  cohort_key: "kiosk_small",
  axes: { model: "kiosk", sqft_bucket: "lt_500" },
  description: "kiosk under 500",
};
const COHORT_MULTI_LOC = {
  id: "c4",
  cohort_key: "multi_location_chain",
  axes: { model: "multi_location" },
  description: "multi-location",
};

const COHORTS = [COHORT_DRIVE_THRU_SMALL, COHORT_CAFE_SMALL, COHORT_KIOSK, COHORT_MULTI_LOC];

test("scoreCohort rewards exact axis match and ignores cohort wildcards", () => {
  const { score, axesMatched } = scoreCohort(
    { model: "drive_thru", sqft_bucket: "500_1500", geo_tier: "top_50_metro" },
    COHORT_DRIVE_THRU_SMALL.axes,
  );
  assert.ok(score > 0);
  assert.deepEqual(axesMatched.sort(), ["geo_tier", "model", "sqft_bucket"]);
});

test("scoreCohort penalises mismatches", () => {
  const { score, axesMismatched } = scoreCohort(
    { model: "cafe", sqft_bucket: "500_1500", geo_tier: "top_50_metro" },
    COHORT_DRIVE_THRU_SMALL.axes,
  );
  // matched: sqft, geo (+11); mismatched: model (-10); age_bucket workspace=null vs cohort 1_3y => -2
  assert.equal(axesMismatched.includes("model"), true);
  assert.ok(score < 11);
});

test("pooledSampleSize sums sample_size across the cohort's rows", () => {
  const rows = [
    { id: "r1", metric_id: "x", cohort_id: "c1", sample_size: 30 },
    { id: "r2", metric_id: "y", cohort_id: "c1", sample_size: 12 },
    { id: "r3", metric_id: "x", cohort_id: "c2", sample_size: 99 },
    { id: "r4", metric_id: "x", cohort_id: "c1", sample_size: null },
  ];
  assert.equal(pooledSampleSize("c1", rows), 42);
  assert.equal(pooledSampleSize("c2", rows), 99);
  assert.equal(pooledSampleSize("c-unknown", rows), 0);
});

test("findCohort returns the nearest-neighbor when sample size meets threshold", () => {
  const ref = [
    { id: "r1", metric_id: "labor_pct_of_revenue", cohort_id: "c1", sample_size: 25 },
    { id: "r2", metric_id: "total_cogs_pct", cohort_id: "c1", sample_size: 25 },
  ];
  const match = findCohort({
    workspace: {
      axes: { model: "drive_thru", sqft_bucket: "500_1500", geo_tier: "top_50_metro", age_bucket: "1_3y" },
      userValues: {},
    },
    cohorts: COHORTS,
    referenceRows: ref,
    sampleThreshold: DEFAULT_SAMPLE_THRESHOLD,
  });
  assert.ok(match);
  assert.equal(match.cohort.cohort_key, "drive_thru_500_1500_top50_1_3y");
  assert.equal(match.axesRelaxed.length, 0);
  assert.equal(match.sampleSize, 50);
});

test("findCohort widens by relaxing least-signal axis first", () => {
  const ref = [
    // multi_location_chain has plenty of N (Starbucks etc.) — broad cohort.
    { id: "r1", metric_id: "auv_usd", cohort_id: "c4", sample_size: 200 },
  ];
  const match = findCohort({
    workspace: {
      axes: {
        model: "multi_location",
        sqft_bucket: "1500_3000",
        geo_tier: "top_50_metro",
        age_bucket: "mature_7plus",
        concept: "third_wave_specialty",
      },
      userValues: {},
    },
    cohorts: COHORTS,
    referenceRows: ref,
  });
  assert.ok(match);
  assert.equal(match.cohort.cohort_key, "multi_location_chain");
  assert.equal(match.sampleSize, 200);
});

test("findCohort returns under-threshold match for fallback when nothing meets bar", () => {
  const ref = [
    { id: "r1", metric_id: "labor_pct_of_revenue", cohort_id: "c1", sample_size: 3 },
  ];
  const match = findCohort({
    workspace: {
      axes: { model: "drive_thru", sqft_bucket: "500_1500", geo_tier: "top_50_metro", age_bucket: "1_3y" },
      userValues: {},
    },
    cohorts: COHORTS,
    referenceRows: ref,
    sampleThreshold: 10,
  });
  assert.ok(match);
  assert.equal(match.cohort.cohort_key, "drive_thru_500_1500_top50_1_3y");
  assert.equal(match.sampleSize, 3);
  // Caller must label "below threshold" → best-practice fallback.
});

test("findCohort returns null when no cohort matches any axis", () => {
  const match = findCohort({
    workspace: { axes: { model: "mobile_cart" }, userValues: {} },
    cohorts: COHORTS,
    referenceRows: [],
  });
  // No cohort with mobile_cart exists in the fixture set.
  assert.equal(match, null);
});

test("findCohort handles empty workspace profile gracefully", () => {
  const match = findCohort({
    workspace: { axes: {}, userValues: {} },
    cohorts: COHORTS,
    referenceRows: [],
  });
  assert.equal(match, null);
});
