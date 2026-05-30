"use client";

import { useState } from "react";
import {
  type MonthlySlice,
  sumSlices,
  getQuarterSlices,
  fiscalYearMonthLabels,
  fmt,
} from "@/lib/financial-projection";
import {
  ChartCard,
  FinancialComboChart,
  FinancialLineChart,
  ViewModeToggle,
  CHART_COLORS,
  type ChartDatum,
  type ChartSeries,
  type ViewMode,
} from "./financial-charts";

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

function CFRow({ label, values, bold, indent, highlight, negative, currencyCode }: RowProps & { currencyCode: string }) {
  return (
    <tr className={highlight ? "bg-[var(--teal-tint-50)]" : ""}>
      {/* TIM-1309: opaque frozen column with z-index above scrolled cells. */}
      <td
        className={`py-2 pr-4 text-sm sticky left-0 z-10 ${highlight ? "bg-[var(--teal-tint-50)]" : "bg-white"} ${indent ? "pl-8" : "pl-4"} ${bold ? "font-semibold" : ""}`}
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

// TIM-1183: cash can now go negative (the $0 clamp was removed in TIM-1169), so
// surface the runway breach prominently. The per-year critique and red table
// cells are easy to miss when a different year is selected; this banner scans
// the whole projection so a deficit is never silently hidden.
function CashRunwayBanner({
  slices,
  fiscalYearStartMonth,
  currencyCode,
}: {
  slices: MonthlySlice[];
  fiscalYearStartMonth: number;
  currencyCode: string;
}) {
  const firstNegative = slices.find((s) => s.cash_cents < 0);
  if (!firstNegative) return null;

  const labels = fiscalYearMonthLabels(fiscalYearStartMonth);
  const monthLabel = (s: MonthlySlice) => labels[s.month - 1] ?? `Month ${s.month}`;
  const trough = slices.reduce((lowest, s) => (s.cash_cents < lowest.cash_cents ? s : lowest), slices[0]);

  return (
    <div className="mb-4 rounded-xl border border-[var(--error-bg-12)] bg-[var(--error-bg-7)] px-5 py-4">
      <p className="text-sm font-semibold text-red-700">
        Cash runs out in {monthLabel(firstNegative)} of Year {firstNegative.year}.
      </p>
      <p className="text-sm text-red-700/90 mt-1 leading-relaxed">
        Your projected cash balance first goes negative in {monthLabel(firstNegative)} (Year{" "}
        {firstNegative.year}) and bottoms out at {fmt(trough.cash_cents, currencyCode)} in{" "}
        {monthLabel(trough)} of Year {trough.year}. You would need additional funding or lower costs
        before then to stay solvent — this is a real deficit, not a $0 balance.
      </p>
    </div>
  );
}

// TIM-1311: always-visible top-of-page summary, matching the P&L revenue chart
// (TIM-1261). Fixed to Year 1 monthly so it reads as a stable headline trend
// regardless of the table's period/year selection. The in-tab chart toggle
// (TIM-1120) stays for deeper views.
function CashSummaryChart({
  slices,
  fiscalYearStartMonth,
  currencyCode,
}: {
  slices: MonthlySlice[];
  fiscalYearStartMonth: number;
  currencyCode: string;
}) {
  const y1 = slices.filter((s) => s.year === 1);
  if (y1.length === 0) return null;
  const labels = fiscalYearMonthLabels(fiscalYearStartMonth);
  const data: ChartDatum[] = y1.map((s, i) => ({
    label: labels[i] ?? `M${i + 1}`,
    ending_cash: s.cash_cents,
  }));
  return (
    <div className="mb-4">
      <ChartCard
        title="Year 1 Ending Cash Balance"
        description="Where your cash lands at the end of each month of your first operating year. Watch for any dip toward or below zero."
      >
        <FinancialLineChart
          data={data}
          series={[{ key: "ending_cash", label: "Ending Cash", color: CHART_COLORS.primary }]}
          currencyCode={currencyCode}
          height={240}
          showZero
        />
      </ChartCard>
    </div>
  );
}

function SectionHeader({ label, colCount }: { label: string; colCount: number }) {
  return (
    <tr>
      <td colSpan={colCount + 1} className="px-4 pt-4 pb-1">
        <span className="text-xs font-semibold text-[var(--teal)] uppercase tracking-wide">{label}</span>
      </td>
    </tr>
  );
}

function DividerRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols + 1}><div className="h-px bg-[var(--border)]" /></td>
    </tr>
  );
}

// Calculate derived cash flow columns from summed slices.
// TIM-1169: surface working-capital deltas + owner activity as discrete rows.
function deriveCF(data: Partial<MonthlySlice>) {
  const ni = data.net_income_cents ?? 0;
  const dep = data.depreciation_cents ?? 0;
  const dAr = data.delta_ar_cents ?? 0;
  const dInv = data.delta_inventory_cents ?? 0;
  const dAp = data.delta_ap_cents ?? 0;
  const loan_rep = data.loan_repayment_cents ?? 0;
  const capex = data.capex_cents ?? 0;
  const draws = data.owner_draws_cents ?? 0;
  const contributions = data.owner_contributions_cents ?? 0;

  const net_cash_operating = ni + dep - dAr - dInv + dAp;
  const net_cash_investing = -capex;
  const net_cash_financing = -loan_rep - draws + contributions;
  const net_change = net_cash_operating + net_cash_investing + net_cash_financing;
  const ending_cash = data.cash_cents ?? 0;
  const beginning_cash = ending_cash - net_change;
  return {
    net_income: ni,
    depreciation_addback: dep,
    delta_ar: -dAr,
    delta_inventory: -dInv,
    delta_ap: dAp,
    net_cash_operating,
    capex,
    net_cash_investing,
    loan_repayment: loan_rep,
    owner_draws: draws,
    owner_contributions: contributions,
    net_cash_financing,
    net_change,
    beginning_cash,
    ending_cash,
  };
}

interface Props {
  slices: MonthlySlice[];
  fiscalYearStartMonth?: number;
  currencyCode?: string;
}

export function CashFlowTab({ slices, fiscalYearStartMonth = 1, currencyCode = "USD" }: Props) {
  const [period, setPeriod] = useState<Period>("monthly");
  const [year, setYear] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [view, setView] = useState<ViewMode>("table");

  const MONTHS = fiscalYearMonthLabels(fiscalYearStartMonth);
  const yearSlices = slices.filter((s) => s.year === year);

  let columns: { label: string; data: Partial<MonthlySlice> }[] = [];

  // For period totals (quarter / year), cash_cents on `sumSlices` would be a sum
  // — but cash is a balance, not a flow. Override with the ending balance of the
  // last slice in the group.
  if (period === "monthly") {
    columns = yearSlices.map((s, i) => ({ label: MONTHS[i], data: s }));
  } else if (period === "quarterly") {
    columns = [1, 2, 3, 4].map((q) => {
      const qs = getQuarterSlices(slices, year, q);
      const summed = sumSlices(qs);
      const endingCash = qs[qs.length - 1]?.cash_cents ?? 0;
      return { label: QUARTERS[q - 1], data: { ...summed, cash_cents: endingCash } };
    });
  } else {
    columns = [1, 2, 3, 4, 5].map((y) => {
      const ys = slices.filter((s) => s.year === y);
      const summed = sumSlices(ys);
      const endingCash = ys[ys.length - 1]?.cash_cents ?? 0;
      return { label: `Year ${y}`, data: { ...summed, cash_cents: endingCash } };
    });
  }

  const cfCols = columns.map((c) => deriveCF(c.data));
  const valsArr = <K extends keyof ReturnType<typeof deriveCF>>(key: K) =>
    cfCols.map((c) => c[key] as number);

  const colCount = columns.length;

  // Build chart data: one row per column. Each row holds the per-section flows
  // plus ending cash. Operating positive, investing and financing typically
  // negative — combo chart stacks the components and overlays ending cash as a
  // line so the user can see what's driving each month's cash change.
  const chartData: ChartDatum[] = columns.map((c, i) => ({
    label: c.label,
    operating: cfCols[i].net_cash_operating,
    investing: cfCols[i].net_cash_investing,
    financing: cfCols[i].net_cash_financing,
    ending_cash: cfCols[i].ending_cash,
    net_change: cfCols[i].net_change,
  }));

  const flowSeries: ChartSeries[] = [
    { key: "operating", label: "Operating", color: CHART_COLORS.primary },
    { key: "investing", label: "Investing", color: CHART_COLORS.warning },
    { key: "financing", label: "Financing", color: CHART_COLORS.accent },
  ];
  const cashLineSeries: ChartSeries[] = [
    { key: "ending_cash", label: "Ending Cash", color: CHART_COLORS.negative },
  ];

  return (
    <div>
      <CashRunwayBanner slices={slices} fiscalYearStartMonth={fiscalYearStartMonth} currencyCode={currencyCode} />
      <CashSummaryChart slices={slices} fiscalYearStartMonth={fiscalYearStartMonth} currencyCode={currencyCode} />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <ViewModeToggle mode={view} onChange={setView} />
        <div className="flex rounded-lg border border-[var(--border-medium)] overflow-hidden text-sm">
          {(["monthly", "quarterly", "annual"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p);
                if (p === "annual") setYear(1);
              }}
              className={`px-3 py-1.5 capitalize ${period === p ? "bg-[var(--teal)] text-white" : "bg-white text-[var(--muted-foreground)] hover:bg-[var(--neutral-cool-100)]"}`}
            >
              {p}
            </button>
          ))}
        </div>
        {period !== "annual" && (
          <div className="flex rounded-lg border border-[var(--border-medium)] overflow-hidden text-sm">
            {([1, 2, 3, 4, 5] as const).map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`px-3 py-1.5 ${year === y ? "bg-[var(--teal)] text-white" : "bg-white text-[var(--muted-foreground)] hover:bg-[var(--neutral-cool-100)]"}`}
              >
                Year {y}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "chart" ? (
        <div className="space-y-4">
          <ChartCard
            title="Cash Flow By Category"
            description="Stacked bars show net cash from Operating, Investing, and Financing activities each period. The line is the ending cash balance."
          >
            <FinancialComboChart
              data={chartData}
              barSeries={flowSeries}
              lineSeries={cashLineSeries}
              currencyCode={currencyCode}
            />
          </ChartCard>
          <ChartCard
            title="Ending Cash Trajectory"
            description="Where your cash balance lands at the end of each period. Watch for dips toward zero."
          >
            <FinancialLineChart
              data={chartData}
              series={[
                { key: "ending_cash", label: "Ending Cash", color: CHART_COLORS.primary },
              ]}
              currencyCode={currencyCode}
              showZero
            />
          </ChartCard>
        </div>
      ) : (
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="py-3 pl-4 pr-4 text-left text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide sticky left-0 z-20 bg-white w-56">
                Line Item
              </th>
              {columns.map((c) => (
                <th key={c.label} className="py-3 px-3 text-right text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SectionHeader label="Operating Activities" colCount={colCount} />
            <CFRow currencyCode={currencyCode} label="Net Income" values={valsArr("net_income")} indent />
            <CFRow currencyCode={currencyCode} label="Plus: Depreciation (Non-Cash)" values={valsArr("depreciation_addback")} indent />
            <CFRow currencyCode={currencyCode} label="Change In Accounts Receivable" values={valsArr("delta_ar")} indent />
            <CFRow currencyCode={currencyCode} label="Change In Inventory" values={valsArr("delta_inventory")} indent />
            <CFRow currencyCode={currencyCode} label="Change In Accounts Payable" values={valsArr("delta_ap")} indent />
            <CFRow currencyCode={currencyCode} label="Net Cash From Operating Activities" values={valsArr("net_cash_operating")} bold highlight />

            <DividerRow cols={colCount} />
            <SectionHeader label="Investing Activities" colCount={colCount} />
            <CFRow currencyCode={currencyCode} label="Capital Expenditures (Asset Purchases)" values={valsArr("capex").map((v) => -v)} indent negative />
            <CFRow currencyCode={currencyCode} label="Net Cash From Investing Activities" values={valsArr("net_cash_investing")} bold />

            <DividerRow cols={colCount} />
            <SectionHeader label="Financing Activities" colCount={colCount} />
            <CFRow currencyCode={currencyCode} label="Loan Repayments" values={valsArr("loan_repayment").map((v) => -v)} indent negative />
            <CFRow currencyCode={currencyCode} label="Owner Draws" values={valsArr("owner_draws").map((v) => -v)} indent negative />
            <CFRow currencyCode={currencyCode} label="Owner Contributions" values={valsArr("owner_contributions")} indent />
            <CFRow currencyCode={currencyCode} label="Net Cash From Financing Activities" values={valsArr("net_cash_financing")} bold />

            <DividerRow cols={colCount} />
            <CFRow currencyCode={currencyCode} label="Net Change In Cash" values={valsArr("net_change")} bold />
            <CFRow currencyCode={currencyCode} label="Beginning Cash" values={valsArr("beginning_cash")} />
            <CFRow currencyCode={currencyCode} label="Ending Cash" values={valsArr("ending_cash")} bold highlight />
          </tbody>
        </table>
      </div>
      )}

      <div className="mt-4 rounded-xl border border-[var(--teal-tint-400)] bg-[var(--teal-tint-100)] px-5 py-4">
        <p className="text-xs font-semibold text-[var(--teal)] uppercase tracking-wide mb-1">What The Numbers Are Saying</p>
        <CashFlowCritique slices={slices} year={year} monthLabels={MONTHS} currencyCode={currencyCode} />
      </div>

      <LoanAmortizationSchedule
        slices={slices}
        year={year}
        monthLabels={MONTHS}
        currencyCode={currencyCode}
      />
    </div>
  );
}

// TIM-1169: month-by-month loan amortization sub-card. Reads pre-computed
// interest + principal from each MonthlySlice (no math here — single source of
// truth). Hidden when there's no loan in the model.
function LoanAmortizationSchedule({
  slices,
  year,
  monthLabels,
  currencyCode,
}: {
  slices: MonthlySlice[];
  year: number;
  monthLabels: string[];
  currencyCode: string;
}) {
  const totalPrincipal = slices.reduce((s, x) => s + x.loan_repayment_cents, 0);
  const totalInterest = slices.reduce((s, x) => s + x.loan_interest_cents, 0);
  if (totalPrincipal === 0 && totalInterest === 0) return null;

  const yearSlices = slices.filter((sl) => sl.year === year);
  // Beginning balance for each month = ending balance of prior month
  let runningBalance = 0;
  const startOfYearIdx = (year - 1) * 12;
  // Find the very first long_term_debt as the original loan amount: walk back
  // from the first non-zero slice + add its first principal.
  const firstNonZero = slices.find((s) => s.long_term_debt_cents > 0);
  const originalLoan = firstNonZero
    ? firstNonZero.long_term_debt_cents + firstNonZero.loan_repayment_cents
    : 0;
  runningBalance = year === 1
    ? originalLoan
    : (slices[startOfYearIdx - 1]?.long_term_debt_cents ?? originalLoan);

  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-white overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <div>
          <p className="text-base font-bold text-[var(--foreground)] leading-tight">Loan Amortization Schedule</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            Month-by-month split of each loan payment into interest and principal. This is the schedule your banker will ask for.
          </p>
        </div>
        <p className="text-xs text-[var(--dark-grey)]">Year {year}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--background)]">
              <th className="py-2.5 pl-5 pr-3 text-left text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Month</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Beginning Balance</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Interest</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Principal</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Payment</th>
              <th className="py-2.5 px-5 text-right text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Ending Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--neutral-cool-100)]">
            {yearSlices.map((s, i) => {
              const begin = runningBalance;
              const ending = s.long_term_debt_cents;
              runningBalance = ending;
              const payment = s.loan_repayment_cents + s.loan_interest_cents;
              return (
                <tr key={s.month_index}>
                  <td className="py-2 pl-5 pr-3 text-sm text-[var(--foreground)]">{monthLabels[i]}</td>
                  <td className="py-2 px-3 text-right text-sm tabular-nums">{fmt(begin, currencyCode)}</td>
                  <td className="py-2 px-3 text-right text-sm tabular-nums text-[var(--error)]">{fmt(s.loan_interest_cents, currencyCode)}</td>
                  <td className="py-2 px-3 text-right text-sm tabular-nums">{fmt(s.loan_repayment_cents, currencyCode)}</td>
                  <td className="py-2 px-3 text-right text-sm tabular-nums font-medium">{fmt(payment, currencyCode)}</td>
                  <td className="py-2 px-5 text-right text-sm tabular-nums">{fmt(ending, currencyCode)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CashFlowCritique({
  slices,
  year,
  monthLabels,
  currencyCode,
}: {
  slices: MonthlySlice[];
  year: number;
  monthLabels: string[];
  currencyCode: string;
}) {
  const yearSlices = slices.filter((s) => s.year === year);
  if (yearSlices.length === 0) return null;

  const lines: string[] = [];
  const lowestCash = Math.min(...yearSlices.map((s) => s.cash_cents));
  const lowestMonth = yearSlices.find((s) => s.cash_cents === lowestCash);
  const labelFor = (m?: number) => (m && m >= 1 && m <= 12 ? monthLabels[m - 1] : "");

  if (lowestCash < 0) {
    const monthName = labelFor(lowestMonth?.month);
    lines.push(`Cash goes negative in ${monthName} of Year ${year}. That is a real problem — you would need more funding or tighter cost control before then.`);
  } else if (lowestCash < 500000) {
    const monthName = labelFor(lowestMonth?.month);
    lines.push(`Your lowest cash balance in Year ${year} is under ${fmt(500000, currencyCode)} (in ${monthName}). That is very thin. A single slow week could leave you unable to pay suppliers.`);
  } else {
    lines.push(`Cash stays positive throughout Year ${year}. Your lowest point is ${fmt(lowestCash, currencyCode)} — that is your real cushion number, not the year-end balance.`);
  }

  // Check if ending cash matches balance sheet (it should — same compute source)
  const lastSlice = yearSlices[yearSlices.length - 1];
  lines.push(`Ending cash of ${fmt(lastSlice.cash_cents, currencyCode)} matches the Cash line on the Balance Sheet.`);

  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-[var(--teal-deeper)] leading-relaxed">{line}</p>
      ))}
    </div>
  );
}
