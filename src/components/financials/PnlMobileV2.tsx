"use client";

// TIM-2596 (Phase 5.8): v2 P&L mobile surface — vertical key-metrics list.
// Renders at <md viewports when ui_revamp_v2 is on; the full multi-column
// table keeps rendering at md+. Shows Year 1 annual totals of the key P&L
// lines as a scrollable card list — no horizontal scroll needed.

import type { MonthlySlice } from "@/lib/financial-projection";
import { fmt } from "@/lib/financial-projection";

interface Props {
  slices: MonthlySlice[];
  currencyCode: string;
}

function sumKey(slices: MonthlySlice[], key: keyof MonthlySlice): number {
  return slices.reduce((s, sl) => s + ((sl[key] as number | undefined) ?? 0), 0);
}

export function PnlMobileV2({ slices, currencyCode }: Props) {
  const y1 = slices.filter((s) => s.year === 1);

  const revenue = sumKey(y1, "net_revenue_cents");
  const cogs = sumKey(y1, "total_cogs_cents");
  const grossProfit = revenue - cogs;
  const opex = sumKey(y1, "total_opex_cents");
  const ebitda = sumKey(y1, "ebitda_cents");
  const interest = sumKey(y1, "interest_cents");
  const netIncome = sumKey(y1, "net_income_cents");

  const gmPct = revenue > 0 ? Math.round(((grossProfit / revenue) * 100)) : null;
  const netPct = revenue > 0 ? Math.round(((netIncome / revenue) * 100)) : null;

  const rows: Array<{
    label: string;
    value: number;
    bold?: boolean;
    indent?: boolean;
    negative?: boolean;
  }> = [
    { label: "Net Revenue", value: revenue, bold: true },
    { label: "COGS", value: cogs, indent: true, negative: true },
    { label: "Gross Profit", value: grossProfit, bold: true },
    { label: "Operating Expenses", value: opex, indent: true, negative: true },
    { label: "EBITDA", value: ebitda, bold: true },
    { label: "Interest", value: interest, indent: true, negative: true },
    { label: "Net Income", value: netIncome, bold: true },
  ];

  return (
    <div className="space-y-4">
      {/* Year 1 summary card */}
      <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-100)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--teal)]">
          Year 1 Summary
        </p>
        <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">
          {fmt(revenue, currencyCode)}
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          {gmPct !== null ? `${gmPct}% gross margin` : "No revenue yet"}
          {netPct !== null ? ` · ${netPct}% net margin` : ""}
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--neutral-cool-50)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Year 1 P&amp;L
          </p>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((row) => {
            const isRed = row.negative && row.value !== 0;
            const isGreen = !row.negative && row.bold && row.value > 0;
            return (
              <li
                key={row.label}
                className="flex items-center justify-between px-4 py-3"
              >
                <span
                  className={`text-sm ${row.bold ? "font-semibold" : ""} ${row.indent ? "pl-4" : ""} text-[var(--foreground)]`}
                >
                  {row.label}
                </span>
                <span
                  className={`text-sm tabular-nums ${row.bold ? "font-semibold" : ""} ${
                    isRed
                      ? "text-red-600"
                      : isGreen
                      ? "text-[var(--teal)]"
                      : "text-[var(--foreground)]"
                  }`}
                >
                  {row.value !== 0 ? fmt(row.value, currencyCode) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-xs text-[var(--muted-foreground)] text-center">
        Full monthly, quarterly, and 5-year P&amp;L available in the desktop view.
      </p>
    </div>
  );
}
