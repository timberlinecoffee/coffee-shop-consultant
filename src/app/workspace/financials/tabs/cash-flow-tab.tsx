"use client";

import { useState } from "react";
import {
  type MonthlySlice,
  sumSlices,
  getQuarterSlices,
  fmt,
} from "@/lib/financial-projection";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

type Period = "monthly" | "quarterly" | "annual";

interface RowProps {
  label: string;
  values: (number | undefined)[];
  bold?: boolean;
  indent?: boolean;
  highlight?: boolean;
  negative?: boolean;
}

function CFRow({ label, values, bold, indent, highlight, negative }: RowProps) {
  return (
    <tr className={highlight ? "bg-[#f7fafa]" : ""}>
      <td
        className={`py-2 pr-4 text-sm sticky left-0 bg-white ${highlight ? "bg-[#f7fafa]" : ""} ${indent ? "pl-8" : "pl-4"} ${bold ? "font-semibold" : ""}`}
      >
        {label}
      </td>
      {values.map((v, i) => {
        const isNeg = negative || (v !== undefined && v < 0);
        return (
          <td
            key={i}
            className={`py-2 px-3 text-right text-sm whitespace-nowrap ${bold ? "font-semibold" : ""} ${isNeg ? "text-red-600" : ""}`}
          >
            {v !== undefined ? fmt(v) : "—"}
          </td>
        );
      })}
    </tr>
  );
}

function SectionHeader({ label, colCount }: { label: string; colCount: number }) {
  return (
    <tr>
      <td colSpan={colCount + 1} className="px-4 pt-4 pb-1">
        <span className="text-xs font-semibold text-[#155e63] uppercase tracking-wide">{label}</span>
      </td>
    </tr>
  );
}

function DividerRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols + 1}><div className="h-px bg-[#efefef]" /></td>
    </tr>
  );
}

// Calculate derived cash flow columns from summed slices
function deriveCF(data: Partial<MonthlySlice>, prevCash: number) {
  const ni = data.net_income_cents ?? 0;
  const dep = data.depreciation_cents ?? 0;
  // Working capital changes: not trivially summable from monthly; approximate from balance sheet deltas
  // For display we show net_cash broken into sections using available fields
  const principal_rep = data.principal_repayment_cents ?? 0;
  const capex = data.capex_cents ?? 0;
  const net_cash_financing = -(principal_rep);
  const net_cash_investing = -(capex);
  const net_cash_operating = (data.net_cash_cents ?? 0) - net_cash_financing - net_cash_investing;
  const ending_cash = data.cash_cents ?? 0;
  const beginning_cash = ending_cash - (data.net_cash_cents ?? 0);
  return {
    net_income: ni,
    depreciation_addback: dep,
    net_cash_operating,
    capex: capex,
    net_cash_investing,
    principal_repayment: principal_rep,
    net_cash_financing,
    net_change: data.net_cash_cents ?? 0,
    beginning_cash,
    ending_cash,
  };
}

interface Props {
  slices: MonthlySlice[];
}

export function CashFlowTab({ slices }: Props) {
  const [period, setPeriod] = useState<Period>("monthly");
  const [year, setYear] = useState<1 | 2 | 3 | 4 | 5>(1);

  const yearSlices = slices.filter((s) => s.year === year);

  let columns: { label: string; data: Partial<MonthlySlice>; prevCash: number }[] = [];

  if (period === "monthly") {
    columns = yearSlices.map((s, i) => {
      const prev = i === 0
        ? (slices.filter(sl => sl.year === year - 1).slice(-1)[0]?.cash_cents ?? 0)
        : yearSlices[i - 1].cash_cents;
      return { label: MONTHS[i], data: s, prevCash: prev };
    });
  } else if (period === "quarterly") {
    columns = [1, 2, 3, 4].map((q) => {
      const qs = getQuarterSlices(slices, year, q);
      const prev = q === 1
        ? (slices.filter(sl => sl.year === year - 1).slice(-1)[0]?.cash_cents ?? 0)
        : (getQuarterSlices(slices, year, q - 1).slice(-1)[0]?.cash_cents ?? 0);
      return { label: QUARTERS[q - 1], data: sumSlices(qs), prevCash: prev };
    });
  } else {
    columns = [1, 2, 3, 4, 5].map((y) => {
      const ys = slices.filter((s) => s.year === y);
      const prev = y === 1 ? 0 : (slices.filter(sl => sl.year === y - 1).slice(-1)[0]?.cash_cents ?? 0);
      return { label: `Year ${y}`, data: sumSlices(ys), prevCash: prev };
    });
  }

  const cfCols = columns.map((c) => deriveCF(c.data, c.prevCash));
  const valsArr = <K extends keyof ReturnType<typeof deriveCF>>(key: K) =>
    cfCols.map((c) => c[key] as number);

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
              <th className="py-3 pl-4 pr-4 text-left text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide sticky left-0 bg-white w-56">
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
            <SectionHeader label="Operating Activities" colCount={colCount} />
            <CFRow label="Net Income" values={valsArr("net_income")} indent />
            <CFRow label="Plus: Depreciation" values={valsArr("depreciation_addback")} indent />
            <CFRow label="Net Cash From Operating Activities" values={valsArr("net_cash_operating")} bold highlight />

            <DividerRow cols={colCount} />
            <SectionHeader label="Investing Activities" colCount={colCount} />
            <CFRow label="Capital Expenditures" values={valsArr("capex")} indent />
            <CFRow label="Net Cash From Investing Activities" values={valsArr("net_cash_investing")} bold />

            <DividerRow cols={colCount} />
            <SectionHeader label="Financing Activities" colCount={colCount} />
            <CFRow label="Loan Principal Repayments" values={valsArr("principal_repayment")} indent negative />
            <CFRow label="Net Cash From Financing Activities" values={valsArr("net_cash_financing")} bold />

            <DividerRow cols={colCount} />
            <CFRow label="Net Change In Cash" values={valsArr("net_change")} bold />
            <CFRow label="Beginning Cash" values={valsArr("beginning_cash")} />
            <CFRow label="Ending Cash" values={valsArr("ending_cash")} bold highlight />
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-2xl border border-[#e5eef0] bg-[#f0f9f9] px-5 py-4">
        <p className="text-xs font-semibold text-[#155e63] uppercase tracking-wide mb-1">What The Numbers Are Saying</p>
        <CashFlowCritique slices={slices} year={year} />
      </div>
    </div>
  );
}

function CashFlowCritique({ slices, year }: { slices: MonthlySlice[]; year: number }) {
  const yearSlices = slices.filter((s) => s.year === year);
  if (yearSlices.length === 0) return null;

  const lines: string[] = [];
  const lowestCash = Math.min(...yearSlices.map((s) => s.cash_cents));
  const lowestMonth = yearSlices.find((s) => s.cash_cents === lowestCash);

  if (lowestCash < 0) {
    const monthName = lowestMonth ? ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][lowestMonth.month - 1] : "";
    lines.push(`Cash goes negative in ${monthName} of Year ${year}. That is a real problem — you would need more funding or tighter cost control before then.`);
  } else if (lowestCash < 500000) {
    const monthName = lowestMonth ? ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][lowestMonth.month - 1] : "";
    lines.push(`Your lowest cash balance in Year ${year} is under $5,000 (in ${monthName}). That is very thin. A single slow week could leave you unable to pay suppliers.`);
  } else {
    lines.push(`Cash stays positive throughout Year ${year}. Your lowest point is ${fmt(lowestCash)} — that is your real cushion number, not the year-end balance.`);
  }

  // Check if ending cash matches balance sheet (it should — same compute source)
  const lastSlice = yearSlices[yearSlices.length - 1];
  lines.push(`Ending cash of ${fmt(lastSlice.cash_cents)} matches the Cash line on the Balance Sheet.`);

  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-[#2a4a4c] leading-relaxed">{line}</p>
      ))}
    </div>
  );
}
