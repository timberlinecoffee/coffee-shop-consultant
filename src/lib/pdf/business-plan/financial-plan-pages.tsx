// TIM-1496: Financial Plan sub-block PDF pages matching YYC Coffee School layout.
// All numbers sourced from MonthlySlice / MonthlyProjections — no LLM calls.
// No em dashes in user-facing copy (voice mandate).

import React from "react";
import { Page, View, Text, StyleSheet, Svg, Rect } from "@react-pdf/renderer";
import { BRAND, type BrandTokens } from "../brand";
import { PdfHeader } from "../components/PdfHeader";
import { PdfFooter } from "../components/PdfFooter";
import { formatMinorUnits } from "@/lib/currency";
import type { MonthlyProjections, MonthlySlice, EquipmentSummary, FundingSourceLine } from "@/lib/financial-projection";
import { computeMonthlySlices, fiscalYearMonthLabels } from "@/lib/financial-projection";
import type { FinancialDocumentVisibility } from "@/lib/business-plan-financials";

// ── Shared styles ─────────────────────────────────────────────────────────────

function makeSharedStyles(brand: BrandTokens) {
  return StyleSheet.create({
    pagePortrait: {
      fontFamily: brand.fonts.sans,
      fontSize: 9,
      color: brand.colors.ink,
      backgroundColor: brand.colors.paper,
      paddingTop: 28,
      paddingBottom: 44,
      paddingLeft: 36,
      paddingRight: 36,
    },
    pageLandscape: {
      fontFamily: brand.fonts.sans,
      fontSize: 9,
      color: brand.colors.ink,
      backgroundColor: brand.colors.paper,
      paddingTop: 28,
      paddingBottom: 44,
      paddingLeft: 28,
      paddingRight: 28,
    },
    headingBar: {
      backgroundColor: brand.colors.primary,
      paddingHorizontal: 8,
      paddingVertical: 5,
      marginBottom: 10,
    },
    heading: {
      fontFamily: brand.fonts.sans,
      fontWeight: 700,
      fontSize: 11,
      color: brand.colors.paper,
    },
    subHeading: {
      fontFamily: brand.fonts.sans,
      fontWeight: 700,
      fontSize: 9,
      color: brand.colors.primary,
      marginTop: 10,
      marginBottom: 4,
    },
    body: {
      fontSize: 9,
      color: brand.colors.ink,
      lineHeight: 1.5,
      marginBottom: 4,
    },
    bullet: {
      fontSize: 9,
      color: brand.colors.ink,
      lineHeight: 1.4,
      marginBottom: 2,
      paddingLeft: 8,
    },
    // 3-column annual statement table
    annualTable: {
      borderWidth: 1,
      borderColor: brand.colors.rule,
      marginBottom: 12,
    },
    annualHeaderRow: {
      flexDirection: "row",
      backgroundColor: brand.colors.primary,
    },
    annualRow: {
      flexDirection: "row",
      borderTopWidth: 0.5,
      borderTopColor: brand.colors.rule,
    },
    annualRowAlt: {
      backgroundColor: "#F8F9F8",
    },
    annualRowBold: {
      backgroundColor: "#EEF3EE",
    },
    annualRowSubhead: {
      backgroundColor: "#F0F4F0",
    },
    annualLabelCell: {
      paddingHorizontal: 6,
      paddingVertical: 3,
      fontSize: 8,
      color: brand.colors.ink,
      width: 160,
    },
    annualLabelCellIndent: {
      paddingLeft: 16,
    },
    annualLabelBold: {
      fontWeight: 700,
    },
    annualLabelMuted: {
      color: brand.colors.muted,
      fontSize: 7,
    },
    annualValueCell: {
      paddingHorizontal: 6,
      paddingVertical: 3,
      fontSize: 8,
      color: brand.colors.ink,
      flex: 1,
      textAlign: "right",
    },
    annualValueBold: {
      fontWeight: 700,
    },
    annualValueNeg: {
      color: "#B04040",
    },
    annualHeaderText: {
      paddingHorizontal: 6,
      paddingVertical: 3,
      fontSize: 8,
      fontWeight: 700,
      color: brand.colors.paper,
      flex: 1,
      textAlign: "right",
    },
    annualHeaderLabel: {
      paddingHorizontal: 6,
      paddingVertical: 3,
      fontSize: 8,
      fontWeight: 700,
      color: brand.colors.paper,
      width: 160,
    },
    // Funding table
    fundTable: {
      borderWidth: 1,
      borderColor: brand.colors.rule,
      marginBottom: 12,
    },
    fundHeaderRow: {
      flexDirection: "row",
      backgroundColor: brand.colors.rule,
    },
    fundRow: {
      flexDirection: "row",
      borderTopWidth: 0.5,
      borderTopColor: brand.colors.rule,
    },
    fundRowAlt: {
      backgroundColor: "#F8F9F8",
    },
    fundRowTotal: {
      backgroundColor: "#EEF3EE",
    },
    fundLabelCell: {
      paddingHorizontal: 6,
      paddingVertical: 4,
      fontSize: 8,
      color: brand.colors.ink,
      flex: 2,
    },
    fundValueCell: {
      paddingHorizontal: 6,
      paddingVertical: 4,
      fontSize: 8,
      color: brand.colors.ink,
      flex: 1,
      textAlign: "right",
    },
    fundValueBold: {
      fontWeight: 700,
    },
    // Monthly table (reuse from parent)
    table: {
      borderWidth: 1,
      borderColor: brand.colors.rule,
      marginBottom: 10,
    },
    tableHeaderRow: {
      flexDirection: "row",
      backgroundColor: brand.colors.rule,
    },
    tableRow: {
      flexDirection: "row",
      borderTopWidth: 1,
      borderTopColor: brand.colors.rule,
    },
    tableRowAlt: {
      backgroundColor: "#F8F9F8",
    },
    tableRowBold: {
      backgroundColor: "#EEF3EE",
    },
    labelCell: {
      padding: 4,
      fontSize: 8,
      color: brand.colors.ink,
      width: 140,
    },
    labelCellBold: {
      fontWeight: 700,
    },
    valueCell: {
      padding: 4,
      fontSize: 8,
      color: brand.colors.ink,
      flex: 1,
      textAlign: "right",
    },
    valueCellBold: {
      fontWeight: 700,
    },
    valueCellNeg: {
      color: "#B04040",
    },
    totalCell: {
      fontWeight: 700,
      backgroundColor: "#DDE8DD",
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number, code: string): string {
  return formatMinorUnits(cents, code);
}

function pct(a: number, b: number): string {
  if (b === 0) return "0.0%";
  return `${((a / b) * 100).toFixed(1)}%`;
}

function sumYear(slices: MonthlySlice[], yr: number, field: keyof MonthlySlice): number {
  return slices
    .filter((s) => s.year === yr)
    .reduce((acc, s) => acc + ((s[field] as number) ?? 0), 0);
}

function lastMonthOfYear(slices: MonthlySlice[], yr: number): MonthlySlice | undefined {
  const yr_slices = slices.filter((s) => s.year === yr);
  return yr_slices[yr_slices.length - 1];
}

function fiscalReorder<T>(items: T[], fiscalStart: number): T[] {
  const s = Math.min(12, Math.max(1, Math.round(fiscalStart || 1))) - 1;
  return Array.from({ length: items.length }, (_, i) => items[(s + i) % 12]);
}

// ── SVG Bar Chart ─────────────────────────────────────────────────────────────

function BarChart({
  values,
  width,
  height,
  barColor,
  negativeColor,
  brand,
}: {
  values: number[];
  width: number;
  height: number;
  barColor: string;
  negativeColor: string;
  brand: BrandTokens;
}) {
  const max = Math.max(...values.map(Math.abs), 1);
  const n = values.length;
  const barW = (width / n) * 0.65;
  const gap = (width / n) * 0.35;
  const zeroY = height / 2;

  return (
    <Svg width={width} height={height}>
      {/* Zero axis */}
      <Rect x={0} y={zeroY} width={width} height={0.5} fill={brand.colors.rule} />
      {values.map((v, i) => {
        const barH = Math.max(1, (Math.abs(v) / max) * (height / 2 - 2));
        const x = i * (barW + gap) + gap / 2;
        const fill = v >= 0 ? barColor : negativeColor;
        const y = v >= 0 ? zeroY - barH : zeroY;
        return <Rect key={i} x={x} y={y} width={barW} height={barH} fill={fill} />;
      })}
    </Svg>
  );
}

function RevenueBarChart({
  values,
  width,
  height,
  brand,
}: {
  values: number[];
  width: number;
  height: number;
  brand: BrandTokens;
}) {
  const max = Math.max(...values, 1);
  const n = values.length;
  const barW = (width / n) * 0.65;
  const gap = (width / n) * 0.35;

  return (
    <Svg width={width} height={height}>
      {values.map((v, i) => {
        const barH = Math.max(1, (v / max) * (height - 4));
        const x = i * (barW + gap) + gap / 2;
        const y = height - barH;
        return <Rect key={i} x={x} y={y} width={barW} height={barH} fill={brand.colors.primary} />;
      })}
    </Svg>
  );
}

function YearBarChart({
  values,
  labels,
  width,
  height,
  code,
  brand,
}: {
  values: number[];
  labels: string[];
  width: number;
  height: number;
  code: string;
  brand: BrandTokens;
}) {
  const max = Math.max(...values.map(Math.abs), 1);
  const n = values.length;
  const barW = (width / n) * 0.5;
  const gap = (width / n) * 0.5;
  const chartH = height - 20;

  return (
    <View>
      <Svg width={width} height={height}>
        {/* Zero line */}
        <Rect x={0} y={chartH / 2} width={width} height={0.5} fill={brand.colors.rule} />
        {values.map((v, i) => {
          const barH = Math.max(1, (Math.abs(v) / max) * (chartH / 2 - 4));
          const x = i * (barW + gap) + gap / 2;
          const fill = v >= 0 ? brand.colors.primary : "#B04040";
          const y = v >= 0 ? chartH / 2 - barH : chartH / 2;
          return <Rect key={i} x={x} y={y} width={barW} height={barH} fill={fill} />;
        })}
      </Svg>
      {/* Labels below chart */}
      <View style={{ flexDirection: "row" }}>
        {labels.map((label, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 7, color: brand.colors.muted }}>{label}</Text>
            <Text style={{ fontSize: 7, color: brand.colors.ink, fontWeight: 700 }}>
              {fmt(values[i], code)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── 3-Column Annual Table ─────────────────────────────────────────────────────

type AnnualRow = {
  label: string;
  values: [number, number, number] | null; // null = sub-heading row
  bold?: boolean;
  indent?: boolean;
  isPct?: boolean; // render as percentage string
  pctBase?: [number, number, number]; // denominator for pct rows
  muted?: boolean;
  separator?: boolean; // blank separator row
};

function AnnualTable({
  title,
  colHeaders,
  rows,
  code,
  brand,
}: {
  title: string;
  colHeaders: [string, string, string];
  rows: AnnualRow[];
  code: string;
  brand: BrandTokens;
}) {
  const SP = makeSharedStyles(brand);
  return (
    <View>
      <View style={SP.headingBar}>
        <Text style={SP.heading}>{title}</Text>
      </View>
      <View style={SP.annualTable}>
        {/* Header */}
        <View style={SP.annualHeaderRow}>
          <Text style={SP.annualHeaderLabel}></Text>
          {colHeaders.map((h, i) => (
            <Text key={i} style={SP.annualHeaderText}>{h}</Text>
          ))}
        </View>
        {/* Rows */}
        {rows.map((row, i) => {
          if (row.separator) {
            return (
              <View key={i} style={[SP.annualRow, { height: 4 }]} />
            );
          }
          if (row.values === null) {
            // Sub-heading
            return (
              <View key={i} style={[SP.annualRow, SP.annualRowSubhead]}>
                <Text style={[SP.annualLabelCell, SP.annualLabelBold]}>
                  {row.label}
                </Text>
                <Text style={SP.annualValueCell} />
                <Text style={SP.annualValueCell} />
                <Text style={SP.annualValueCell} />
              </View>
            );
          }
          const isNeg = row.values.some((v) => v < 0);
          return (
            <View
              key={i}
              style={[
                SP.annualRow,
                row.bold ? SP.annualRowBold : i % 2 === 1 ? SP.annualRowAlt : {},
              ]}
            >
              <Text
                style={[
                  SP.annualLabelCell,
                  row.indent ? SP.annualLabelCellIndent : {},
                  row.bold ? SP.annualLabelBold : {},
                  row.muted ? SP.annualLabelMuted : {},
                ]}
              >
                {row.label}
              </Text>
              {row.values.map((v, j) => {
                const display = row.isPct
                  ? pct(v, (row.pctBase ?? [1, 1, 1])[j])
                  : fmt(v, code);
                return (
                  <Text
                    key={j}
                    style={[
                      SP.annualValueCell,
                      row.bold ? SP.annualValueBold : {},
                      (isNeg || v < 0) && !row.isPct ? SP.annualValueNeg : {},
                    ]}
                  >
                    {display}
                  </Text>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Key Assumptions Page ──────────────────────────────────────────────────────

export function KeyAssumptionsPage({
  mp,
  shopName,
  date,
  brand = BRAND,
  cogsGrandTotalMonthlyCents,
}: {
  mp: MonthlyProjections;
  shopName: string;
  date: string;
  brand?: BrandTokens;
  cogsGrandTotalMonthlyCents?: number | null;
}) {
  const SP = makeSharedStyles(brand);
  const openDays = Object.entries(mp.weekly_schedule).filter(([, d]) => d.open);
  const daysPerWeek = openDays.length;
  const avgTicket = mp.avg_ticket_cents;
  const weeklyCustomers = Object.entries(mp.daily_flow)
    .filter(([d]) => mp.weekly_schedule[d as keyof typeof mp.weekly_schedule]?.open)
    .reduce((s, [, v]) => s + (v as number), 0);

  const fteCount = mp.personnel
    ? mp.personnel.filter((p) => p.pay_basis !== "hourly").length
    : 0;
  const ptCount = mp.personnel
    ? mp.personnel.filter((p) => p.pay_basis === "hourly").length
    : 0;

  const rampMonths = mp.ramp_months ?? 0;
  const growthPct = mp.growth_monthly_pct ?? 0;

  const startup = mp.startup_costs;
  const totalStartup = startup
    ? startup.buildout_cents + startup.equipment_cents + startup.deposits_cents +
      startup.licenses_cents + startup.pre_opening_marketing_cents +
      startup.initial_inventory_cents + startup.startup_supplies_cents +
      startup.professional_fees_cents + startup.working_capital_reserve_cents +
      startup.opening_cash_buffer_cents
    : 0;

  const totalFunding = (mp.funding_sources ?? []).reduce((s, f) => s + f.amount_cents, 0);

  const code = mp.currency_code ?? "USD";

  const assumptions: string[] = [
    `Average ticket: ${fmt(avgTicket, code)} per customer`,
    `Daily customer target: ${weeklyCustomers} per week (${daysPerWeek} operating days/week)`,
    rampMonths > 0
      ? `Ramp period: ${rampMonths} months to reach projected capacity`
      : "No ramp period modeled (full capacity from month 1)",
    growthPct > 0
      ? `Revenue growth: ${growthPct.toFixed(1)}% per month after ramp`
      : "Flat revenue model after ramp",
    fteCount > 0 || ptCount > 0
      ? `Staffing: ${fteCount} salaried + ${ptCount} hourly team members`
      : "Staffing plan not yet entered in Financials workspace",
    totalStartup > 0
      ? `Total startup investment: ${fmt(totalStartup, code)}`
      : "Startup costs not yet entered",
    totalFunding > 0
      ? `Total funding: ${fmt(totalFunding, code)}`
      : "Funding sources not yet entered",
    typeof cogsGrandTotalMonthlyCents === "number" && cogsGrandTotalMonthlyCents > 0
      ? `COGS: from menu costing and additional items (centralized Grand Total)`
      : `COGS rate: ${mp.cogs_pct.toFixed(1)}% of revenue (base assumption)`,
    mp.income_tax_pct > 0
      ? `Income tax rate: ${mp.income_tax_pct.toFixed(1)}%`
      : "Income tax not modeled",
  ];

  return (
    <Page size={brand.page.size} style={SP.pagePortrait}>
      <PdfHeader shopName={shopName} workspaceName="Financial Plan" brand={brand} />
      <View style={SP.headingBar}>
        <Text style={SP.heading}>Key Assumptions</Text>
      </View>
      <Text style={[SP.body, { marginBottom: 10 }]}>
        The projections in this financial plan are built on the following operating assumptions.
        All numbers are derived from inputs in the Financials workspace and reflect management
        expectations for the business. Actual results will vary based on market conditions,
        execution, and timing.
      </Text>
      <Text style={SP.subHeading}>Operating Assumptions</Text>
      {assumptions.map((a, i) => (
        <Text key={i} style={SP.bullet}>
          {"•"} {a}
        </Text>
      ))}
      <PdfFooter generatedDate={date} brand={brand} />
    </Page>
  );
}

// ── Revenue by Month Page ─────────────────────────────────────────────────────

export function RevenueByMonthPage({
  slices,
  mp,
  shopName,
  date,
  brand = BRAND,
}: {
  slices: MonthlySlice[];
  mp: MonthlyProjections;
  shopName: string;
  date: string;
  brand?: BrandTokens;
}) {
  const SP = makeSharedStyles(brand);
  const code = mp.currency_code ?? "USD";
  const fiscalStart = mp.fiscal_year_start_month ?? 1;
  const months = fiscalYearMonthLabels(fiscalStart);
  const year1 = slices.filter((s) => s.year === 1);
  const ordered = fiscalReorder(year1, fiscalStart);
  const values = ordered.map((s) => s.net_revenue_cents);

  return (
    <Page size="A4" orientation="landscape" style={SP.pageLandscape}>
      <PdfHeader shopName={shopName} workspaceName="Financial Plan" brand={brand} />
      <View style={SP.headingBar}>
        <Text style={SP.heading}>Revenue by Month (Year 1)</Text>
      </View>

      {/* Bar chart */}
      <View style={{ marginBottom: 10 }}>
        <RevenueBarChart values={values} width={790} height={80} brand={brand} />
      </View>

      {/* Month labels under chart */}
      <View style={{ flexDirection: "row", marginBottom: 8 }}>
        {months.map((m, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 6, color: brand.colors.muted }}>{m}</Text>
          </View>
        ))}
      </View>

      {/* Table */}
      <View style={SP.table}>
        <View style={SP.tableHeaderRow}>
          <Text style={[SP.labelCell, SP.labelCellBold]}>Line item</Text>
          {months.map((h, i) => (
            <Text key={i} style={[SP.valueCell, SP.valueCellBold]}>{h}</Text>
          ))}
          <Text style={[SP.valueCell, SP.valueCellBold]}>Total</Text>
        </View>
        {[
          { label: "Gross Revenue", values: ordered.map((s) => s.gross_revenue_cents), bold: false },
          { label: "Loyalty Discounts", values: ordered.map((s) => -s.loyalty_discounts_cents), bold: false },
          { label: "Net Revenue", values: ordered.map((s) => s.net_revenue_cents), bold: true },
        ].map((row, i) => {
          const total = row.values.reduce((s, v) => s + v, 0);
          return (
            <View
              key={i}
              style={[SP.tableRow, row.bold ? SP.tableRowBold : i % 2 === 1 ? SP.tableRowAlt : {}]}
            >
              <Text style={[SP.labelCell, row.bold ? SP.labelCellBold : {}]}>{row.label}</Text>
              {row.values.map((v, j) => (
                <Text key={j} style={[SP.valueCell, row.bold ? SP.valueCellBold : {}, v < 0 ? SP.valueCellNeg : {}]}>
                  {fmt(v, code)}
                </Text>
              ))}
              <Text style={[SP.valueCell, SP.totalCell, total < 0 ? SP.valueCellNeg : {}]}>
                {fmt(total, code)}
              </Text>
            </View>
          );
        })}
      </View>

      <PdfFooter generatedDate={date} brand={brand} />
    </Page>
  );
}

// ── Expenses by Month Page ────────────────────────────────────────────────────

export function ExpensesByMonthPage({
  slices,
  mp,
  shopName,
  date,
  brand = BRAND,
}: {
  slices: MonthlySlice[];
  mp: MonthlyProjections;
  shopName: string;
  date: string;
  brand?: BrandTokens;
}) {
  const SP = makeSharedStyles(brand);
  const code = mp.currency_code ?? "USD";
  const fiscalStart = mp.fiscal_year_start_month ?? 1;
  const months = fiscalYearMonthLabels(fiscalStart);
  const year1 = slices.filter((s) => s.year === 1);
  const ordered = fiscalReorder(year1, fiscalStart);
  const expenseValues = ordered.map((s) => s.total_cogs_cents + s.total_opex_cents);

  return (
    <Page size="A4" orientation="landscape" style={SP.pageLandscape}>
      <PdfHeader shopName={shopName} workspaceName="Financial Plan" brand={brand} />
      <View style={SP.headingBar}>
        <Text style={SP.heading}>Expenses by Month (Year 1)</Text>
      </View>

      {/* Bar chart */}
      <View style={{ marginBottom: 10 }}>
        <RevenueBarChart values={expenseValues} width={790} height={80} brand={brand} />
      </View>

      {/* Month labels */}
      <View style={{ flexDirection: "row", marginBottom: 8 }}>
        {months.map((m, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 6, color: brand.colors.muted }}>{m}</Text>
          </View>
        ))}
      </View>

      {/* Table */}
      <View style={SP.table}>
        <View style={SP.tableHeaderRow}>
          <Text style={[SP.labelCell, SP.labelCellBold]}>Expense</Text>
          {months.map((h, i) => (
            <Text key={i} style={[SP.valueCell, SP.valueCellBold]}>{h}</Text>
          ))}
          <Text style={[SP.valueCell, SP.valueCellBold]}>Total</Text>
        </View>
        {[
          { label: "Direct Costs (COGS)", values: ordered.map((s) => s.total_cogs_cents), bold: false },
          { label: "Labor", values: ordered.map((s) => s.labor_cents), bold: false },
          { label: "Monthly Rent", values: ordered.map((s) => s.rent_cents), bold: false },
          { label: "Marketing & Ads", values: ordered.map((s) => s.marketing_cents), bold: false },
          { label: "Utilities", values: ordered.map((s) => s.utilities_cents), bold: false },
          { label: "Insurance", values: ordered.map((s) => s.insurance_cents), bold: false },
          { label: "Website", values: ordered.map((s) => s.tech_cents), bold: false },
          { label: "Maintenance", values: ordered.map((s) => s.maintenance_cents), bold: false },
          { label: "Supplies", values: ordered.map((s) => s.supplies_cents), bold: false },
          { label: "Other Operating", values: ordered.map((s) => s.other_opex_cents), bold: false },
          { label: "Total Expenses", values: ordered.map((s) => s.total_cogs_cents + s.total_opex_cents), bold: true },
        ].map((row, i) => {
          const total = row.values.reduce((s, v) => s + v, 0);
          return (
            <View
              key={i}
              style={[SP.tableRow, row.bold ? SP.tableRowBold : i % 2 === 1 ? SP.tableRowAlt : {}]}
            >
              <Text style={[SP.labelCell, row.bold ? SP.labelCellBold : {}]}>{row.label}</Text>
              {row.values.map((v, j) => (
                <Text key={j} style={[SP.valueCell, row.bold ? SP.valueCellBold : {}]}>
                  {fmt(v, code)}
                </Text>
              ))}
              <Text style={[SP.valueCell, SP.totalCell]}>{fmt(total, code)}</Text>
            </View>
          );
        })}
      </View>

      <PdfFooter generatedDate={date} brand={brand} />
    </Page>
  );
}

// ── Net Profit by Year Page ───────────────────────────────────────────────────

export function NetProfitByYearPage({
  slices,
  mp,
  shopName,
  date,
  brand = BRAND,
}: {
  slices: MonthlySlice[];
  mp: MonthlyProjections;
  shopName: string;
  date: string;
  brand?: BrandTokens;
}) {
  const SP = makeSharedStyles(brand);
  const code = mp.currency_code ?? "USD";
  const years = [1, 2, 3, 4, 5];
  const revenues = years.map((y) => sumYear(slices, y, "net_revenue_cents"));
  const netProfits = years.map((y) => sumYear(slices, y, "net_income_cents"));
  const labels = years.map((y) => `Year ${y}`);

  return (
    <Page size={brand.page.size} style={SP.pagePortrait}>
      <PdfHeader shopName={shopName} workspaceName="Financial Plan" brand={brand} />
      <View style={SP.headingBar}>
        <Text style={SP.heading}>Net Profit by Year (5-Year Outlook)</Text>
      </View>

      {/* Bar chart */}
      <View style={{ marginBottom: 8 }}>
        <YearBarChart values={netProfits} labels={labels} width={480} height={120} code={code} brand={brand} />
      </View>

      {/* Summary table */}
      <View style={SP.annualTable}>
        <View style={SP.annualHeaderRow}>
          <Text style={SP.annualHeaderLabel}>Metric</Text>
          {labels.map((l, i) => (
            <Text key={i} style={SP.annualHeaderText}>{l}</Text>
          ))}
        </View>
        {[
          { label: "Net Revenue", values: revenues },
          { label: "Net Profit", values: netProfits },
          {
            label: "Net Margin",
            values: netProfits.map((n, i) => n),
            isPct: true,
            pctBase: revenues,
          },
        ].map((row, i) => (
          <View key={i} style={[SP.annualRow, i % 2 === 1 ? SP.annualRowAlt : {}]}>
            <Text style={[SP.annualLabelCell, SP.annualLabelBold]}>{row.label}</Text>
            {row.values.map((v, j) => {
              const display = row.isPct
                ? pct(v, (row.pctBase ?? [])[j] ?? 1)
                : fmt(v, code);
              return (
                <Text
                  key={j}
                  style={[
                    SP.annualValueCell,
                    SP.annualValueBold,
                    !row.isPct && v < 0 ? SP.annualValueNeg : {},
                  ]}
                >
                  {display}
                </Text>
              );
            })}
          </View>
        ))}
      </View>

      <PdfFooter generatedDate={date} brand={brand} />
    </Page>
  );
}

// ── Use of Funds Page ─────────────────────────────────────────────────────────

export function UseOfFundsPage({
  mp,
  shopName,
  date,
  brand = BRAND,
}: {
  mp: MonthlyProjections;
  shopName: string;
  date: string;
  brand?: BrandTokens;
}) {
  const SP = makeSharedStyles(brand);
  const code = mp.currency_code ?? "USD";
  const sc = mp.startup_costs;

  const rows: { label: string; cents: number }[] = sc
    ? [
        { label: "Leasehold Improvements / Build-Out", cents: sc.buildout_cents },
        { label: "Equipment, Technology & Fixtures", cents: sc.equipment_cents },
        { label: "Rent Deposits & Security", cents: sc.deposits_cents },
        { label: "Licenses & Permits", cents: sc.licenses_cents },
        { label: "Pre-Opening Marketing", cents: sc.pre_opening_marketing_cents },
        { label: "Initial Inventory", cents: sc.initial_inventory_cents },
        { label: "Opening Supplies & Smallwares", cents: sc.startup_supplies_cents },
        { label: "Professional & Legal Fees", cents: sc.professional_fees_cents },
        { label: "Working Capital Reserve", cents: sc.working_capital_reserve_cents },
        { label: "Opening Cash Buffer", cents: sc.opening_cash_buffer_cents },
      ].filter((r) => r.cents > 0)
    : [];

  // Add capex lines
  const capexLines = (mp.forecast_lines ?? []).filter(
    (l) => l.category === "capex" && l.value > 0
  );
  for (const l of capexLines) {
    rows.push({ label: l.label, cents: l.value });
  }

  const total = rows.reduce((s, r) => s + r.cents, 0);

  return (
    <Page size={brand.page.size} style={SP.pagePortrait}>
      <PdfHeader shopName={shopName} workspaceName="Financial Plan" brand={brand} />
      <View style={SP.headingBar}>
        <Text style={SP.heading}>Use of Funds</Text>
      </View>
      <Text style={[SP.body, { marginBottom: 8 }]}>
        The following table shows how startup capital will be deployed across the major cost
        categories required to open and operate the business.
      </Text>

      {rows.length === 0 ? (
        <Text style={[SP.body, { fontStyle: "italic", color: brand.colors.muted }]}>
          Complete the Startup Costs section in the Financials workspace to populate this table.
        </Text>
      ) : (
        <View style={SP.fundTable}>
          <View style={SP.fundHeaderRow}>
            <Text style={[SP.fundLabelCell, { fontWeight: 700 }]}>Category</Text>
            <Text style={[SP.fundValueCell, { fontWeight: 700 }]}>Amount</Text>
          </View>
          {rows.map((row, i) => (
            <View key={i} style={[SP.fundRow, i % 2 === 1 ? SP.fundRowAlt : {}]}>
              <Text style={SP.fundLabelCell}>{row.label}</Text>
              <Text style={SP.fundValueCell}>{fmt(row.cents, code)}</Text>
            </View>
          ))}
          <View style={[SP.fundRow, SP.fundRowTotal]}>
            <Text style={[SP.fundLabelCell, SP.fundValueBold]}>Total Use of Funds</Text>
            <Text style={[SP.fundValueCell, SP.fundValueBold]}>{fmt(total, code)}</Text>
          </View>
        </View>
      )}

      <PdfFooter generatedDate={date} brand={brand} />
    </Page>
  );
}

// ── Sources of Funds Page ─────────────────────────────────────────────────────

const FUNDING_KIND_LABELS: Record<string, string> = {
  founder_equity:   "Founder Equity",
  loan:             "Loan / SBA Financing",
  investor_equity:  "Investor Equity",
  grant:            "Grant",
};

export function SourcesOfFundsPage({
  mp,
  shopName,
  date,
  brand = BRAND,
}: {
  mp: MonthlyProjections;
  shopName: string;
  date: string;
  brand?: BrandTokens;
}) {
  const SP = makeSharedStyles(brand);
  const code = mp.currency_code ?? "USD";
  const sources: FundingSourceLine[] = mp.funding_sources ?? [];
  const total = sources.reduce((s, f) => s + f.amount_cents, 0);

  return (
    <Page size={brand.page.size} style={SP.pagePortrait}>
      <PdfHeader shopName={shopName} workspaceName="Financial Plan" brand={brand} />
      <View style={SP.headingBar}>
        <Text style={SP.heading}>Sources of Funds</Text>
      </View>
      <Text style={[SP.body, { marginBottom: 8 }]}>
        The following table summarizes the capital sources that fund the business launch and
        initial operations.
      </Text>

      {sources.length === 0 ? (
        <Text style={[SP.body, { fontStyle: "italic", color: brand.colors.muted }]}>
          Complete the Funding section in the Financials workspace to populate this table.
        </Text>
      ) : (
        <View style={SP.fundTable}>
          <View style={SP.fundHeaderRow}>
            <Text style={[SP.fundLabelCell, { fontWeight: 700 }]}>Source</Text>
            <Text style={[SP.fundValueCell, { fontWeight: 700 }]}>Amount</Text>
          </View>
          {sources.map((src, i) => (
            <View key={i} style={[SP.fundRow, i % 2 === 1 ? SP.fundRowAlt : {}]}>
              <Text style={SP.fundLabelCell}>
                {src.label || FUNDING_KIND_LABELS[src.kind] || src.kind}
              </Text>
              <Text style={SP.fundValueCell}>{fmt(src.amount_cents, code)}</Text>
            </View>
          ))}
          <View style={[SP.fundRow, SP.fundRowTotal]}>
            <Text style={[SP.fundLabelCell, SP.fundValueBold]}>Total Funding</Text>
            <Text style={[SP.fundValueCell, SP.fundValueBold]}>{fmt(total, code)}</Text>
          </View>
        </View>
      )}

      <PdfFooter generatedDate={date} brand={brand} />
    </Page>
  );
}

// ── Projected P&L (3-column, YYC verbatim line items) ────────────────────────

export function ProjectedPLPage({
  slices,
  mp,
  shopName,
  date,
  brand = BRAND,
}: {
  slices: MonthlySlice[];
  mp: MonthlyProjections;
  shopName: string;
  date: string;
  brand?: BrandTokens;
}) {
  const SP = makeSharedStyles(brand);
  const code = mp.currency_code ?? "USD";

  const rev = [1, 2, 3].map((y) => sumYear(slices, y, "net_revenue_cents")) as [number, number, number];
  const cogs = [1, 2, 3].map((y) => sumYear(slices, y, "total_cogs_cents")) as [number, number, number];
  const gross = rev.map((r, i) => r - cogs[i]) as [number, number, number];
  const labor = [1, 2, 3].map((y) => sumYear(slices, y, "labor_cents")) as [number, number, number];
  const rent = [1, 2, 3].map((y) => sumYear(slices, y, "rent_cents")) as [number, number, number];
  const mktg = [1, 2, 3].map((y) => sumYear(slices, y, "marketing_cents")) as [number, number, number];
  const tech = [1, 2, 3].map((y) => sumYear(slices, y, "tech_cents")) as [number, number, number];
  const utils = [1, 2, 3].map((y) => sumYear(slices, y, "utilities_cents")) as [number, number, number];
  const ins = [1, 2, 3].map((y) => sumYear(slices, y, "insurance_cents")) as [number, number, number];
  const maint = [1, 2, 3].map((y) => sumYear(slices, y, "maintenance_cents")) as [number, number, number];
  const supp = [1, 2, 3].map((y) => sumYear(slices, y, "supplies_cents")) as [number, number, number];
  const other = [1, 2, 3].map((y) => sumYear(slices, y, "other_opex_cents")) as [number, number, number];
  const totalOpex = [1, 2, 3].map((y) => sumYear(slices, y, "total_opex_cents")) as [number, number, number];
  const opIncome = [1, 2, 3].map((y) => sumYear(slices, y, "operating_income_cents")) as [number, number, number];
  const interest = [1, 2, 3].map((y) => sumYear(slices, y, "interest_cents")) as [number, number, number];
  const deprec = [1, 2, 3].map((y) => sumYear(slices, y, "depreciation_cents")) as [number, number, number];
  const taxes = [1, 2, 3].map((y) => sumYear(slices, y, "taxes_cents")) as [number, number, number];
  const netProfit = [1, 2, 3].map((y) => sumYear(slices, y, "net_income_cents")) as [number, number, number];
  const totalExp = [0, 1, 2].map((i) => cogs[i] + totalOpex[i] + interest[i] + deprec[i] + taxes[i]) as [number, number, number];

  const rows: AnnualRow[] = [
    { label: "Revenue",               values: rev,       bold: true },
    { label: "Direct Costs",          values: cogs.map((v) => -v) as [number,number,number] },
    { label: "Gross Profit",          values: gross,     bold: true },
    { label: "Gross Margin (%)",       values: gross,     isPct: true, pctBase: rev, muted: true },
    { label: "Operating Expenses",    values: null },
    { label: "Salaries & Wages",           values: labor.map((v) => -v) as [number,number,number], indent: true },
    { label: "Other Employee Taxes & Benefits", values: [0, 0, 0], indent: true, muted: true },
    { label: "Monthly Rent",          values: rent.map((v) => -v) as [number,number,number], indent: true },
    { label: "Website",               values: tech.map((v) => -v) as [number,number,number], indent: true },
    { label: "Marketing & Ads",       values: mktg.map((v) => -v) as [number,number,number], indent: true },
    { label: "Subscriptions",         values: [0, 0, 0],                                     indent: true, muted: true },
    { label: "Utilities",             values: utils.map((v) => -v) as [number,number,number], indent: true },
    { label: "Insurance",             values: ins.map((v) => -v) as [number,number,number], indent: true },
    { label: "Maintenance",           values: maint.map((v) => -v) as [number,number,number], indent: true },
    { label: "Supplies",              values: supp.map((v) => -v) as [number,number,number], indent: true },
    { label: "Other Operating",       values: other.map((v) => -v) as [number,number,number], indent: true },
    { label: "Total Operating Expenses", values: totalOpex.map((v) => -v) as [number,number,number], bold: true },
    { label: "Operating Income",      values: opIncome,  bold: true },
    { label: "Interest Incurred",     values: interest.map((v) => -v) as [number,number,number] },
    { label: "Depreciation and Amortization", values: deprec.map((v) => -v) as [number,number,number] },
    { label: "Gain or Loss from Sale of Assets", values: [0, 0, 0], muted: true },
    { label: "Income Taxes",          values: taxes.map((v) => -v) as [number,number,number] },
    { label: "Total Expenses",        values: totalExp.map((v) => -v) as [number,number,number], bold: true },
    { label: "Net Profit",            values: netProfit, bold: true },
    { label: "Net Profit Margin (%)",  values: netProfit, isPct: true, pctBase: rev, muted: true },
  ];

  return (
    <Page size={brand.page.size} style={SP.pagePortrait}>
      <PdfHeader shopName={shopName} workspaceName="Financial Plan" brand={brand} />
      <AnnualTable
        title="Projected Profit & Loss"
        colHeaders={["Year 1", "Year 2", "Year 3"]}
        rows={rows}
        code={code}
        brand={brand}
      />
      <PdfFooter generatedDate={date} brand={brand} />
    </Page>
  );
}

// ── Projected Balance Sheet (3-column) ────────────────────────────────────────

export function ProjectedBalanceSheetPage({
  slices,
  mp,
  shopName,
  date,
  brand = BRAND,
}: {
  slices: MonthlySlice[];
  mp: MonthlyProjections;
  shopName: string;
  date: string;
  brand?: BrandTokens;
}) {
  const SP = makeSharedStyles(brand);
  const code = mp.currency_code ?? "USD";

  // End-of-year balance sheet snapshots
  const snap = [1, 2, 3].map((y) => lastMonthOfYear(slices, y));

  function field(field: keyof MonthlySlice): [number, number, number] {
    return snap.map((s) => (s ? (s[field] as number) ?? 0 : 0)) as [number, number, number];
  }

  const cash = field("cash_cents");
  const ar   = field("accounts_receivable_cents");
  const inv  = field("inventory_cents");
  const nfa  = field("net_fixed_assets_cents");
  const totalAssets = field("total_assets_cents");
  const ap   = field("accounts_payable_cents");
  const curDebt  = field("current_debt_cents");
  const ltDebt   = field("long_term_debt_cents");
  const totalLiab = field("total_liabilities_cents");
  const ownerEq  = field("owner_equity_cents");
  const retained = field("retained_earnings_cents");
  const totalEq  = field("total_equity_cents");
  const liabAndEq = field("total_liabilities_and_equity_cents");

  const rows: AnnualRow[] = [
    { label: "Assets", values: null },
    { label: "Cash",                     values: cash,       indent: true },
    { label: "Accounts Receivable",       values: ar,         indent: true },
    { label: "Inventory",                 values: inv,        indent: true },
    { label: "Net Fixed Assets",          values: nfa,        indent: true },
    { label: "Total Assets",              values: totalAssets, bold: true },
    { label: "Liabilities", values: null },
    { label: "Accounts Payable",          values: ap,         indent: true },
    { label: "Current Portion of Debt",   values: curDebt,    indent: true },
    { label: "Long-Term Debt",            values: ltDebt,     indent: true },
    { label: "Total Liabilities",         values: totalLiab,  bold: true },
    { label: "Equity", values: null },
    { label: "Owner Equity",              values: ownerEq,    indent: true },
    { label: "Retained Earnings",         values: retained,   indent: true },
    { label: "Total Equity",              values: totalEq,    bold: true },
    { label: "Liabilities + Equity",      values: liabAndEq,  bold: true },
  ];

  return (
    <Page size={brand.page.size} style={SP.pagePortrait}>
      <PdfHeader shopName={shopName} workspaceName="Financial Plan" brand={brand} />
      <AnnualTable
        title="Projected Balance Sheet (End of Year)"
        colHeaders={["Year 1", "Year 2", "Year 3"]}
        rows={rows}
        code={code}
        brand={brand}
      />
      <PdfFooter generatedDate={date} brand={brand} />
    </Page>
  );
}

// ── Projected Cash Flow (3-column) ────────────────────────────────────────────

export function ProjectedCashFlowPage({
  slices,
  mp,
  shopName,
  date,
  brand = BRAND,
}: {
  slices: MonthlySlice[];
  mp: MonthlyProjections;
  shopName: string;
  date: string;
  brand?: BrandTokens;
}) {
  const SP = makeSharedStyles(brand);
  const code = mp.currency_code ?? "USD";

  function yr(y: number, f: keyof MonthlySlice) {
    return sumYear(slices, y, f);
  }

  const netIncome  = [1,2,3].map((y) => yr(y, "net_income_cents"))   as [number,number,number];
  const deprecAdd  = [1,2,3].map((y) => yr(y, "depreciation_cents")) as [number,number,number];
  const deltaAr    = [1,2,3].map((y) => -yr(y, "delta_ar_cents"))    as [number,number,number];
  const deltaInv   = [1,2,3].map((y) => -yr(y, "delta_inventory_cents")) as [number,number,number];
  const deltaAp    = [1,2,3].map((y) => yr(y, "delta_ap_cents"))     as [number,number,number];
  const operCF     = [0,1,2].map((i) => netIncome[i] + deprecAdd[i] + deltaAr[i] + deltaInv[i] + deltaAp[i]) as [number,number,number];

  const capex      = [1,2,3].map((y) => -yr(y, "capex_cents"))       as [number,number,number];
  const investCF   = capex;

  const loanRepay  = [1,2,3].map((y) => -yr(y, "loan_repayment_cents")) as [number,number,number];
  const ownerDraws = [1,2,3].map((y) => -yr(y, "owner_draws_cents")) as [number,number,number];
  const ownerContr = [1,2,3].map((y) => yr(y, "owner_contributions_cents")) as [number,number,number];
  const financCF   = [0,1,2].map((i) => loanRepay[i] + ownerDraws[i] + ownerContr[i]) as [number,number,number];

  const netCash    = [0,1,2].map((i) => operCF[i] + investCF[i] + financCF[i]) as [number,number,number];

  // Beginning cash = end of prior year (year 0 beginning = first month's starting cash)
  const firstSlice = slices.find((s) => s.month_index === 1);
  const begCash1 = firstSlice ? firstSlice.cash_cents - firstSlice.net_cash_cents : 0;
  const endCash  = [1,2,3].map((y) => lastMonthOfYear(slices, y)?.cash_cents ?? 0) as [number,number,number];
  const begCash  = [begCash1, endCash[0], endCash[1]] as [number,number,number];

  const rows: AnnualRow[] = [
    { label: "Operating Activities", values: null },
    { label: "Net Income",                   values: netIncome, indent: true },
    { label: "Depreciation (add-back)",       values: deprecAdd, indent: true },
    { label: "Change in Accounts Receivable", values: deltaAr,   indent: true },
    { label: "Change in Inventory",           values: deltaInv,  indent: true },
    { label: "Change in Accounts Payable",    values: deltaAp,   indent: true },
    { label: "Operating Cash Flow",           values: operCF,    bold: true },
    { label: "Investing Activities", values: null },
    { label: "Capital Expenditures",          values: capex,     indent: true },
    { label: "Investing Cash Flow",           values: investCF,  bold: true },
    { label: "Financing Activities", values: null },
    { label: "Loan Repayment",                values: loanRepay, indent: true },
    { label: "Owner Draws",                   values: ownerDraws, indent: true },
    { label: "Owner Contributions",           values: ownerContr, indent: true },
    { label: "Financing Cash Flow",           values: financCF,  bold: true },
    { label: "Net Change in Cash",            values: netCash,   bold: true },
    { label: "Cash, Beginning of Year",       values: begCash },
    { label: "Cash, End of Year",             values: endCash,   bold: true },
  ];

  return (
    <Page size={brand.page.size} style={SP.pagePortrait}>
      <PdfHeader shopName={shopName} workspaceName="Financial Plan" brand={brand} />
      <AnnualTable
        title="Projected Cash Flow"
        colHeaders={["Year 1", "Year 2", "Year 3"]}
        rows={rows}
        code={code}
        brand={brand}
      />
      <PdfFooter generatedDate={date} brand={brand} />
    </Page>
  );
}

// ── Monthly appendix table (reused from original template) ───────────────────

type ApxRow = {
  label: string;
  values: number[];
  bold?: boolean;
  negative?: boolean;
};

function MonthlyApxTable({
  headers,
  rows,
  showTotal,
  totalLabel,
  code,
  brand,
}: {
  headers: string[];
  rows: ApxRow[];
  showTotal: boolean;
  totalLabel: string;
  code: string;
  brand: BrandTokens;
}) {
  const SP = makeSharedStyles(brand);
  return (
    <View style={SP.table}>
      <View style={SP.tableHeaderRow}>
        <Text style={[SP.labelCell, SP.labelCellBold]}>Line item</Text>
        {headers.map((h, i) => (
          <Text key={`${h}-${i}`} style={[SP.valueCell, SP.valueCellBold]}>{h}</Text>
        ))}
        {showTotal && (
          <Text style={[SP.valueCell, SP.valueCellBold]}>{totalLabel}</Text>
        )}
      </View>
      {rows.map((row, i) => {
        const total = row.values.reduce((s, v) => s + v, 0);
        return (
          <View
            key={`${row.label}-${i}`}
            style={[SP.tableRow, row.bold ? SP.tableRowBold : i % 2 === 1 ? SP.tableRowAlt : {}]}
          >
            <Text style={[SP.labelCell, row.bold ? SP.labelCellBold : {}]}>{row.label}</Text>
            {row.values.map((v, j) => (
              <Text
                key={`v-${j}`}
                style={[
                  SP.valueCell,
                  row.bold ? SP.valueCellBold : {},
                  (row.negative || v < 0) ? SP.valueCellNeg : {},
                ]}
              >
                {formatMinorUnits(v, code)}
              </Text>
            ))}
            {showTotal && (
              <Text
                style={[
                  SP.valueCell,
                  SP.totalCell,
                  (row.negative || total < 0) ? SP.valueCellNeg : {},
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

// ── Full Financial Plan Pages ─────────────────────────────────────────────────
// Renders all enabled financial document pages in YYC order:
// Forecast → Financing → Statements → Appendix (monthly)

export function FinancialPlanPages({
  mp,
  equipment,
  shopName,
  date,
  visibility,
  brand = BRAND,
  cogsGrandTotalMonthlyCents,
}: {
  mp: MonthlyProjections;
  equipment: EquipmentSummary;
  shopName: string;
  date: string;
  visibility: FinancialDocumentVisibility;
  brand?: BrandTokens;
  cogsGrandTotalMonthlyCents?: number | null;
}) {
  const SP = makeSharedStyles(brand);
  const code = mp.currency_code ?? "USD";
  const fiscalStart = mp.fiscal_year_start_month ?? 1;
  const months = fiscalYearMonthLabels(fiscalStart);

  // TIM-3735: pass Grand Total so computeMonthlyProjections uses the
  // centralized COGS (menu + additional) instead of legacy cogs_pct × revenue.
  const slices = computeMonthlySlices(mp, equipment, {}, {
    cogs_grand_total_monthly_cents: cogsGrandTotalMonthlyCents ?? null,
  });
  if (slices.length === 0) return null;

  // Build monthly appendix rows (for the appendix section)
  const year1 = slices.filter((s) => s.year === 1);
  if (year1.length === 0) return null;
  const ordered1 = fiscalReorder(year1, fiscalStart);

  const plRows: ApxRow[] = [
    { label: "Net revenue", values: ordered1.map((s) => s.net_revenue_cents), bold: true },
    { label: "COGS", values: ordered1.map((s) => -s.total_cogs_cents), negative: true },
    { label: "Gross profit", values: ordered1.map((s) => s.net_revenue_cents - s.total_cogs_cents), bold: true },
    { label: "Labor", values: ordered1.map((s) => -s.labor_cents), negative: true },
    { label: "Monthly Rent", values: ordered1.map((s) => -s.rent_cents), negative: true },
    { label: "Marketing & Ads", values: ordered1.map((s) => -s.marketing_cents), negative: true },
    { label: "Utilities", values: ordered1.map((s) => -s.utilities_cents), negative: true },
    { label: "Insurance", values: ordered1.map((s) => -s.insurance_cents), negative: true },
    { label: "Website", values: ordered1.map((s) => -s.tech_cents), negative: true },
    { label: "Maintenance", values: ordered1.map((s) => -s.maintenance_cents), negative: true },
    { label: "Supplies", values: ordered1.map((s) => -s.supplies_cents), negative: true },
    { label: "Other operating", values: ordered1.map((s) => -s.other_opex_cents), negative: true },
    { label: "Total opex", values: ordered1.map((s) => -s.total_opex_cents), bold: true, negative: true },
    { label: "EBITDA", values: ordered1.map((s) => s.operating_income_cents), bold: true },
    { label: "Depreciation", values: ordered1.map((s) => -s.depreciation_cents), negative: true },
    { label: "Interest", values: ordered1.map((s) => -s.interest_cents), negative: true },
    { label: "Income tax", values: ordered1.map((s) => -s.taxes_cents), negative: true },
    { label: "Net income", values: ordered1.map((s) => s.net_income_cents), bold: true },
  ];

  const cfRows: ApxRow[] = [
    { label: "Net income", values: ordered1.map((s) => s.net_income_cents) },
    { label: "Depreciation (add back)", values: ordered1.map((s) => s.depreciation_cents) },
    { label: "Operating cash flow", values: ordered1.map((s) => s.net_income_cents + s.depreciation_cents), bold: true },
    { label: "Capital expenditures", values: ordered1.map((s) => -s.capex_cents), negative: true },
    { label: "Loan repayment", values: ordered1.map((s) => -s.loan_repayment_cents), negative: true },
    { label: "Net cash flow", values: ordered1.map((s) => s.net_cash_cents), bold: true },
    { label: "Ending cash balance", values: ordered1.map((s) => s.cash_cents), bold: true },
  ];

  const bsRows: ApxRow[] = [
    { label: "Cash", values: ordered1.map((s) => s.cash_cents) },
    { label: "Accounts receivable", values: ordered1.map((s) => s.accounts_receivable_cents) },
    { label: "Inventory", values: ordered1.map((s) => s.inventory_cents) },
    { label: "Net fixed assets", values: ordered1.map((s) => s.net_fixed_assets_cents) },
    { label: "Total assets", values: ordered1.map((s) => s.total_assets_cents), bold: true },
    { label: "Accounts payable", values: ordered1.map((s) => s.accounts_payable_cents) },
    { label: "Current debt", values: ordered1.map((s) => s.current_debt_cents) },
    { label: "Long-term debt", values: ordered1.map((s) => s.long_term_debt_cents) },
    { label: "Total liabilities", values: ordered1.map((s) => s.total_liabilities_cents), bold: true },
    { label: "Owner equity", values: ordered1.map((s) => s.owner_equity_cents) },
    { label: "Retained earnings", values: ordered1.map((s) => s.retained_earnings_cents) },
    { label: "Total equity", values: ordered1.map((s) => s.total_equity_cents), bold: true },
    { label: "Liabilities + equity", values: ordered1.map((s) => s.total_liabilities_and_equity_cents), bold: true },
  ];

  return (
    <>
      {/* Forecast */}
      {visibility.key_assumptions !== false && (
        <KeyAssumptionsPage mp={mp} shopName={shopName} date={date} brand={brand} cogsGrandTotalMonthlyCents={cogsGrandTotalMonthlyCents} />
      )}
      {visibility.revenue_by_month !== false && (
        <RevenueByMonthPage slices={slices} mp={mp} shopName={shopName} date={date} brand={brand} />
      )}
      {visibility.expenses_by_month !== false && (
        <ExpensesByMonthPage slices={slices} mp={mp} shopName={shopName} date={date} brand={brand} />
      )}
      {visibility.net_profit_by_year !== false && (
        <NetProfitByYearPage slices={slices} mp={mp} shopName={shopName} date={date} brand={brand} />
      )}

      {/* Financing */}
      {visibility.use_of_funds !== false && (
        <UseOfFundsPage mp={mp} shopName={shopName} date={date} brand={brand} />
      )}
      {visibility.sources_of_funds !== false && (
        <SourcesOfFundsPage mp={mp} shopName={shopName} date={date} brand={brand} />
      )}

      {/* Statements */}
      {visibility.projected_pl !== false && (
        <ProjectedPLPage slices={slices} mp={mp} shopName={shopName} date={date} brand={brand} />
      )}
      {visibility.projected_balance_sheet !== false && (
        <ProjectedBalanceSheetPage slices={slices} mp={mp} shopName={shopName} date={date} brand={brand} />
      )}
      {visibility.projected_cash_flow !== false && (
        <ProjectedCashFlowPage slices={slices} mp={mp} shopName={shopName} date={date} brand={brand} />
      )}

      {/* Appendix — Monthly detail */}
      {visibility.monthly_pl !== false && (
        <Page size="A4" orientation="landscape" style={SP.pageLandscape}>
          <PdfHeader shopName={shopName} workspaceName="Appendix" brand={brand} />
          <View style={SP.headingBar}>
            <Text style={SP.heading}>Monthly Profit & Loss (Year 1)</Text>
          </View>
          <MonthlyApxTable
            headers={months}
            rows={plRows}
            showTotal={true}
            totalLabel="Year 1"
            code={code}
            brand={brand}
          />
          <PdfFooter generatedDate={date} brand={brand} />
        </Page>
      )}

      {visibility.monthly_balance_sheet !== false && (
        <Page size="A4" orientation="landscape" style={SP.pageLandscape}>
          <PdfHeader shopName={shopName} workspaceName="Appendix" brand={brand} />
          <View style={SP.headingBar}>
            <Text style={SP.heading}>Monthly Balance Sheet (End of Month, Year 1)</Text>
          </View>
          <MonthlyApxTable
            headers={months}
            rows={bsRows}
            showTotal={false}
            totalLabel=""
            code={code}
            brand={brand}
          />
          <PdfFooter generatedDate={date} brand={brand} />
        </Page>
      )}

      {visibility.monthly_cash_flow !== false && (
        <Page size="A4" orientation="landscape" style={SP.pageLandscape}>
          <PdfHeader shopName={shopName} workspaceName="Appendix" brand={brand} />
          <View style={SP.headingBar}>
            <Text style={SP.heading}>Monthly Cash Flow (Year 1)</Text>
          </View>
          <MonthlyApxTable
            headers={months}
            rows={cfRows}
            showTotal={true}
            totalLabel="Year 1"
            code={code}
            brand={brand}
          />
          <PdfFooter generatedDate={date} brand={brand} />
        </Page>
      )}
    </>
  );
}
