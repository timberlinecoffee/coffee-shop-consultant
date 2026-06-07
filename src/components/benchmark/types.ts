// TIM-2472: Shared types for the benchmarking UI surface.

export type BenchmarkStatus = "green" | "blue" | "yellow" | "grey";
export type BenchmarkSourceType = "cohort" | "best-practice" | "both" | "no data";
export type BenchmarkChipVariant = "grid" | "inline";

export interface BenchmarkMetric {
  id: string;
  label: string;
  value: string;
  status: BenchmarkStatus;
  sourceType: BenchmarkSourceType;
}

export interface BenchmarkPillar {
  id: string;
  label: string;
  metrics: BenchmarkMetric[];
}

export interface CohortAxes {
  shopModel: string[];
  locationType: string;
  shopSize: string[];
}

export interface CohortInfo {
  axes: CohortAxes;
  sampleSize: number;
  dataFreshnessDate: string;
  sourceCatalog: string;
  isFallback: boolean;
}

export interface PercentilePoint {
  period: string;
  userValue: number;
  cohortMedian: number;
  bpLow: number;
  bpHigh: number;
}

export interface DrilldownData {
  metricId: string;
  metricLabel: string;
  userValue: string;
  status: BenchmarkStatus;
  sourceType: BenchmarkSourceType;
  percentilePosition?: number;
  percentileLabel?: string;
  bpLow?: number;
  bpHigh?: number;
  bpUnit?: string;
  userValueNumeric?: number;
  insightText?: string;
  citationSource?: string;
  citationDate?: string;
  citationUrl?: string;
  citationConfidence?: "high" | "medium" | "low";
  trendData?: PercentilePoint[];
}

export interface BenchmarkPageData {
  cohort: CohortInfo;
  pillars: BenchmarkPillar[];
  drilldowns: Record<string, DrilldownData>;
}
