"use client";

// TIM-1121: Beginner-friendly rewrite. Each ratio shows
//   name → plain definition → current value → benchmark (with source) → status indicator.
// Core ratios always visible; secondary ones behind "Show advanced".

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { type MonthlySlice, sumSlices } from "@/lib/financial-projection";

interface Props {
  slices: MonthlySlice[];
}

type Status = "good" | "caution" | "warning";

interface Ratio {
  key: string;
  label: string;
  plainEnglish: string;
  value: number | null;
  unit: "pct";
  benchmarkLabel: string;
  benchmarkSource: string;
  tier: "core" | "advanced";
  status: Status;
  takeaway: string;
}

// ── Status helpers ────────────────────────────────────────────────────────────

function statusForRange(
  value: number,
  healthy: [number, number],
  cautionPct: number,
  direction: "higherIsBetter" | "lowerIsBetter",
): Status {
  const [min, max] = healthy;
  if (value >= min && value <= max) return "good";
  if (direction === "higherIsBetter") {
    if (value > max) return "good";
    if (value >= min - cautionPct) return "caution";
    return "warning";
  }
  // lowerIsBetter
  if (value < min) return "good";
  if (value <= max + cautionPct) return "caution";
  return "warning";
}

// ── Ratio definitions (single source of truth for benchmarks) ─────────────────

function computeRatios(slices: MonthlySlice[]): Ratio[] {
  const y1 = slices.filter((s) => s.year === 1);
  if (y1.length === 0) return [];

  const totals = sumSlices(y1);
  const nr = totals.net_revenue_cents ?? 0;
  const gp = totals.gross_profit_cents ?? 0;
  const oi = totals.operating_income_cents ?? 0;
  // TIM-1206: labor_cents is overhead labor; COGS-labor is folded into total_cogs.
  const laborOverhead = totals.labor_cents ?? 0;
  const laborCogs = totals.labor_cogs_cents ?? 0;
  const totalLabor = laborOverhead + laborCogs;
  const cogs = totals.total_cogs_cents ?? 0;
  const rent = totals.rent_cents ?? 0;
  const pp = totals.payment_processing_cents ?? 0;
  const spoilage = totals.spoilage_cents ?? 0;
  const ni = totals.net_income_cents ?? 0;

  if (nr <= 0) return [];

  const grossMargin = (gp / nr) * 100;
  const opMargin = (oi / nr) * 100;
  const laborPct = (totalLabor / nr) * 100;
  // cogs already includes COGS-labor; add only overhead labor for prime cost.
  const primeCost = ((cogs + laborOverhead) / nr) * 100;
  const occupancy = (rent / nr) * 100;
  const processingPct = (pp / nr) * 100;
  const spoilagePct = cogs > 0 ? (spoilage / cogs) * 100 : 0;
  const netMargin = (ni / nr) * 100;

  const ratios: Ratio[] = [
    {
      key: "prime_cost",
      label: "Prime Cost",
      plainEnglish:
        "Cost of goods + labor combined. The single best predictor of whether a shop survives.",
      value: primeCost,
      unit: "pct",
      benchmarkLabel: "55–65% (≤65% target)",
      benchmarkSource: "National Restaurant Association industry data",
      tier: "core",
      status: statusForRange(primeCost, [55, 65], 5, "lowerIsBetter"),
      takeaway:
        primeCost <= 65
          ? "Within the healthy range. This is the number that separates shops that make it from shops that don't."
          : primeCost <= 70
            ? "Slightly above 65%. Tighten labor schedule or revisit pricing in the next quarter."
            : "Above 70%. The biggest lever you have. Raising prices or trimming labor hours is usually the fastest fix.",
    },
    {
      key: "gross_margin",
      label: "Gross Margin",
      plainEnglish:
        "Of every dollar you take in, how much is left after paying for ingredients.",
      value: grossMargin,
      unit: "pct",
      benchmarkLabel: "60–70%",
      benchmarkSource: "Specialty Coffee Association industry surveys",
      tier: "core",
      status: statusForRange(grossMargin, [60, 70], 5, "higherIsBetter"),
      takeaway:
        grossMargin >= 60 && grossMargin <= 70
          ? "In the healthy zone for a coffee shop."
          : grossMargin < 60
            ? "Below the 60–70% target. Check your COGS percentages — pour sizes, drink prices, or supplier costs may be off."
            : "Above 70% is unusually strong. Double-check your COGS inputs are realistic.",
    },
    {
      key: "labor_pct",
      label: "Labor",
      plainEnglish:
        "Wages, payroll taxes, and benefits as a share of every dollar earned.",
      value: laborPct,
      unit: "pct",
      benchmarkLabel: "28–35%",
      benchmarkSource: "Specialty Coffee Association benchmarks",
      tier: "core",
      status: statusForRange(laborPct, [28, 35], 5, "lowerIsBetter"),
      takeaway:
        laborPct >= 28 && laborPct <= 35
          ? "In the normal range. Most shops land here."
          : laborPct > 35
            ? "Above 35%. Either you are over-staffed or under-priced. Both are worth looking at."
            : "Under 28%. Possible if you're running lean or owner-operated. Make sure the schedule is sustainable long-term.",
    },
    {
      key: "occupancy",
      label: "Rent (Occupancy)",
      plainEnglish:
        "Rent plus other occupancy costs as a share of every dollar earned.",
      value: occupancy,
      unit: "pct",
      benchmarkLabel: "≤10% ideal, 10–15% acceptable",
      benchmarkSource: "Specialty Coffee Association industry data",
      tier: "core",
      status: statusForRange(occupancy, [0, 10], 5, "lowerIsBetter"),
      takeaway:
        occupancy <= 10
          ? "Under 10%. You have real cushion here."
          : occupancy <= 15
            ? "In range, but pushing the high end. Worth renegotiating when your lease comes up."
            : "Above 15%. Your rent is eating too much of your revenue (\"the rent trap\"). Renegotiate or, longer-term, relocate.",
    },
    {
      key: "net_margin",
      label: "Net Margin",
      plainEnglish:
        "What you actually keep after every expense — taxes, interest, depreciation, everything.",
      value: netMargin,
      unit: "pct",
      benchmarkLabel: "Year 1: ≥0%; mature: 3–15%",
      benchmarkSource: "SCA + independent operator surveys",
      tier: "core",
      status: statusForRange(netMargin, [3, 15], 3, "higherIsBetter"),
      takeaway:
        netMargin < 0
          ? "Operating at a net loss. Not unusual in Year 1, but you need a clear path to positive by Year 2."
          : netMargin < 3
            ? "Thin. Any surprise expense or slow month could wipe it out."
            : "Solid for a coffee shop. Most indie shops run in this range.",
    },
    {
      key: "operating_margin",
      label: "Operating Margin",
      plainEnglish:
        "Profit from running the business, before interest and taxes, as % of revenue.",
      value: opMargin,
      unit: "pct",
      benchmarkLabel: "5–15% (mature shop)",
      benchmarkSource: "Specialty Coffee Association industry surveys",
      tier: "advanced",
      status: statusForRange(opMargin, [5, 15], 5, "higherIsBetter"),
      takeaway:
        opMargin >= 5 && opMargin <= 15
          ? "Healthy for an indie coffee shop."
          : opMargin < 0
            ? "Operating at a loss. Review operating expenses and pricing — Year 1 losses happen but should narrow fast."
            : opMargin < 5
              ? "Thin but positive. Keep a close eye on operating expense growth."
              : "Above 15% is excellent. Make sure your projections aren't underestimating real-world costs.",
    },
    {
      key: "payment_processing",
      label: "Payment Processing",
      plainEnglish:
        "Card processor fees (Square, Toast, Stripe, etc.) as % of revenue.",
      value: processingPct,
      unit: "pct",
      benchmarkLabel: "2.5–3.0%",
      benchmarkSource: "Common indie POS rate cards (Square, Toast, Clover)",
      tier: "advanced",
      status: statusForRange(processingPct, [2.5, 3.0], 0.5, "lowerIsBetter"),
      takeaway:
        processingPct <= 3
          ? "In line with industry rates."
          : "Above 3%. Worth negotiating your processor rate, switching providers, or offering a cash discount.",
    },
    {
      key: "spoilage",
      label: "Spoilage",
      plainEnglish:
        "Food and drink wasted (expired milk, dropped pastries, etc.) as % of cost of goods.",
      value: spoilagePct,
      unit: "pct",
      benchmarkLabel: "2–5% of COGS",
      benchmarkSource: "National Restaurant Association",
      tier: "advanced",
      status: statusForRange(spoilagePct, [0, 5], 2, "lowerIsBetter"),
      takeaway:
        spoilagePct <= 5
          ? "Within the 2–5% benchmark."
          : "Above 5%. Tighter ordering, smaller par levels, and stricter FIFO rotation can bring this down.",
    },
  ];

  return ratios.filter((r) => r.value !== null);
}

// ── Presentation ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<Status, { wrap: string; chip: string; chipLabel: string; dot: string }> = {
  good: {
    wrap: "border-green-200 bg-green-50",
    chip: "bg-green-100 text-green-800",
    chipLabel: "On track",
    dot: "bg-green-500",
  },
  caution: {
    wrap: "border-amber-200 bg-amber-50",
    chip: "bg-amber-100 text-amber-900",
    chipLabel: "Watch",
    dot: "bg-amber-500",
  },
  warning: {
    wrap: "border-red-200 bg-red-50",
    chip: "bg-red-100 text-red-800",
    chipLabel: "Needs attention",
    dot: "bg-red-500",
  },
};

function RatioCard({ ratio }: { ratio: Ratio }) {
  if (ratio.value === null) return null;
  const styles = STATUS_STYLES[ratio.status];
  const v = ratio.value;

  return (
    <div className={`rounded-xl border px-5 py-4 ${styles.wrap}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{ratio.label}</p>
          <p className="text-xs text-[var(--gray-mid)] mt-1 leading-snug">
            {ratio.plainEnglish}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${styles.chip} whitespace-nowrap`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
          {styles.chipLabel}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[var(--gray-1050)]">
            Your value
          </p>
          <p className="text-2xl font-bold text-[var(--foreground)] mt-0.5">
            {v.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[var(--gray-1050)]">
            Healthy range
          </p>
          <p className="text-sm font-medium text-[var(--foreground)] mt-1">
            {ratio.benchmarkLabel}
          </p>
          <p className="text-[10px] text-[var(--neutral-cool-650)] mt-0.5 leading-tight">
            Source: {ratio.benchmarkSource}
          </p>
        </div>
      </div>

      <p className="text-xs text-[var(--gray-1400)] mt-3 leading-relaxed">
        {ratio.takeaway}
      </p>
    </div>
  );
}

export function RatiosTab({ slices }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const ratios = computeRatios(slices);

  if (ratios.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-white px-5 py-8 text-center text-sm text-[var(--dark-grey)]">
        Enter your inputs to see ratio analysis.
      </div>
    );
  }

  const core = ratios.filter((r) => r.tier === "core");
  const advanced = ratios.filter((r) => r.tier === "advanced");

  const warnings = ratios.filter((r) => r.status === "warning");
  const cautions = ratios.filter((r) => r.status === "caution");

  // Summary banner
  const summary = (() => {
    if (warnings.length > 0) {
      return {
        tone: "warning" as const,
        title: `${warnings.length} ratio${warnings.length > 1 ? "s" : ""} need${warnings.length > 1 ? "" : "s"} attention`,
        body: `Focus on: ${warnings.map((r) => r.label).join(", ")}. These are outside the healthy range for a coffee shop.`,
      };
    }
    if (cautions.length > 0) {
      return {
        tone: "caution" as const,
        title: `${cautions.length} ratio${cautions.length > 1 ? "s" : ""} to watch`,
        body: `Close to the edge: ${cautions.map((r) => r.label).join(", ")}. Worth a check, not a crisis.`,
      };
    }
    return {
      tone: "good" as const,
      title: "All ratios are healthy.",
      body: "Your numbers are within industry benchmarks for an indie coffee shop. Focus on execution.",
    };
  })();

  const summaryStyles = STATUS_STYLES[summary.tone];

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className={`rounded-xl border px-5 py-4 ${summaryStyles.wrap}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${summaryStyles.dot}`} />
          <p className="text-sm font-semibold text-[var(--foreground)]">{summary.title}</p>
        </div>
        <p className="text-xs text-[var(--gray-1300)] mt-1 leading-relaxed">{summary.body}</p>
      </div>

      {/* How to read this */}
      <div className="rounded-xl border border-[var(--border)] bg-white px-5 py-3">
        <p className="text-[11px] uppercase tracking-wide text-[var(--gray-1050)] font-semibold">
          How to read this
        </p>
        <p className="text-xs text-[var(--gray-mid)] mt-1 leading-relaxed">
          Each card shows what the ratio means in plain English, your Year 1
          value, and the healthy range for an indie coffee shop with the source
          we used. Green = on track, amber = watch, red = needs attention.
        </p>
      </div>

      {/* Core ratios */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {core.map((r) => (
          <RatioCard key={r.key} ratio={r} />
        ))}
      </div>

      {/* Advanced toggle */}
      {advanced.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gray-550)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--gray-1300)] hover:bg-[var(--neutral-cool-100)] transition-colors"
            aria-expanded={showAdvanced}
            aria-controls="ratios-advanced-section"
          >
            {showAdvanced ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Hide advanced ratios
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Show advanced ratios ({advanced.length})
              </>
            )}
          </button>

          {showAdvanced && (
            <div
              id="ratios-advanced-section"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 mt-3"
            >
              {advanced.map((r) => (
                <RatioCard key={r.key} ratio={r} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
