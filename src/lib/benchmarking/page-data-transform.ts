// TIM-2450: Bridge between the Phase 1 verdict engine and the Phase 3 dashboard.
//
// The engine returns BenchmarkVerdict[] keyed on metric_key in DB shape. The
// dashboard consumes BenchmarkPageData (pillars + drilldowns + cohort) with
// human-friendly axis labels. This module is the only seam between the two
// shapes — pure function, no I/O — so it can be unit-tested.

import type {
  BenchmarkPageData,
  BenchmarkPillar,
  BenchmarkSourceType,
  BenchmarkStatus,
  CohortInfo,
  DrilldownData,
} from "../../components/benchmark/types.ts";
import type {
  BenchmarkVerdict,
  CohortAxes,
  CohortMatch,
} from "./types.ts";

// Workspace slugs the dashboard mounts at — pillar filter is keyed off this.
export type WorkspaceSlug =
  | "financials"
  | "operations-playbook"
  | "menu-pricing"
  | "marketing"
  | "all";

const PILLAR_LABELS: Record<string, string> = {
  revenue_traffic: "Revenue & Traffic",
  cogs: "Cost of Goods Sold",
  labor: "Labor",
  real_estate_fitout: "Real Estate & Fit-out",
  equipment_throughput: "Equipment & Throughput",
  menu_pricing: "Menu & Pricing",
  marketing_loyalty: "Marketing & Loyalty",
  customer_experience: "Customer Experience",
};

const SLUG_TO_PILLARS: Record<WorkspaceSlug, string[]> = {
  financials: ["revenue_traffic", "cogs", "labor", "real_estate_fitout"],
  "operations-playbook": ["equipment_throughput", "customer_experience"],
  "menu-pricing": ["menu_pricing"],
  marketing: ["marketing_loyalty"],
  all: [
    "revenue_traffic",
    "cogs",
    "labor",
    "real_estate_fitout",
    "equipment_throughput",
    "menu_pricing",
    "marketing_loyalty",
    "customer_experience",
  ],
};

const MODEL_LABELS: Record<string, string> = {
  drive_thru: "Drive-through",
  cafe: "Full café",
  kiosk: "Cart / kiosk",
  cafe_drive_thru: "Café + drive-thru",
  multi_location: "Multi-location",
  mobile_cart: "Mobile cart",
};

const GEO_LABELS: Record<string, string> = {
  top_50_metro: "Top-50 metro",
  mid_metro: "Mid-size metro",
  small_metro: "Small metro",
  rural: "Rural",
};

const SQFT_LABELS: Record<string, string> = {
  lt_500: "Under 500 sq ft",
  "500_1500": "500–1,500 sq ft",
  "1500_3000": "1,500–3,000 sq ft",
  gt_3000: "Over 3,000 sq ft",
};

export interface TransformInputs {
  workspaceSlug: WorkspaceSlug;
  verdicts: BenchmarkVerdict[];
  cohortMatch: CohortMatch | null;
  /** Most recent dataset version across reference rows — surfaced as "data freshness". */
  dataFreshnessDate: string;
  /** Primary source catalog name shown on the cohort card. */
  sourceCatalog: string;
}

export function buildBenchmarkPageData(input: TransformInputs): BenchmarkPageData {
  const allowed = new Set(SLUG_TO_PILLARS[input.workspaceSlug] ?? SLUG_TO_PILLARS.all);
  const filtered = input.verdicts.filter((v) => allowed.has(v.metric.pillar));

  const pillars = groupByPillar(filtered);
  const drilldowns: Record<string, DrilldownData> = {};
  for (const v of filtered) {
    drilldowns[v.metric.key] = buildDrilldown(v);
  }

  return {
    cohort: buildCohortInfo(input.cohortMatch, input.dataFreshnessDate, input.sourceCatalog),
    pillars,
    drilldowns,
  };
}

function groupByPillar(verdicts: BenchmarkVerdict[]): BenchmarkPillar[] {
  const byPillar = new Map<string, BenchmarkVerdict[]>();
  for (const v of verdicts) {
    const list = byPillar.get(v.metric.pillar) ?? [];
    list.push(v);
    byPillar.set(v.metric.pillar, list);
  }
  const pillars: BenchmarkPillar[] = [];
  for (const [pillarKey, vs] of byPillar) {
    pillars.push({
      id: pillarKey,
      label: PILLAR_LABELS[pillarKey] ?? pillarKey,
      metrics: vs.map((v) => ({
        id: v.metric.key,
        label: v.metric.name,
        value: formatUserValue(v.userValue, v.metric.unit),
        status: chipStatus(v),
        sourceType: sourceType(v),
      })),
    });
  }
  // Stable order: same order as SLUG_TO_PILLARS.all
  pillars.sort((a, b) => SLUG_TO_PILLARS.all.indexOf(a.id) - SLUG_TO_PILLARS.all.indexOf(b.id));
  return pillars;
}

function buildDrilldown(v: BenchmarkVerdict): DrilldownData {
  const userValueNumeric = v.userValue ?? undefined;
  const cohortPct = v.cohortVerdict?.percentile;
  const bpLow = v.bestPractice?.lowerBound ?? undefined;
  const bpHigh = v.bestPractice?.upperBound ?? undefined;
  const proposed = computeProposed(v);
  const firstAction = v.applicableActions[0];
  return {
    metricId: v.metric.key,
    metricLabel: v.metric.name,
    userValue: formatUserValue(v.userValue, v.metric.unit),
    status: chipStatus(v),
    sourceType: sourceType(v),
    percentilePosition: cohortPct ?? undefined,
    percentileLabel: cohortPct != null ? percentileLabel(cohortPct) : undefined,
    bpLow: bpLow != null ? bpLow : undefined,
    bpHigh: bpHigh != null ? bpHigh : undefined,
    bpUnit: unitSuffix(v.metric.unit),
    userValueNumeric,
    insightText: insightFor(v),
    citationSource: v.bestPractice?.source.name ?? citationFromCohort(v),
    citationDate:
      v.bestPractice?.source.publicationDate ??
      v.bestPractice?.source.datasetVersion ??
      undefined,
    citationUrl: v.bestPractice?.source.url ?? undefined,
    citationConfidence: undefined, // Phase 1 engine does not surface confidence on verdicts
    proposedNumeric: proposed,
    proposedFormatted: proposed != null ? formatUserValue(proposed, v.metric.unit) : undefined,
    actionLabel: firstAction?.label,
    actionDescription: firstAction?.description,
  };
}

function computeProposed(v: BenchmarkVerdict): number | undefined {
  // Best-practice midpoint when we have a band — that's the engine's "land in
  // the band" target. Falls back to cohort median (p50) when only cohort
  // signal is present. Returns undefined when we cannot suggest a value.
  const bp = v.bestPractice;
  if (bp) {
    if (bp.target != null) return bp.target;
    if (bp.lowerBound != null && bp.upperBound != null) {
      return Math.round(((bp.lowerBound + bp.upperBound) / 2) * 100) / 100;
    }
  }
  const p50 = v.cohortVerdict?.p50;
  if (p50 != null) return p50;
  return undefined;
}

function buildCohortInfo(
  match: CohortMatch | null,
  dataFreshnessDate: string,
  sourceCatalog: string,
): CohortInfo {
  if (!match) {
    return {
      axes: { shopModel: [], locationType: "Not classified", shopSize: [] },
      sampleSize: 0,
      dataFreshnessDate,
      sourceCatalog,
      isFallback: true,
    };
  }
  return {
    axes: humaniseAxes(match.cohort.axes),
    sampleSize: match.sampleSize,
    dataFreshnessDate,
    sourceCatalog,
    isFallback: match.sampleSize < 10 || match.axesRelaxed.length > 0,
  };
}

function humaniseAxes(axes: CohortAxes): { shopModel: string[]; locationType: string; shopSize: string[] } {
  return {
    shopModel: axes.model ? [MODEL_LABELS[axes.model] ?? axes.model] : [],
    locationType: axes.geo_tier ? GEO_LABELS[axes.geo_tier] ?? axes.geo_tier : "Not classified",
    shopSize: axes.sqft_bucket ? [SQFT_LABELS[axes.sqft_bucket] ?? axes.sqft_bucket] : [],
  };
}

function chipStatus(v: BenchmarkVerdict): BenchmarkStatus {
  // primarySource decides which colour wins. The dashboard surfaces best-practice
  // when both fired, but visually the cohort colour is shown when cohort is the
  // sole source. "none" → grey.
  if (v.primarySource === "none") return "grey";
  if (v.primarySource === "cohort") {
    return v.cohortVerdict?.chipColor ?? "grey";
  }
  // best-practice OR both → use best-practice verdict for the chip colour.
  const bp = v.bestPracticeVerdict?.chipColor;
  if (bp && bp !== "grey") return bp;
  return v.cohortVerdict?.chipColor ?? "grey";
}

function sourceType(v: BenchmarkVerdict): BenchmarkSourceType {
  switch (v.primarySource) {
    case "cohort":
      return "cohort";
    case "best-practice":
      return "best-practice";
    case "both":
      return "both";
    case "none":
    default:
      return "no data";
  }
}

function percentileLabel(p: number): string {
  if (p >= 75) return `You are in the top ${Math.max(1, Math.round(100 - p))}% of your cohort.`;
  if (p <= 25) return `You are in the bottom ${Math.max(1, Math.round(p))}% of your cohort.`;
  return `You are around the cohort median (${Math.round(p)}th percentile).`;
}

function insightFor(v: BenchmarkVerdict): string | undefined {
  if (v.primarySource === "none") return undefined;
  if (v.bestPractice?.rationale) return v.bestPractice.rationale;
  if (v.cohortVerdict?.percentile != null) return percentileLabel(v.cohortVerdict.percentile);
  return undefined;
}

function citationFromCohort(v: BenchmarkVerdict): string | undefined {
  if (!v.cohort) return undefined;
  return `Groundwork cohort: ${v.cohort.cohortKey}`;
}

// ── unit formatting ────────────────────────────────────────────────────────
// Catalog units we know about (from supabase/seeds/tim2447_benchmark_metrics_seed.sql).

export function formatUserValue(value: number | null, unit: string): string {
  if (value == null) return "—";
  switch (unit) {
    case "pct":
      return `${roundForPct(value)}%`;
    case "usd":
      return `$${value.toFixed(2)}`;
    case "usd_year":
      return value >= 1000 ? `$${Math.round(value / 1000)}k/yr` : `$${value.toFixed(0)}/yr`;
    case "usd_hour":
      return `$${value.toFixed(2)}/hr`;
    case "usd_sqft":
      return `$${value.toFixed(0)}/sqft`;
    case "usd_sqft_year":
      return `$${value.toFixed(0)}/sqft/yr`;
    case "count":
      return value.toFixed(0);
    case "count_day":
      return `${value.toFixed(0)}/day`;
    case "count_hour":
      return `${value.toFixed(0)}/hr`;
    case "years":
      return `${value.toFixed(1)} yr`;
    case "seconds":
      return `${value.toFixed(0)}s`;
    case "rating_5":
      return value.toFixed(2);
    default:
      return String(value);
  }
}

function roundForPct(value: number): string {
  if (value < 10 && value > 0) return value.toFixed(1);
  return value.toFixed(0);
}

export function unitSuffix(unit: string): string {
  switch (unit) {
    case "pct":
      return "%";
    case "usd":
      return "$";
    case "usd_hour":
      return "$/hr";
    case "usd_sqft":
      return "$/sqft";
    case "usd_sqft_year":
      return "$/sqft/yr";
    case "usd_year":
      return "$/yr";
    case "count_day":
      return "/day";
    case "count_hour":
      return "/hr";
    case "seconds":
      return "s";
    case "years":
      return "yr";
    default:
      return "";
  }
}

export function yellowCount(data: BenchmarkPageData): number {
  let n = 0;
  for (const p of data.pillars) {
    for (const m of p.metrics) {
      if (m.status === "yellow") n++;
    }
  }
  return n;
}
