"use client";

// TIM-2525: Persistent Financial Health panel — free, not Copilot-gated.
// Computation lives in src/lib/financials/health-metrics.ts (shared with the
// dashboard server component). This file owns only the React presentation.

import { useMemo } from "react";
import { type MonthlySlice, type FinancialInputs } from "@/lib/financial-projection";
import {
  computeFinancialHealthMetrics,
  worstTier,
  type HealthMetric,
  type HealthTier,
} from "@/lib/financials/health-metrics";

// ── Design tokens for each tier ───────────────────────────────────────────────

const TIER_STYLES: Record<
  HealthTier,
  { wrap: string; dot: string; chip: string; chipLabel: string }
> = {
  green: {
    wrap: "border-green-200 bg-green-50",
    dot: "bg-green-500",
    chip: "bg-green-100 text-green-800",
    chipLabel: "On track",
  },
  yellow: {
    wrap: "border-amber-200 bg-amber-50",
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-900",
    chipLabel: "Watch",
  },
  red: {
    wrap: "border-red-200 bg-red-50",
    dot: "bg-red-500",
    chip: "bg-red-100 text-red-800",
    chipLabel: "Needs attention",
  },
};

// ── MetricRow ─────────────────────────────────────────────────────────────────

function MetricRow({ metric }: { metric: HealthMetric }) {
  const s = TIER_STYLES[metric.tier];
  return (
    <div className={`rounded-xl border px-5 py-4 ${s.wrap}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--foreground)] leading-tight">
            {metric.label}
          </p>
          <p className="text-[11px] text-[var(--gray-mid)] mt-0.5 leading-snug">
            {metric.thresholds}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <p className="text-xl font-bold text-[var(--foreground)] tabular-nums">
            {metric.formattedValue}
          </p>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${s.chip}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.chipLabel}
          </span>
        </div>
      </div>
      <p className="text-xs text-[var(--gray-1400)] mt-2.5 leading-relaxed">
        {metric.whatItMeans}
      </p>
    </div>
  );
}

// ── FinancialHealthPanel ──────────────────────────────────────────────────────

interface Props {
  slices: MonthlySlice[];
  financialInputs: FinancialInputs;
}

export function FinancialHealthPanel({ slices, financialInputs }: Props) {
  const metrics = useMemo(
    () => computeFinancialHealthMetrics(slices, financialInputs),
    [slices, financialInputs]
  );

  if (metrics.length === 0) return null;

  const worst = worstTier(metrics);
  const s = TIER_STYLES[worst];

  const redCount = metrics.filter((m) => m.tier === "red").length;
  const yellowCount = metrics.filter((m) => m.tier === "yellow").length;

  const summaryTitle =
    worst === "green"
      ? "All financial health indicators look good."
      : worst === "yellow"
      ? `${yellowCount} indicator${yellowCount > 1 ? "s" : ""} to watch`
      : `${redCount} indicator${redCount > 1 ? "s" : ""} need${redCount > 1 ? "" : "s"} attention`;

  const summaryBody =
    worst === "green"
      ? "Your plan is within healthy benchmarks for a coffee shop."
      : worst === "yellow"
      ? "These numbers are close to the edge — worth reviewing before you open."
      : "These are outside healthy benchmarks for a coffee shop. Address them now.";

  return (
    <div className="mb-5 space-y-3">
      {/* Summary banner */}
      <div className={`rounded-xl border px-5 py-4 ${s.wrap}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${s.dot}`} />
          <p className="text-sm font-bold text-[var(--foreground)] leading-tight">
            Financial Health — {summaryTitle}
          </p>
        </div>
        <p className="text-xs text-[var(--gray-1300)] mt-1 leading-relaxed">
          {summaryBody} These indicators update live as you edit your plan. No
          Copilot credits required.
        </p>
      </div>

      {/* Metric rows */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {metrics.map((m) => (
          <MetricRow key={m.key} metric={m} />
        ))}
      </div>
    </div>
  );
}
