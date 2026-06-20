"use client";

// TIM-2775: Mobile card-per-row view for Benchmarks workspace v2.
// Pattern: EquipmentMobileV2 — grouped by pillar, tap card → detail sheet.

import { useState } from "react";
import { ChevronRight, X } from "lucide-react";
import type { BenchmarkPillar, BenchmarkMetric, DrilldownData, BenchmarkStatus } from "./types";

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

type MetricWithPillar = BenchmarkMetric & { pillarLabel: string };

export function BenchmarkTableMobile({ pillars, drilldowns }: Props) {
  const [openMetricId, setOpenMetricId] = useState<string | null>(null);

  const allMetrics: MetricWithPillar[] = pillars.flatMap((p) =>
    p.metrics.map((m) => ({ ...m, pillarLabel: p.label }))
  );

  const openMetric = openMetricId
    ? (allMetrics.find((m) => m.id === openMetricId) ?? null)
    : null;
  const openDrilldown = openMetricId ? (drilldowns[openMetricId] ?? null) : null;

  const totalMetrics = pillars.reduce((sum, p) => sum + p.metrics.length, 0);
  const yellowCount = pillars.reduce(
    (sum, p) => sum + p.metrics.filter((m) => m.status === "yellow").length,
    0
  );

  return (
    <div className="space-y-5">
      {/* Summary bar — mirrors EquipmentMobileV2 total bar */}
      <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-100)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--teal)]">
          Benchmark Summary
        </p>
        <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">
          {totalMetrics} metric{totalMetrics === 1 ? "" : "s"}
        </p>
        {yellowCount > 0 && (
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {yellowCount} outside guideline
          </p>
        )}
      </div>

      {/* Cards grouped by pillar */}
      {pillars.map((pillar) => (
        <section key={pillar.id} aria-labelledby={`pillar-hd-${pillar.id}`}>
          <h2
            id={`pillar-hd-${pillar.id}`}
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
          >
            {pillar.label}
          </h2>
          <ul className="space-y-2">
            {pillar.metrics.map((metric) => (
              <li key={metric.id}>
                <button
                  type="button"
                  onClick={() => setOpenMetricId(metric.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left transition-colors hover:border-[var(--teal-tint)] hover:bg-[var(--teal-tint-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] focus-visible:ring-offset-1"
                  aria-label={`Open details for ${metric.label}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                        {metric.label}
                      </p>
                      <p className="shrink-0 tabular-nums text-sm font-semibold text-[var(--foreground)]">
                        {metric.value}
                      </p>
                    </div>
                    <div className="mt-1">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_CHIP[metric.status]}`}
                      >
                        {STATUS_LABELS[metric.status]}
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    size={16}
                    className="shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {pillars.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">No benchmark data yet.</p>
        </div>
      )}

      {/* Bottom detail sheet — same slide-up pattern as EquipmentMobileV2 */}
      {openMetric && openDrilldown && (
        <MetricDetailSheet
          metric={openMetric}
          drilldown={openDrilldown}
          onClose={() => setOpenMetricId(null)}
        />
      )}
    </div>
  );
}

function MetricDetailSheet({
  metric,
  drilldown,
  onClose,
}: {
  metric: MetricWithPillar;
  drilldown: DrilldownData;
  onClose: () => void;
}) {
  const range = formatRange(drilldown);

  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Pillar",        value: metric.pillarLabel },
    { label: "Your Value",    value: metric.value },
    { label: "Status",        value: STATUS_LABELS[metric.status] },
    { label: "Target Range",  value: range },
    ...(drilldown.percentileLabel
      ? [{ label: "Percentile", value: drilldown.percentileLabel }]
      : []),
    ...(drilldown.insightText
      ? [{ label: "Insight", value: drilldown.insightText }]
      : []),
    ...(drilldown.citationSource
      ? [{ label: "Source", value: drilldown.citationSource }]
      : []),
    ...(drilldown.citationDate
      ? [{ label: "Data Date", value: drilldown.citationDate }]
      : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="metric-detail-title"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p
              id="metric-detail-title"
              className="truncate text-base font-semibold text-[var(--foreground)]"
            >
              {metric.label}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              {metric.pillarLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Detail rows */}
        <dl className="divide-y divide-[var(--border)] px-5">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-start justify-between gap-3 py-3"
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)] shrink-0">
                {row.label}
              </dt>
              <dd className="max-w-[65%] text-right text-sm text-[var(--foreground)]">
                {row.value && row.value.trim() ? (
                  row.value
                ) : (
                  <span className="text-[var(--muted-foreground)]">—</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <div className="h-4" />
      </div>
    </div>
  );
}
