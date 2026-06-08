// TIM-2449: best-practice recommender.
//
// Plan §3b / §6 — best-practice rows are always-on. The most-specific row
// whose applicable_cohort_filter matches the workspace wins; a null filter
// applies to everything (the fallback row).
//
// Inside / near / outside the guideline band drives chip color independent of
// the cohort verdict — both can fire on the same metric and the unified verdict
// surfaces them side-by-side.

import type {
  BestPracticeRow,
  BestPracticeVerdict,
  ChipColor,
  CohortAxes,
  WorkspaceProfile,
} from "./types";

const FILTER_AXES: (keyof CohortAxes)[] = [
  "model",
  "sqft_bucket",
  "geo_tier",
  "age_bucket",
  "auv_tier",
  "concept",
];

// A row's filter applies if every non-null filter axis matches the workspace
// profile. Null filter axes are wildcards.
export function rowApplies(row: BestPracticeRow, workspace: WorkspaceProfile): boolean {
  const f = row.applicable_cohort_filter;
  if (f === null) return true;
  for (const axis of FILTER_AXES) {
    const fv = f[axis] ?? null;
    if (fv === null) continue;
    const uv = workspace.axes[axis] ?? null;
    if (uv !== fv) return false;
  }
  return true;
}

// Score a row's specificity — more non-null filter axes = more specific = prefer.
// Tie-break on freshest dataset_version, then alphabetical source_name for
// determinism.
function specificity(row: BestPracticeRow): number {
  if (row.applicable_cohort_filter === null) return 0;
  let n = 0;
  for (const axis of FILTER_AXES) {
    if (row.applicable_cohort_filter[axis] != null) n += 1;
  }
  return n;
}

export function pickBestPractice(
  rows: BestPracticeRow[],
  workspace: WorkspaceProfile,
): BestPracticeRow | null {
  const applicable = rows.filter((r) => rowApplies(r, workspace));
  if (applicable.length === 0) return null;
  const sorted = [...applicable].sort((a, b) => {
    const sa = specificity(a);
    const sb = specificity(b);
    if (sa !== sb) return sb - sa;
    if (a.dataset_version !== b.dataset_version) {
      return b.dataset_version.localeCompare(a.dataset_version);
    }
    return a.source_name.localeCompare(b.source_name);
  });
  return sorted[0];
}

// "Inside" the band: low <= value <= high (when both present), or value within
// 10% of the target (when only a target is given). "Near": within 10% of the
// nearest bound. "Outside": further than that. "Unknown": value or band missing.
export function classifyAgainstBestPractice(
  value: number | null,
  row: BestPracticeRow,
): { position: "inside" | "near" | "outside" | "unknown"; nearnessPct: number | null } {
  if (value === null) return { position: "unknown", nearnessPct: null };
  const lo = row.guideline_low ?? null;
  const hi = row.guideline_high ?? null;
  const tgt = row.guideline_target ?? null;
  if (lo !== null && hi !== null) {
    if (value >= lo && value <= hi) return { position: "inside", nearnessPct: 0 };
    const dist = value < lo ? lo - value : value - hi;
    const denom = Math.max(Math.abs(lo), Math.abs(hi));
    const nearnessPct = denom > 0 ? (dist / denom) * 100 : 0;
    return { position: nearnessPct <= 10 ? "near" : "outside", nearnessPct };
  }
  if (tgt !== null) {
    const dist = Math.abs(value - tgt);
    const denom = Math.abs(tgt);
    const nearnessPct = denom > 0 ? (dist / denom) * 100 : 0;
    if (nearnessPct <= 5) return { position: "inside", nearnessPct };
    if (nearnessPct <= 10) return { position: "near", nearnessPct };
    return { position: "outside", nearnessPct };
  }
  return { position: "unknown", nearnessPct: null };
}

export function chipColorFromBestPractice(
  position: "inside" | "near" | "outside" | "unknown",
): ChipColor {
  switch (position) {
    case "inside":
      return "green";
    case "near":
      return "blue";
    case "outside":
      return "yellow";
    case "unknown":
      return "grey";
  }
}

export function computeBestPracticeVerdict(
  value: number | null,
  row: BestPracticeRow | null,
): BestPracticeVerdict | null {
  if (!row) return null;
  const { position } = classifyAgainstBestPractice(value, row);
  return { position, chipColor: chipColorFromBestPractice(position) };
}
