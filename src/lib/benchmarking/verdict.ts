// TIM-2449: unified verdict engine — orchestrator.
//
// Per metric, compose:
//   1. cohort match (with widening + sample size)
//   2. cohort percentile + chip
//   3. best-practice band + chip
// into the single response shape from plan §4.
//
// Pure function — no I/O. Callers (routes, future server actions, tests) load
// the catalog rows + workspace inputs and pass them in.

import { findCohort } from "./cohort-matcher.ts";
import { computePercentile } from "./percentile.ts";
import { computeBestPracticeVerdict, pickBestPractice } from "./best-practice.ts";
import { buildApplicableActions } from "./applicable-actions.ts";
import type {
  BenchmarkVerdict,
  BestPracticeRow,
  ChipColor,
  CohortMatch,
  CohortRow,
  MetricCatalogRow,
  ReferenceValueRow,
  WorkspaceProfile,
} from "./types";

export interface VerdictInputs {
  workspace: WorkspaceProfile;
  metrics: MetricCatalogRow[];
  cohorts: CohortRow[];
  referenceRows: ReferenceValueRow[];
  bestPracticeRows: BestPracticeRow[];
  sampleThreshold?: number;
}

export interface VerdictResult {
  workspaceProfile: WorkspaceProfile;
  cohortMatch: CohortMatch | null;
  verdicts: BenchmarkVerdict[];
  // Plan §5: matcher logs widening events. Surface them up the stack so the
  // /api route can write them to its server log and the dashboard label.
  widenLog: { metric: string; relaxed: string[]; sampleSize: number }[];
}

export function computeAllVerdicts(input: VerdictInputs): VerdictResult {
  const cohortMatch = findCohort({
    workspace: input.workspace,
    cohorts: input.cohorts,
    referenceRows: input.referenceRows,
    sampleThreshold: input.sampleThreshold,
  });
  const widenLog: VerdictResult["widenLog"] = [];

  const verdicts: BenchmarkVerdict[] = input.metrics.map((m) =>
    verdictForMetric(m, input, cohortMatch, widenLog),
  );

  return { workspaceProfile: input.workspace, cohortMatch, verdicts, widenLog };
}

export function verdictForMetric(
  metric: MetricCatalogRow,
  input: VerdictInputs,
  cohortMatch: CohortMatch | null,
  widenLog: VerdictResult["widenLog"],
): BenchmarkVerdict {
  const userValue = input.workspace.userValues[metric.metric_key] ?? null;
  const cohortRefRows = filterReferenceRows(metric.metric_key, cohortMatch, input.referenceRows);
  const nationalRefRows = input.referenceRows.filter(
    (r) => r.metric_id === metric.metric_key && r.cohort_id === null,
  );

  // Use cohort rows when present; fall back to national/unbucketed rows so
  // every metric has a chance to render a chip.
  const effectiveRefRows = cohortRefRows.length > 0 ? cohortRefRows : nationalRefRows;
  const cohortVerdict = effectiveRefRows.length > 0
    ? computePercentile({
        userValue,
        referenceRows: effectiveRefRows,
        direction: metric.direction_of_better,
      })
    : null;

  const bestPracticeRow = pickBestPractice(
    input.bestPracticeRows.filter((r) => r.metric_id === metric.metric_key),
    input.workspace,
  );
  const bestPracticeVerdict = computeBestPracticeVerdict(userValue, bestPracticeRow);

  // Decide which source(s) actually fired.
  const cohortFired =
    cohortVerdict !== null &&
    cohortVerdict.percentile !== null &&
    cohortMatch !== null &&
    cohortMatch.sampleSize >= (input.sampleThreshold ?? 10);
  const bestPracticeFired = bestPracticeVerdict !== null && bestPracticeVerdict.position !== "unknown";

  let primarySource: BenchmarkVerdict["primarySource"] = "none";
  if (cohortFired && bestPracticeFired) primarySource = "both";
  else if (cohortFired) primarySource = "cohort";
  else if (bestPracticeFired) primarySource = "best-practice";

  // Log a widen event for the dashboard label (plan §5 — never silently widen).
  if (cohortMatch && cohortMatch.axesRelaxed.length > 0 && cohortRefRows.length > 0) {
    widenLog.push({
      metric: metric.metric_key,
      relaxed: cohortMatch.axesRelaxed.map(String),
      sampleSize: cohortMatch.sampleSize,
    });
  }

  const applicableActions = buildApplicableActions({
    metric,
    userValue,
    bestPracticeRow,
    cohortVerdict,
  });

  return {
    metric: {
      key: metric.metric_key,
      pillar: metric.pillar,
      name: metric.name,
      unit: metric.unit,
      direction: metric.direction_of_better,
    },
    userValue,
    cohort: cohortMatch
      ? {
          definition: cohortMatch.cohort.axes,
          cohortKey: cohortMatch.cohort.cohort_key,
          description: cohortMatch.cohort.description,
          sampleSize: cohortMatch.sampleSize,
          axesRelaxed: cohortMatch.axesRelaxed,
          p25: cohortVerdict?.p25 ?? null,
          p50: cohortVerdict?.p50 ?? null,
          p75: cohortVerdict?.p75 ?? null,
        }
      : null,
    cohortVerdict: cohortVerdict
      ? {
          percentile: cohortVerdict.percentile,
          chipColor: cohortVerdict.chipColor as ChipColor,
          p25: cohortVerdict.p25,
          p50: cohortVerdict.p50,
          p75: cohortVerdict.p75,
        }
      : null,
    bestPractice: bestPracticeRow
      ? {
          lowerBound: bestPracticeRow.guideline_low,
          upperBound: bestPracticeRow.guideline_high,
          target: bestPracticeRow.guideline_target,
          source: {
            name: bestPracticeRow.source_name,
            url: bestPracticeRow.source_url,
            publicationDate: bestPracticeRow.source_publication_date,
            datasetVersion: bestPracticeRow.dataset_version,
          },
          rationale: bestPracticeRow.rationale,
        }
      : null,
    bestPracticeVerdict,
    primarySource,
    applicableActions,
  };
}

function filterReferenceRows(
  metricKey: string,
  cohortMatch: CohortMatch | null,
  rows: ReferenceValueRow[],
): ReferenceValueRow[] {
  if (!cohortMatch) return [];
  return rows.filter((r) => r.metric_id === metricKey && r.cohort_id === cohortMatch.cohort.id);
}
