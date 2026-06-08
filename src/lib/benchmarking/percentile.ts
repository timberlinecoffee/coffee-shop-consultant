// TIM-2449: percentile engine + chip color.
//
// Given a user value and the cohort's reference percentiles, place the user on
// the curve. Plan §7b chip rule (direction-of-better aware):
//   green  = top quartile (best 25%)
//   blue   = median band (25th-75th)
//   yellow = bottom quartile (worst 25%)
//   grey   = no reference data
//
// "Top" depends on direction_of_better:
//   - higher: top quartile = above p75
//   - lower : top quartile = below p25
//   - range : middle (p25-p75) is best, outside is yellow
//
// Reference rows can be percentile-typed (p25/p50/p75 set) or range-typed
// (low/high set). For range-only rows we synthesise a coarse percentile by
// treating low=p25 and high=p75 — good enough for chip color, and the caller
// surfaces the actual band to the user so they're never misled by the synthesis.

import type { ChipColor, ReferenceValueRow } from "./types";

export interface PercentileInputs {
  userValue: number | null;
  referenceRows: ReferenceValueRow[]; // pre-filtered to the chosen cohort
  direction: "higher" | "lower" | "range";
}

export interface PercentileResult {
  percentile: number | null;
  chipColor: ChipColor;
  p25: number | null;
  p50: number | null;
  p75: number | null;
}

// Pick the highest-confidence row, falling back to the most recent extraction.
// Multiple rows on the same metric+cohort are common — different sources land
// overlapping ranges. The matcher uses the freshest high-confidence row.
function pickRow(rows: ReferenceValueRow[]): ReferenceValueRow | null {
  if (rows.length === 0) return null;
  const conf = { high: 3, medium: 2, low: 1 } as const;
  const sorted = [...rows].sort((a, b) => {
    const ca = conf[a.extraction_confidence] ?? 0;
    const cb = conf[b.extraction_confidence] ?? 0;
    if (ca !== cb) return cb - ca;
    return (b.extraction_date || "").localeCompare(a.extraction_date || "");
  });
  return sorted[0];
}

// Resolve p25/p50/p75 from a reference row, synthesising from low/high when the
// row is range-only.
export function resolveBand(row: ReferenceValueRow): {
  p25: number | null;
  p50: number | null;
  p75: number | null;
} {
  const p25 = row.p25 ?? row.low ?? null;
  const p75 = row.p75 ?? row.high ?? null;
  let p50 = row.p50 ?? null;
  if (p50 === null && p25 !== null && p75 !== null) {
    p50 = (p25 + p75) / 2;
  }
  return { p25, p50, p75 };
}

// Interpolate a percentile from p25/p50/p75. Linear within each quartile,
// clamped at 0 and 100. Returns null when the band is degenerate (p25 ≥ p75).
export function interpolatePercentile(
  value: number,
  band: { p25: number | null; p50: number | null; p75: number | null },
): number | null {
  const { p25, p50, p75 } = band;
  if (p25 === null || p75 === null || p25 >= p75) return null;
  const mid = p50 ?? (p25 + p75) / 2;
  if (value <= p25) {
    // Below p25 — extrapolate linearly toward 0 using the same slope as p25-p50.
    if (mid <= p25) return 0;
    const ratio = (value - p25) / (mid - p25);
    const pct = 25 + ratio * 25; // ratio is negative below p25
    return Math.max(0, Math.min(100, pct));
  }
  if (value >= p75) {
    if (mid >= p75) return 100;
    const ratio = (value - p75) / (p75 - mid);
    const pct = 75 + ratio * 25;
    return Math.max(0, Math.min(100, pct));
  }
  if (value <= mid) {
    const ratio = (value - p25) / (mid - p25);
    return 25 + ratio * 25;
  }
  const ratio = (value - mid) / (p75 - mid);
  return 50 + ratio * 25;
}

// Translate a numerical percentile into a chip color, accounting for
// direction-of-better.
export function chipColorFromPercentile(
  percentile: number | null,
  direction: "higher" | "lower" | "range",
  band: { p25: number | null; p50: number | null; p75: number | null },
  value: number | null,
): ChipColor {
  if (percentile === null) return "grey";
  switch (direction) {
    case "higher":
      if (percentile >= 75) return "green";
      if (percentile <= 25) return "yellow";
      return "blue";
    case "lower":
      // Lower-is-better — the 25th percentile is the BEST 25%.
      if (percentile <= 25) return "green";
      if (percentile >= 75) return "yellow";
      return "blue";
    case "range": {
      // Range metrics: inside the p25-p75 band is best; outside is yellow.
      // (Some "range" metrics like rent_per_sqft don't have a "better" pole —
      // green means "in the typical band", yellow means "outside it".)
      if (band.p25 === null || band.p75 === null || value === null) return "blue";
      if (value >= band.p25 && value <= band.p75) return "green";
      return "yellow";
    }
  }
}

export function computePercentile(input: PercentileInputs): PercentileResult {
  const row = pickRow(input.referenceRows);
  if (!row || input.userValue === null) {
    return { percentile: null, chipColor: "grey", p25: null, p50: null, p75: null };
  }
  const band = resolveBand(row);
  const percentile = interpolatePercentile(input.userValue, band);
  const chipColor = chipColorFromPercentile(percentile, input.direction, band, input.userValue);
  return { ...band, percentile, chipColor };
}
