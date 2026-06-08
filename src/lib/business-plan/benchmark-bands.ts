// TIM-2474 (F1 of TIM-2454): canonical band loader so the P&L critique, the
// Ratios tab, and the cross-suite hiring resolver all read labor / cogs /
// rent / gross-margin thresholds from `benchmarks.json` instead of inlining
// their own literals. Bands are returned in ratio form (0-1) to match
// `describeBandPosition()` in `src/lib/cross-suite/hiring-financials.ts` —
// every consumer that needs percent multiplies by 100 at the render edge.
//
// Relative `./benchmarks.ts` import so node:test can load this without the
// Next.js path-alias resolver (mirrors plan-state.ts).

import {
  loadBenchmarks,
  type BenchmarkDataset,
  type IndustryBenchmark,
} from "./benchmarks.ts";

export interface BenchmarkBand {
  min: number; // ratio form: 0.28 means 28%
  max: number; // ratio form
  source: string;
  label: string; // verbatim value_range, e.g. "28% to 35%"
}

export interface FinancialBenchmarkBands {
  labor: BenchmarkBand | null;
  cogs: BenchmarkBand | null;
  rent: BenchmarkBand | null;
  // Gross margin is the line-level inverse of COGS. Deriving here means a
  // single edit to the COGS benchmark ripples to every gross-margin reader,
  // and the two figures never drift out of accounting-identity (cogs + gross
  // margin ≠ 100% would be a math bug, not a curation choice).
  grossMargin: BenchmarkBand | null;
}

const RANGE_RE = /^\s*(\d+(?:\.\d+)?)\s*%\s*to\s*(\d+(?:\.\d+)?)\s*%\s*$/i;

export function parsePercentRange(
  value_range: string,
): { min: number; max: number } | null {
  if (typeof value_range !== "string") return null;
  const m = value_range.match(RANGE_RE);
  if (!m) return null;
  const a = Number(m[1]) / 100;
  const b = Number(m[2]) / 100;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

function bandFromBenchmark(
  b: IndustryBenchmark | undefined | null,
): BenchmarkBand | null {
  if (!b) return null;
  const parsed = parsePercentRange(b.value_range);
  if (!parsed) return null;
  return {
    min: parsed.min,
    max: parsed.max,
    source: b.source,
    label: b.value_range,
  };
}

function formatRatioPct(ratio: number): string {
  const v = Math.round(ratio * 1000) / 10;
  return Number.isInteger(v) ? `${v.toFixed(0)}%` : `${v.toFixed(1)}%`;
}

export function getFinancialBenchmarkBands(
  ds?: BenchmarkDataset,
): FinancialBenchmarkBands {
  const dataset = ds ?? loadBenchmarks();
  const byKey = new Map(dataset.benchmarks.map((b) => [b.key, b]));
  const labor = bandFromBenchmark(byKey.get("coffee_shop_labor_pct"));
  const cogs = bandFromBenchmark(byKey.get("coffee_shop_blended_cogs_pct"));
  const rent = bandFromBenchmark(byKey.get("coffee_shop_rent_pct"));
  const grossMargin: BenchmarkBand | null = cogs
    ? {
        min: 1 - cogs.max,
        max: 1 - cogs.min,
        source: cogs.source,
        label: `${formatRatioPct(1 - cogs.max)} to ${formatRatioPct(1 - cogs.min)}`,
      }
    : null;
  return { labor, cogs, rent, grossMargin };
}
