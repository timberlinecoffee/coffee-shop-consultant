// TIM-2449: Phase 1 stub for applicable actions.
//
// Plan §5 of TIM-2449 spec — "Apply-suggestion stub. Phase 3 wires this through
// the unified review modal." We emit text-only descriptors per metric so the
// chat companion and dashboard can render the CTA shape even before the modal
// path is live. The action id is a stable string the Phase 3 wiring can switch
// on; the shape never breaks.

import type {
  ApplicableAction,
  BestPracticeRow,
  CohortVerdict,
  MetricCatalogRow,
} from "./types";

export interface ApplicableActionInputs {
  metric: MetricCatalogRow;
  userValue: number | null;
  bestPracticeRow: BestPracticeRow | null;
  cohortVerdict: CohortVerdict | null;
}

export function buildApplicableActions(input: ApplicableActionInputs): ApplicableAction[] {
  if (input.userValue === null) return [];
  const actions: ApplicableAction[] = [];
  const bp = input.bestPracticeRow;
  if (bp) {
    const direction = input.metric.direction_of_better;
    const above = bp.guideline_high != null && input.userValue > bp.guideline_high;
    const below = bp.guideline_low != null && input.userValue < bp.guideline_low;
    if (above) {
      actions.push({
        id: `${input.metric.metric_key}.lower_to_best_practice`,
        label: direction === "lower" ? "Tighten to best-practice band" : "Bring back into band",
        description:
          `Your value is above the ${bp.source_name} band (${formatBand(bp)}). ` +
          `Phase 3 will wire this into the review modal with a per-metric Apply.`,
      });
    } else if (below) {
      actions.push({
        id: `${input.metric.metric_key}.raise_to_best_practice`,
        label: direction === "higher" ? "Raise to best-practice band" : "Bring up into band",
        description:
          `Your value is below the ${bp.source_name} band (${formatBand(bp)}). ` +
          `Phase 3 will wire this into the review modal with a per-metric Apply.`,
      });
    }
  }
  if (
    input.cohortVerdict?.percentile !== null &&
    input.cohortVerdict?.percentile !== undefined &&
    input.cohortVerdict.chipColor === "yellow"
  ) {
    actions.push({
      id: `${input.metric.metric_key}.move_toward_cohort_median`,
      label: "Move toward cohort median",
      description:
        `You're in the bottom quartile of your cohort. Phase 3 will surface ` +
        `the top-quartile playbook here with an Apply path.`,
    });
  }
  return actions;
}

function formatBand(row: BestPracticeRow): string {
  if (row.guideline_low != null && row.guideline_high != null) {
    return `${row.guideline_low}–${row.guideline_high}`;
  }
  if (row.guideline_target != null) {
    return `target ${row.guideline_target}`;
  }
  return "see source";
}
