"use client";

// TIM-2472: Top-level "How You Compare" tab content.
// Layout (top to bottom): cohort-fallback callout? → CohortSummaryCard → HealthGrid → BenchmarkTrendChart.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { CohortSummaryCard } from "./CohortSummaryCard";
import { HealthGrid } from "./HealthGrid";
import { AdjustCohortModal } from "./AdjustCohortModal";
import { BenchmarkTrendChart } from "./BenchmarkTrendChart";
import type { BenchmarkPageData, CohortAxes, DrilldownData } from "./types";

interface BenchmarkDashboardProps {
  workspaceSlug: string;
  onAskBenchmark: (metricId: string, metricLabel: string) => void;
  onApplySuggestion: (drilldown: DrilldownData) => void;
  /** Surfaced for the sub-nav badge (count of yellow chips). */
  onYellowCountChange?: (count: number) => void;
  /** Caller-supplied drilldown opener — used by inline chips' "see why". */
  openMetricId?: string | null;
}

type LoadState = "idle" | "loading" | "loaded" | "error";

async function fetchBenchmarkMetrics(workspaceSlug: string, axes?: CohortAxes): Promise<BenchmarkPageData> {
  const params = axes
    ? `?shopModel=${axes.shopModel.join(",")}&locationType=${axes.locationType}&shopSize=${axes.shopSize.join(",")}`
    : "";
  const res = await fetch(`/api/benchmarks/${workspaceSlug}/metrics${params}`);
  if (!res.ok) throw new Error("Failed to load benchmark data");
  return res.json() as Promise<BenchmarkPageData>;
}

async function previewSampleSize(workspaceSlug: string, axes: CohortAxes): Promise<number> {
  const params = `?shopModel=${axes.shopModel.join(",")}&locationType=${axes.locationType}&shopSize=${axes.shopSize.join(",")}&previewOnly=1`;
  const res = await fetch(`/api/benchmarks/${workspaceSlug}/metrics${params}`);
  if (!res.ok) return 0;
  const data = await res.json() as { sampleSize?: number };
  return data.sampleSize ?? 0;
}

function CohortFalloutCallout({ sampleSize, onDismiss }: { sampleSize: number; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--bench-blue-border)] bg-[var(--bench-blue-bg)] px-4 py-3">
      <AlertTriangle size={14} className="text-[var(--bench-blue-text)] flex-shrink-0 mt-0.5" />
      <p className="text-xs text-[var(--bench-blue-text)] flex-1">
        Cohort data for your area is too thin (n={sampleSize}). Showing industry best-practice guidelines instead.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="text-[10px] text-[var(--bench-blue-text)] hover:underline whitespace-nowrap"
      >
        Dismiss
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-8 text-center space-y-2">
      <p className="text-sm font-semibold text-[var(--foreground)]">No benchmark data yet</p>
      <p className="text-xs text-[var(--muted-foreground)] max-w-sm mx-auto">
        We don&apos;t have enough comparison data for this workspace yet. Check back as more coffee shops
        connect their numbers.
      </p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-8 text-center space-y-3">
      <p className="text-sm font-semibold text-[var(--foreground)]">Benchmark data didn&apos;t load</p>
      <p className="text-xs text-[var(--muted-foreground)]">Your own numbers are fine — this is just the comparison view.</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--teal)] hover:bg-[var(--teal-tint-100)] transition-colors"
      >
        <RefreshCcw size={12} />
        Try again
      </button>
    </div>
  );
}

export function BenchmarkDashboard({
  workspaceSlug,
  onAskBenchmark,
  onApplySuggestion,
  onYellowCountChange,
  openMetricId,
}: BenchmarkDashboardProps) {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [data, setData] = useState<BenchmarkPageData | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [fallbackDismissed, setFallbackDismissed] = useState(false);

  const load = useCallback(
    async (axes?: CohortAxes) => {
      setLoadState("loading");
      try {
        const result = await fetchBenchmarkMetrics(workspaceSlug, axes);
        setData(result);
        setLoadState("loaded");
      } catch {
        setLoadState("error");
      }
    },
    [workspaceSlug]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const getDrilldown = useCallback(
    (metricId: string): DrilldownData | undefined => {
      return data?.drilldowns[metricId];
    },
    [data]
  );

  const handleApplyAxes = useCallback(
    (axes: CohortAxes) => {
      setFallbackDismissed(false);
      void load(axes);
    },
    [load]
  );

  const handlePreviewSampleSize = useCallback(
    (axes: CohortAxes) => previewSampleSize(workspaceSlug, axes),
    [workspaceSlug]
  );

  // Trend data: use first non-grey metric with trend data
  const trendMetric = data?.pillars
    .flatMap((p) => p.metrics)
    .find((m) => m.status !== "grey" && data.drilldowns[m.id]?.trendData?.length);
  const trendData = trendMetric ? data?.drilldowns[trendMetric.id]?.trendData : undefined;

  const isLoading = loadState === "loading" || loadState === "idle";
  const showFallout =
    !fallbackDismissed &&
    data?.cohort.isFallback &&
    data.cohort.sampleSize < 10;
  const yellowCount = data?.pillars.flatMap((p) => p.metrics).filter((m) => m.status === "yellow").length ?? 0;

  // TIM-2450: surface yellow chip count to the parent workspace so its sub-nav
  // badge ([How You Compare 3 flagged]) reflects the live engine output. Only
  // re-fires when the number actually changes.
  useEffect(() => {
    onYellowCountChange?.(yellowCount);
  }, [yellowCount, onYellowCountChange]);

  const handleApply = useCallback(
    (drilldown: DrilldownData) => {
      onApplySuggestion(drilldown);
    },
    [onApplySuggestion]
  );

  return (
    <div className="space-y-4">
      {/* Cohort fallback banner — never silent substitution */}
      {showFallout && data && (
        <CohortFalloutCallout
          sampleSize={data.cohort.sampleSize}
          onDismiss={() => setFallbackDismissed(true)}
        />
      )}

      {/* Cohort summary */}
      <CohortSummaryCard
        cohort={
          data?.cohort ?? {
            axes: { shopModel: [], locationType: "", shopSize: [] },
            sampleSize: 0,
            dataFreshnessDate: "",
            sourceCatalog: "",
            isFallback: false,
          }
        }
        onAdjust={() => setAdjustOpen(true)}
        loading={isLoading}
      />

      {/* Health grid */}
      {loadState === "error" ? (
        <ErrorState onRetry={() => load()} />
      ) : loadState === "loaded" && (!data || data.pillars.length === 0) ? (
        <EmptyState />
      ) : (
        <HealthGrid
          pillars={data?.pillars ?? []}
          getDrilldown={getDrilldown}
          onAskBenchmark={onAskBenchmark}
          onApplySuggestion={(metricId) => {
            const dd = getDrilldown(metricId);
            if (dd) handleApply(dd);
          }}
          loading={isLoading}
          openMetricId={openMetricId ?? null}
        />
      )}

      {/* Trend chart */}
      {trendData && trendData.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-3">
            {trendMetric?.label} — trend
          </p>
          <BenchmarkTrendChart data={trendData} />
        </div>
      )}

      {/* Adjust-cohort modal */}
      {adjustOpen && data && (
        <AdjustCohortModal
          current={data.cohort.axes}
          onApply={handleApplyAxes}
          onClose={() => setAdjustOpen(false)}
          onPreviewSampleSize={handlePreviewSampleSize}
        />
      )}

      {/* Expose yellow count for parent badge (via data attribute — parent reads it) */}
      <div data-benchmark-yellow-count={yellowCount} aria-hidden="true" className="hidden" />
    </div>
  );
}
