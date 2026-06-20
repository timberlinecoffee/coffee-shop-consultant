"use client";

// TIM-2472: Benchmark status chip — grid and inline variants.
// Colors exclusively from --bench-* tokens (no raw hex in JSX).

import type { BenchmarkStatus, BenchmarkSourceType, BenchmarkChipVariant } from "./types";

const STATUS_STYLES: Record<BenchmarkStatus, { bg: string; border: string; text: string; dot: string }> = {
  green: {
    bg: "bg-[var(--bench-green-bg)]",
    border: "border-[var(--bench-green-border)]",
    text: "text-[var(--bench-green-text)]",
    dot: "bg-[var(--bench-green-text)]",
  },
  blue: {
    bg: "bg-[var(--bench-blue-bg)]",
    border: "border-[var(--bench-blue-border)]",
    text: "text-[var(--bench-blue-text)]",
    dot: "bg-[var(--bench-blue-text)]",
  },
  yellow: {
    bg: "bg-[var(--bench-yellow-bg)]",
    border: "border-[var(--bench-yellow-border)]",
    text: "text-[var(--bench-yellow-text)]",
    dot: "bg-[var(--bench-yellow-text)]",
  },
  grey: {
    bg: "bg-[var(--bench-grey-bg)]",
    border: "border-[var(--bench-grey-border)]",
    text: "text-[var(--bench-grey-text)]",
    dot: "bg-[var(--bench-grey-text)]",
  },
};

const SOURCE_LABELS: Record<BenchmarkSourceType, string> = {
  cohort: "cohort",
  "best-practice": "best practice",
  both: "cohort + BP",
  "no data": "no data",
};

export const VERDICT_LABELS: Record<BenchmarkStatus, string> = {
  green: "Top quartile",
  blue: "Median band",
  yellow: "Outside guideline",
  grey: "No data yet",
};

interface BenchmarkChipProps {
  metric: string;
  value: string;
  status: BenchmarkStatus;
  sourceType: BenchmarkSourceType;
  variant?: BenchmarkChipVariant;
  selected?: boolean;
  onClick?: () => void;
}

export function BenchmarkChip({
  metric,
  value,
  status,
  sourceType,
  variant = "grid",
  selected = false,
  onClick,
}: BenchmarkChipProps) {
  const s = STATUS_STYLES[status];
  const isClickable = status !== "grey" && onClick != null;
  const isInline = variant === "inline";

  const selectedRing = selected
    ? "outline outline-2 outline-offset-1 outline-[var(--teal)]"
    : "";

  const hoverClass = isClickable
    ? "cursor-pointer hover:brightness-95 transition-[filter]"
    : status === "grey"
    ? "cursor-default"
    : "";

  const tooltipTitle =
    status === "grey" ? "No comparison data available for this metric yet." : undefined;

  if (isInline) {
    return (
      <span
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        title={tooltipTitle}
        onClick={isClickable ? onClick : undefined}
        onKeyDown={
          isClickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${s.bg} ${s.border} ${s.text} ${hoverClass} ${selectedRing}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} aria-hidden="true" />
        {VERDICT_LABELS[status]}
      </span>
    );
  }

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      title={tooltipTitle}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      aria-pressed={selected}
      className={`flex flex-col gap-0.5 px-3 py-2 rounded-lg border ${s.bg} ${s.border} ${hoverClass} ${selectedRing}`}
    >
      <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${s.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} aria-hidden="true" />
        {metric}
      </div>
      <div className={`text-sm font-semibold ${s.text}`}>{value}</div>
      <div className={`text-[10px] ${s.text} opacity-70`}>{SOURCE_LABELS[sourceType]}</div>
    </div>
  );
}
