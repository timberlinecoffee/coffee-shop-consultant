"use client";

import { useState } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import { NumericInput } from "@/components/ui/numeric-input";
import {
  type MonthlySlice,
  type LineMonthlyAmount,
  type ForecastCategory,
  sumSlices,
  getQuarterSlices,
  aggregateLineAmounts,
  aggregatePersonnelAmounts,
  fiscalYearMonthLabels,
  fmt,
  pct,
  BASE_REVENUE_LINE_ID,
} from "@/lib/financial-projection";
import {
  ChartCard,
  FinancialBarChart,
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
  negative?: boolean;
  indent?: boolean;
  highlight?: boolean;
  pctValues?: (string | undefined)[];
  // TIM-1247: render as a muted memo line (e.g. sales-tax pass-through) that is
  // shown for information but is not part of the P&L math.
  memo?: boolean;
}

function StatRow({ label, values, bold, negative, indent, highlight, pctValues, memo, currencyCode }: RowProps & { currencyCode: string }) {
  const isNeg = (v?: number) => (v !== undefined && v < 0) || negative;
  // TIM-1309: the frozen first column must be fully opaque with a z-index above
  // the scrolled value cells (some of which are positioned), so month numbers
  // pass cleanly underneath instead of bleeding through.
  const stickyBg = memo ? "bg-white" : highlight ? "bg-[#f7fafa]" : "bg-white";
  return (
    <tr className={highlight ? "bg-[#f7fafa]" : ""}>
      <td className={`py-2.5 pr-4 text-sm sticky left-0 z-10 ${stickyBg} ${indent ? "pl-8" : "pl-4"} ${bold ? "font-semibold" : ""} ${memo ? "italic text-[#8a8a8a]" : ""}`}>
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`py-2.5 px-3 text-right text-sm whitespace-nowrap ${bold ? "font-semibold" : ""} ${memo ? "italic text-[#8a8a8a]" : ""} ${!memo && v !== undefined && isNeg(v) ? "text-red-600" : ""}`}
        >
          {/* TIM-1309: stack the % beneath the absolute value, both right-aligned,
              so the totals line up in a consistent column instead of being shoved
              left by a trailing percentage. */}
          <span className="flex flex-col items-end leading-tight">
            <span>{v !== undefined ? fmt(v, currencyCode) : "—"}</span>
            {pctValues?.[i] && (
              <span className="text-[10px] font-normal text-[#afafaf]">{pctValues[i]}</span>
            )}
          </span>
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

// TIM-1243: edit in major currency units (dollars), store integer cents — same
// convention as the forecast-lines editor.
function centsToInput(cents: number | undefined): string {
  if (cents === undefined) return "";
  return String(Math.round(cents) / 100);
}
function inputToCents(val: string): number {
  return Math.max(0, Math.round((parseFloat(val) || 0) * 100));
}

interface EditableCell {
  amount: number | undefined;
  overridden: boolean;
  monthIndexAbs: number | undefined;
}

interface EditableLineRowProps {
  label: string;
  lineId: string;
  cells: EditableCell[];
  editable: boolean; // monthly view + canEdit
  manual: boolean;
  currencyCode: string;
  indent?: boolean;
  onSet: (lineId: string, monthIndexAbs: number, cents: number) => void;
  onClear: (lineId: string, monthIndexAbs: number) => void;
  onToggleManual: (lineId: string, manual: boolean) => void;
}

// TIM-1243: a revenue/expense line rendered across the monthly columns with
// click-to-edit per-cell overrides and a per-line manual-entry toggle.
function EditableLineRow({
  label,
  lineId,
  cells,
  editable,
  manual,
  currencyCode,
  indent,
  onSet,
  onClear,
  onToggleManual,
}: EditableLineRowProps) {
  const [editingCol, setEditingCol] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (i: number, current: number | undefined) => {
    if (!editable || cells[i].monthIndexAbs === undefined) return;
    setEditingCol(i);
    setDraft(centsToInput(current));
  };
  const commit = (i: number) => {
    const mi = cells[i].monthIndexAbs;
    if (mi !== undefined) onSet(lineId, mi, inputToCents(draft));
    setEditingCol(null);
  };

  return (
    <tr className={`group/row ${manual ? "bg-[#fbf7ef]" : ""}`}>
      <td
        className={`py-2 pr-4 text-sm sticky left-0 z-10 ${manual ? "bg-[#fbf7ef]" : "bg-white"} ${indent ? "pl-8" : "pl-4"}`}
      >
        <span className="inline-flex items-center gap-1.5">
          <span>{label}</span>
          {editable &&
            (manual ? (
              <button
                type="button"
                onClick={() => onToggleManual(lineId, false)}
                title="Entering all months by hand — click to switch back to assumptions"
                aria-label="Switch back to assumption-driven entry"
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#9a6b00] bg-[#f3e6c4] hover:bg-[#ecdaa8] rounded px-1.5 py-0.5 transition-colors"
              >
                Manual
                <RotateCcw size={9} className="opacity-60" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onToggleManual(lineId, true)}
                title="Enter every month by hand (seeds from current values)"
                aria-label="Enter all months manually"
                className="opacity-0 group-hover/row:opacity-100 focus:opacity-100 text-[#c4c4c4] hover:text-[#155e63] transition-opacity"
              >
                <Pencil size={11} />
              </button>
            ))}
        </span>
      </td>
      {cells.map((cell, i) => {
        const isEditing = editingCol === i;
        const canEditCell = editable && cell.monthIndexAbs !== undefined;
        const overridden = cell.overridden;
        if (isEditing) {
          return (
            <td key={i} className="py-1 px-2 text-right">
              <NumericInput
                type="number"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commit(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit(i);
                  else if (e.key === "Escape") setEditingCol(null);
                }}
                className="w-24 text-right text-sm border border-[#155e63] rounded px-1.5 py-1 focus:outline-none"
              />
            </td>
          );
        }
        return (
          <td
            key={i}
            className={`py-2 px-3 text-right text-sm whitespace-nowrap relative ${
              overridden ? "bg-[#eef6f6]" : ""
            } ${canEditCell ? "cursor-pointer hover:bg-[#f3faf9] group" : ""}`}
            onClick={() => canEditCell && startEdit(i, cell.amount)}
            title={canEditCell ? (overridden ? "Manual override — click to edit" : "Click to override this month") : undefined}
          >
            <span className="inline-flex items-center justify-end gap-1">
              {overridden && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#155e63] inline-block" aria-label="overridden" />
              )}
              {cell.amount !== undefined ? fmt(cell.amount, currencyCode) : "—"}
              {canEditCell && overridden && !manual && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (cell.monthIndexAbs !== undefined) onClear(lineId, cell.monthIndexAbs);
                  }}
                  title="Revert to calculated"
                  aria-label="Revert to calculated"
                  className="opacity-0 group-hover:opacity-100 text-[#8a8a8a] hover:text-[#155e63] inline-flex items-center"
                >
                  <RotateCcw size={11} />
                </button>
              )}
            </span>
          </td>
        );
      })}
    </tr>
  );
}

interface Props {
  slices: MonthlySlice[];
  fiscalYearStartMonth?: number;
  currencyCode?: string;
  // TIM-1243: manual override controls. When `editable` and the period is
  // monthly, revenue/expense line-item cells become click-to-edit.
  editable?: boolean;
  manualLines?: string[];
  onSetOverride?: (lineId: string, monthIndexAbs: number, cents: number) => void;
  onClearOverride?: (lineId: string, monthIndexAbs: number) => void;
  onToggleManual?: (lineId: string, manual: boolean) => void;
}

export function PLTab({
  slices,
  fiscalYearStartMonth = 1,
  currencyCode = "USD",
  editable = false,
  manualLines = [],
  onSetOverride,
  onClearOverride,
  onToggleManual,
}: Props) {
  const [period, setPeriod] = useState<Period>("monthly");
  const [year, setYear] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [view, setView] = useState<ViewMode>("table");
  const [showCogs, setShowCogs] = useState(true);
  const [showOpex, setShowOpex] = useState(true);
  const [showRevenue, setShowRevenue] = useState(true);

  const MONTHS = fiscalYearMonthLabels(fiscalYearStartMonth);
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

  // TIM-1206: personnel roles carry their own per-line amounts (category =
  // cogs | overhead per role). Merge them with forecast lines so each role
  // renders under the right P&L section; totals already include them.
  if (period === "monthly") {
    columns = yearSlices.map((s, i) => ({
      label: MONTHS[i],
      data: s,
      lineAmounts: [...(s.forecast_line_amounts ?? []), ...(s.personnel_line_amounts ?? [])],
    }));
  } else if (period === "quarterly") {
    columns = [1, 2, 3, 4].map((q) => {
      const qs = getQuarterSlices(slices, year, q);
      return {
        label: QUARTERS[q - 1],
        data: sumSlices(qs),
        lineAmounts: [...aggregateLineAmounts(qs), ...aggregatePersonnelAmounts(qs)],
      };
    });
  } else {
    columns = [1, 2, 3, 4, 5].map((y) => {
      const ys = slices.filter((s) => s.year === y);
      return {
        label: `Year ${y}`,
        data: sumSlices(ys),
        lineAmounts: [...aggregateLineAmounts(ys), ...aggregatePersonnelAmounts(ys)],
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

  // TIM-1243: per-cell editing is only meaningful in the monthly view (each
  // column maps to a single absolute month). Quarterly/annual stay read-only.
  const monthlyEditable =
    editable && period === "monthly" && !!onSetOverride && !!onClearOverride && !!onToggleManual;
  const manualSet = new Set(manualLines);
  const cellsForLine = (id: string): EditableCell[] =>
    columns.map((c) => {
      const ln = c.lineAmounts.find((l) => l.id === id);
      return {
        amount: ln?.amount_cents,
        overridden: !!ln?.overridden,
        monthIndexAbs: c.data.month_index,
      };
    });
  const baseCells: EditableCell[] = columns.map((c) => ({
    amount: c.data.base_revenue_cents,
    overridden: !!c.data.base_revenue_overridden,
    monthIndexAbs: c.data.month_index,
  }));
  const editProps = {
    editable: monthlyEditable,
    currencyCode,
    onSet: onSetOverride ?? (() => {}),
    onClear: onClearOverride ?? (() => {}),
    onToggleManual: onToggleManual ?? (() => {}),
  };

  const vals = (key: keyof MonthlySlice) => columns.map((c) => c.data[key] as number | undefined);
  const pctOf = (numKey: keyof MonthlySlice, denKey: keyof MonthlySlice) =>
    columns.map((c) => pct((c.data[numKey] as number) ?? 0, (c.data[denKey] as number) ?? 1));

  const colCount = columns.length;

  // ── Chart datasets ──
  // Revenue forecast: net revenue + foot-traffic vs. extra revenue lines
  const revenueChartData: ChartDatum[] = columns.map((c) => {
    const addls = revenueLines.reduce(
      (sum, rl) =>
        sum + (c.lineAmounts.find((ln) => ln.id === rl.id)?.amount_cents ?? 0),
      0
    );
    const gross = (c.data.gross_revenue_cents as number | undefined) ?? 0;
    const row: ChartDatum = {
      label: c.label,
      foot_traffic: gross - addls,
      net_revenue: (c.data.net_revenue_cents as number | undefined) ?? 0,
    };
    for (const rl of revenueLines) {
      row[`line_${rl.id}`] =
        c.lineAmounts.find((ln) => ln.id === rl.id)?.amount_cents ?? 0;
    }
    return row;
  });

  const revenueBarSeries: ChartSeries[] = [
    { key: "foot_traffic", label: "Foot Traffic", color: CHART_COLORS.primary },
    ...revenueLines.map((rl) => ({ key: `line_${rl.id}`, label: rl.label })),
  ];
  const revenueLineSeries: ChartSeries[] = [
    { key: "net_revenue", label: "Net Revenue", color: CHART_COLORS.primary },
  ];

  // Expense forecast: total COGS + line-item overhead + total opex
  const expenseChartData: ChartDatum[] = columns.map((c) => {
    const row: ChartDatum = {
      label: c.label,
      total_cogs: (c.data.total_cogs_cents as number | undefined) ?? 0,
      total_opex: (c.data.total_opex_cents as number | undefined) ?? 0,
      operating_income: (c.data.operating_income_cents as number | undefined) ?? 0,
    };
    for (const ol of overheadLines) {
      row[`opex_${ol.id}`] =
        c.lineAmounts.find((ln) => ln.id === ol.id)?.amount_cents ?? 0;
    }
    return row;
  });

  const expenseStackedSeries: ChartSeries[] = [
    { key: "total_cogs", label: "COGS", color: CHART_COLORS.warning },
    ...overheadLines.map((ol) => ({
      key: `opex_${ol.id}`,
      label: ol.label,
    })),
  ];

  const profitSeries: ChartSeries[] = [
    {
      key: "operating_income",
      label: "Operating Income",
      color: CHART_COLORS.primary,
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <ViewModeToggle mode={view} onChange={setView} />
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

      {view === "chart" ? (
        <div className="space-y-4">
          <ChartCard
            title="Revenue Forecast"
            description="Stacked revenue by source over the period, with net revenue overlaid as a line."
          >
            <FinancialBarChart
              data={revenueChartData}
              series={revenueBarSeries}
              currencyCode={currencyCode}
            />
          </ChartCard>
          <ChartCard
            title="Revenue Trajectory"
            description="Net revenue trend across the selected period."
          >
            <FinancialLineChart
              data={revenueChartData}
              series={revenueLineSeries}
              currencyCode={currencyCode}
            />
          </ChartCard>
          <ChartCard
            title="Expense Forecast"
            description="Stacked operating expenses and COGS by period. Heavier bars = larger total expense burden."
          >
            <FinancialBarChart
              data={expenseChartData}
              series={expenseStackedSeries}
              currencyCode={currencyCode}
            />
          </ChartCard>
          <ChartCard
            title="Operating Income"
            description="What you keep after COGS and operating expenses. Negative values mean you're burning cash."
          >
            <FinancialLineChart
              data={expenseChartData}
              series={profitSeries}
              currencyCode={currencyCode}
              showZero
            />
          </ChartCard>
        </div>
      ) : (
      <div className="rounded-2xl border border-[#efefef] bg-white overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#efefef]">
              <th className="py-3 pl-4 pr-4 text-left text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide sticky left-0 z-20 bg-white w-48">
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
                {monthlyEditable ? (
                  <EditableLineRow {...editProps} label="Foot-Traffic Revenue" lineId={BASE_REVENUE_LINE_ID} cells={baseCells} manual={manualSet.has(BASE_REVENUE_LINE_ID)} indent />
                ) : (
                  <StatRow currencyCode={currencyCode} label="Foot-Traffic Revenue" values={vals("base_revenue_cents")} indent />
                )}
                {revenueLines.map((rl) =>
                  monthlyEditable ? (
                    <EditableLineRow {...editProps} key={rl.id} label={rl.label} lineId={rl.id} cells={cellsForLine(rl.id)} manual={manualSet.has(rl.id)} indent />
                  ) : (
                    <StatRow currencyCode={currencyCode} key={rl.id} label={rl.label} values={valsForLine(rl.id)} indent />
                  )
                )}
                <StatRow currencyCode={currencyCode} label="Less: Loyalty Discounts" values={vals("loyalty_discounts_cents")} negative indent />
              </>
            )}
            <StatRow currencyCode={currencyCode} label="Net Revenue" values={vals("net_revenue_cents")} bold highlight />
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
                <StatRow currencyCode={currencyCode} label="Beverage COGS" values={vals("beverage_cogs_cents")} indent />
                <StatRow currencyCode={currencyCode} label="Food COGS" values={vals("food_cogs_cents")} indent />
                <StatRow currencyCode={currencyCode} label="Retail COGS" values={vals("retail_cogs_cents")} indent />
                {cogsLines.map((cl) =>
                  monthlyEditable ? (
                    <EditableLineRow {...editProps} key={cl.id} label={cl.label} lineId={cl.id} cells={cellsForLine(cl.id)} manual={manualSet.has(cl.id)} indent />
                  ) : (
                    <StatRow currencyCode={currencyCode} key={cl.id} label={cl.label} values={valsForLine(cl.id)} indent />
                  )
                )}
              </>
            )}
            <StatRow
              currencyCode={currencyCode}
              label="Total COGS"
              values={vals("total_cogs_cents")}
              bold
              pctValues={pctOf("total_cogs_cents", "net_revenue_cents")}
            />
            <StatRow currencyCode={currencyCode} label="Gross Profit" values={vals("gross_profit_cents")} bold highlight
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
                {overheadLines.map((ol) =>
                  monthlyEditable ? (
                    <EditableLineRow {...editProps} key={ol.id} label={ol.label} lineId={ol.id} cells={cellsForLine(ol.id)} manual={manualSet.has(ol.id)} indent />
                  ) : (
                    <StatRow currencyCode={currencyCode} key={ol.id} label={ol.label} values={valsForLine(ol.id)} indent />
                  )
                )}
                <StatRow currencyCode={currencyCode} label="Payment Processing Fees" values={vals("payment_processing_cents")} indent pctValues={pctOf("payment_processing_cents", "net_revenue_cents")} />
                <StatRow currencyCode={currencyCode} label="Spoilage And Waste" values={vals("spoilage_cents")} indent />
              </>
            )}
            <StatRow currencyCode={currencyCode} label="Total Operating Expenses" values={vals("total_opex_cents")} bold
              pctValues={pctOf("total_opex_cents", "net_revenue_cents")} />
            <DividerRow cols={colCount} />

            <StatRow currencyCode={currencyCode} label="EBITDA (Earnings Before Interest, Taxes, Depreciation & Amortization)" values={vals("ebitda_cents")} bold
              pctValues={pctOf("ebitda_cents", "net_revenue_cents")} />
            <StatRow currencyCode={currencyCode} label="Depreciation" values={vals("depreciation_cents")} negative indent />
            <StatRow currencyCode={currencyCode} label="Operating Income (EBIT)" values={vals("ebit_cents")} bold highlight
              pctValues={pctOf("ebit_cents", "net_revenue_cents")} />
            <StatRow currencyCode={currencyCode} label="Interest Expense" values={vals("interest_cents")} negative indent />
            <StatRow currencyCode={currencyCode} label="Income Before Taxes" values={vals("income_before_taxes_cents")} bold />
            <StatRow currencyCode={currencyCode} label="Income Tax" values={vals("taxes_cents")} indent />
            <StatRow currencyCode={currencyCode} label="Net Income" values={vals("net_income_cents")} bold highlight
              pctValues={pctOf("net_income_cents", "net_revenue_cents")} />
            <DividerRow cols={colCount} />
            <StatRow currencyCode={currencyCode} label="Cash Balance" values={vals("cash_cents")} bold highlight />
            <DividerRow cols={colCount} />
            {/* TIM-1247: sales tax is a pass-through liability, not revenue or
                expense. Shown as a memo so it never affects the P&L lines above. */}
            <StatRow currencyCode={currencyCode} label="Sales Tax Collected & Remitted (Pass-Through)" values={vals("sales_tax_collected_cents")} indent memo />
            <tr>
              <td colSpan={colCount + 1} className="pl-8 pr-4 pb-2 text-[10px] text-[#afafaf] italic">
                Collected from customers and remitted to the state — not part of revenue or net income.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      )}

      {editable && view === "table" && (
        <p className="mt-2 text-xs text-[#8a8a8a] leading-relaxed">
          {period === "monthly" ? (
            <>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#155e63] align-middle mr-1" />
              Click any revenue or expense cell to type an override for that month — overridden cells are
              flagged and survive recalculation. To enter every month by hand, hover a line and click the{" "}
              <Pencil size={11} className="inline align-text-bottom text-[#155e63]" /> pencil (LivePlan-style);
              the <span className="text-[#9a6b00] font-semibold">Manual</span> tag marks those lines and reverts
              them when clicked. Overrides flow into the P&amp;L, cash flow, balance sheet, break-even, and ratios.
            </>
          ) : (
            <>Switch to the <span className="font-medium">monthly</span> view to edit individual cells. Overridden cells are flagged with a dot.</>
          )}
        </p>
      )}

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
  // TIM-1206: labor_cents is overhead labor; COGS-labor sits inside total_cogs.
  const laborOverhead = totals.labor_cents ?? 0;
  const laborCogs = totals.labor_cogs_cents ?? 0;
  const totalLabor = laborOverhead + laborCogs;
  const cogs = totals.total_cogs_cents ?? 0;
  const rent = totals.rent_cents ?? 0;

  const grossMargin = nr > 0 ? gp / nr * 100 : 0;
  const netMargin = nr > 0 ? ni / nr * 100 : 0;
  const laborPct = nr > 0 ? totalLabor / nr * 100 : 0;
  // Prime cost = goods COGS + all labor. cogs already includes COGS-labor, so
  // add only overhead labor to avoid double-counting.
  const primeCost = nr > 0 ? (cogs + laborOverhead) / nr * 100 : 0;
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
    lines.push(`Net margin is ${netMargin.toFixed(1)}% — thin but positive. Most indie shops run 5–15%. Keep an eye on your operating expenses as revenue grows.`);
  }

  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-[#2a4a4c] leading-relaxed">{line}</p>
      ))}
    </div>
  );
}
