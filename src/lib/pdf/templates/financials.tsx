// TIM-715: Financials workspace PDF template — first adopter of the shared
// framework defined in TIM-711 / TIM-712. Maps the FinancialsContent JSONB
// shape onto cover + summary + tables + chart sections.

import React from "react"
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer"
import type { ChartConfiguration } from "chart.js"
import { BRAND, type BrandTokens } from "../brand"
import { PdfDocument } from "../components/PdfDocument"
import { PdfHeader } from "../components/PdfHeader"
import { PdfFooter } from "../components/PdfFooter"
import { PdfSection } from "../components/PdfSection"
import { PdfTable, type ColumnDef, type Row } from "../components/PdfTable"
import { PdfChartImage } from "../components/PdfChartImage"
import { chartToPng } from "../chart-to-png"
import { parseFinancialsContent } from "@/lib/financials/schema"
import { formatCurrencyAmount, formatMinorUnits } from "@/lib/currency"
import type { PdfTemplate } from "../registry"
import type {
  FinancialsContent,
  MonthlyPnl,
  StartupCostLine,
  RevenueLine,
  LaborLine,
  FixedCostLine,
  FundingLine,
  AiFlag,
} from "@/types/financials"

// ── label dictionaries ───────────────────────────────────────────────────────

const STARTUP_CATEGORY_LABEL: Record<StartupCostLine["category"], string> = {
  build_out: "Build-out",
  equipment: "Equipment",
  licenses: "Licenses",
  deposits: "Deposits",
  inventory: "Inventory",
  other: "Other",
}

const REVENUE_STREAM_LABEL: Record<RevenueLine["stream"], string> = {
  coffee: "Coffee",
  food: "Food",
  wholesale: "Wholesale",
  catering: "Catering",
  other: "Other",
}

const LABOR_ROLE_LABEL: Record<LaborLine["role"], string> = {
  owner: "Owner",
  barista: "Barista",
  manager: "Manager",
  other: "Other",
}

const FIXED_COST_LABEL: Record<FixedCostLine["category"], string> = {
  rent: "Rent",
  utilities: "Utilities",
  insurance: "Insurance",
  software: "Software",
  marketing: "Marketing",
  other: "Other",
}

const FUNDING_SOURCE_LABEL: Record<FundingLine["source"], string> = {
  self: "Self-funded",
  sba: "SBA loan",
  family: "Family / friends",
  investor: "Investor",
  grant: "Grant",
  other: "Other",
}

const FLAG_SEVERITY_LABEL: Record<AiFlag["severity"], string> = {
  error: "Critical",
  warn: "Warning",
  info: "Info",
}

// ── calc helpers (mirror the UI so numbers match the workspace exactly) ─────

function computePnl(pnl: MonthlyPnl) {
  const totalRevenue = pnl.revenue.reduce((s, r) => s + r.monthly_cents, 0)
  const cogs = Math.round(totalRevenue * (pnl.cogs_percent / 100))
  const grossProfit = totalRevenue - cogs
  const totalLabor = pnl.labor.reduce((s, l) => s + l.monthly_cents, 0)
  const totalFixed = pnl.fixed_costs.reduce((s, f) => s + f.monthly_cents, 0)
  const netProfit = grossProfit - totalLabor - totalFixed
  return { totalRevenue, cogs, grossProfit, totalLabor, totalFixed, netProfit }
}

function computeBreakEven(pnl: MonthlyPnl) {
  const { totalLabor, totalFixed, totalRevenue } = computePnl(pnl)
  const grossMargin = 1 - pnl.cogs_percent / 100
  const monthlyFixed = totalLabor + totalFixed
  const breakEvenRevenue =
    grossMargin > 0 ? Math.ceil(monthlyFixed / grossMargin) : 0
  const grossMarginPct = Math.round(grossMargin * 100)
  const revenueGap = breakEvenRevenue - totalRevenue
  return { breakEvenRevenue, grossMarginPct, monthlyFixed, revenueGap }
}

function fmtUsd(cents: number, currencyCode: string = "USD"): string {
  return formatMinorUnits(cents, currencyCode)
}

function fmtDateLong(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function fmtYyyymmdd(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("")
}

function slugify(s: string | null | undefined): string {
  if (!s) return "untitled"
  const slug = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "untitled"
}

// ── chart configs ────────────────────────────────────────────────────────────

function breakEvenChartConfig(pnl: MonthlyPnl, brand: BrandTokens, currencyCode = "USD"): ChartConfiguration {
  const { totalRevenue, totalLabor, totalFixed } = computePnl(pnl)
  const { breakEvenRevenue } = computeBreakEven(pnl)
  const maxX = Math.max(totalRevenue, breakEvenRevenue, 1) * 1.5
  const grossMargin = 1 - pnl.cogs_percent / 100
  const fixedCosts = totalLabor + totalFixed
  const points = 6
  const labels: number[] = []
  const totalCosts: number[] = []
  const revenue: number[] = []
  for (let i = 0; i <= points; i++) {
    const x = (maxX * i) / points
    labels.push(Math.round(x / 100))
    totalCosts.push(Math.round((fixedCosts + x * (1 - grossMargin)) / 100))
    revenue.push(Math.round(x / 100))
  }

  return {
    type: "line",
    data: {
      labels: labels.map((v) => formatCurrencyAmount(v, currencyCode)),
      datasets: [
        {
          label: "Total costs",
          data: totalCosts,
          borderColor: brand.colors.muted,
          backgroundColor: brand.colors.muted,
          tension: 0,
          pointRadius: 0,
        },
        {
          label: "Revenue",
          data: revenue,
          borderColor: brand.colors.primary,
          backgroundColor: brand.colors.primary,
          tension: 0,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: { position: "bottom" },
        title: {
          display: true,
          text: `Break-even at ${fmtUsd(breakEvenRevenue, currencyCode)}/mo revenue`,
        },
      },
      scales: {
        x: { title: { display: true, text: "Monthly revenue" } },
        y: {
          title: { display: true, text: "Dollars" },
          ticks: {
            callback: (v) => formatCurrencyAmount(Number(v), currencyCode),
          },
        },
      },
    },
  }
}

function monthlyBurnChartConfig(pnl: MonthlyPnl, brand: BrandTokens, currencyCode = "USD"): ChartConfiguration {
  const { cogs, totalLabor, totalFixed } = computePnl(pnl)
  return {
    type: "bar",
    data: {
      labels: ["COGS", "Labor", "Fixed costs"],
      datasets: [
        {
          label: "Monthly burn",
          data: [cogs / 100, totalLabor / 100, totalFixed / 100],
          backgroundColor: [
            brand.colors.accent,
            brand.colors.primary,
            brand.colors.muted,
          ],
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: "Monthly burn by category" },
      },
      scales: {
        y: {
          title: { display: true, text: "Dollars per month" },
          ticks: {
            callback: (v) => formatCurrencyAmount(Number(v), currencyCode),
          },
        },
      },
    },
  }
}

// ── page styles ──────────────────────────────────────────────────────────────

function makeStyles(brand: BrandTokens) {
  return StyleSheet.create({
    page: {
      fontFamily: brand.fonts.sans,
      fontSize: 10,
      color: brand.colors.ink,
      backgroundColor: brand.colors.paper,
      paddingTop: brand.page.margin,
      paddingBottom: brand.page.margin + 20,
      paddingLeft: brand.page.margin,
      paddingRight: brand.page.margin,
    },
    coverPage: {
      fontFamily: brand.fonts.sans,
      color: brand.colors.ink,
      backgroundColor: brand.colors.paper,
      padding: brand.page.margin * 1.5,
      flexDirection: "column",
      justifyContent: "center",
    },
    coverEyebrow: {
      fontSize: 11,
      color: brand.colors.primary,
      fontWeight: 700,
      letterSpacing: 2,
      marginBottom: 16,
    },
    coverTitle: {
      fontFamily: brand.fonts.serif,
      fontSize: 36,
      fontWeight: 600,
      lineHeight: 1.15,
      color: brand.colors.ink,
      marginBottom: 12,
    },
    coverShop: {
      fontSize: 18,
      color: brand.colors.ink,
      marginBottom: 32,
    },
    coverRule: {
      height: 2,
      backgroundColor: brand.colors.primary,
      width: 64,
      marginBottom: 24,
    },
    coverMetaLabel: {
      fontSize: 9,
      color: brand.colors.muted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 2,
    },
    coverMetaValue: {
      fontSize: 11,
      color: brand.colors.ink,
      marginBottom: 14,
    },
    coverFootnote: {
      position: "absolute",
      bottom: brand.page.margin,
      left: brand.page.margin * 1.5,
      right: brand.page.margin * 1.5,
      fontSize: 9,
      color: brand.colors.muted,
      borderTopWidth: 1,
      borderTopColor: brand.colors.rule,
      paddingTop: 8,
    },
    paragraph: {
      fontSize: 10,
      color: brand.colors.ink,
      marginBottom: 6,
      lineHeight: 1.5,
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
      borderColor: brand.colors.rule,
      padding: 8,
      borderRadius: 4,
    },
    metricLabel: {
      fontSize: 8,
      color: brand.colors.muted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 4,
    },
    metricValue: {
      fontSize: 14,
      color: brand.colors.ink,
      fontWeight: 700,
    },
    metricValueGood: {
      color: brand.colors.primary,
    },
    metricValueBad: {
      color: "var(--rust)",
    },
    emptyNote: {
      fontSize: 10,
      fontStyle: "italic",
      color: brand.colors.muted,
      padding: 8,
      backgroundColor: "var(--neutral-cool-f5)",
      borderRadius: 4,
      marginBottom: 8,
    },
    flagRow: {
      flexDirection: "row",
      marginBottom: 6,
      paddingBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: brand.colors.rule,
    },
    flagSev: {
      width: 60,
      fontSize: 9,
      fontWeight: 700,
      color: brand.colors.ink,
    },
    flagBody: {
      flex: 1,
      fontSize: 9,
      color: brand.colors.ink,
    },
    flagEvidence: {
      fontSize: 8,
      color: brand.colors.muted,
      marginTop: 2,
    },
  })
}

// ── section renderers ───────────────────────────────────────────────────────

type RenderOpts = {
  content: FinancialsContent
  shopName: string | null
  generatedDate: string
  breakEvenPng: Buffer | null
  burnPng: Buffer | null
  currencyCode: string
  brand: BrandTokens
}

function renderCoverPage(opts: RenderOpts) {
  const { content, shopName, generatedDate, currencyCode, brand } = opts
  const styles = makeStyles(brand)
  const { totalRevenue, netProfit } = computePnl(content.monthly_pnl)
  const { breakEvenRevenue } = computeBreakEven(content.monthly_pnl)
  const totalStartup = content.startup_costs.reduce(
    (s, l) => s + l.amount_cents,
    0
  )

  return (
    <Page size={brand.page.size} style={styles.coverPage}>
      <Text style={styles.coverEyebrow}>FINANCIALS</Text>
      <View style={styles.coverRule} />
      <Text style={styles.coverTitle}>Financials report</Text>
      <Text style={styles.coverShop}>{shopName ?? "Your coffee shop"}</Text>

      <Text style={styles.coverMetaLabel}>Generated</Text>
      <Text style={styles.coverMetaValue}>{generatedDate}</Text>

      <Text style={styles.coverMetaLabel}>Total startup costs</Text>
      <Text style={styles.coverMetaValue}>{fmtUsd(totalStartup, currencyCode)}</Text>

      <Text style={styles.coverMetaLabel}>Projected monthly revenue</Text>
      <Text style={styles.coverMetaValue}>{fmtUsd(totalRevenue, currencyCode)}</Text>

      <Text style={styles.coverMetaLabel}>Projected monthly net profit</Text>
      <Text style={styles.coverMetaValue}>
        {netProfit >= 0 ? "+" : "-"}
        {fmtUsd(Math.abs(netProfit), currencyCode)}
      </Text>

      <Text style={styles.coverMetaLabel}>Break-even revenue</Text>
      <Text style={styles.coverMetaValue}>
        {breakEvenRevenue > 0 ? `${fmtUsd(breakEvenRevenue, currencyCode)}/mo` : "—"}
      </Text>

      <Text style={styles.coverFootnote}>
        Numbers are projections based on the data you entered in the Financials
        workspace. Review the assumptions section and update them as your plan
        evolves.
      </Text>
    </Page>
  )
}

function ExecutiveSummary({ content, brand, currencyCode = "USD" }: { content: FinancialsContent; brand: BrandTokens; currencyCode?: string }) {
  const styles = makeStyles(brand)
  const pnl = computePnl(content.monthly_pnl)
  const be = computeBreakEven(content.monthly_pnl)
  const totalStartup = content.startup_costs.reduce(
    (s, l) => s + l.amount_cents,
    0
  )
  const totalFunding = content.funding.reduce(
    (s, l) => s + l.amount_cents,
    0
  )
  const fundingGap = totalFunding - totalStartup
  const payback =
    totalStartup > 0 && pnl.netProfit > 0
      ? Math.ceil(totalStartup / pnl.netProfit)
      : null

  return (
    <PdfSection title="Executive summary" brand={brand}>
      <View style={styles.metricRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Monthly revenue</Text>
          <Text style={styles.metricValue}>{fmtUsd(pnl.totalRevenue, currencyCode)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Net profit / month</Text>
          <Text
            style={[
              styles.metricValue,
              pnl.netProfit >= 0
                ? styles.metricValueGood
                : styles.metricValueBad,
            ]}
          >
            {pnl.netProfit >= 0 ? "+" : "-"}
            {fmtUsd(Math.abs(pnl.netProfit), currencyCode)}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Gross margin</Text>
          <Text style={styles.metricValue}>{be.grossMarginPct}%</Text>
        </View>
      </View>
      <View style={styles.metricRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Break-even revenue</Text>
          <Text style={styles.metricValue}>
            {be.breakEvenRevenue > 0
              ? `${fmtUsd(be.breakEvenRevenue, currencyCode)}/mo`
              : "—"}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Funding vs. startup</Text>
          <Text
            style={[
              styles.metricValue,
              fundingGap >= 0
                ? styles.metricValueGood
                : styles.metricValueBad,
            ]}
          >
            {fundingGap >= 0 ? "+" : "-"}
            {fmtUsd(Math.abs(fundingGap), currencyCode)}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Startup payback</Text>
          <Text style={styles.metricValue}>
            {payback != null ? `~${payback} mo` : "—"}
          </Text>
        </View>
      </View>
    </PdfSection>
  )
}

function StartupCostsSection({ content, brand }: { content: FinancialsContent; brand: BrandTokens }) {
  const styles = makeStyles(brand)
  const lines = content.startup_costs
  const total = lines.reduce((s, l) => s + l.amount_cents, 0)

  if (lines.length === 0) {
    return (
      <PdfSection title="Startup costs" brand={brand}>
        <Text style={styles.emptyNote}>
          No startup costs recorded yet. Add line items in the Financials
          workspace to populate this section.
        </Text>
      </PdfSection>
    )
  }

  const columns: ColumnDef[] = [
    { key: "category", label: "Category", width: 100 },
    { key: "label", label: "Description" },
    { key: "amount", label: "Amount", currency: true, width: 100 },
  ]
  const rows: Row[] = lines.map((l) => ({
    category: STARTUP_CATEGORY_LABEL[l.category],
    label: l.label || "—",
    amount: l.amount_cents,
  }))
  const totalsRow: Row = { category: "", label: "Total", amount: total }

  return (
    <PdfSection title="Startup costs" brand={brand}>
      <PdfTable columns={columns} rows={rows} totalsRow={totalsRow} />
    </PdfSection>
  )
}

function MonthlyPnlSection({ content, brand }: { content: FinancialsContent; brand: BrandTokens }) {
  const styles = makeStyles(brand)
  const pnl = content.monthly_pnl
  const summary = computePnl(pnl)

  const hasAnyLines =
    pnl.revenue.length > 0 ||
    pnl.labor.length > 0 ||
    pnl.fixed_costs.length > 0

  if (!hasAnyLines) {
    return (
      <PdfSection title="Monthly P&amp;L" brand={brand}>
        <Text style={styles.emptyNote}>
          No revenue, labor, or fixed costs recorded yet.
        </Text>
      </PdfSection>
    )
  }

  const columns: ColumnDef[] = [
    { key: "category", label: "Line", width: 110 },
    { key: "label", label: "Description" },
    { key: "amount", label: "Monthly", currency: true, width: 90 },
  ]

  const rows: Row[] = []
  for (const r of pnl.revenue) {
    rows.push({
      category: `Revenue · ${REVENUE_STREAM_LABEL[r.stream]}`,
      label: r.label || "—",
      amount: r.monthly_cents,
    })
  }
  rows.push({
    category: `COGS (${pnl.cogs_percent}%)`,
    label: "Cost of goods sold",
    amount: -summary.cogs,
  })
  for (const l of pnl.labor) {
    rows.push({
      category: `Labor · ${LABOR_ROLE_LABEL[l.role]}`,
      label: `${l.headcount} × monthly cost`,
      amount: -l.monthly_cents,
    })
  }
  for (const f of pnl.fixed_costs) {
    rows.push({
      category: `Fixed · ${FIXED_COST_LABEL[f.category]}`,
      label: f.label || "—",
      amount: -f.monthly_cents,
    })
  }

  const totalsRow: Row = {
    category: "Net profit",
    label: "Revenue − COGS − Labor − Fixed",
    amount: summary.netProfit,
  }

  return (
    <PdfSection title="Monthly P&amp;L" brand={brand}>
      <PdfTable columns={columns} rows={rows} totalsRow={totalsRow} />
    </PdfSection>
  )
}

function BreakEvenChartSection({
  breakEvenPng,
  content,
  brand,
}: {
  breakEvenPng: Buffer | null
  content: FinancialsContent
  brand: BrandTokens
}) {
  const styles = makeStyles(brand)
  const be = computeBreakEven(content.monthly_pnl)
  if (!breakEvenPng) {
    return (
      <PdfSection title="Break-even analysis" brand={brand}>
        <Text style={styles.emptyNote}>
          Break-even chart unavailable — add revenue and cost data to generate
          this chart.
        </Text>
      </PdfSection>
    )
  }
  return (
    <PdfSection title="Break-even analysis" brand={brand}>
      <PdfChartImage
        src={breakEvenPng}
        caption={
          be.breakEvenRevenue > 0
            ? `You need approximately ${fmtUsd(
                be.breakEvenRevenue
              )}/mo in revenue to cover all costs.`
            : "Add revenue lines and a COGS percentage to compute break-even."
        }
        brand={brand}
      />
      {content.break_even.assumptions_note && (
        <Text style={styles.paragraph}>
          Assumptions: {content.break_even.assumptions_note}
        </Text>
      )}
    </PdfSection>
  )
}

function MonthlyBurnChartSection({
  burnPng,
  content,
  brand,
}: {
  burnPng: Buffer | null
  content: FinancialsContent
  brand: BrandTokens
}) {
  const styles = makeStyles(brand)
  const summary = computePnl(content.monthly_pnl)
  const totalBurn = summary.cogs + summary.totalLabor + summary.totalFixed
  if (!burnPng) {
    return (
      <PdfSection title="Monthly burn" brand={brand}>
        <Text style={styles.emptyNote}>
          Monthly burn chart unavailable — add labor, fixed costs, or revenue
          (for COGS).
        </Text>
      </PdfSection>
    )
  }
  return (
    <PdfSection title="Monthly burn" brand={brand}>
      <PdfChartImage
        src={burnPng}
        caption={`Total projected burn: ${fmtUsd(
          totalBurn
        )} per month across COGS, labor, and fixed costs.`}
        brand={brand}
      />
    </PdfSection>
  )
}

function FundingSection({ content, brand }: { content: FinancialsContent; brand: BrandTokens }) {
  const styles = makeStyles(brand)
  const lines = content.funding
  const total = lines.reduce((s, l) => s + l.amount_cents, 0)
  const startupTotal = content.startup_costs.reduce(
    (s, l) => s + l.amount_cents,
    0
  )
  const gap = total - startupTotal

  if (lines.length === 0) {
    return (
      <PdfSection title="Funding sources" brand={brand}>
        <Text style={styles.emptyNote}>
          No funding sources recorded yet.
        </Text>
      </PdfSection>
    )
  }

  const columns: ColumnDef[] = [
    { key: "source", label: "Source", width: 100 },
    { key: "label", label: "Description" },
    { key: "terms", label: "Terms" },
    { key: "amount", label: "Amount", currency: true, width: 90 },
  ]
  const rows: Row[] = lines.map((l) => ({
    source: FUNDING_SOURCE_LABEL[l.source],
    label: l.label || "—",
    terms: l.terms_note ?? "—",
    amount: l.amount_cents,
  }))
  const totalsRow: Row = {
    source: "",
    label: "Total funding",
    terms: "",
    amount: total,
  }

  return (
    <PdfSection title="Funding sources" brand={brand}>
      <PdfTable columns={columns} rows={rows} totalsRow={totalsRow} />
      <Text style={styles.paragraph}>
        {gap >= 0
          ? `Surplus over startup costs: ${fmtUsd(gap)}.`
          : `Funding gap to cover startup costs: ${fmtUsd(Math.abs(gap))}.`}
      </Text>
    </PdfSection>
  )
}

function AiFindingsSection({ content, brand }: { content: FinancialsContent; brand: BrandTokens }) {
  const styles = makeStyles(brand)
  const findings = content.ai_findings
  if (!findings || findings.flags.length === 0) return null

  return (
    <PdfSection title="AI findings" brand={brand}>
      <Text style={styles.paragraph}>
        Last reviewed {findings.last_run_at}. {findings.flags.length}{" "}
        finding{findings.flags.length === 1 ? "" : "s"}.
      </Text>
      {findings.flags.map((flag, i) => (
        <View key={`${flag.rule_id}-${i}`} style={styles.flagRow}>
          <Text style={styles.flagSev}>
            {FLAG_SEVERITY_LABEL[flag.severity]}
          </Text>
          <View style={styles.flagBody}>
            <Text>{flag.message}</Text>
            {flag.evidence && (
              <Text style={styles.flagEvidence}>Evidence: {flag.evidence}</Text>
            )}
          </View>
        </View>
      ))}
    </PdfSection>
  )
}

// ── chart rendering with safe fallback ──────────────────────────────────────

async function renderCharts(content: FinancialsContent, brand: BrandTokens, currencyCode = "USD"): Promise<{
  breakEvenPng: Buffer | null
  burnPng: Buffer | null
}> {
  const summary = computePnl(content.monthly_pnl)
  const hasPnlData =
    summary.totalRevenue > 0 ||
    summary.totalLabor > 0 ||
    summary.totalFixed > 0

  if (!hasPnlData) {
    return { breakEvenPng: null, burnPng: null }
  }

  let breakEvenPng: Buffer | null = null
  let burnPng: Buffer | null = null
  try {
    breakEvenPng = await chartToPng({
      config: breakEvenChartConfig(content.monthly_pnl, brand, currencyCode),
      width: 900,
      height: 480,
    })
  } catch {
    breakEvenPng = null
  }
  try {
    burnPng = await chartToPng({
      config: monthlyBurnChartConfig(content.monthly_pnl, brand, currencyCode),
      width: 900,
      height: 480,
    })
  } catch {
    burnPng = null
  }
  return { breakEvenPng, burnPng }
}

// ── top-level document ──────────────────────────────────────────────────────

function FinancialsPdf(opts: RenderOpts) {
  const { content, shopName, generatedDate, breakEvenPng, burnPng, brand, currencyCode } = opts
  const styles = makeStyles(brand)
  return (
    <PdfDocument shopName={shopName}>
      {renderCoverPage(opts)}
      <Page size={brand.page.size} style={styles.page}>
        <PdfHeader
          shopName={shopName}
          workspaceName="Financials report"
          brand={brand}
        />
        <ExecutiveSummary content={content} brand={brand} currencyCode={currencyCode} />
        <StartupCostsSection content={content} brand={brand} />
        <MonthlyPnlSection content={content} brand={brand} />
        <BreakEvenChartSection
          breakEvenPng={breakEvenPng}
          content={content}
          brand={brand}
        />
        <MonthlyBurnChartSection burnPng={burnPng} content={content} brand={brand} />
        <FundingSection content={content} brand={brand} />
        <AiFindingsSection content={content} brand={brand} />
        <PdfFooter generatedDate={generatedDate} brand={brand} />
      </Page>
    </PdfDocument>
  )
}

// ── template export ─────────────────────────────────────────────────────────

export const financialsTemplate: PdfTemplate<unknown> = {
  workspace_key: "financials",

  render: async (ctx) => {
    const brand = ctx.brand
    const content = parseFinancialsContent(ctx.content)
    const { breakEvenPng, burnPng } = await renderCharts(content, brand, ctx.currencyCode)
    return (
      <FinancialsPdf
        content={content}
        shopName={ctx.plan.shop_name}
        generatedDate={fmtDateLong(new Date())}
        breakEvenPng={breakEvenPng}
        burnPng={burnPng}
        currencyCode={ctx.currencyCode}
        brand={brand}
      />
    )
  },

  filename: (ctx) => {
    const slug = slugify(ctx.plan.shop_name)
    const date = fmtYyyymmdd(new Date())
    return `financials-${slug}-${date}.pdf`
  },
}
