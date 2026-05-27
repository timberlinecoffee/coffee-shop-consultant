"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Lightbulb } from "lucide-react";
import {
  type MonthlySlice,
  type FinancialInputs,
  fiscalYearMonthLabels,
  fmt,
} from "@/lib/financial-projection";
import { diagnoseBalanceSheet } from "@/lib/balance-diagnostic";

type Period = "monthly" | "annual";

interface RowProps {
  label: string;
  values: (number | undefined)[];
  bold?: boolean;
  indent?: boolean;
  highlight?: boolean;
  negative?: boolean;
}

function BSRow({ label, values, bold, indent, highlight, negative, currencyCode }: RowProps & { currencyCode: string }) {
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
            {v !== undefined ? fmt(v, currencyCode) : "—"}
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
  fiscalYearStartMonth?: number;
  currencyCode?: string;
  financialInputs?: Partial<FinancialInputs>;
}

export function BalanceSheetTab({
  slices,
  fiscalYearStartMonth = 1,
  currencyCode = "USD",
  financialInputs,
}: Props) {
  const [period, setPeriod] = useState<Period>("monthly");
  const [year, setYear] = useState<1 | 2 | 3 | 4 | 5>(1);

  const MONTHS = fiscalYearMonthLabels(fiscalYearStartMonth);
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

  const lastSlice = yearSlices[yearSlices.length - 1];
  const diagnostic = lastSlice
    ? diagnoseBalanceSheet({
        slice: lastSlice,
        allSlices: slices,
        inputs: financialInputs,
      })
    : null;

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
      </div>

      {diagnostic && <BalanceDiagnosticBanner diagnostic={diagnostic} currencyCode={currencyCode} />}

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
            <BSRow currencyCode={currencyCode} label="Cash And Cash Equivalents" values={vals("cash_cents")} />
            <BSRow currencyCode={currencyCode} label="Accounts Receivable" values={vals("accounts_receivable_cents")} indent />
            <BSRow currencyCode={currencyCode} label="Inventory" values={vals("inventory_cents")} indent />
            <BSRow currencyCode={currencyCode} label="Fixed Assets (Gross)" values={vals("fixed_assets_gross_cents")} indent />
            <BSRow currencyCode={currencyCode} label="Less: Accumulated Depreciation" values={vals("accumulated_depreciation_cents")} indent negative />
            <BSRow currencyCode={currencyCode} label="Net Fixed Assets" values={vals("net_fixed_assets_cents")} indent />
            <BSRow currencyCode={currencyCode} label="Other Assets" values={vals("other_assets_cents")} indent />
            <BSRow currencyCode={currencyCode} label="Total Assets" values={vals("total_assets_cents")} bold highlight />

            <DividerRow cols={colCount} />
            <SectionHeader label="Liabilities" colCount={colCount} />
            <BSRow currencyCode={currencyCode} label="Accounts Payable" values={vals("accounts_payable_cents")} indent />
            <BSRow currencyCode={currencyCode} label="Current Portion Of Long-Term Debt" values={vals("current_debt_cents")} indent />
            <BSRow currencyCode={currencyCode} label="Long-Term Debt" values={vals("long_term_debt_cents")} indent />
            <BSRow currencyCode={currencyCode} label="Total Liabilities" values={vals("total_liabilities_cents")} bold />

            <DividerRow cols={colCount} />
            <SectionHeader label="Equity" colCount={colCount} />
            <BSRow currencyCode={currencyCode} label="Owner Equity" values={vals("owner_equity_cents")} indent />
            <BSRow currencyCode={currencyCode} label="Retained Earnings" values={vals("retained_earnings_cents")} indent />
            <BSRow currencyCode={currencyCode} label="Total Equity" values={vals("total_equity_cents")} bold />

            <DividerRow cols={colCount} />
            <BSRow currencyCode={currencyCode} label="Total Liabilities And Equity" values={vals("total_liabilities_and_equity_cents")} bold highlight />
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

// TIM-1119: expandable banner that replaces the simple red badge. When
// balanced, collapses to a one-line green confirmation. When out of balance,
// shows headline + summary + ranked causes + suggested fix.
function BalanceDiagnosticBanner({
  diagnostic,
  currencyCode,
}: {
  diagnostic: ReturnType<typeof diagnoseBalanceSheet>;
  currencyCode: string;
}) {
  const [expanded, setExpanded] = useState(true);

  if (diagnostic.balanced) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5">
        <CheckCircle2 size={16} className="text-green-700 shrink-0" aria-hidden="true" />
        <p className="text-sm font-medium text-green-800">
          Balance sheet checks out
        </p>
        <p className="text-xs text-green-700">
          Total assets equal liabilities plus equity.
        </p>
      </div>
    );
  }

  const causes = diagnostic.causes.slice(0, 3);

  return (
    <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-red-100/40 transition-colors"
        aria-expanded={expanded}
      >
        <AlertCircle size={18} className="text-red-700 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-900">
            Balance sheet is out of balance —{" "}
            <span className="font-bold">{fmt(Math.abs(diagnostic.gap_cents), currencyCode)}</span>
          </p>
          <p className="text-xs text-red-800 mt-0.5">{diagnostic.headline}</p>
        </div>
        {expanded ? (
          <ChevronDown size={16} className="text-red-700 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight size={16} className="text-red-700 shrink-0" aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-1 space-y-4 border-t border-red-200">
          <p className="text-sm text-red-900 leading-relaxed">{diagnostic.summary}</p>

          {causes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-900 uppercase tracking-wide mb-2">
                Likely Cause{causes.length > 1 ? "s" : ""}
              </p>
              <ol className="space-y-2">
                {causes.map((cause, i) => (
                  <li key={cause.id} className="flex gap-3">
                    <span className="shrink-0 text-xs font-semibold text-red-800 w-5 mt-0.5">
                      {i + 1}.
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-900">{cause.label}</p>
                      <p className="text-xs text-red-800 mt-0.5 leading-relaxed">
                        {cause.explanation}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {diagnostic.suggested_fix && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
              <Lightbulb size={16} className="text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-1">
                  Suggested Fix
                </p>
                <p className="text-sm font-medium text-amber-900">
                  {diagnostic.suggested_fix.label}
                </p>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  {diagnostic.suggested_fix.rationale}
                </p>
                <p className="text-[10px] text-amber-700 mt-2 uppercase tracking-wide">
                  Where to make the change:{" "}
                  <span className="font-semibold">
                    {diagnostic.suggested_fix.location === "startup_costs"
                      ? "Startup Costs tab"
                      : diagnostic.suggested_fix.location === "funding_sources"
                      ? "Startup Costs tab → Funding"
                      : "Forecast Inputs tab"}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      )}
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
    lines.push(`Cash position at year end looks manageable. Keep watching it month by month — the cash flow tab will show you the lowest points.`);
  }

  if (last.retained_earnings_cents < 0) {
    lines.push(`Retained earnings are negative — cumulative losses so far. That is fine if it is early days, but you want to see this number trending toward positive by the end of Year 2 or 3.`);
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
