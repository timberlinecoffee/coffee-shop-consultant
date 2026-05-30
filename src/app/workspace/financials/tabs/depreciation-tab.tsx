"use client";

import { useMemo } from "react";
import {
  type MonthlySlice,
  fiscalYearMonthLabels,
  formatCurrency,
} from "@/lib/financial-projection";
import type { EquipmentItem } from "../financials-workspace";
import {
  ChartCard,
  FinancialBarChart,
  CHART_COLORS,
  type ChartDatum,
  type ChartSeries,
} from "./financial-charts";

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
}

const CHART_SERIES: ChartSeries[] = [
  { key: "depreciation", label: "Depreciation Expense", color: CHART_COLORS.warning },
];

export function DepreciationTab({
  equipmentItems,
  slices,
  fiscalYearStartMonth,
  currencyCode,
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

  const assetRows = useMemo(
    () =>
      activeItems.map((item) => {
        const totalCostCents = item.unit_cost_cents * item.quantity;
        const life = item.useful_life_years > 0 ? item.useful_life_years : 7;
        const lifeMonths = Math.max(1, Math.round(life * 12));
        const monthlyDepCents = Math.round(totalCostCents / lifeMonths);
        // Accumulated over projection period (60 months max, capped at life)
        const projMonths = Math.min(60, lifeMonths);
        const accumulatedCents = monthlyDepCents * projMonths;
        return {
          id: item.id,
          name: item.name || "Unnamed Asset",
          category: fmtCategory(item.category),
          life,
          totalCostCents,
          monthlyDepCents,
          accumulatedCents,
        };
      }),
    [activeItems]
  );

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
      <ChartCard
        title="Monthly Depreciation Expense — Year 1"
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
            <strong>Cash Flow:</strong> depreciation is non-cash — it is added back in operating
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
              Edit in Build-Out &amp; Equipment →
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--background)]">
                  <th className="py-2 px-4 text-left font-semibold text-[var(--muted-foreground)] sticky left-0 bg-[var(--background)]">
                    Asset
                  </th>
                  <th className="py-2 px-3 text-left font-semibold text-[var(--muted-foreground)] whitespace-nowrap">
                    Category
                  </th>
                  <th className="py-2 px-3 text-right font-semibold text-[var(--muted-foreground)] whitespace-nowrap">
                    Cost
                  </th>
                  <th className="py-2 px-3 text-right font-semibold text-[var(--muted-foreground)] whitespace-nowrap">
                    Useful Life
                  </th>
                  <th className="py-2 px-3 text-right font-semibold text-[var(--muted-foreground)] whitespace-nowrap">
                    Monthly Dep.
                  </th>
                  <th className="py-2 px-3 text-right font-semibold text-[var(--muted-foreground)] whitespace-nowrap">
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
                    <td className="py-2 px-3 text-right tabular-nums">{fmtC(row.monthlyDepCents)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmtC(row.accumulatedCents)}</td>
                  </tr>
                ))}
                <tr className="bg-[var(--teal-tint-50)] font-semibold border-t-2 border-[var(--border)]">
                  <td className="py-2 px-4 sticky left-0 bg-[var(--teal-tint-50)]">Total</td>
                  <td className="py-2 px-3" />
                  <td className="py-2 px-3 text-right tabular-nums">{fmtC(totals.costCents)}</td>
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
            No capitalized assets yet.{" "}
            <a
              href="/workspace/buildout-equipment"
              className="font-medium text-[var(--teal)] hover:underline"
            >
              Add equipment in Build-Out &amp; Equipment →
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
