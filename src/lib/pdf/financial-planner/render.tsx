// TIM-1103: Financial Planner Suite — standalone PDF export.
// Landscape orientation for month-to-month tables, portrait for cover /
// assumptions / annual summary. Currency follows MonthlyProjections.currency_code;
// month ordering follows fiscal_year_start_month. No emojis (TIM-196).

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ChartConfiguration } from "chart.js";
import { BRAND, registerFonts } from "@/lib/pdf/brand";
import { chartToPng } from "@/lib/pdf/chart-to-png";
import {
  type MonthlyProjections,
  type MonthlySlice,
  type EquipmentSummary,
  computeMonthlySlices,
  fiscalYearMonthLabels,
} from "@/lib/financial-projection";
import { formatMinorUnits, getCurrencyMeta } from "@/lib/currency";

registerFonts();

// ── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pagePortrait: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    color: BRAND.colors.ink,
    backgroundColor: BRAND.colors.paper,
    paddingTop: 36,
    paddingBottom: 52,
    paddingLeft: 36,
    paddingRight: 36,
  },
  pageLandscape: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 9,
    color: BRAND.colors.ink,
    backgroundColor: BRAND.colors.paper,
    paddingTop: 28,
    paddingBottom: 44,
    paddingLeft: 28,
    paddingRight: 28,
  },
  coverPage: {
    fontFamily: BRAND.fonts.sans,
    color: BRAND.colors.ink,
    backgroundColor: BRAND.colors.paper,
    padding: 60,
    flexDirection: "column",
    justifyContent: "center",
  },
  coverEyebrow: {
    fontSize: 11,
    color: BRAND.colors.primary,
    fontWeight: 700,
    letterSpacing: 2,
    marginBottom: 16,
  },
  coverRule: {
    height: 2,
    backgroundColor: BRAND.colors.primary,
    width: 64,
    marginBottom: 24,
  },
  coverTitle: {
    fontFamily: BRAND.fonts.serif,
    fontSize: 36,
    fontWeight: 600,
    lineHeight: 1.15,
    color: BRAND.colors.ink,
    marginBottom: 12,
  },
  coverShop: {
    fontSize: 18,
    color: BRAND.colors.ink,
    marginBottom: 32,
  },
  coverMetaLabel: {
    fontSize: 9,
    color: BRAND.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  coverMetaValue: {
    fontSize: 11,
    color: BRAND.colors.ink,
    marginBottom: 14,
  },
  coverFootnote: {
    position: "absolute",
    bottom: 40,
    left: 60,
    right: 60,
    fontSize: 9,
    color: BRAND.colors.muted,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.rule,
    paddingTop: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
    marginBottom: 12,
  },
  brandLine: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 12,
    color: BRAND.colors.primary,
  },
  headerMeta: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8,
    color: BRAND.colors.muted,
    textAlign: "right",
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.rule,
    paddingTop: 6,
  },
  footerText: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8,
    color: BRAND.colors.muted,
  },
  sectionHeadingBar: {
    backgroundColor: BRAND.colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  sectionHeading: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 11,
    color: BRAND.colors.paper,
  },
  sectionWrap: {
    marginBottom: 14,
  },
  paragraph: {
    fontSize: 10,
    color: BRAND.colors.ink,
    marginBottom: 6,
    lineHeight: 1.5,
  },
  small: {
    fontSize: 9,
    color: BRAND.colors.muted,
    marginBottom: 4,
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
    gap: 8,
  },
  metric: {
    flexGrow: 1,
    flexBasis: "30%",
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    padding: 8,
    borderRadius: 4,
  },
  metricLabel: {
    fontSize: 8,
    color: BRAND.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    color: BRAND.colors.ink,
    fontWeight: 700,
  },
  metricValuePos: { color: BRAND.colors.primary },
  metricValueNeg: { color: "#B23A1F" },
  monthTable: {
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    marginBottom: 10,
  },
  monthHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#EEF2EE",
  },
  monthRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.rule,
  },
  monthRowAlt: {
    backgroundColor: "#FBFBFA",
  },
  monthRowBold: {
    backgroundColor: "#F0F4F1",
  },
  monthLabelCell: {
    padding: 4,
    fontSize: 8,
    color: BRAND.colors.ink,
    width: 140,
  },
  monthLabelCellBold: {
    fontWeight: 700,
  },
  monthValueCell: {
    padding: 4,
    fontSize: 8,
    color: BRAND.colors.ink,
    flex: 1,
    textAlign: "right",
  },
  monthValueCellNeg: {
    color: "#B23A1F",
  },
  totalsCell: {
    fontWeight: 700,
    backgroundColor: "#EEF2EE",
  },
  chartsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  chartHalf: {
    flex: 1,
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    padding: 6,
    borderRadius: 4,
  },
  chartFull: {
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    padding: 6,
    borderRadius: 4,
    marginBottom: 12,
  },
  chartTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: BRAND.colors.ink,
    marginBottom: 4,
  },
  chartImage: {
    width: "100%",
    height: 140,
    objectFit: "contain",
  },
  chartImageFull: {
    width: "100%",
    height: 220,
    objectFit: "contain",
  },
  assumptionRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
  },
  assumptionLabel: {
    flex: 2,
    fontSize: 9,
    color: BRAND.colors.ink,
  },
  assumptionValue: {
    flex: 1,
    fontSize: 9,
    color: BRAND.colors.ink,
    textAlign: "right",
  },
});

// ── helpers ───────────────────────────────────────────────────────────────────

export function slugify(s: string | null | undefined): string {
  if (!s) return "untitled";
  const slug = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}

export function fmtYyyymmdd(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("");
}

function sliceMonths(slices: MonthlySlice[], year: number): MonthlySlice[] {
  return slices.filter((s) => s.year === year);
}

function fiscalReorder<T>(items: T[], fiscalStart: number): T[] {
  // items are in calendar month order (Jan…Dec). Rotate so fiscal start month
  // is first. items length must equal 12.
  const s = Math.min(12, Math.max(1, Math.round(fiscalStart || 1))) - 1;
  return Array.from({ length: items.length }, (_, i) => items[(s + i) % 12]);
}

type Row = {
  label: string;
  values: number[];
  total?: number;
  bold?: boolean;
  highlight?: boolean;
  negative?: boolean;
};

function MonthTable({
  headers,
  rows,
  showTotal = true,
  totalLabel = "Year",
  code,
}: {
  headers: string[];
  rows: Row[];
  showTotal?: boolean;
  totalLabel?: string;
  code: string;
}) {
  return (
    <View style={styles.monthTable}>
      <View style={styles.monthHeaderRow}>
        <Text style={[styles.monthLabelCell, styles.monthLabelCellBold]}>Line item</Text>
        {headers.map((h, i) => (
          <Text
            key={`${h}-${i}`}
            style={[styles.monthValueCell, styles.monthLabelCellBold]}
          >
            {h}
          </Text>
        ))}
        {showTotal && (
          <Text style={[styles.monthValueCell, styles.monthLabelCellBold]}>{totalLabel}</Text>
        )}
      </View>
      {rows.map((row, i) => {
        const total = row.total ?? row.values.reduce((s, v) => s + v, 0);
        return (
          <View
            key={`${row.label}-${i}`}
            style={[
              styles.monthRow,
              row.bold ? styles.monthRowBold : i % 2 === 1 ? styles.monthRowAlt : {},
            ]}
          >
            <Text
              style={[
                styles.monthLabelCell,
                row.bold ? styles.monthLabelCellBold : {},
              ]}
            >
              {row.label}
            </Text>
            {row.values.map((v, j) => (
              <Text
                key={`v-${j}`}
                style={[
                  styles.monthValueCell,
                  row.bold ? styles.monthLabelCellBold : {},
                  (row.negative || v < 0) ? styles.monthValueCellNeg : {},
                ]}
              >
                {formatMinorUnits(v, code)}
              </Text>
            ))}
            {showTotal && (
              <Text
                style={[
                  styles.monthValueCell,
                  styles.totalsCell,
                  (row.negative || total < 0) ? styles.monthValueCellNeg : {},
                ]}
              >
                {formatMinorUnits(total, code)}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.sectionHeadingBar}>
      <Text style={styles.sectionHeading}>{children}</Text>
    </View>
  );
}

function Header({ shopName, sub }: { shopName: string | null; sub: string }) {
  return (
    <View style={styles.header} fixed>
      <Text style={styles.brandLine}>Groundwork — Financials Report</Text>
      <Text style={styles.headerMeta}>
        {(shopName ?? "Your Coffee Shop")}{"\n"}{sub}
      </Text>
    </View>
  );
}

function Footer({ generatedDate }: { generatedDate: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>Groundwork · Generated {generatedDate}</Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

// ── chart configs (currency-aware axis ticks via prefix on labels) ───────────

function fmtAxis(value: number, code: string): string {
  // Compact for chart axes; uses currency symbol via formatMinorUnits.
  const meta = getCurrencyMeta(code);
  const divisor = Math.pow(10, meta.fractionDigits);
  const v = value / divisor;
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    notation: Math.abs(v) >= 1000 ? "compact" : "standard",
  }).format(v);
}

function revenueChartConfig(
  monthSlices: MonthlySlice[],
  months: string[],
  code: string,
  fiscalStart: number
): ChartConfiguration {
  const orderedSlices = fiscalReorder(monthSlices, fiscalStart);
  const meta = getCurrencyMeta(code);
  const divisor = Math.pow(10, meta.fractionDigits);
  const revenue = orderedSlices.map((s) => s.net_revenue_cents / divisor);
  const cogs = orderedSlices.map((s) => s.total_cogs_cents / divisor);
  const opex = orderedSlices.map(
    (s) =>
      (s.labor_cents +
        s.rent_cents +
        s.marketing_cents +
        s.utilities_cents +
        s.insurance_cents +
        s.tech_cents +
        s.maintenance_cents +
        s.supplies_cents +
        s.other_opex_cents) /
      divisor
  );
  return {
    type: "line",
    data: {
      labels: months,
      datasets: [
        {
          label: `Revenue (${meta.code})`,
          data: revenue,
          borderColor: BRAND.colors.primary,
          backgroundColor: BRAND.colors.primary,
          tension: 0.2,
          pointRadius: 2,
        },
        {
          label: `COGS (${meta.code})`,
          data: cogs,
          borderColor: BRAND.colors.accent,
          backgroundColor: BRAND.colors.accent,
          tension: 0.2,
          pointRadius: 2,
        },
        {
          label: `Operating expenses (${meta.code})`,
          data: opex,
          borderColor: BRAND.colors.muted,
          backgroundColor: BRAND.colors.muted,
          tension: 0.2,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: { position: "bottom" },
        title: { display: true, text: "Year 1 — revenue vs. costs by month" },
      },
      scales: {
        y: {
          ticks: {
            callback: (v) => fmtAxis(Number(v) * divisor, code),
          },
        },
      },
    },
  };
}

function expenseBreakdownConfig(
  monthSlices: MonthlySlice[],
  code: string
): ChartConfiguration {
  const meta = getCurrencyMeta(code);
  const divisor = Math.pow(10, meta.fractionDigits);
  const totals = monthSlices.reduce(
    (acc, s) => {
      acc.cogs += s.total_cogs_cents;
      acc.labor += s.labor_cents;
      acc.rent += s.rent_cents;
      acc.marketing += s.marketing_cents;
      acc.utilities += s.utilities_cents;
      acc.other +=
        s.insurance_cents +
        s.tech_cents +
        s.maintenance_cents +
        s.supplies_cents +
        s.other_opex_cents;
      return acc;
    },
    { cogs: 0, labor: 0, rent: 0, marketing: 0, utilities: 0, other: 0 }
  );
  return {
    type: "doughnut",
    data: {
      labels: ["COGS", "Labor", "Rent", "Marketing", "Utilities", "Other"],
      datasets: [
        {
          data: [
            totals.cogs / divisor,
            totals.labor / divisor,
            totals.rent / divisor,
            totals.marketing / divisor,
            totals.utilities / divisor,
            totals.other / divisor,
          ],
          backgroundColor: [
            BRAND.colors.accent,
            BRAND.colors.primary,
            "#7BAE8A",
            "#C18A1F",
            "#8FA694",
            BRAND.colors.muted,
          ],
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: { position: "right" },
        title: { display: true, text: "Year 1 — expense breakdown" },
      },
    },
  };
}

function cashFlowChartConfig(
  monthSlices: MonthlySlice[],
  months: string[],
  code: string,
  fiscalStart: number
): ChartConfiguration {
  const orderedSlices = fiscalReorder(monthSlices, fiscalStart);
  const meta = getCurrencyMeta(code);
  const divisor = Math.pow(10, meta.fractionDigits);
  const cash = orderedSlices.map((s) => s.cash_cents / divisor);
  const netCash = orderedSlices.map((s) => s.net_cash_cents / divisor);
  return {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        {
          type: "line" as const,
          label: `Ending cash (${meta.code})`,
          data: cash,
          borderColor: BRAND.colors.primary,
          backgroundColor: BRAND.colors.primary,
          tension: 0.2,
          pointRadius: 2,
          yAxisID: "y",
        },
        {
          type: "bar" as const,
          label: `Net cash / month (${meta.code})`,
          data: netCash,
          backgroundColor: BRAND.colors.accent,
          yAxisID: "y",
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: { position: "bottom" },
        title: { display: true, text: "Year 1 — cash flow" },
      },
      scales: {
        y: {
          ticks: {
            callback: (v) => fmtAxis(Number(v) * divisor, code),
          },
        },
      },
    },
  };
}

function breakEvenChartConfig(
  y1Annual: { revenue: number; cogs: number; fixed: number },
  code: string
): ChartConfiguration {
  const meta = getCurrencyMeta(code);
  const divisor = Math.pow(10, meta.fractionDigits);
  const grossMargin = y1Annual.revenue > 0 ? (y1Annual.revenue - y1Annual.cogs) / y1Annual.revenue : 0;
  const breakEvenAnnual =
    grossMargin > 0 ? y1Annual.fixed / grossMargin : 0;
  const maxX = Math.max(y1Annual.revenue, breakEvenAnnual, 1) * 1.5;
  const points = 6;
  const labels: number[] = [];
  const totalCosts: number[] = [];
  const revenue: number[] = [];
  for (let i = 0; i <= points; i++) {
    const x = (maxX * i) / points;
    labels.push(Math.round(x / divisor));
    totalCosts.push(Math.round((y1Annual.fixed + x * (1 - grossMargin)) / divisor));
    revenue.push(Math.round(x / divisor));
  }
  return {
    type: "line",
    data: {
      labels: labels.map((v) =>
        new Intl.NumberFormat(meta.locale, {
          style: "currency",
          currency: meta.code,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
          notation: "compact",
        }).format(v)
      ),
      datasets: [
        {
          label: "Total costs",
          data: totalCosts,
          borderColor: BRAND.colors.muted,
          backgroundColor: BRAND.colors.muted,
          tension: 0,
          pointRadius: 0,
        },
        {
          label: "Revenue",
          data: revenue,
          borderColor: BRAND.colors.primary,
          backgroundColor: BRAND.colors.primary,
          tension: 0,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: { position: "bottom" },
        title: { display: true, text: "Break-even — annual revenue vs. total costs" },
      },
      scales: {
        x: { title: { display: true, text: "Annual revenue" } },
        y: {
          title: { display: true, text: meta.code },
          ticks: {
            callback: (v) =>
              new Intl.NumberFormat(meta.locale, {
                style: "currency",
                currency: meta.code,
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
                notation: "compact",
              }).format(Number(v)),
          },
        },
      },
    },
  };
}

// ── data shaping for each statement ──────────────────────────────────────────

function buildPlRows(year1: MonthlySlice[], fiscalStart: number, code: string): Row[] {
  void code;
  const ordered = fiscalReorder(year1, fiscalStart);
  const rev = ordered.map((s) => s.net_revenue_cents);
  const cogs = ordered.map((s) => -s.total_cogs_cents);
  const grossProfit = ordered.map(
    (s) => s.net_revenue_cents - s.total_cogs_cents
  );
  const labor = ordered.map((s) => -s.labor_cents);
  const rent = ordered.map((s) => -s.rent_cents);
  const marketing = ordered.map((s) => -s.marketing_cents);
  const utilities = ordered.map((s) => -s.utilities_cents);
  const insurance = ordered.map((s) => -s.insurance_cents);
  const tech = ordered.map((s) => -s.tech_cents);
  const maintenance = ordered.map((s) => -s.maintenance_cents);
  const supplies = ordered.map((s) => -s.supplies_cents);
  const otherOpex = ordered.map((s) => -s.other_opex_cents);
  const totalOpex = ordered.map((s) => -s.total_opex_cents);
  const operatingIncome = ordered.map((s) => s.operating_income_cents);
  const depreciation = ordered.map((s) => -s.depreciation_cents);
  const interest = ordered.map((s) => -s.interest_cents);
  const taxes = ordered.map((s) => -s.taxes_cents);
  const netIncome = ordered.map((s) => s.net_income_cents);

  return [
    { label: "Net revenue", values: rev, bold: true, highlight: true },
    { label: "COGS", values: cogs, negative: true },
    { label: "Gross profit", values: grossProfit, bold: true },
    { label: "Labor", values: labor, negative: true },
    { label: "Rent", values: rent, negative: true },
    { label: "Marketing", values: marketing, negative: true },
    { label: "Utilities", values: utilities, negative: true },
    { label: "Insurance", values: insurance, negative: true },
    { label: "Tech / software", values: tech, negative: true },
    { label: "Maintenance", values: maintenance, negative: true },
    { label: "Supplies", values: supplies, negative: true },
    { label: "Other operating", values: otherOpex, negative: true },
    { label: "Total opex", values: totalOpex, negative: true, bold: true },
    { label: "EBITDA", values: operatingIncome, bold: true },
    { label: "Depreciation", values: depreciation, negative: true },
    { label: "Operating income (EBIT)", values: ordered.map((s) => s.ebit_cents), bold: true },
    { label: "Interest", values: interest, negative: true },
    { label: "Taxes", values: taxes, negative: true },
    { label: "Net income", values: netIncome, bold: true, highlight: true },
  ];
}

function buildCashFlowRows(year1: MonthlySlice[], fiscalStart: number): Row[] {
  const ordered = fiscalReorder(year1, fiscalStart);
  return [
    { label: "Net income", values: ordered.map((s) => s.net_income_cents) },
    { label: "Depreciation (non-cash)", values: ordered.map((s) => s.depreciation_cents) },
    {
      label: "Operating cash flow",
      values: ordered.map((s) => s.net_income_cents + s.depreciation_cents),
      bold: true,
    },
    { label: "Capex", values: ordered.map((s) => -s.capex_cents), negative: true },
    { label: "Loan repayment", values: ordered.map((s) => -s.loan_repayment_cents), negative: true },
    {
      label: "Net cash flow",
      values: ordered.map((s) => s.net_cash_cents),
      bold: true,
      highlight: true,
    },
    {
      label: "Ending cash balance",
      values: ordered.map((s) => s.cash_cents),
      bold: true,
    },
  ];
}

function buildBalanceSheetRows(year1: MonthlySlice[], fiscalStart: number): Row[] {
  const ordered = fiscalReorder(year1, fiscalStart);
  return [
    { label: "Cash", values: ordered.map((s) => s.cash_cents) },
    { label: "Accounts receivable", values: ordered.map((s) => s.accounts_receivable_cents) },
    { label: "Inventory", values: ordered.map((s) => s.inventory_cents) },
    { label: "Net fixed assets", values: ordered.map((s) => s.net_fixed_assets_cents) },
    { label: "Other assets", values: ordered.map((s) => s.other_assets_cents) },
    { label: "Total assets", values: ordered.map((s) => s.total_assets_cents), bold: true, highlight: true },
    { label: "Accounts payable", values: ordered.map((s) => s.accounts_payable_cents) },
    { label: "Current debt", values: ordered.map((s) => s.current_debt_cents) },
    { label: "Long-term debt", values: ordered.map((s) => s.long_term_debt_cents) },
    { label: "Total liabilities", values: ordered.map((s) => s.total_liabilities_cents), bold: true },
    { label: "Owner equity", values: ordered.map((s) => s.owner_equity_cents) },
    { label: "Retained earnings", values: ordered.map((s) => s.retained_earnings_cents) },
    { label: "Total equity", values: ordered.map((s) => s.total_equity_cents), bold: true },
    {
      label: "Total liabilities + equity",
      values: ordered.map((s) => s.total_liabilities_and_equity_cents),
      bold: true,
      highlight: true,
    },
  ];
}

// ── annual rollup ────────────────────────────────────────────────────────────

type AnnualRow = {
  label: string;
  values: number[];
  bold?: boolean;
  negative?: boolean;
};

function buildAnnualSummary(slices: MonthlySlice[]): AnnualRow[] {
  const years = [1, 2, 3, 4, 5];
  function sumYear(field: keyof MonthlySlice, year: number): number {
    return slices
      .filter((s) => s.year === year)
      .reduce((acc, s) => acc + ((s[field] as number) ?? 0), 0);
  }
  return [
    {
      label: "Net revenue",
      values: years.map((y) => sumYear("net_revenue_cents", y)),
      bold: true,
    },
    {
      label: "COGS",
      values: years.map((y) => -sumYear("total_cogs_cents", y)),
      negative: true,
    },
    {
      label: "Operating expenses",
      values: years.map((y) => -sumYear("total_opex_cents", y)),
      negative: true,
    },
    {
      label: "Operating income",
      values: years.map((y) => sumYear("operating_income_cents", y)),
      bold: true,
    },
    {
      label: "Net income",
      values: years.map((y) => sumYear("net_income_cents", y)),
      bold: true,
    },
    {
      label: "Ending cash",
      values: years.map((y) => {
        const ys = slices.filter((s) => s.year === y);
        return ys.length > 0 ? ys[ys.length - 1].cash_cents : 0;
      }),
      bold: true,
    },
  ];
}

// ── document ──────────────────────────────────────────────────────────────────

export interface FinancialPlannerPdfProps {
  mp: MonthlyProjections;
  equipment: EquipmentSummary;
  shopName: string | null;
  generatedDate: string;
  charts: {
    revenuePng: Buffer | null;
    expensePng: Buffer | null;
    cashFlowPng: Buffer | null;
    breakEvenPng: Buffer | null;
  };
}

export function FinancialPlannerPdf(props: FinancialPlannerPdfProps) {
  const { mp, equipment, shopName, generatedDate, charts } = props;
  const code = mp.currency_code ?? "USD";
  const meta = getCurrencyMeta(code);
  const fiscalStart = mp.fiscal_year_start_month ?? 1;
  const months = fiscalYearMonthLabels(fiscalStart);

  const slices = computeMonthlySlices(mp, equipment, {});
  const year1 = sliceMonths(slices, 1);

  const annualY1 = year1.reduce(
    (acc, s) => {
      acc.revenue += s.net_revenue_cents;
      acc.cogs += s.total_cogs_cents;
      acc.opex += s.total_opex_cents;
      acc.netIncome += s.net_income_cents;
      return acc;
    },
    { revenue: 0, cogs: 0, opex: 0, netIncome: 0 }
  );
  const endingCash = year1.length > 0 ? year1[year1.length - 1].cash_cents : 0;
  const grossMargin =
    annualY1.revenue > 0
      ? (annualY1.revenue - annualY1.cogs) / annualY1.revenue
      : 0;
  const breakEvenAnnual = grossMargin > 0 ? annualY1.opex / grossMargin : 0;

  const yearHeaders = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
  const annualRows = buildAnnualSummary(slices);
  const plRows = buildPlRows(year1, fiscalStart, code);
  const cfRows = buildCashFlowRows(year1, fiscalStart);
  const bsRows = buildBalanceSheetRows(year1, fiscalStart);

  return (
    <Document creator="Groundwork" producer="Groundwork">
      {/* Cover (portrait) */}
      <Page size="A4" style={styles.coverPage}>
        <Text style={styles.coverEyebrow}>GROUNDWORK · FINANCIAL PLANNER</Text>
        <View style={styles.coverRule} />
        <Text style={styles.coverTitle}>Financials report</Text>
        <Text style={styles.coverShop}>{shopName ?? "Your coffee shop"}</Text>

        <Text style={styles.coverMetaLabel}>Generated</Text>
        <Text style={styles.coverMetaValue}>{generatedDate}</Text>

        <Text style={styles.coverMetaLabel}>Currency</Text>
        <Text style={styles.coverMetaValue}>
          {meta.code} — {meta.name}
        </Text>

        <Text style={styles.coverMetaLabel}>Fiscal year starts</Text>
        <Text style={styles.coverMetaValue}>{months[0]}</Text>

        <Text style={styles.coverMetaLabel}>Year 1 net revenue</Text>
        <Text style={styles.coverMetaValue}>
          {formatMinorUnits(annualY1.revenue, code)}
        </Text>

        <Text style={styles.coverMetaLabel}>Year 1 net income</Text>
        <Text style={styles.coverMetaValue}>
          {(annualY1.netIncome >= 0 ? "+" : "-") +
            formatMinorUnits(Math.abs(annualY1.netIncome), code)}
        </Text>

        <Text style={styles.coverMetaLabel}>Year 1 ending cash</Text>
        <Text style={styles.coverMetaValue}>
          {formatMinorUnits(endingCash, code)}
        </Text>

        <Text style={styles.coverFootnote}>
          Projections derived from the Financial Planner Suite using the
          assumptions and forecast lines you entered. Numbers honor the selected
          currency and fiscal-year start. Review assumptions before sharing with
          lenders or investors.
        </Text>
      </Page>

      {/* Annual summary (portrait) */}
      <Page size="A4" style={styles.pagePortrait}>
        <Header shopName={shopName} sub="Annual summary" />
        <SectionHeading>Executive summary</SectionHeading>
        <View style={styles.metricRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Year 1 revenue</Text>
            <Text style={styles.metricValue}>
              {formatMinorUnits(annualY1.revenue, code)}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Year 1 net income</Text>
            <Text
              style={[
                styles.metricValue,
                annualY1.netIncome >= 0
                  ? styles.metricValuePos
                  : styles.metricValueNeg,
              ]}
            >
              {(annualY1.netIncome >= 0 ? "+" : "-") +
                formatMinorUnits(Math.abs(annualY1.netIncome), code)}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Gross margin</Text>
            <Text style={styles.metricValue}>
              {Math.round(grossMargin * 100)}%
            </Text>
          </View>
        </View>
        <View style={styles.metricRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Ending Cash (Year 1)</Text>
            <Text style={styles.metricValue}>
              {formatMinorUnits(endingCash, code)}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Break-even revenue (annual)</Text>
            <Text style={styles.metricValue}>
              {breakEvenAnnual > 0
                ? formatMinorUnits(breakEvenAnnual, code)
                : "—"}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Currency</Text>
            <Text style={styles.metricValue}>{meta.code}</Text>
          </View>
        </View>

        <SectionHeading>5-year summary</SectionHeading>
        <MonthTable
          headers={yearHeaders}
          rows={annualRows}
          showTotal={false}
          code={code}
        />

        <Footer generatedDate={generatedDate} />
      </Page>

      {/* Monthly P&L (landscape) */}
      <Page size="A4" orientation="landscape" style={styles.pageLandscape}>
        <Header shopName={shopName} sub="Year 1 — Monthly P&L" />
        <SectionHeading>Year 1 — monthly profit & loss</SectionHeading>
        <MonthTable
          headers={months}
          rows={plRows}
          totalLabel="Year 1"
          code={code}
        />
        <Footer generatedDate={generatedDate} />
      </Page>

      {/* Monthly Cash Flow (landscape) */}
      <Page size="A4" orientation="landscape" style={styles.pageLandscape}>
        <Header shopName={shopName} sub="Year 1 — Monthly cash flow" />
        <SectionHeading>Year 1 — monthly cash flow</SectionHeading>
        <MonthTable
          headers={months}
          rows={cfRows}
          totalLabel="Year 1"
          code={code}
        />
        <Footer generatedDate={generatedDate} />
      </Page>

      {/* Monthly Balance Sheet (landscape) */}
      <Page size="A4" orientation="landscape" style={styles.pageLandscape}>
        <Header shopName={shopName} sub="Year 1 — Monthly balance sheet" />
        <SectionHeading>Year 1 — monthly balance sheet (end of month)</SectionHeading>
        <MonthTable
          headers={months}
          rows={bsRows}
          showTotal={false}
          code={code}
        />
        <Footer generatedDate={generatedDate} />
      </Page>

      {/* Charts (landscape) */}
      <Page size="A4" orientation="landscape" style={styles.pageLandscape}>
        <Header shopName={shopName} sub="Year 1 — charts" />
        <SectionHeading>Year 1 — visualizations</SectionHeading>
        {charts.revenuePng && (
          <View style={styles.chartFull}>
            <Text style={styles.chartTitle}>Revenue vs. costs</Text>
            <Image
              src={`data:image/png;base64,${charts.revenuePng.toString("base64")}`}
              style={styles.chartImageFull}
            />
          </View>
        )}
        <View style={styles.chartsRow}>
          {charts.expensePng && (
            <View style={styles.chartHalf}>
              <Text style={styles.chartTitle}>Expense breakdown</Text>
              <Image
                src={`data:image/png;base64,${charts.expensePng.toString("base64")}`}
                style={styles.chartImage}
              />
            </View>
          )}
          {charts.cashFlowPng && (
            <View style={styles.chartHalf}>
              <Text style={styles.chartTitle}>Cash flow</Text>
              <Image
                src={`data:image/png;base64,${charts.cashFlowPng.toString("base64")}`}
                style={styles.chartImage}
              />
            </View>
          )}
        </View>
        {charts.breakEvenPng && (
          <View style={styles.chartFull}>
            <Text style={styles.chartTitle}>Break-even analysis</Text>
            <Image
              src={`data:image/png;base64,${charts.breakEvenPng.toString("base64")}`}
              style={styles.chartImageFull}
            />
          </View>
        )}
        <Footer generatedDate={generatedDate} />
      </Page>

      {/* Assumptions (portrait) */}
      <Page size="A4" style={styles.pagePortrait}>
        <Header shopName={shopName} sub="Assumptions" />
        <SectionHeading>Assumptions</SectionHeading>
        <View style={styles.assumptionRow}>
          <Text style={styles.assumptionLabel}>Currency</Text>
          <Text style={styles.assumptionValue}>
            {meta.code} — {meta.name}
          </Text>
        </View>
        <View style={styles.assumptionRow}>
          <Text style={styles.assumptionLabel}>Fiscal year starts</Text>
          <Text style={styles.assumptionValue}>{months[0]}</Text>
        </View>
        <View style={styles.assumptionRow}>
          <Text style={styles.assumptionLabel}>Average ticket</Text>
          <Text style={styles.assumptionValue}>
            {formatMinorUnits(mp.avg_ticket_cents, code)}
          </Text>
        </View>
        <View style={styles.assumptionRow}>
          <Text style={styles.assumptionLabel}>Base COGS rate</Text>
          <Text style={styles.assumptionValue}>{mp.cogs_pct}%</Text>
        </View>
        <View style={styles.assumptionRow}>
          <Text style={styles.assumptionLabel}>Tax rate</Text>
          <Text style={styles.assumptionValue}>{mp.taxes_pct}%</Text>
        </View>
        <View style={styles.assumptionRow}>
          <Text style={styles.assumptionLabel}>Revenue ramp (months)</Text>
          <Text style={styles.assumptionValue}>{mp.ramp_months}</Text>
        </View>
        <View style={styles.assumptionRow}>
          <Text style={styles.assumptionLabel}>Growth mode</Text>
          <Text style={styles.assumptionValue}>
            {mp.growth_mode === "simple"
              ? `Simple ${mp.growth_monthly_pct}%/mo`
              : "Custom"}
          </Text>
        </View>

        <View style={{ height: 8 }} />
        <SectionHeading>Weekly schedule & traffic</SectionHeading>
        {(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((d) => {
          const sched = mp.weekly_schedule[d];
          const flow = mp.daily_flow[d] ?? 0;
          return (
            <View style={styles.assumptionRow} key={d}>
              <Text style={styles.assumptionLabel}>{d.toUpperCase()}</Text>
              <Text style={styles.assumptionValue}>
                {sched.open
                  ? `${sched.open_time}–${sched.close_time} · ${flow} customers`
                  : "Closed"}
              </Text>
            </View>
          );
        })}

        <View style={{ height: 8 }} />
        <SectionHeading>Forecast lines</SectionHeading>
        {mp.forecast_lines.length === 0 && (
          <Text style={styles.paragraph}>No custom forecast lines configured.</Text>
        )}
        {mp.forecast_lines.map((line) => {
          const valueDisplay =
            line.mode === "pct"
              ? `${line.value}% of revenue`
              : formatMinorUnits(line.value, code) + "/mo";
          const ramp = line.ramp?.enabled
            ? ` · ramp ${line.ramp.ramp_months} mo from ${line.ramp.start_pct}%`
            : "";
          const growth = line.growth?.enabled
            ? ` · growth ${line.growth.monthly_pct}%/mo`
            : "";
          return (
            <View style={styles.assumptionRow} key={line.id}>
              <Text style={styles.assumptionLabel}>
                {line.label}
                {"  "}
                <Text style={styles.small}>({line.category})</Text>
              </Text>
              <Text style={styles.assumptionValue}>
                {valueDisplay}
                {ramp}
                {growth}
              </Text>
            </View>
          );
        })}

        <Footer generatedDate={generatedDate} />
      </Page>
    </Document>
  );
}

// ── chart rendering helper ───────────────────────────────────────────────────

export async function renderPlannerCharts(
  mp: MonthlyProjections,
  equipment: EquipmentSummary
): Promise<FinancialPlannerPdfProps["charts"]> {
  const code = mp.currency_code ?? "USD";
  const fiscalStart = mp.fiscal_year_start_month ?? 1;
  const months = fiscalYearMonthLabels(fiscalStart);

  const slices = computeMonthlySlices(mp, equipment, {});
  const year1 = sliceMonths(slices, 1);
  if (year1.length === 0) {
    return {
      revenuePng: null,
      expensePng: null,
      cashFlowPng: null,
      breakEvenPng: null,
    };
  }

  const annualY1 = year1.reduce(
    (acc, s) => {
      acc.revenue += s.net_revenue_cents;
      acc.cogs += s.total_cogs_cents;
      acc.fixed += s.total_opex_cents;
      return acc;
    },
    { revenue: 0, cogs: 0, fixed: 0 }
  );

  async function safe(cfg: ChartConfiguration, w = 1100, h = 480): Promise<Buffer | null> {
    try {
      return await chartToPng({ config: cfg, width: w, height: h });
    } catch {
      return null;
    }
  }

  const [revenuePng, expensePng, cashFlowPng, breakEvenPng] = await Promise.all([
    safe(revenueChartConfig(year1, months, code, fiscalStart), 1100, 440),
    safe(expenseBreakdownConfig(year1, code), 700, 440),
    safe(cashFlowChartConfig(year1, months, code, fiscalStart), 700, 440),
    safe(breakEvenChartConfig(annualY1, code), 1100, 440),
  ]);

  return { revenuePng, expensePng, cashFlowPng, breakEvenPng };
}
