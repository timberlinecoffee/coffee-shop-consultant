// TIM-2449: nearest-neighbor cohort matcher.
//
// Given a workspace profile, pick the cohort from benchmark_cohorts that best
// matches on the four high-signal axes (model, sqft, AUV tier, geo tier). If
// the nearest cohort's pooled sample size is below threshold, relax one axis at
// a time in priority order — never silently. Return what we matched, what we
// relaxed, and the sample size so the caller can label the verdict to the user.
//
// Plan §5: "Never silently widen, never silently substitute."

import type {
  CohortAxes,
  CohortMatch,
  CohortRow,
  ReferenceValueRow,
  WorkspaceProfile,
} from "./types";

// Axis weights for the score function. Plan §5: model + size + AUV + geo are
// the high-signal axes; age and concept are tie-breakers.
const AXIS_WEIGHTS: Record<keyof CohortAxes, number> = {
  model: 10,
  sqft_bucket: 6,
  auv_tier: 6,
  geo_tier: 5,
  age_bucket: 2,
  concept: 1,
};

// Priority order when widening — the LEAST-signal axis is relaxed first.
// Anything in AXIS_WEIGHTS missing here is a programming error.
const WIDEN_ORDER: (keyof CohortAxes)[] = [
  "concept",
  "age_bucket",
  "geo_tier",
  "auv_tier",
  "sqft_bucket",
  "model",
];

export const DEFAULT_SAMPLE_THRESHOLD = 10;

const ALL_AXES: (keyof CohortAxes)[] = [
  "model",
  "sqft_bucket",
  "geo_tier",
  "age_bucket",
  "auv_tier",
  "concept",
];

// Score a single cohort against a workspace profile. Higher = better match.
// Returns a negative penalty for axis mismatches and 0 for "any value" cohort
// axes (those NULL fields apply to everything).
export function scoreCohort(workspace: CohortAxes, cohort: CohortAxes): {
  score: number;
  axesMatched: (keyof CohortAxes)[];
  axesMismatched: (keyof CohortAxes)[];
} {
  let score = 0;
  const matched: (keyof CohortAxes)[] = [];
  const mismatched: (keyof CohortAxes)[] = [];
  for (const axis of ALL_AXES) {
    const w = cohort[axis] ?? null;
    const u = workspace[axis] ?? null;
    if (w === null) {
      // Cohort doesn't constrain this axis — neutral. Don't reward, don't
      // penalize; a broad cohort shouldn't beat a narrow exact match.
      continue;
    }
    if (u === null) {
      // Workspace has no value for an axis the cohort requires — penalty.
      mismatched.push(axis);
      score -= AXIS_WEIGHTS[axis];
      continue;
    }
    if (w === u) {
      matched.push(axis);
      score += AXIS_WEIGHTS[axis];
    } else {
      mismatched.push(axis);
      score -= AXIS_WEIGHTS[axis];
    }
  }
  return { score, axesMatched: matched, axesMismatched: mismatched };
}

// Pooled sample size across the reference rows for a single cohort. The
// matcher returns this so the caller can label it ("n=42 reference shops").
// Rows with a NULL sample_size contribute 0; range-only rows are common and
// the engine treats them as still informative for chip color, but they do not
// vote toward the sample threshold.
export function pooledSampleSize(
  cohortId: string,
  referenceRows: ReferenceValueRow[],
): number {
  let total = 0;
  for (const r of referenceRows) {
    if (r.cohort_id !== cohortId) continue;
    if (typeof r.sample_size === "number" && Number.isFinite(r.sample_size) && r.sample_size > 0) {
      total += r.sample_size;
    }
  }
  return total;
}

// Try each progressively-relaxed workspace profile against the cohorts and
// return the best match plus the list of axes we relaxed. If threshold is met
// at any attempt, return that match. Otherwise return the best under-threshold
// match seen so the caller can label "Below sample threshold (n=X)" and fall
// back to best-practice. Returns null only when zero cohorts ever matched any
// axis (including after relaxing every axis).
export function findCohort(input: {
  workspace: WorkspaceProfile;
  cohorts: CohortRow[];
  referenceRows: ReferenceValueRow[];
  sampleThreshold?: number;
}): CohortMatch | null {
  const threshold = input.sampleThreshold ?? DEFAULT_SAMPLE_THRESHOLD;
  let currentProfile: CohortAxes = { ...input.workspace.axes };
  const relaxed: (keyof CohortAxes)[] = [];
  let bestSeen: CohortMatch | null = null;

  for (let attempt = 0; attempt <= WIDEN_ORDER.length; attempt += 1) {
    const best = pickBest(currentProfile, input.cohorts);
    if (best) {
      const sampleSize = pooledSampleSize(best.cohort.id, input.referenceRows);
      const candidate: CohortMatch = {
        ...best,
        axesRelaxed: [...relaxed],
        sampleSize,
      };
      if (sampleSize >= threshold) {
        return candidate;
      }
      // Track best-seen by (sampleSize desc, score desc) so the caller still
      // gets something labelled even when nothing crosses the bar.
      if (
        bestSeen === null ||
        candidate.sampleSize > bestSeen.sampleSize ||
        (candidate.sampleSize === bestSeen.sampleSize && candidate.score > bestSeen.score)
      ) {
        bestSeen = candidate;
      }
    }
    // Relax the next axis. If it's already null, keep iterating to the next.
    const nextAxis = WIDEN_ORDER[attempt];
    if (nextAxis && currentProfile[nextAxis] != null) {
      currentProfile = { ...currentProfile, [nextAxis]: null };
      relaxed.push(nextAxis);
    }
  }
  return bestSeen;
}

function pickBest(
  workspace: CohortAxes,
  cohorts: CohortRow[],
): { cohort: CohortRow; axesMatched: (keyof CohortAxes)[]; score: number } | null {
  let best: { cohort: CohortRow; axesMatched: (keyof CohortAxes)[]; score: number } | null = null;
  for (const cohort of cohorts) {
    const { score, axesMatched } = scoreCohort(workspace, cohort.axes);
    if (score <= 0) {
      // No matched axes — skip. Broad-only cohorts (all NULL axes) score 0
      // and are only used as a last resort via cohort_id IS NULL reference rows.
      continue;
    }
    if (best === null || score > best.score) {
      best = { cohort, axesMatched, score };
    }
  }
  return best;
}
