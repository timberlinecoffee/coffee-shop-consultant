// TIM-2449: load the benchmark reference dataset from Supabase.
//
// One round-trip per table (catalog, cohorts, reference rows, best-practices).
// Authenticated reads are allowed by the TIM-2447 RLS policies, so this works
// with the user's own client — no service-role bridge needed.
//
// Callers (the two API routes + future server actions) load once and pass the
// result into computeAllVerdicts. The fetch is cheap by design: every table is
// tiny (catalog ≤ 30 rows, cohorts ≤ 50, reference ≤ a few hundred, best-
// practices ≤ ~100).

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BestPracticeRow,
  CohortRow,
  MetricCatalogRow,
  ReferenceValueRow,
} from "./types";

export interface ReferenceDataset {
  metrics: MetricCatalogRow[];
  cohorts: CohortRow[];
  referenceRows: ReferenceValueRow[];
  bestPracticeRows: BestPracticeRow[];
}

export async function loadReferenceDataset(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<ReferenceDataset> {
  const [metricsRes, cohortsRes, refRes, bpRes] = await Promise.all([
    supabase
      .from("benchmark_metrics")
      .select("metric_key, pillar, name, unit, direction_of_better, description"),
    supabase.from("benchmark_cohorts").select("id, cohort_key, axes, description"),
    supabase
      .from("benchmark_reference_values")
      .select(
        "id, metric_id, cohort_id, value_type, p25, p50, p75, low, high, sample_size, source_url, source_name, source_publication_date, extraction_date, extraction_confidence, dataset_version, notes",
      ),
    supabase
      .from("benchmark_best_practices")
      .select(
        "id, metric_id, applicable_cohort_filter, guideline_low, guideline_high, guideline_target, rationale, source_url, source_name, source_publication_date, dataset_version",
      ),
  ]);

  if (metricsRes.error) throw metricsRes.error;
  if (cohortsRes.error) throw cohortsRes.error;
  if (refRes.error) throw refRes.error;
  if (bpRes.error) throw bpRes.error;

  return {
    metrics: (metricsRes.data ?? []) as MetricCatalogRow[],
    cohorts: (cohortsRes.data ?? []) as CohortRow[],
    referenceRows: (refRes.data ?? []) as ReferenceValueRow[],
    bestPracticeRows: (bpRes.data ?? []) as BestPracticeRow[],
  };
}
