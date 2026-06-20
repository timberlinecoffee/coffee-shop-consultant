"use client";

// TIM-2775: Desktop data table for Benchmarks workspace v2.
// One row per benchmark metric, grouped under pillar section headers.
// Styling follows BenchmarkDrilldown status chip tokens.

import { Fragment } from "react";
import type { BenchmarkPillar, DrilldownData, BenchmarkStatus } from "./types";

interface Props {
  pillars: BenchmarkPillar[];
  drilldowns: Record<string, DrilldownData>;
}

const STATUS_CHIP: Record<BenchmarkStatus, string> = {
  green:  "bg-[var(--bench-green-bg)]  text-[var(--bench-green-text)]  border-[var(--bench-green-border)]",
  blue:   "bg-[var(--bench-blue-bg)]   text-[var(--bench-blue-text)]   border-[var(--bench-blue-border)]",
  yellow: "bg-[var(--bench-yellow-bg)] text-[var(--bench-yellow-text)] border-[var(--bench-yellow-border)]",
  grey:   "bg-[var(--bench-grey-bg)]   text-[var(--bench-grey-text)]   border-[var(--bench-grey-border)]",
};

const STATUS_LABELS: Record<BenchmarkStatus, string> = {
  green:  "Top Quartile",
  blue:   "Median Band",
  yellow: "Outside Guideline",
  grey:   "No Data",
};

function formatRange(d: DrilldownData): string {
  if (d.bpLow == null || d.bpHigh == null) return "—";
  const unit = d.bpUnit ?? "";
  if (unit === "%") return `${d.bpLow}%–${d.bpHigh}%`;
  if (unit.startsWith("$")) return `${unit}${d.bpLow}–${unit}${d.bpHigh}`;
  return `${d.bpLow}–${d.bpHigh}${unit ? ` ${unit}` : ""}`;
}

export function BenchmarkTableDesktop({ pillars, drilldowns }: Props) {
  return (
    <div className="rounded-xl border border-[var(--border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--background)]">
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] w-[40%]">
              Metric
            </th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] w-[15%]">
              Your Value
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] w-[25%]">
              Status
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] w-[20%]">
              Target Range
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {pillars.map((pillar) => (
            <Fragment key={pillar.id}>
              <tr className="bg-[var(--muted)]">
                <td
                  colSpan={4}
                  className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
                >
                  {pillar.label}
                </td>
              </tr>
              {pillar.metrics.map((metric) => {
                const drilldown = drilldowns[metric.id];
                return (
                  <tr key={metric.id} className="bg-white">
                    <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                      {metric.label}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--foreground)]">
                      {metric.value}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_CHIP[metric.status]}`}
                      >
                        {STATUS_LABELS[metric.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-xs text-[var(--muted-foreground)]">
                      {drilldown ? formatRange(drilldown) : "—"}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
