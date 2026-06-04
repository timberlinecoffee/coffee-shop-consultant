"use client";

import { useMemo } from "react";
import {
  type MonthlySlice,
  type ForecastLine,
  fiscalYearMonthLabels,
  formatCurrency,
} from "@/lib/financial-projection";
import type { EquipmentItem } from "../financials-workspace";
import { ForecastLinesEditor, type MenuCogsItem } from "../forecast-lines-editor";
import {
  ChartCard,
  FinancialBarChart,
  CHART_COLORS,
  type ChartDatum,
  type ChartSeries,
} from "./financial-charts";

// 60-month projection horizon used for the accumulated-depreciation column.
const PROJ_MONTHS = 60;

const CATEGORY_LABELS: Record<string, string> = {
  espresso_station: "Espresso Station",
  brew_platform: "Brew Platform",
  milk_beverage_prep: "Milk & Beverage Prep",
  refrigeration: "Refrigeration",
  plumbing_water: "Plumbing & Water",
  electrical: "Electrical",
  pos_tech: "POS & Tech",
  furniture_fixtures: "Furniture & Fixtures",
  signage_decor: "Signage & Decor",
  smallwares: "Smallwares",
  ceramics: "Ceramics",
  glassware: "Glassware",
  to_go_ware: "To-Go Ware",
  miscellaneous: "Miscellaneous",
  // legacy
  espresso_platform: "Espresso Platform",
  espresso: "Espresso",
  grinder: "Grinder",
  plumbing: "Plumbing",
  furniture: "Furniture",
  pos: "POS",
  signage: "Signage",
  other: "Other",
};

function fmtCategory(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

interface Props {
  equipmentItems: EquipmentItem[];
  slices: MonthlySlice[];
  fiscalYearStartMonth: number;
  currencyCode: string;
  // TIM-1739: the Asset Purchase (capex) editor was relocated here from
  // Forecast Inputs. `forecastLines` is the full set; the editor filters to
  // capex internally and onChange returns the full array.
  forecastLines: ForecastLine[];
  canEdit: boolean;
  onChangeForecastLines: (next: ForecastLine[]) => void;
  menuBlendedCogsPct?: number | null;
  menuCogsItems?: MenuCogsItem[];
  manualLines?: string[];
  overrideCounts?: Record<string, number>;
  onClearLineOverrides?: (lineId: string) => void;
  onGoToProjections?: () => void;
}

const CHART_SERIES: ChartSeries[] = [
  { key: "depreciation", label: "Depreciation Expense", color: CHART_COLORS.warning },
];

export function DepreciationTab({
  equipmentItems,
  slices,
  fiscalYearStartMonth,
  currencyCode,
  forecastLines,
  canEdit,
  onChangeForecastLines,
  menuBlendedCogsPct = null,
  menuCogsItems = [],
  manualLines = [],
  overrideCounts = {},
  onClearLineOverrides,
  onGoToProjections,
}: Props) {
  const activeItems = useMemo(
    () => equipmentItems.filter((i) => !i.archived && i.unit_cost_cents > 0),
    [equipmentItems]
  );

  const year1Labels = useMemo(
    () => fiscalYearMonthLabels(fiscalYearStartMonth),
    [fiscalYearStartMonth]
  );

  const chartData: ChartDatum[] = useMemo(
    () =>
      slices.slice(0, 12).map((s, i) => ({
        label: year1Labels[i] ?? `Mo ${i + 1}`,
        depreciation: s.depreciation_cents / 100,
      })),
    [slices, year1Labels]
  );

  // TIM-1739: manual capex ForecastLines entered in this tab (excludes the
  // synthetic equipment-linked lines, which are represented by `equipmentItems`).
  const capexLines = useMemo(
    () =>
      forecastLines.filter(
        (l) => l.category === "capex" && !l.linked_equipment_item_id && l.value > 0
      ),
    [forecastLines]
  );

  // Accumulated depreciation recognized within the 60-month projection window,
  // starting from the asset's purchase month. An asset bought in month 4 only
  // depreciates for months 4..60, so its 5-year accumulated is lower than a
  // month-1 asset of the same cost.
  function accumulatedInWindow(
    monthlyDepCents: number,
    lifeMonths: number,
    purchaseMonth: number
  ): number {
    const remaining = PROJ_MONTHS - (purchaseMonth - 1);
    const depMonths = Math.max(0, Math.min(lifeMonths, remaining));
    return monthlyDepCents * depMonths;
  }

  const assetRows = useMemo(() => {
    const equipmentRows = activeItems.map((item) => {
      const totalCostCents = item.unit_cost_cents * item.quantity;
      const life = item.useful_life_years > 0 ? item.useful_life_years : 7;
      const lifeMonths = Math.max(1, Math.round(life * 12));
      const monthlyDepCents = Math.round(totalCostCents / lifeMonths);
      const purchaseMonth = Math.max(1, item.purchase_month ?? 1);
      return {
        id: item.id,
        name: item.name || "Unnamed Asset",
        category: fmtCategory(item.category),
        life,
        purchaseMonth,
        totalCostCents,
        monthlyDepCents,
        accumulatedCents: accumulatedInWindow(monthlyDepCents, lifeMonths, purchaseMonth),
      };
    });
    const capexRows = capexLines.map((l) => {
      const totalCostCents = Math.round(l.value);
      const life = l.useful_life_years && l.useful_life_years > 0 ? l.useful_life_years : 7;
      const lifeMonths = Math.max(1, Math.round(life * 12));
      const monthlyDepCents = Math.round(totalCostCents / lifeMonths);
      const purchaseMonth = Math.max(1, l.ramp?.start_month ?? 1);
      return {
        id: l.id,
        name: l.label || "Asset Purchase",
        category: l.asset_category ? fmtCategory(l.asset_category) : "Capital Asset",
        life,
        purchaseMonth,
        totalCostCents,
        monthlyDepCents,
        accumulatedCents: accumulatedInWindow(monthlyDepCents, lifeMonths, purchaseMonth),
      };
    });
    return [...equipmentRows, ...capexRows];
  }, [activeItems, capexLines]);

  const totals = useMemo(
    () => ({
      costCents: assetRows.reduce((s, r) => s + r.totalCostCents, 0),
      monthlyDepCents: assetRows.reduce((s, r) => s + r.monthlyDepCents, 0),
      accumulatedCents: assetRows.reduce((s, r) => s + r.accumulatedCents, 0),
    }),
    [assetRows]
  );

  function fmtC(cents: number): string {
    return formatCurrency(cents / 100, currencyCode);
  }

  return (
    <div className="space-y-6">
      {/* TIM-1739: Asset Purchase entry, relocated here from Forecast Inputs. */}
      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <div className="flex items-center gap-1.5 mb-1">
          <p className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--teal)]">
            Asset Purchases
          </p>
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mb-3">
          Add the capital assets you plan to buy. Each one is charged as cash in its
          purchase month and depreciated over its useful life on the schedule below.
        </p>
        <ForecastLinesEditor
          lines={forecastLines}
          canEdit={canEdit}
          onChange={onChangeForecastLines}
          currencyCode={currencyCode}
          menuBlendedCogsPct={menuBlendedCogsPct}
          menuCogsItems={menuCogsItems}
          categories={["capex"]}
          manualLines={manualLines}
          overrideCounts={overrideCounts}
          onClearLineOverrides={onClearLineOverrides}
          onGoToProjections={onGoToProjections}
        />
      </div>

      <ChartCard
        title="Monthly Depreciation Expense: Year 1"
        description="Straight-line depreciation charged to the P&L each month across all capital assets."
      >
        <FinancialBarChart
          data={chartData}
          series={CHART_SERIES}
          currencyCode={currencyCode}
          stack={false}
        />
      </ChartCard>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--teal-tint-500)] px-4 py-3">
        <p className="text-xs font-semibold text-[var(--teal)] mb-1.5">How depreciation flows</p>
        <ul className="space-y-1 text-xs text-[var(--muted-foreground)] list-disc list-inside">
          <li>
            <strong>P&L:</strong> monthly depreciation expense reduces operating income each month.
          </li>
          <li>
            <strong>Balance Sheet:</strong> accumulated depreciation offsets the gross asset balance
            (fixed assets, net).
          </li>
          <li>
            <strong>Cash Flow:</strong> depreciation is non-cash; it is added back in operating
            activities.
          </li>
        </ul>
      </div>

      {assetRows.length > 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--teal)]">
              Asset Depreciation Schedule
            </p>
            <a
              href="/workspace/buildout-equipment"
              className="text-xs font-medium text-[var(--teal)] hover:underline"
            >
              Edit in Equipment &amp; Supplies →
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--background)]">
                  <th className="py-2 px-4 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] sticky left-0 bg-[var(--background)]">
                    Asset
                  </th>
                  <th className="py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] whitespace-nowrap">
                    Category
                  </th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] whitespace-nowrap">
                    Cost
                  </th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] whitespace-nowrap">
                    Useful Life
                  </th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] whitespace-nowrap">
                    Purchase
                  </th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] whitespace-nowrap">
                    Monthly Dep.
                  </th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] whitespace-nowrap">
                    5-Yr Accumulated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {assetRows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-[var(--teal-tint-500)] transition-colors"
                  >
                    <td className="py-2 px-4 font-medium text-[var(--foreground)] sticky left-0 bg-white">
                      {row.name}
                    </td>
                    <td className="py-2 px-3 text-[var(--muted-foreground)]">{row.category}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmtC(row.totalCostCents)}</td>
                    <td className="py-2 px-3 text-right text-[var(--muted-foreground)]">
                      {row.life}yr
                    </td>
                    <td className="py-2 px-3 text-right text-[var(--muted-foreground)] tabular-nums">
                      Mo {row.purchaseMonth}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmtC(row.monthlyDepCents)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmtC(row.accumulatedCents)}</td>
                  </tr>
                ))}
                <tr className="bg-[var(--teal-tint-50)] font-semibold border-t-2 border-[var(--border)]">
                  <td className="py-2 px-4 sticky left-0 bg-[var(--teal-tint-50)]">Total</td>
                  <td className="py-2 px-3" />
                  <td className="py-2 px-3 text-right tabular-nums">{fmtC(totals.costCents)}</td>
                  <td className="py-2 px-3" />
                  <td className="py-2 px-3" />
                  <td className="py-2 px-3 text-right tabular-nums">{fmtC(totals.monthlyDepCents)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtC(totals.accumulatedCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-white p-8 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">
            No capitalized assets yet. Add an Asset Purchase above, or{" "}
            <a
              href="/workspace/buildout-equipment"
              className="font-medium text-[var(--teal)] hover:underline"
            >
              add equipment in Equipment &amp; Supplies →
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
