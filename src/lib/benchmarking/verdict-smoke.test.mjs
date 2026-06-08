// TIM-2449 — smoke test mirroring the trent@simpler.coffee fixture plus the
// shipped seed rows (supabase/seeds/tim2447_*). Locks the spec's acceptance
// criterion: "verdict matches manual spot-check for at least 3 metrics across
// cohort + best-practice paths".
//
// Trent's plan (per [[project_demo_persona_fixture]]):
//   - Concept: third-wave specialty cafe
//   - sq_ft: 1,200 → bucket 500_1500
//   - Y1 revenue ≈ $650K → auv_tier mid
//   - Labor 33% → above SCA 25-30 band
//   - Total COGS 31% → inside NCA 28-35 band
//   - Rent 8.2% → inside NRA 6-10 band
//
// We load the shipped best-practice seed values directly to keep this
// independent from prod DB state.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAllVerdicts } from "./verdict.ts";

const METRICS = [
  {
    metric_key: "labor_pct_of_revenue",
    pillar: "labor",
    name: "Labor cost (% of revenue)",
    unit: "pct",
    direction_of_better: "lower",
    description: null,
  },
  {
    metric_key: "total_cogs_pct",
    pillar: "cogs",
    name: "Total COGS",
    unit: "pct",
    direction_of_better: "lower",
    description: null,
  },
  {
    metric_key: "rent_pct_of_revenue",
    pillar: "real_estate_fitout",
    name: "Rent % of revenue",
    unit: "pct",
    direction_of_better: "lower",
    description: null,
  },
  {
    metric_key: "fitout_per_sqft_usd",
    pillar: "real_estate_fitout",
    name: "Fit-out per sqft",
    unit: "usd_sqft",
    direction_of_better: "lower",
    description: null,
  },
];

const COHORTS = [
  // Mirror tim2447_benchmark_cohorts_seed.sql — cafe_500_1500_top50_1_3y.
  {
    id: "c-cafe-small",
    cohort_key: "cafe_500_1500_top50_1_3y",
    axes: { model: "cafe", sqft_bucket: "500_1500", geo_tier: "top_50_metro", age_bucket: "1_3y" },
    description: "Dine-in cafe, 500-1500 sqft, top-50 metro, 1-3y",
  },
];

// All best-practice rows from tim2447_best_practices_seed.sql (subset relevant
// to the four metrics here). Generic rows have null filter, drive-thru row
// shouldn't apply to a cafe workspace.
const BEST_PRACTICES = [
  {
    id: "bp1",
    metric_id: "labor_pct_of_revenue",
    applicable_cohort_filter: null,
    guideline_low: 25,
    guideline_high: 30,
    guideline_target: 28,
    rationale: "SCA Operators Guide target",
    source_url: "https://sca.coffee/research",
    source_name: "SCA Operators Guide",
    source_publication_date: "2024-01-01",
    dataset_version: "2026.Q2",
  },
  {
    id: "bp2",
    metric_id: "labor_pct_of_revenue",
    applicable_cohort_filter: { model: "drive_thru" },
    guideline_low: 22,
    guideline_high: 27,
    guideline_target: 25,
    rationale: "SCA Drive-thru annex",
    source_url: "https://sca.coffee/research",
    source_name: "SCA Operators Guide (drive-thru)",
    source_publication_date: "2024-01-01",
    dataset_version: "2026.Q2",
  },
  {
    id: "bp3",
    metric_id: "total_cogs_pct",
    applicable_cohort_filter: null,
    guideline_low: 28,
    guideline_high: 35,
    guideline_target: 32,
    rationale: "NCA/NRA target band",
    source_url: "https://www.ncausa.org/Industry-Resources",
    source_name: "NCA Industry Resources",
    source_publication_date: "2024-01-01",
    dataset_version: "2026.Q2",
  },
  {
    id: "bp4",
    metric_id: "rent_pct_of_revenue",
    applicable_cohort_filter: null,
    guideline_low: 6,
    guideline_high: 10,
    guideline_target: 8,
    rationale: "NRA published guideline",
    source_url: "https://restaurant.org/research-and-media/research/industry-statistics/",
    source_name: "NRA Industry Statistics",
    source_publication_date: "2024-01-01",
    dataset_version: "2026.Q2",
  },
  {
    id: "bp5",
    metric_id: "fitout_per_sqft_usd",
    applicable_cohort_filter: null,
    guideline_low: 250,
    guideline_high: 450,
    guideline_target: 350,
    rationale: "Daily Coffee News build-cost composite",
    source_url: "https://dailycoffeenews.com/category/business/",
    source_name: "Daily Coffee News",
    source_publication_date: "2024-01-01",
    dataset_version: "2026.Q2",
  },
];

const TRENT_WORKSPACE = {
  axes: {
    model: "cafe",
    sqft_bucket: "500_1500",
    geo_tier: "top_50_metro",
    age_bucket: "pre_open",
    auv_tier: "mid",
    concept: "third_wave_specialty",
  },
  userValues: {
    labor_pct_of_revenue: 35,       // above SCA 25-30 band by 16.7% → outside
    total_cogs_pct: 31,             // inside NCA 28-35 band
    rent_pct_of_revenue: 8.2,       // inside NRA 6-10 band
    fitout_per_sqft_usd: 425,       // inside DCN 250-450 band (near upper)
  },
};

test("smoke: trent fixture — labor flags as outside best-practice band", () => {
  const out = computeAllVerdicts({
    workspace: TRENT_WORKSPACE,
    metrics: METRICS,
    cohorts: COHORTS,
    referenceRows: [], // No cohort reference rows in spot-check; BP-only fallback
    bestPracticeRows: BEST_PRACTICES,
  });
  const labor = out.verdicts.find((v) => v.metric.key === "labor_pct_of_revenue");
  assert.equal(labor.userValue, 35);
  assert.equal(labor.bestPractice.upperBound, 30);
  assert.equal(labor.bestPracticeVerdict.position, "outside");
  assert.equal(labor.bestPracticeVerdict.chipColor, "yellow");
  assert.equal(labor.primarySource, "best-practice"); // no cohort rows
  // SCA Operators Guide (generic) should win over the drive-thru annex.
  assert.equal(labor.bestPractice.source.name, "SCA Operators Guide");
  assert.ok(labor.applicableActions.length >= 1);
});

test("smoke: trent fixture — COGS lands inside NCA band", () => {
  const out = computeAllVerdicts({
    workspace: TRENT_WORKSPACE,
    metrics: METRICS,
    cohorts: COHORTS,
    referenceRows: [],
    bestPracticeRows: BEST_PRACTICES,
  });
  const cogs = out.verdicts.find((v) => v.metric.key === "total_cogs_pct");
  assert.equal(cogs.bestPracticeVerdict.position, "inside");
  assert.equal(cogs.bestPracticeVerdict.chipColor, "green");
  assert.equal(cogs.applicableActions.length, 0); // inside the band → no action
});

test("smoke: trent fixture — rent lands inside NRA band", () => {
  const out = computeAllVerdicts({
    workspace: TRENT_WORKSPACE,
    metrics: METRICS,
    cohorts: COHORTS,
    referenceRows: [],
    bestPracticeRows: BEST_PRACTICES,
  });
  const rent = out.verdicts.find((v) => v.metric.key === "rent_pct_of_revenue");
  assert.equal(rent.bestPracticeVerdict.position, "inside");
  assert.equal(rent.bestPracticeVerdict.chipColor, "green");
});

test("smoke: cohort path fires when sample size meets threshold", () => {
  const REF = [
    {
      id: "r1",
      metric_id: "labor_pct_of_revenue",
      cohort_id: "c-cafe-small",
      value_type: "range",
      p25: null,
      p50: null,
      p75: null,
      low: 28,
      high: 35,
      sample_size: 40,
      source_url: "x",
      source_name: "SCA",
      source_publication_date: null,
      extraction_date: "2026-06-07",
      extraction_confidence: "high",
      dataset_version: "2026.Q2",
      notes: null,
    },
  ];
  const out = computeAllVerdicts({
    workspace: TRENT_WORKSPACE,
    metrics: [METRICS[0]],
    cohorts: COHORTS,
    referenceRows: REF,
    bestPracticeRows: BEST_PRACTICES,
  });
  const labor = out.verdicts[0];
  assert.equal(out.cohortMatch.cohort.cohort_key, "cafe_500_1500_top50_1_3y");
  assert.equal(out.cohortMatch.sampleSize, 40);
  assert.equal(labor.primarySource, "both"); // cohort + BP fire together
  assert.ok(labor.cohort);
  assert.ok(labor.cohortVerdict);
});
