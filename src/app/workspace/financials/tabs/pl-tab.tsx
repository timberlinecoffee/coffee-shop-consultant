"use client";

import { useState } from "react";
import {
  type MonthlySlice,
  type LineMonthlyAmount,
  type ForecastCategory,
  sumSlices,
  getQuarterSlices,
  aggregateLineAmounts,
  fmt,
  pct,
} from "@/lib/financial-projection";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

type Period = "monthly" | "quarterly" | "annual";

interface RowProps {
  label: string;
  values: (number | undefined)[];
  bold?: boolean;
  negative?: boolean;
  indent?: boolean;
  highlight?: boolean;
  pctValues?: (string | undefined)[];
}

function StatRow({ label, values, bold, negative, indent, highlight, pctValues }: RowProps) {
  const isNeg = (v?: number) => (v !== undefined && v < 0) || negative;
  return (
    <tr className={highlight ? "bg-[#f7fafa]" : ""}>
      <td className={`py-2 pr-4 text-sm sticky left-0 bg-white ${highlight ? "bg-[#f7fafa]" : ""} ${indent ? "pl-8" : "pl-4"} ${bold ? "font-semibold" : ""}`}>
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`py-2 px-3 text-right text-sm whitespace-nowrap ${bold ? "font-semibold" : ""} ${v !== undefined && isNeg(v) ? "text-red-600" : ""}`}
        >
          {v !== undefined ? fmt(v) : "—"}
          {pctValues?.[i] && <span className="text-xs text-[#afafaf] ml-1">({pctValues[i]})</span>}
        </td>
      ))}
    </tr>
  );
}

function DividerRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols + 1} className="py-0">
        <div className="h-px bg-[#efefef]" />
      </td>
    </tr>
  );
}

interface Props {
  slices: MonthlySlice[];
}

export function PLTab({ slices }: Props) {
  const [period, setPeriod] = useState<Period>("monthly");
  const [year, setYear] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [showCogs, setShowCogs] = useState(true);
  const [showOpex, setShowOpex] = useState(true);
  const [showRevenue, setShowRevenue] = useState(true);

  const yearSlices = slices.filter((s) => s.year === year);

  // Each column carries:
  //   data = aggregated numeric fields (Partial<MonthlySlice>)
  //   lineAmounts = per-line totals for that period (forecast_line_amounts rolled up)
  interface PLColumn {
    label: string;
    data: Partial<MonthlySlice>;
    lineAmounts: LineMonthlyAmount[];
  }
  let columns: PLColumn[] = [];

  if (period === "monthly") {
    columns = yearSlices.map((s, i) => ({
      label: MONTHS[i],
      data: s,
      lineAmounts: s.forecast_line_amounts ?? [],
    }));
  } else if (period === "quarterly") {
    columns = [1, 2, 3, 4].map((q) => {
      const qs = getQuarterSlices(slices, year, q);
      return {
        label: QUARTERS[q - 1],
        data: sumSlices(qs),
        lineAmounts: aggregateLineAmounts(qs),
      };
    });
  } else {
    columns = [1, 2, 3, 4, 5].map((y) => {
      const ys = slices.filter((s) => s.year === y);
      return {
        label: `Year ${y}`,
        data: sumSlices(ys),
        lineAmounts: aggregateLineAmounts(ys),
      };
    });
  }

  // Union of all line IDs across columns, grouped by category — so user-named
  // lines show up under the right section regardless of whether they have a
  // value in every period.
  const linesByCategory = (cat: ForecastCategory) => {
    const seen = new Map<string, { id: string; label: string }>();
    for (const col of columns) {
      for (const ln of col.lineAmounts) {
        if (ln.category === cat && !seen.has(ln.id)) {
          seen.set(ln.id, { id: ln.id, label: ln.label });
        }
      }
    }
    return Array.from(seen.values());
  };
  const overheadLines = linesByCategory("overhead");
  const cogsLines = linesByCategory("cogs");
  const revenueLines = linesByCategory("revenue");

  const valsForLine = (id: string) =>
    columns.map((c) => c.lineAmounts.find((ln) => ln.id === id)?.amount_cents);

  const vals = (key: keyof MonthlySlice) => columns.map((c) => c.data[key] as number | undefined);
  const pctOf = (numKey: keyof MonthlySlice, denKey: keyof MonthlySlice) =>
    columns.map((c) => pct((c.data[numKey] as number) ?? 0, (c.data[denKey] as number) ?? 1));

  const colCount = columns.length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex rounded-lg border border-[#e0e0e0] overflow-hidden text-sm">
          {(["monthly", "quarterly", "annual"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p);
                if (p === "annual") setYear(1);
              }}
              className={`px-3 py-1.5 capitalize ${period === p ? "bg-[#155e63] text-white" : "bg-white text-[#6b6b6b] hover:bg-[#f5f5f5]"}`}
            >
              {p}
            </button>
          ))}
        </div>
        {period !== "annual" && (
          <div className="flex rounded-lg border border-[#e0e0e0] overflow-hidden text-sm">
            {([1, 2, 3, 4, 5] as const).map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`px-3 py-1.5 ${year === y ? "bg-[#155e63] text-white" : "bg-white text-[#6b6b6b] hover:bg-[#f5f5f5]"}`}
              >
                Year {y}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[#efefef] bg-white overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#efefef]">
              <th className="py-3 pl-4 pr-4 text-left text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide sticky left-0 bg-white w-48">
                Line Item
              </th>
              {columns.map((c) => (
                <th key={c.label} className="py-3 px-3 text-right text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={colCount + 1} className="px-4 py-1.5">
                <button
                  onClick={() => setShowRevenue(!showRevenue)}
                  className="text-xs font-semibold text-[#155e63] uppercase tracking-wide"
                >
                  {showRevenue ? "▼" : "▶"} Revenue
                </button>
              </td>
            </tr>
            {showRevenue && (
              <>
                <StatRow label="Foot-Traffic Revenue" values={vals("gross_revenue_cents").map((v, i) => {
                  // base revenue = gross_revenue - sum of additional revenue lines for the column
                  const addls = revenueLines.reduce(
                    (s, rl) => s + (columns[i].lineAmounts.find((ln) => ln.id === rl.id)?.amount_cents ?? 0),
                    0
                  );
                  return v !== undefined ? v - addls : undefined;
                })} indent />
                {revenueLines.map((rl) => (
                  <StatRow key={rl.id} label={rl.label} values={valsForLine(rl.id)} indent />
                ))}
                <StatRow label="Less: Loyalty Discounts" values={vals("loyalty_discounts_cents")} negative indent />
              </>
            )}
            <StatRow label="Net Revenue" values={vals("net_revenue_cents")} bold highlight />
            <DividerRow cols={colCount} />

            <tr>
              <td colSpan={colCount + 1} className="px-4 py-1.5">
                <button
                  onClick={() => setShowCogs(!showCogs)}
                  className="text-xs font-semibold text-[#155e63] uppercase tracking-wide"
                >
                  {showCogs ? "▼" : "▶"} Cost Of Goods Sold
                </button>
              </td>
            </tr>
            {showCogs && (
              <>
                <StatRow label="Beverage COGS" values={vals("beverage_cogs_cents")} indent />
                <StatRow label="Food COGS" values={vals("food_cogs_cents")} indent />
                <StatRow label="Retail COGS" values={vals("retail_cogs_cents")} indent />
                {cogsLines.map((cl) => (
                  <StatRow key={cl.id} label={cl.label} values={valsForLine(cl.id)} indent />
                ))}
              </>
            )}
            <StatRow
              label="Total COGS"
              values={vals("total_cogs_cents")}
              bold
              pctValues={pctOf("total_cogs_cents", "net_revenue_cents")}
            />
            <StatRow label="Gross Profit" values={vals("gross_profit_cents")} bold highlight
              pctValues={pctOf("gross_profit_cents", "net_revenue_cents")} />
            <DividerRow cols={colCount} />

            <tr>
              <td colSpan={colCount + 1} className="px-4 py-1.5">
                <button
                  onClick={() => setShowOpex(!showOpex)}
                  className="text-xs font-semibold text-[#155e63] uppercase tracking-wide"
                >
                  {showOpex ? "▼" : "▶"} Operating Expenses
                </button>
              </td>
            </tr>
            {showOpex && (
              <>
                {overheadLines.map((ol) => (
                  <StatRow key={ol.id} label={ol.label} values={valsForLine(ol.id)} indent />
                ))}
                <StatRow label="Payment Processing Fees" values={vals("payment_processing_cents")} indent pctValues={pctOf("payment_processing_cents", "net_revenue_cents")} />
                <StatRow label="Spoilage And Waste" values={vals("spoilage_cents")} indent />
              </>
            )}
            <StatRow label="Total Operating Expenses" values={vals("total_opex_cents")} bold
              pctValues={pctOf("total_opex_cents", "net_revenue_cents")} />
            <DividerRow cols={colCount} />

            <StatRow label="Operating Income (EBIT)" values={vals("operating_income_cents")} bold highlight
              pctValues={pctOf("operating_income_cents", "net_revenue_cents")} />
            <StatRow label="Depreciation" values={vals("depreciation_cents")} indent />
            <StatRow label="EBITDA" values={vals("ebitda_cents")} bold />
            <StatRow label="Interest Expense" values={vals("interest_cents")} negative indent />
            <StatRow label="Income Before Taxes" values={vals("income_before_taxes_cents")} bold />
            <StatRow label="Taxes" values={vals("taxes_cents")} indent />
            <StatRow label="Net Income" values={vals("net_income_cents")} bold highlight
              pctValues={pctOf("net_income_cents", "net_revenue_cents")} />
            <DividerRow cols={colCount} />
            <StatRow label="Cash Balance" values={vals("cash_cents")} bold highlight />
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-2xl border border-[#e5eef0] bg-[#f0f9f9] px-5 py-4">
        <p className="text-xs font-semibold text-[#155e63] uppercase tracking-wide mb-1">What The Numbers Are Saying</p>
        <PLCritique slices={slices} year={year} />
      </div>
    </div>
  );
}

function PLCritique({ slices, year }: { slices: MonthlySlice[]; year: number }) {
  const yearSlices = slices.filter((s) => s.year === year);
  if (yearSlices.length === 0) return null;

  const totals = sumSlices(yearSlices);
  const nr = totals.net_revenue_cents ?? 1;
  const gp = totals.gross_profit_cents ?? 0;
  const ni = totals.net_income_cents ?? 0;
  const labor = totals.labor_cents ?? 0;
  const cogs = totals.total_cogs_cents ?? 0;
  const rent = totals.rent_cents ?? 0;

  const grossMargin = nr > 0 ? gp / nr * 100 : 0;
  const netMargin = nr > 0 ? ni / nr * 100 : 0;
  const laborPct = nr > 0 ? labor / nr * 100 : 0;
  const primeCost = nr > 0 ? (cogs + labor) / nr * 100 : 0;
  const occupancy = nr > 0 ? rent / nr * 100 : 0;

  const lines: string[] = [];

  if (grossMargin < 55) {
    lines.push(`Gross margin is ${grossMargin.toFixed(1)}% — that is below the 60–70% range most healthy shops run. Check your COGS percentages and your menu mix.`);
  } else if (grossMargin >= 60 && grossMargin <= 70) {
    lines.push(`Gross margin is ${grossMargin.toFixed(1)}% — right in the healthy zone. Coffee shops that stay in this range have room to survive slow months.`);
  } else {
    lines.push(`Gross margin is ${grossMargin.toFixed(1)}% — strong. Make sure your COGS inputs reflect real supplier pricing.`);
  }

  if (primeCost > 65) {
    lines.push(`Prime cost (COGS + labor) is ${primeCost.toFixed(1)}% of revenue — above 65%. This is the number that kills most shops. Something needs to move: raise prices, tighten scheduling, or push higher-margin items.`);
  } else {
    lines.push(`Prime cost is ${primeCost.toFixed(1)}% — within the 55–65% benchmark. That is the most important number to keep an eye on.`);
  }

  if (occupancy > 15) {
    lines.push(`Rent is ${occupancy.toFixed(1)}% of revenue — above 15%. Aim for under 10% if you can. Worth revisiting either your lease terms or your traffic model.`);
  } else if (occupancy <= 10) {
    lines.push(`Rent is ${occupancy.toFixed(1)}% of revenue — healthy. Under 10% gives you real cushion.`);
  }

  if (ni < 0) {
    lines.push(`Net income is negative in Year ${year}. That is not unusual in Year 1, but you need a clear path to break-even. Check the Break-Even tab.`);
  } else if (netMargin < 5) {
    lines.push(`Net margin is ${netMargin.toFixed(1)}% — thin but positive. Most indie shops run 5–15%. Keep an eye on your OpEx as revenue grows.`);
  }

  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-[#2a4a4c] leading-relaxed">{line}</p>
      ))}
    </div>
  );
}
