"use client";

// TIM-2472: Cohort summary card — axes, sample size, data freshness, source legend, Adjust button.

import { Users, Settings } from "lucide-react";
import type { CohortInfo } from "./types";

interface CohortSummaryCardProps {
  cohort: CohortInfo;
  onAdjust: () => void;
  loading?: boolean;
}

function LegendPill({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${color}`}>
      {label}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4 animate-pulse space-y-3">
      <div className="h-3 w-40 bg-[var(--muted)] rounded" />
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-5 w-20 bg-[var(--muted)] rounded-full" />)}
      </div>
    </div>
  );
}

export function CohortSummaryCard({ cohort, onAdjust, loading }: CohortSummaryCardProps) {
  if (loading) return <SkeletonCard />;

  const axisChips = [
    ...cohort.axes.shopModel.map((v) => ({ label: v, key: `model-${v}` })),
    { label: cohort.axes.locationType, key: "loc" },
    ...cohort.axes.shopSize.map((v) => ({ label: v, key: `size-${v}` })),
  ];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
          <Users size={13} className="text-[var(--teal)]" />
          Compared to {cohort.sampleSize} similar shops
        </div>
        <button
          type="button"
          onClick={onAdjust}
          className="flex items-center gap-1 text-xs font-semibold text-[var(--teal)] hover:underline whitespace-nowrap"
        >
          <Settings size={12} />
          Adjust cohort
        </button>
      </div>

      {/* Axis chips */}
      <div className="flex flex-wrap gap-1.5">
        {axisChips.map((chip) => (
          <span
            key={chip.key}
            className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--muted)] text-[10px] text-[var(--foreground)] font-medium"
          >
            {chip.label}
          </span>
        ))}
      </div>

      {/* Source legend */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] text-[var(--muted-foreground)] mr-1">Source types:</span>
        <LegendPill
          label="Cohort"
          color="bg-[var(--bench-blue-bg)] border-[var(--bench-blue-border)] text-[var(--bench-blue-text)]"
        />
        <LegendPill
          label="Best practice"
          color="bg-[var(--bench-green-bg)] border-[var(--bench-green-border)] text-[var(--bench-green-text)]"
        />
        <LegendPill
          label="No data"
          color="bg-[var(--bench-grey-bg)] border-[var(--bench-grey-border)] text-[var(--bench-grey-text)]"
        />
      </div>

      {/* Freshness */}
      <p className="text-[10px] text-[var(--muted-foreground)]">
        Data as of {cohort.dataFreshnessDate} · {cohort.sourceCatalog}
      </p>
    </div>
  );
}
