"use client";

import { useState } from "react";
import {
  type MonthlySlice,
  sumSlices,
  fmt,
} from "@/lib/financial-projection";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Period = "monthly" | "annual";

interface RowProps {
  label: string;
  values: (number | undefined)[];
  bold?: boolean;
  indent?: boolean;
  highlight?: boolean;
  negative?: boolean;
}

function BSRow({ label, values, bold, indent, highlight, negative }: RowProps) {
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

interface Props {
  slices: MonthlySlice[];
}

export function BalanceSheetTab({ slices }: Props) {
  const [period, setPeriod] = useState<Period>("monthly");
  const [year, setYear] = useState<1 | 2 | 3 | 4 | 5>(1);

  const yearSlices = slices.filter((s) => s.year === year);

  let columns: { label: string; data: Partial<MonthlySlice> }[] = [];

  if (period === "monthly") {
    columns = yearSlices.map((s, i) => ({ label: MONTHS[i], data: s }));
  } else {
    columns = [1, 2, 3, 4, 5].map((y) => {
      const ys = slices.filter((s) => s.year === y);
      const last = ys[ys.length - 1];
      return { label: `Year ${y}`, data: last ?? {} };
    });
  }

  const vals = (key: keyof MonthlySlice) =>
    columns.map((c) => c.data[key] as number | undefined);

  const colCount = columns.length;

  // Verification: does the balance sheet balance?
  const lastSlice = yearSlices[yearSlices.length - 1];
  const balances = lastSlice
    ? Math.abs(lastSlice.total_assets_cents - lastSlice.total_liabilities_and_equity_cents) < 2
    : true;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex rounded-lg border border-[#e0e0e0] overflow-hidden text-sm">
          {(["monthly", "annual"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 capitalize ${period === p ? "bg-[#155e63] text-white" : "bg-white text-[#6b6b6b] hover:bg-[#f5f5f5]"}`}
            >
              {p}
            </button>
          ))}
        </div>
        {period === "monthly" && (
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
        <div className={`text-xs px-2.5 py-1 rounded-full ${balances ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {balances ? "Balance Sheet Checks Out" : "Balance Sheet Out Of Balance. Check your inputs."}
        </div>
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
            <SectionHeader label="Assets" colCount={colCount} />
            <BSRow label="Cash And Cash Equivalents" values={vals("cash_cents")} />
            <BSRow label="Accounts Receivable" values={vals("accounts_receivable_cents")} indent />
            <BSRow label="Inventory" values={vals("inventory_cents")} indent />
            <BSRow label="Fixed Assets (Gross)" values={vals("fixed_assets_gross_cents")} indent />
            <BSRow label="Less: Accumulated Depreciation" values={vals("accumulated_depreciation_cents")} indent negative />
            <BSRow label="Net Fixed Assets" values={vals("net_fixed_assets_cents")} indent />
            <BSRow label="Other Assets" values={vals("other_assets_cents")} indent />
            <BSRow label="Total Assets" values={vals("total_assets_cents")} bold highlight />

            <DividerRow cols={colCount} />
            <SectionHeader label="Liabilities" colCount={colCount} />
            <BSRow label="Accounts Payable" values={vals("accounts_payable_cents")} indent />
            <BSRow label="Current Portion Of Long-Term Debt" values={vals("current_debt_cents")} indent />
            <BSRow label="Long-Term Debt" values={vals("long_term_debt_cents")} indent />
            <BSRow label="Total Liabilities" values={vals("total_liabilities_cents")} bold />

            <DividerRow cols={colCount} />
            <SectionHeader label="Equity" colCount={colCount} />
            <BSRow label="Owner Equity" values={vals("owner_equity_cents")} indent />
            <BSRow label="Retained Earnings" values={vals("retained_earnings_cents")} indent />
            <BSRow label="Total Equity" values={vals("total_equity_cents")} bold />

            <DividerRow cols={colCount} />
            <BSRow label="Total Liabilities And Equity" values={vals("total_liabilities_and_equity_cents")} bold highlight />
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-2xl border border-[#e5eef0] bg-[#f0f9f9] px-5 py-4">
        <p className="text-xs font-semibold text-[#155e63] uppercase tracking-wide mb-1">What The Numbers Are Saying</p>
        <BalanceSheetCritique slices={slices} year={year} />
      </div>
    </div>
  );
}

function BalanceSheetCritique({ slices, year }: { slices: MonthlySlice[]; year: number }) {
  const yearSlices = slices.filter((s) => s.year === year);
  const last = yearSlices[yearSlices.length - 1];
  if (!last) return null;

  const lines: string[] = [];

  if (last.cash_cents < 0) {
    lines.push(`Cash goes negative in Year ${year}. That means you run out of money before the year ends. Look at your startup funding and your early-month losses.`);
  } else if (last.cash_cents < last.rent_cents * 3) {
    lines.push(`You are ending the year with less than 3 months of rent in cash. That is a thin cushion. Most advisors want to see at least 2–3 months of fixed costs in reserve.`);
  } else {
    lines.push(`Cash position at year end looks manageable. Keep watching it month by month. The cash flow tab will show you the lowest points.`);
  }

  if (last.retained_earnings_cents < 0) {
    lines.push(`Retained earnings are negative. Cumulative losses so far. That is fine if it is early days, but you want to see this number trending toward positive by the end of Year 2 or 3.`);
  }

  const debtToEquity = last.total_equity_cents > 0
    ? last.total_liabilities_cents / last.total_equity_cents
    : 999;

  if (debtToEquity > 2) {
    lines.push(`Debt-to-equity ratio is ${debtToEquity.toFixed(1)}:1. That is high. If you need to borrow more or bring in a partner, lenders will notice this.`);
  }

  if (lines.length === 0) {
    lines.push("Balance sheet looks solid for this stage. Keep an eye on cash and retained earnings as the years progress.");
  }

  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-[#2a4a4c] leading-relaxed">{line}</p>
      ))}
    </div>
  );
}
