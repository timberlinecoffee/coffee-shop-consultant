"use client";

// TIM-2472: Pillar rows + chip grid + single-open inline drill-down.
// State: one drill-down open at a time, tracked by {pillarId, metricId}.

import { useState } from "react";
import { BenchmarkChip } from "./BenchmarkChip";
import { BenchmarkDrilldown } from "./BenchmarkDrilldown";
import type { BenchmarkPillar, DrilldownData } from "./types";

interface OpenState {
  pillarId: string;
  metricId: string;
}

interface HealthGridProps {
  pillars: BenchmarkPillar[];
  getDrilldown: (metricId: string) => DrilldownData | undefined;
  onAskBenchmark: (metricId: string, metricLabel: string) => void;
  onApplySuggestion: (metricId: string) => void;
  loading?: boolean;
}

function PillarSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-[var(--border)] p-3">
          <div className="h-3 w-24 bg-[var(--muted)] rounded mb-3" />
          <div className="flex gap-2">
            {[1, 2, 3].map((j) => (
              <div key={j} className="h-14 w-28 bg-[var(--muted)] rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function HealthGrid({ pillars, getDrilldown, onAskBenchmark, onApplySuggestion, loading }: HealthGridProps) {
  const [open, setOpen] = useState<OpenState | null>(null);

  if (loading) return <PillarSkeleton />;

  function handleChipClick(pillarId: string, metricId: string) {
    setOpen((prev) =>
      prev?.pillarId === pillarId && prev?.metricId === metricId ? null : { pillarId, metricId }
    );
  }

  function handleClose() {
    setOpen(null);
  }

  return (
    <div className="space-y-2">
      {pillars.map((pillar) => {
        const hasYellow = pillar.metrics.some((m) => m.status === "yellow");
        const openMetric = open?.pillarId === pillar.id ? open.metricId : null;
        const drilldownData = openMetric ? getDrilldown(openMetric) : undefined;

        return (
          <div
            key={pillar.id}
            className={`rounded-xl border bg-white p-3 transition-colors ${
              hasYellow ? "border-[var(--bench-yellow-border)]" : "border-[var(--border)]"
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-2">
              {pillar.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {pillar.metrics.map((metric) => (
                <BenchmarkChip
                  key={metric.id}
                  metric={metric.label}
                  value={metric.value}
                  status={metric.status}
                  sourceType={metric.sourceType}
                  variant="grid"
                  selected={openMetric === metric.id}
                  onClick={
                    metric.status !== "grey"
                      ? () => handleChipClick(pillar.id, metric.id)
                      : undefined
                  }
                />
              ))}
            </div>

            {/* Inline drill-down panel — opens below the row, not in a modal */}
            {openMetric && drilldownData && (
              <div className="mt-3">
                <BenchmarkDrilldown
                  data={drilldownData}
                  onClose={handleClose}
                  onAskBenchmark={onAskBenchmark}
                  onApplySuggestion={onApplySuggestion}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
