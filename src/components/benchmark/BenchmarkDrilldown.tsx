"use client";

// TIM-2472: Inline expandable drill-down panel.
// Opens below the pillar row — NOT a modal, NOT a sidebar.
// Structure: header / percentile viz / BP band / insight / citation / actions.

import { X, ExternalLink, Sparkles, ArrowUpRight } from "lucide-react";
import { PercentileBar } from "./PercentileBar";
import { BestPracticeBand } from "./BestPracticeBand";
import { BenchmarkTrendChart } from "./BenchmarkTrendChart";
import { ResponsiveChart } from "@/components/charts/ResponsiveChart";
import type { DrilldownData } from "./types";

interface BenchmarkDrilldownProps {
  data: DrilldownData;
  onClose: () => void;
  onAskBenchmark: (metricId: string, metricLabel: string) => void;
  onApplySuggestion: (metricId: string) => void;
}

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const STATUS_CHIP_STYLES = {
  green: "bg-[var(--bench-green-bg)] text-[var(--bench-green-text)] border-[var(--bench-green-border)]",
  blue: "bg-[var(--bench-blue-bg)] text-[var(--bench-blue-text)] border-[var(--bench-blue-border)]",
  yellow: "bg-[var(--bench-yellow-bg)] text-[var(--bench-yellow-text)] border-[var(--bench-yellow-border)]",
  grey: "bg-[var(--bench-grey-bg)] text-[var(--bench-grey-text)] border-[var(--bench-grey-border)]",
};

const STATUS_LABELS = {
  green: "Top quartile",
  blue: "Median band",
  yellow: "Outside guideline",
  grey: "No data",
};

const SOURCE_TYPE_LABELS = {
  cohort: "Cohort",
  "best-practice": "Best practice",
  both: "Cohort + Best practice",
  "no data": "No data",
};

export function BenchmarkDrilldown({ data, onClose, onAskBenchmark, onApplySuggestion }: BenchmarkDrilldownProps) {
  const showPercentile = data.percentilePosition != null && (data.sourceType === "cohort" || data.sourceType === "both");
  const showBpBand =
    data.bpLow != null &&
    data.bpHigh != null &&
    data.userValueNumeric != null &&
    (data.sourceType === "best-practice" || data.sourceType === "both");

  return (
    <div
      className="border border-[var(--teal)] bg-white rounded-xl p-4 space-y-4 shadow-sm"
      role="region"
      aria-label={`Drill-down: ${data.metricLabel}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{data.metricLabel}</h3>
          <span className="text-sm text-[var(--muted-foreground)]">{data.userValue}</span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_CHIP_STYLES[data.status]}`}
          >
            {STATUS_LABELS[data.status]}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drill-down"
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex-shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* Percentile visualization */}
      {showPercentile && data.percentilePosition != null && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-2">
            Cohort percentile
          </p>
          <PercentileBar
            position={data.percentilePosition}
            label={data.percentileLabel}
          />
        </div>
      )}

      {/* Best-practice band visualization */}
      {showBpBand && data.bpLow != null && data.bpHigh != null && data.userValueNumeric != null && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-2">
            Best-practice target
          </p>
          <BestPracticeBand
            bpLow={data.bpLow}
            bpHigh={data.bpHigh}
            userValue={data.userValueNumeric}
            unit={data.bpUnit}
          />
        </div>
      )}

      {/* Trend chart — M4: wrapped in ResponsiveChart for expand + compact-axis support */}
      {data.trendData && data.trendData.length > 0 && (
        <ResponsiveChart
          title="Trend"
          minHeightNarrow={140}
          minHeightMedium={160}
          defaultHeight={180}
        >
          {(h) => (
            <BenchmarkTrendChart data={data.trendData!} unit={data.bpUnit} height={h} />
          )}
        </ResponsiveChart>
      )}

      {/* Insight */}
      {data.insightText && (
        <div className="bg-[var(--muted)] rounded-lg px-3 py-2.5">
          <p className="text-xs text-[var(--foreground)] leading-relaxed">{data.insightText}</p>
        </div>
      )}

      {/* Source citation */}
      {data.citationSource && (
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_CHIP_STYLES[data.status]}`}
          >
            {SOURCE_TYPE_LABELS[data.sourceType]}
          </span>
          {data.citationUrl ? (
            <a
              href={data.citationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-[var(--teal)] hover:underline flex items-center gap-0.5"
            >
              {data.citationSource}
              <ExternalLink size={10} />
            </a>
          ) : (
            <span className="text-[10px] text-[var(--muted-foreground)]">{data.citationSource}</span>
          )}
          {data.citationDate && (
            <span className="text-[10px] text-[var(--muted-foreground)]">· {data.citationDate}</span>
          )}
          {data.citationConfidence && (
            <span className="text-[10px] text-[var(--muted-foreground)]">
              · {CONFIDENCE_LABELS[data.citationConfidence] ?? data.citationConfidence}
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={() => onAskBenchmark(data.metricId, data.metricLabel)}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--teal)] text-[var(--teal)] hover:bg-[var(--teal-tint-100)] transition-colors"
        >
          <Sparkles size={12} />
          Ask Benchmark
        </button>
        <button
          type="button"
          onClick={() => onApplySuggestion(data.metricId)}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--teal)] text-white hover:bg-[var(--teal-dark)] transition-colors"
        >
          <ArrowUpRight size={12} />
          Apply suggestion
        </button>
      </div>
    </div>
  );
}
