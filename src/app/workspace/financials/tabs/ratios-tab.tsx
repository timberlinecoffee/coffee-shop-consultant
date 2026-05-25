"use client";

import { type MonthlySlice, sumSlices } from "@/lib/financial-projection";

interface Props {
  slices: MonthlySlice[];
}

interface Ratio {
  label: string;
  value: number | null;
  unit: "pct" | "dollar" | "number";
  benchmarkMin: number;
  benchmarkMax: number;
  higherIsBetter: boolean;
  note: (v: number) => string;
}

function computeRatios(slices: MonthlySlice[]): Ratio[] {
  const y1 = slices.filter((s) => s.year === 1);
  if (y1.length === 0) return [];

  const totals = sumSlices(y1);
  const nr = totals.net_revenue_cents ?? 1;
  const gp = totals.gross_profit_cents ?? 0;
  const oi = totals.operating_income_cents ?? 0;
  const labor = totals.labor_cents ?? 0;
  const cogs = totals.total_cogs_cents ?? 0;
  const rent = totals.rent_cents ?? 0;
  const pp = totals.payment_processing_cents ?? 0;
  const spoilage = totals.spoilage_cents ?? 0;
  const bevCogs = totals.beverage_cogs_cents ?? 0;
  const foodCogs = totals.food_cogs_cents ?? 0;
  const ni = totals.net_income_cents ?? 0;

  const avgTicketCents = slices[0]?.net_revenue_cents && slices[0]?.net_revenue_cents > 0
    ? null : null;

  const grossMargin = nr > 0 ? gp / nr * 100 : 0;
  const opMargin = nr > 0 ? oi / nr * 100 : 0;
  const laborPct = nr > 0 ? labor / nr * 100 : 0;
  const primeCost = nr > 0 ? (cogs + labor) / nr * 100 : 0;
  const occupancy = nr > 0 ? rent / nr * 100 : 0;
  const processingPct = nr > 0 ? pp / nr * 100 : 0;
  const spoilagePct = cogs > 0 ? spoilage / cogs * 100 : 0;
  const netMargin = nr > 0 ? ni / nr * 100 : 0;

  return [
    {
      label: "Gross Margin",
      value: grossMargin,
      unit: "pct",
      benchmarkMin: 60,
      benchmarkMax: 70,
      higherIsBetter: true,
      note: (v) => v >= 60 && v <= 70
        ? `${v.toFixed(1)}% — right in the healthy zone for a coffee shop.`
        : v < 60
        ? `${v.toFixed(1)}% — below the 60–70% target. Check your COGS percentages.`
        : `${v.toFixed(1)}% — above 70%. Strong margin, but double-check your inputs.`,
    },
    {
      label: "Operating Margin",
      value: opMargin,
      unit: "pct",
      benchmarkMin: 5,
      benchmarkMax: 15,
      higherIsBetter: true,
      note: (v) => v >= 5 && v <= 15
        ? `${v.toFixed(1)}% — healthy for an indie coffee shop.`
        : v < 0
        ? `${v.toFixed(1)}% — operating at a loss. Review your OpEx and pricing.`
        : v < 5
        ? `${v.toFixed(1)}% — thin but positive. Keep a close eye on OpEx growth.`
        : `${v.toFixed(1)}% — above 15%. Excellent, but make sure projections are realistic.`,
    },
    {
      label: "Labor As % Of Revenue",
      value: laborPct,
      unit: "pct",
      benchmarkMin: 28,
      benchmarkMax: 35,
      higherIsBetter: false,
      note: (v) => v >= 28 && v <= 35
        ? `${v.toFixed(1)}% — in the normal range. Most shops land here.`
        : v > 35
        ? `${v.toFixed(1)}% — above 35%. Either you are over-staffed or under-priced. Both are worth looking at.`
        : `${v.toFixed(1)}% — under 28%. Possible if you are in the early days or running lean. Make sure your schedule is sustainable.`,
    },
    {
      label: "Prime Cost",
      value: primeCost,
      unit: "pct",
      benchmarkMin: 55,
      benchmarkMax: 65,
      higherIsBetter: false,
      note: (v) => v <= 65
        ? `${v.toFixed(1)}% — within the 55–65% benchmark. This is the number that separates shops that make it from shops that don't.`
        : `${v.toFixed(1)}% — above 65%. This is the most important number to fix. Raising prices or tightening labor scheduling is usually the fastest path.`,
    },
    {
      label: "Occupancy",
      value: occupancy,
      unit: "pct",
      benchmarkMin: 8,
      benchmarkMax: 15,
      higherIsBetter: false,
      note: (v) => v <= 10
        ? `${v.toFixed(1)}% — under 10%. Healthy. You have real cushion here.`
        : v <= 15
        ? `${v.toFixed(1)}% — in range, but pushing toward the high end. Worth renegotiating if you can.`
        : `${v.toFixed(1)}% — above 15%. Your rent is eating too much of your revenue. See if you can renegotiate after Year 1.`,
    },
    {
      label: "Payment Processing",
      value: processingPct,
      unit: "pct",
      benchmarkMin: 2.5,
      benchmarkMax: 3.0,
      higherIsBetter: false,
      note: (v) => `${v.toFixed(2)}% — typical range is 2.5–3.0%. ${v > 3 ? "Worth negotiating your processor rate or adding a cash discount." : "In line with industry rates."}`,
    },
    {
      label: "Spoilage",
      value: spoilagePct,
      unit: "pct",
      benchmarkMin: 2,
      benchmarkMax: 5,
      higherIsBetter: false,
      note: (v) => v <= 5
        ? `${v.toFixed(1)}% of COGS — within the 2–5% benchmark.`
        : `${v.toFixed(1)}% of COGS — above 5%. Tighter ordering and rotating stock can bring this down.`,
    },
    {
      label: "Net Margin",
      value: netMargin,
      unit: "pct",
      benchmarkMin: 3,
      benchmarkMax: 15,
      higherIsBetter: true,
      note: (v) => v < 0
        ? `${v.toFixed(1)}% — operating at a net loss. Not unusual in Year 1, but you need a path to positive.`
        : v < 3
        ? `${v.toFixed(1)}% — thin. Any unexpected expense or slow month could wipe it out.`
        : `${v.toFixed(1)}% — solid for a coffee shop. Most indie shops run in this range.`,
    },
  ];
}

function RatioTile({ ratio }: { ratio: Ratio }) {
  if (ratio.value === null) return null;

  const v = ratio.value;
  const { benchmarkMin, benchmarkMax, higherIsBetter } = ratio;
  const inBenchmark = v >= benchmarkMin && v <= benchmarkMax;
  const good = higherIsBetter ? v >= benchmarkMin : v <= benchmarkMax;

  const statusColor = inBenchmark
    ? "text-green-700 bg-green-50 border-green-200"
    : good
    ? "text-[#155e63] bg-[#f0f9f9] border-[#c5dfe0]"
    : "text-red-700 bg-red-50 border-red-200";

  const barPosition = (() => {
    const range = benchmarkMax - benchmarkMin;
    if (range <= 0) return 50;
    const midpoint = (benchmarkMin + benchmarkMax) / 2;
    const distFromMid = v - midpoint;
    const normalized = 50 + (distFromMid / range) * 50;
    return Math.max(0, Math.min(100, normalized));
  })();

  return (
    <div className={`rounded-2xl border px-4 py-4 ${statusColor}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">{ratio.label}</p>
      <p className="text-2xl font-bold">
        {ratio.unit === "pct"
          ? `${v.toFixed(1)}%`
          : ratio.unit === "dollar"
          ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
          : v.toFixed(1)}
      </p>
      <div className="mt-2 relative">
        <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
          <div
            className="h-full bg-current opacity-30 absolute top-0 left-0"
            style={{
              left: `${(benchmarkMin / (benchmarkMax * 1.5)) * 100}%`,
              width: `${((benchmarkMax - benchmarkMin) / (benchmarkMax * 1.5)) * 100}%`,
            }}
          />
        </div>
        <div
          className="w-2 h-2 rounded-full bg-current absolute top-[-2px]"
          style={{ left: `calc(${Math.min(95, (v / (benchmarkMax * 1.5)) * 100)}% - 4px)` }}
        />
      </div>
      <p className="text-xs opacity-70 mt-1">Benchmark: {benchmarkMin}–{benchmarkMax}%</p>
      <p className="text-xs mt-2 leading-snug">{ratio.note(v)}</p>
    </div>
  );
}

export function RatiosTab({ slices }: Props) {
  const ratios = computeRatios(slices);

  if (ratios.length === 0) {
    return (
      <div className="rounded-2xl border border-[#efefef] bg-white px-5 py-8 text-center text-sm text-[#afafaf]">
        Enter your inputs to see ratio analysis.
      </div>
    );
  }

  const allGood = ratios.filter((r) => r.value !== null).every((r) => {
    const v = r.value!;
    return r.higherIsBetter ? v >= r.benchmarkMin : v <= r.benchmarkMax;
  });
  const criticalIssues = ratios.filter((r) => {
    if (r.value === null) return false;
    const v = r.value;
    return r.higherIsBetter ? v < r.benchmarkMin : v > r.benchmarkMax;
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#efefef] bg-white px-5 py-4">
        <p className="text-sm font-semibold text-[#1a1a1a]">Year 1 Key Ratios</p>
        <p className="text-xs text-[#afafaf] mt-0.5">
          Benchmarks based on SCA data and industry surveys. Green = in benchmark range.
        </p>
        {criticalIssues.length > 0 && (
          <p className="text-xs text-red-700 mt-2">
            {criticalIssues.length} ratio{criticalIssues.length > 1 ? "s" : ""} outside benchmark: {criticalIssues.map(r => r.label).join(", ")}.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ratios.map((r) => (
          <RatioTile key={r.label} ratio={r} />
        ))}
      </div>

      <div className="rounded-2xl border border-[#e5eef0] bg-[#f0f9f9] px-5 py-4">
        <p className="text-xs font-semibold text-[#155e63] uppercase tracking-wide mb-2">The Ones That Matter Most</p>
        <div className="space-y-2">
          <p className="text-sm text-[#2a4a4c] leading-relaxed">
            Prime cost and occupancy together tell you whether your business model works. If prime cost is under 65% and occupancy is under 10%, you have a healthy foundation. Everything else is optimization.
          </p>
          {allGood && (
            <p className="text-sm text-[#2a4a4c] leading-relaxed font-medium">
              Your ratios are all within benchmark ranges. That is a good sign — now focus on execution.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
