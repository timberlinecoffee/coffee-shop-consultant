// TIM-2449: shared types for the benchmarking engine (cohort matcher,
// percentile engine, best-practice recommender, unified verdict).
//
// The DB-level axis enums live in supabase/seeds/tim2447_benchmark_cohorts_seed.sql.
// We mirror them here as string-union types so callers get autocomplete and the
// matcher can validate against the enums it knows about. Anything outside the
// enums is rejected, never silently coerced.

export type CohortModel =
  | "drive_thru"
  | "cafe"
  | "kiosk"
  | "cafe_drive_thru"
  | "multi_location"
  | "mobile_cart";

export type CohortSqftBucket = "lt_500" | "500_1500" | "1500_3000" | "gt_3000";

export type CohortGeoTier = "top_50_metro" | "mid_metro" | "small_metro" | "rural";

export type CohortAgeBucket = "pre_open" | "lt_1y" | "1_3y" | "3_7y" | "mature_7plus";

export type CohortAuvTier = "low" | "mid" | "high" | "top_decile";

export type CohortConcept =
  | "third_wave_specialty"
  | "neighborhood_cafe"
  | "grab_and_go"
  | "cafe_food_program"
  | "roastery_cafe";

// Plan §5 axes. Each is optional because both cohort definitions and the
// derived workspace profile can leave individual axes blank when there's no
// signal — e.g. a pre-open plan has no AUV tier yet.
export interface CohortAxes {
  model?: CohortModel | null;
  sqft_bucket?: CohortSqftBucket | null;
  geo_tier?: CohortGeoTier | null;
  age_bucket?: CohortAgeBucket | null;
  auv_tier?: CohortAuvTier | null;
  concept?: CohortConcept | null;
}

// A row from benchmark_cohorts. `axes` is the partial-match shape — NULL fields
// mean "this cohort applies to any value on that axis".
export interface CohortRow {
  id: string;
  cohort_key: string;
  axes: CohortAxes;
  description: string | null;
}

// A row from benchmark_reference_values (the data table). `cohort_id` null
// means the row is national/unbucketed.
export interface ReferenceValueRow {
  id: string;
  metric_id: string;
  cohort_id: string | null;
  value_type: "percentile" | "range" | "guideline";
  p25: number | null;
  p50: number | null;
  p75: number | null;
  low: number | null;
  high: number | null;
  sample_size: number | null;
  source_url: string;
  source_name: string;
  source_publication_date: string | null;
  extraction_date: string;
  extraction_confidence: "high" | "medium" | "low";
  dataset_version: string;
  notes: string | null;
}

// A row from benchmark_best_practices. `applicable_cohort_filter` is a partial
// CohortAxes shape (NULL = applies to every workspace).
export interface BestPracticeRow {
  id: string;
  metric_id: string;
  applicable_cohort_filter: CohortAxes | null;
  guideline_low: number | null;
  guideline_high: number | null;
  guideline_target: number | null;
  rationale: string;
  source_url: string;
  source_name: string;
  source_publication_date: string | null;
  dataset_version: string;
}

// A row from benchmark_metrics — the catalog entry that anchors a verdict.
export interface MetricCatalogRow {
  metric_key: string;
  pillar: string;
  name: string;
  unit: string;
  direction_of_better: "higher" | "lower" | "range";
  description: string | null;
}

// The workspace profile we match into a cohort. Derived from the user's plan
// (model from the chosen concept + locations, sqft from the signed/primary
// location, AUV tier from the financial model's Y1 revenue, etc.). See
// derive-workspace-profile.ts.
export interface WorkspaceProfile {
  axes: CohortAxes;
  userValues: Record<string, number | null>;
}

// Chip color per plan §7b. Grey = no reference data.
export type ChipColor = "green" | "blue" | "yellow" | "grey";

// Output of the cohort matcher — the cohort we picked plus a record of which
// axes were relaxed to reach the sample-size threshold. The caller MUST surface
// `relaxedAxes` to the user (plan §5: "Never silently widen").
export interface CohortMatch {
  cohort: CohortRow;
  axesMatched: (keyof CohortAxes)[];
  axesRelaxed: (keyof CohortAxes)[];
  sampleSize: number; // sum of sample_size across reference rows for this cohort
  score: number;      // higher = better match (used internally for sort)
}

// Per-metric output of the percentile engine.
export interface CohortVerdict {
  percentile: number | null;     // 0..100, null when not computable
  chipColor: ChipColor;
  p25: number | null;
  p50: number | null;
  p75: number | null;
}

// Per-metric output of the best-practice recommender.
export interface BestPracticeVerdict {
  position: "inside" | "near" | "outside" | "unknown";
  chipColor: ChipColor;
}

// Unified verdict shape per plan §4. One row per metric.
export interface BenchmarkVerdict {
  metric: {
    key: string;
    pillar: string;
    name: string;
    unit: string;
    direction: "higher" | "lower" | "range";
  };
  userValue: number | null;
  cohort: {
    definition: CohortAxes;
    cohortKey: string;
    description: string | null;
    sampleSize: number;
    axesRelaxed: (keyof CohortAxes)[];
    p25: number | null;
    p50: number | null;
    p75: number | null;
  } | null;
  cohortVerdict: CohortVerdict | null;
  bestPractice: {
    lowerBound: number | null;
    upperBound: number | null;
    target: number | null;
    source: {
      name: string;
      url: string;
      publicationDate: string | null;
      datasetVersion: string;
    };
    rationale: string;
  } | null;
  bestPracticeVerdict: BestPracticeVerdict | null;
  primarySource: "cohort" | "best-practice" | "both" | "none";
  applicableActions: ApplicableAction[];
}

// Phase 1 stub per spec §5 — text-only suggestion. Phase 3 wires this through
// the unified review modal.
export interface ApplicableAction {
  id: string;
  label: string;
  description: string;
}
