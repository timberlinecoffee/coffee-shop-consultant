// TIM-2450: page-data-transform pinning tests.
// Pure-function transform from BenchmarkVerdict[] → BenchmarkPageData.
// Pin axis humanisation, status mapping, slug → pillar filter, unit format,
// and the yellow counter the sub-nav badge reads.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBenchmarkPageData,
  formatUserValue,
  unitSuffix,
  yellowCount,
} from "./page-data-transform.ts";

function bp(metricKey, pillar, name, unit, opts = {}) {
  return {
    metric: {
      key: metricKey,
      pillar,
      name,
      unit,
      direction: opts.direction ?? "lower",
    },
    userValue: opts.userValue ?? null,
    cohort: opts.cohort ?? null,
    cohortVerdict: opts.cohortVerdict ?? null,
    bestPractice: opts.bestPractice ?? null,
    bestPracticeVerdict: opts.bestPracticeVerdict ?? null,
    primarySource: opts.primarySource ?? "none",
    applicableActions: opts.applicableActions ?? [],
  };
}

const COHORT_MATCH = {
  cohort: {
    id: "c1",
    cohort_key: "cafe_small_metro_500_1500",
    axes: { model: "cafe", sqft_bucket: "500_1500", geo_tier: "mid_metro" },
    description: "Cafés in mid-metro between 500–1,500 sq ft",
  },
  axesMatched: ["model", "sqft_bucket", "geo_tier"],
  axesRelaxed: [],
  sampleSize: 42,
  score: 4,
};

test("buildBenchmarkPageData: financials slug only emits financials pillars", () => {
  const verdicts = [
    bp("labor_pct_of_revenue", "labor", "Labor %", "pct", {
      userValue: 38,
      primarySource: "best-practice",
      bestPractice: {
        lowerBound: 28,
        upperBound: 35,
        target: 32,
        source: { name: "SCA", url: "https://sca.example", publicationDate: "2025-04", datasetVersion: "v1" },
        rationale: "Above SCA band",
      },
      bestPracticeVerdict: { position: "outside", chipColor: "yellow" },
    }),
    bp("attach_rate_food_pct", "menu_pricing", "Food attach", "pct", {
      userValue: 22,
      primarySource: "best-practice",
      bestPractice: {
        lowerBound: 30,
        upperBound: 50,
        target: 40,
        source: { name: "SCA", url: "https://sca.example", publicationDate: "2025-04", datasetVersion: "v1" },
        rationale: "Below band",
      },
      bestPracticeVerdict: { position: "outside", chipColor: "yellow" },
    }),
  ];
  const data = buildBenchmarkPageData({
    workspaceSlug: "financials",
    verdicts,
    cohortMatch: COHORT_MATCH,
    dataFreshnessDate: "May 2026",
    sourceCatalog: "Groundwork v2.1",
  });
  assert.equal(data.pillars.length, 1);
  assert.equal(data.pillars[0].id, "labor");
  assert.equal(data.pillars[0].metrics.length, 1);
  assert.equal(data.pillars[0].metrics[0].id, "labor_pct_of_revenue");
});

test("buildBenchmarkPageData: cohort axes are humanised, sample size flows through", () => {
  const data = buildBenchmarkPageData({
    workspaceSlug: "all",
    verdicts: [],
    cohortMatch: COHORT_MATCH,
    dataFreshnessDate: "May 2026",
    sourceCatalog: "Groundwork v2.1",
  });
  assert.deepEqual(data.cohort.axes.shopModel, ["Full café"]);
  assert.equal(data.cohort.axes.locationType, "Mid-size metro");
  assert.deepEqual(data.cohort.axes.shopSize, ["500–1,500 sq ft"]);
  assert.equal(data.cohort.sampleSize, 42);
  assert.equal(data.cohort.isFallback, false);
});

test("buildBenchmarkPageData: isFallback when sample < 10 OR widening occurred", () => {
  const thin = buildBenchmarkPageData({
    workspaceSlug: "all",
    verdicts: [],
    cohortMatch: { ...COHORT_MATCH, sampleSize: 5 },
    dataFreshnessDate: "x",
    sourceCatalog: "y",
  });
  assert.equal(thin.cohort.isFallback, true);

  const widened = buildBenchmarkPageData({
    workspaceSlug: "all",
    verdicts: [],
    cohortMatch: { ...COHORT_MATCH, sampleSize: 40, axesRelaxed: ["geo_tier"] },
    dataFreshnessDate: "x",
    sourceCatalog: "y",
  });
  assert.equal(widened.cohort.isFallback, true);
});

test("buildBenchmarkPageData: chip status follows primarySource (cohort → cohort color, both → BP color)", () => {
  const cohortOnly = bp("k1", "cogs", "COGS", "pct", {
    userValue: 28,
    primarySource: "cohort",
    cohortVerdict: { percentile: 80, chipColor: "green", p25: null, p50: null, p75: null },
  });
  const bothBpYellow = bp("k2", "labor", "Labor", "pct", {
    userValue: 40,
    primarySource: "both",
    cohortVerdict: { percentile: 40, chipColor: "blue", p25: null, p50: null, p75: null },
    bestPracticeVerdict: { position: "outside", chipColor: "yellow" },
  });
  const data = buildBenchmarkPageData({
    workspaceSlug: "all",
    verdicts: [cohortOnly, bothBpYellow],
    cohortMatch: COHORT_MATCH,
    dataFreshnessDate: "x",
    sourceCatalog: "y",
  });
  const allMetrics = data.pillars.flatMap((p) => p.metrics);
  const m1 = allMetrics.find((m) => m.id === "k1");
  const m2 = allMetrics.find((m) => m.id === "k2");
  assert.equal(m1.status, "green");
  assert.equal(m1.sourceType, "cohort");
  assert.equal(m2.status, "yellow");
  assert.equal(m2.sourceType, "both");
});

test("buildBenchmarkPageData: drilldown surfaces percentile + BP band + citation", () => {
  const v = bp("labor_pct_of_revenue", "labor", "Labor %", "pct", {
    userValue: 38,
    primarySource: "both",
    cohortVerdict: { percentile: 30, chipColor: "blue", p25: null, p50: null, p75: null },
    bestPractice: {
      lowerBound: 28,
      upperBound: 35,
      target: 32,
      source: {
        name: "SCA",
        url: "https://sca.example",
        publicationDate: "2025-04",
        datasetVersion: "v1",
      },
      rationale: "You are 3pp above the SCA band",
    },
    bestPracticeVerdict: { position: "outside", chipColor: "yellow" },
  });
  const data = buildBenchmarkPageData({
    workspaceSlug: "financials",
    verdicts: [v],
    cohortMatch: COHORT_MATCH,
    dataFreshnessDate: "May 2026",
    sourceCatalog: "Groundwork v2.1",
  });
  const dd = data.drilldowns["labor_pct_of_revenue"];
  assert.equal(dd.percentilePosition, 30);
  assert.equal(dd.bpLow, 28);
  assert.equal(dd.bpHigh, 35);
  assert.equal(dd.bpUnit, "%");
  assert.equal(dd.citationSource, "SCA");
  assert.equal(dd.citationUrl, "https://sca.example");
  assert.equal(dd.insightText, "You are 3pp above the SCA band");
});

test("yellowCount sums yellow chips across pillars", () => {
  const data = {
    cohort: { axes: { shopModel: [], locationType: "", shopSize: [] }, sampleSize: 0, dataFreshnessDate: "", sourceCatalog: "", isFallback: false },
    pillars: [
      { id: "a", label: "A", metrics: [{ id: "1", label: "x", value: "1", status: "yellow", sourceType: "cohort" }, { id: "2", label: "y", value: "1", status: "green", sourceType: "cohort" }] },
      { id: "b", label: "B", metrics: [{ id: "3", label: "z", value: "1", status: "yellow", sourceType: "cohort" }] },
    ],
    drilldowns: {},
  };
  assert.equal(yellowCount(data), 2);
});

test("formatUserValue: pct/usd/usd_year/usd_hour/count_hour", () => {
  assert.equal(formatUserValue(38, "pct"), "38%");
  assert.equal(formatUserValue(3.5, "pct"), "3.5%");
  assert.equal(formatUserValue(null, "pct"), "—");
  assert.equal(formatUserValue(8.4, "usd"), "$8.40");
  assert.equal(formatUserValue(420000, "usd_year"), "$420k/yr");
  assert.equal(formatUserValue(900, "usd_year"), "$900/yr");
  assert.equal(formatUserValue(22.5, "usd_hour"), "$22.50/hr");
  assert.equal(formatUserValue(18, "count_hour"), "18/hr");
});

test("unitSuffix maps common catalog units", () => {
  assert.equal(unitSuffix("pct"), "%");
  assert.equal(unitSuffix("usd"), "$");
  assert.equal(unitSuffix("usd_sqft"), "$/sqft");
  assert.equal(unitSuffix("count"), "");
});
