"use client";

// TIM-2775: Desktop data table for Benchmarks workspace v2.
// One row per benchmark metric, grouped under pillar section headers.

import { Fragment } from "react";
import { BenchmarkChip } from "./BenchmarkChip";
import { formatRange } from "./benchmark-utils";
import type { BenchmarkPillar, DrilldownData } from "./types";

interface Props {
  pillars: BenchmarkPillar[];
  drilldowns: Record<string, DrilldownData>;
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
                      <BenchmarkChip
                        variant="inline"
                        metric={metric.label}
                        value={metric.value}
                        status={metric.status}
                        sourceType={metric.sourceType}
                      />
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
