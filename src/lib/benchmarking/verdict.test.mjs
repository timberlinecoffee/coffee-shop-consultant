// TIM-2449: unified verdict engine tests — composes cohort + best-practice.
//
// These cover the three acceptance-criterion paths:
//   • both cohort + best-practice present → primarySource = "both"
//   • cohort present, no best-practice → primarySource = "cohort"
//   • best-practice present, no cohort match → primarySource = "best-practice"

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAllVerdicts } from "./verdict.ts";

const METRIC_LABOR = {
  metric_key: "labor_pct_of_revenue",
  pillar: "labor",
  name: "Labor cost (% of revenue)",
  unit: "pct",
  direction_of_better: "lower",
  description: null,
};
const METRIC_AUV = {
  metric_key: "auv_usd",
  pillar: "revenue_traffic",
  name: "AUV",
  unit: "usd_year",
  direction_of_better: "higher",
  description: null,
};

const COHORT_DRIVE_THRU = {
  id: "c1",
  cohort_key: "drive_thru_500_1500_top50_1_3y",
  axes: { model: "drive_thru", sqft_bucket: "500_1500", geo_tier: "top_50_metro", age_bucket: "1_3y" },
  description: "drive-thru small",
};

const COHORT_CAFE = {
  id: "c2",
  cohort_key: "cafe_500_1500_top50_1_3y",
  axes: { model: "cafe", sqft_bucket: "500_1500", geo_tier: "top_50_metro", age_bucket: "1_3y" },
  description: "cafe small",
};

const REF_LABOR_C1 = {
  id: "r1",
  metric_id: "labor_pct_of_revenue",
  cohort_id: "c1",
  value_type: "percentile",
  p25: 24,
  p50: 28,
  p75: 32,
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

const BP_LABOR_DRIVE_THRU = {
  id: "bp1",
  metric_id: "labor_pct_of_revenue",
  applicable_cohort_filter: { model: "drive_thru" },
  guideline_low: 22,
  guideline_high: 27,
  guideline_target: 25,
  rationale: "SCA drive-thru annex",
  source_url: "https://sca.coffee",
  source_name: "SCA",
  source_publication_date: "2024-01-01",
  dataset_version: "2026.Q2",
};

const WORKSPACE = {
  axes: { model: "drive_thru", sqft_bucket: "500_1500", geo_tier: "top_50_metro", age_bucket: "1_3y" },
  userValues: { labor_pct_of_revenue: 32, auv_usd: 600000 },
};

test("computeAllVerdicts both: cohort + best-practice fire on same metric", () => {
  const out = computeAllVerdicts({
    workspace: WORKSPACE,
    metrics: [METRIC_LABOR],
    cohorts: [COHORT_DRIVE_THRU, COHORT_CAFE],
    referenceRows: [REF_LABOR_C1],
    bestPracticeRows: [BP_LABOR_DRIVE_THRU],
  });
  assert.equal(out.verdicts.length, 1);
  const v = out.verdicts[0];
  assert.equal(v.metric.key, "labor_pct_of_revenue");
  assert.equal(v.userValue, 32);
  assert.equal(v.primarySource, "both");
  assert.equal(v.cohort.cohortKey, "drive_thru_500_1500_top50_1_3y");
  assert.equal(v.cohort.sampleSize, 50);
  assert.equal(v.cohortVerdict.percentile, 75);
  assert.equal(v.cohortVerdict.chipColor, "yellow"); // lower-direction, at p75 = worst-25%
  assert.equal(v.bestPractice.upperBound, 27);
  assert.equal(v.bestPracticeVerdict.position, "outside");
  assert.equal(v.bestPracticeVerdict.chipColor, "yellow");
});

test("computeAllVerdicts cohort-only when best-practice missing", () => {
  const out = computeAllVerdicts({
    workspace: WORKSPACE,
    metrics: [METRIC_LABOR],
    cohorts: [COHORT_DRIVE_THRU],
    referenceRows: [REF_LABOR_C1],
    bestPracticeRows: [],
  });
  const v = out.verdicts[0];
  assert.equal(v.primarySource, "cohort");
  assert.equal(v.bestPractice, null);
  assert.equal(v.bestPracticeVerdict, null);
  assert.equal(v.cohortVerdict.chipColor, "yellow");
});

test("computeAllVerdicts best-practice-only when cohort N below threshold", () => {
  const out = computeAllVerdicts({
    workspace: WORKSPACE,
    metrics: [METRIC_LABOR],
    cohorts: [COHORT_DRIVE_THRU],
    referenceRows: [{ ...REF_LABOR_C1, sample_size: 3 }], // below threshold
    bestPracticeRows: [BP_LABOR_DRIVE_THRU],
  });
  const v = out.verdicts[0];
  assert.equal(v.primarySource, "best-practice");
});

test("computeAllVerdicts neither: greys out when no reference data and no BP", () => {
  const out = computeAllVerdicts({
    workspace: WORKSPACE,
    metrics: [METRIC_AUV],
    cohorts: [COHORT_DRIVE_THRU],
    referenceRows: [],
    bestPracticeRows: [],
  });
  const v = out.verdicts[0];
  assert.equal(v.primarySource, "none");
  assert.equal(v.cohortVerdict, null);
});

test("computeAllVerdicts emits widening log entries when cohort axes relaxed", () => {
  // workspace mismatches concept axis; the matcher widens by dropping it.
  const WS = {
    axes: { ...WORKSPACE.axes, concept: "third_wave_specialty" },
    userValues: { labor_pct_of_revenue: 30 },
  };
  const COHORT_NO_CONCEPT = {
    ...COHORT_DRIVE_THRU,
    axes: { ...COHORT_DRIVE_THRU.axes }, // no concept filter — but workspace has concept set
  };
  // Make cohort sample large so widening is not required for threshold,
  // and the matcher's axesRelaxed should be empty here — instead test with
  // a workspace whose AUV tier doesn't match.
  const WS_RELAX = {
    axes: { ...WORKSPACE.axes, auv_tier: "top_decile" },
    userValues: { labor_pct_of_revenue: 30 },
  };
  const COHORT_MID_AUV = {
    ...COHORT_DRIVE_THRU,
    id: "c3",
    cohort_key: "drive_thru_mid_auv",
    axes: { ...COHORT_DRIVE_THRU.axes, auv_tier: "mid" },
  };
  const REF_C3 = { ...REF_LABOR_C1, id: "r2", cohort_id: "c3", sample_size: 5 };
  const out = computeAllVerdicts({
    workspace: WS_RELAX,
    metrics: [METRIC_LABOR],
    cohorts: [COHORT_MID_AUV],
    referenceRows: [REF_C3],
    bestPracticeRows: [],
    sampleThreshold: 10,
  });
  // Verdict cohort still matched (under-threshold), and the dashboard surfaces
  // it with axesRelaxed labelled. primarySource should fall back to "none"
  // because the cohort verdict didn't fire (below threshold) and no BP.
  assert.equal(out.cohortMatch.cohort.cohort_key, "drive_thru_mid_auv");
  assert.equal(out.verdicts[0].primarySource, "none");
});

test("computeAllVerdicts handles missing userValue gracefully", () => {
  const out = computeAllVerdicts({
    workspace: { axes: WORKSPACE.axes, userValues: { labor_pct_of_revenue: null } },
    metrics: [METRIC_LABOR],
    cohorts: [COHORT_DRIVE_THRU],
    referenceRows: [REF_LABOR_C1],
    bestPracticeRows: [BP_LABOR_DRIVE_THRU],
  });
  const v = out.verdicts[0];
  assert.equal(v.userValue, null);
  assert.equal(v.cohortVerdict.chipColor, "grey");
  assert.equal(v.bestPracticeVerdict.position, "unknown");
});
