// TIM-1037: Business Plan Generator PDF template.
// TIM-1225: wires in branded cover (renderCover) and logo bytes via dataLoader.
// TIM-1316: financial appendix pages (P&L, cash flow, balance sheet).

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { BRAND, registerFonts } from "../brand";
import { PdfDocument } from "../components/PdfDocument";
import { PdfHeader } from "../components/PdfHeader";
import { PdfFooter } from "../components/PdfFooter";
import type { PdfTemplate } from "../registry";
import type { BusinessPlanSectionData } from "@/lib/business-plan";
import { renderCover } from "@/lib/pdf/business-plan/covers";
import {
  assembleCompanyConcept,
  assembleMarketAnalysis,
  assembleLocationSection,
  assembleBuildoutEquipment,
  assembleMenuPricing,
  assembleMarketingPlan,
  assembleOperationsLaunch,
  assembleTeamHiring,
  assembleFinancialPlan,
  BUSINESS_PLAN_SECTIONS,
  type BpLocationCandidate,
  type BpEquipmentItem,
  type BpMenuItem,
  type BpLaunchItem,
  type BpHiringRole,
  toBpMarketingPlanning,
} from "@/lib/business-plan";
import {
  normalizeMonthlyProjections,
  computeMonthlySlices,
  fiscalYearMonthLabels,
  type MonthlyProjections,
  type MonthlySlice,
  type EquipmentSummary,
} from "@/lib/financial-projection";
import { formatMinorUnits } from "@/lib/currency";

registerFonts();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BusinessPlanCoverData {
  template_id: string;
  accent_color: string | null;
  tagline: string | null;
  prepared_for: string | null;
  author_name: string | null;
  logo?: { data: Buffer; format: "png" | "jpg" }; // react-pdf uses "jpg" not "jpeg"
}

export interface BusinessPlanPdfContent {
  shopName: string | null;
  sections: BusinessPlanSectionData[];
  cover: BusinessPlanCoverData;
  financialData?: { mp: MonthlyProjections; equipment: EquipmentSummary };
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    color: BRAND.colors.ink,
    backgroundColor: BRAND.colors.paper,
    paddingTop: BRAND.page.margin,
    paddingBottom: BRAND.page.margin + 20,
    paddingLeft: BRAND.page.margin,
    paddingRight: BRAND.page.margin,
  },
  tocTitle: {
    fontFamily: BRAND.fonts.serif,
    fontSize: 16,
    fontWeight: 600,
    color: BRAND.colors.ink,
    marginBottom: 16,
  },
  tocRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: BRAND.colors.rule,
  },
  tocLabel: {
    fontSize: 10,
    color: BRAND.colors.ink,
  },
  tocNumber: {
    fontSize: 10,
    color: BRAND.colors.muted,
  },
  sectionTitle: {
    fontFamily: BRAND.fonts.serif,
    fontSize: 18,
    fontWeight: 600,
    color: BRAND.colors.primary,
    marginBottom: 6,
  },
  sourceLabel: {
    fontSize: 8,
    color: BRAND.colors.muted,
    marginBottom: 14,
    fontStyle: "italic",
  },
  rule: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
    marginBottom: 16,
  },
  body: {
    fontSize: 10,
    color: BRAND.colors.ink,
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
  },
  noContent: {
    fontSize: 10,
    color: BRAND.colors.muted,
    fontStyle: "italic",
  },
});

// ── Financial appendix styles ─────────────────────────────────────────────────

const FA = StyleSheet.create({
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
  headingBar: {
    backgroundColor: BRAND.colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 10,
  },
  heading: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 11,
    color: BRAND.colors.paper,
  },
  table: {
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    marginBottom: 10,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: BRAND.colors.rule,
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.rule,
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
    color: BRAND.colors.ink,
    width: 140,
  },
  labelCellBold: {
    fontWeight: 700,
  },
  valueCell: {
    padding: 4,
    fontSize: 8,
    color: BRAND.colors.ink,
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

// ── Financial appendix helpers ────────────────────────────────────────────────

type ApxRow = {
  label: string;
  values: number[];
  bold?: boolean;
  negative?: boolean;
};

function fiscalReorder<T>(items: T[], fiscalStart: number): T[] {
  const s = Math.min(12, Math.max(1, Math.round(fiscalStart || 1))) - 1;
  return Array.from({ length: items.length }, (_, i) => items[(s + i) % 12]);
}

function buildApxPlRows(year1: MonthlySlice[], fiscalStart: number): ApxRow[] {
  const ordered = fiscalReorder(year1, fiscalStart);
  return [
    { label: "Net revenue", values: ordered.map((s) => s.net_revenue_cents), bold: true },
    { label: "COGS", values: ordered.map((s) => -s.total_cogs_cents), negative: true },
    { label: "Gross profit", values: ordered.map((s) => s.net_revenue_cents - s.total_cogs_cents), bold: true },
    { label: "Labor", values: ordered.map((s) => -s.labor_cents), negative: true },
    { label: "Rent", values: ordered.map((s) => -s.rent_cents), negative: true },
    { label: "Marketing", values: ordered.map((s) => -s.marketing_cents), negative: true },
    { label: "Utilities", values: ordered.map((s) => -s.utilities_cents), negative: true },
    { label: "Insurance", values: ordered.map((s) => -s.insurance_cents), negative: true },
    { label: "Tech / software", values: ordered.map((s) => -s.tech_cents), negative: true },
    { label: "Maintenance", values: ordered.map((s) => -s.maintenance_cents), negative: true },
    { label: "Supplies", values: ordered.map((s) => -s.supplies_cents), negative: true },
    { label: "Other operating", values: ordered.map((s) => -s.other_opex_cents), negative: true },
    { label: "Total opex", values: ordered.map((s) => -s.total_opex_cents), bold: true, negative: true },
    { label: "EBITDA", values: ordered.map((s) => s.operating_income_cents), bold: true },
    { label: "Depreciation", values: ordered.map((s) => -s.depreciation_cents), negative: true },
    { label: "EBIT", values: ordered.map((s) => s.ebit_cents), bold: true },
    { label: "Interest", values: ordered.map((s) => -s.interest_cents), negative: true },
    { label: "Income tax", values: ordered.map((s) => -s.taxes_cents), negative: true },
    { label: "Net income", values: ordered.map((s) => s.net_income_cents), bold: true },
  ];
}

function buildApxCashFlowRows(year1: MonthlySlice[], fiscalStart: number): ApxRow[] {
  const ordered = fiscalReorder(year1, fiscalStart);
  return [
    { label: "Net income", values: ordered.map((s) => s.net_income_cents) },
    { label: "Depreciation (add back)", values: ordered.map((s) => s.depreciation_cents) },
    { label: "Operating cash flow", values: ordered.map((s) => s.net_income_cents + s.depreciation_cents), bold: true },
    { label: "Capital expenditures", values: ordered.map((s) => -s.capex_cents), negative: true },
    { label: "Loan repayment", values: ordered.map((s) => -s.loan_repayment_cents), negative: true },
    { label: "Net cash flow", values: ordered.map((s) => s.net_cash_cents), bold: true },
    { label: "Ending cash balance", values: ordered.map((s) => s.cash_cents), bold: true },
  ];
}

function buildApxBalanceSheetRows(year1: MonthlySlice[], fiscalStart: number): ApxRow[] {
  const ordered = fiscalReorder(year1, fiscalStart);
  return [
    { label: "Cash", values: ordered.map((s) => s.cash_cents) },
    { label: "Accounts receivable", values: ordered.map((s) => s.accounts_receivable_cents) },
    { label: "Inventory", values: ordered.map((s) => s.inventory_cents) },
    { label: "Net fixed assets", values: ordered.map((s) => s.net_fixed_assets_cents) },
    { label: "Total assets", values: ordered.map((s) => s.total_assets_cents), bold: true },
    { label: "Accounts payable", values: ordered.map((s) => s.accounts_payable_cents) },
    { label: "Current debt", values: ordered.map((s) => s.current_debt_cents) },
    { label: "Long-term debt", values: ordered.map((s) => s.long_term_debt_cents) },
    { label: "Total liabilities", values: ordered.map((s) => s.total_liabilities_cents), bold: true },
    { label: "Owner equity", values: ordered.map((s) => s.owner_equity_cents) },
    { label: "Retained earnings", values: ordered.map((s) => s.retained_earnings_cents) },
    { label: "Total equity", values: ordered.map((s) => s.total_equity_cents), bold: true },
    { label: "Liabilities + equity", values: ordered.map((s) => s.total_liabilities_and_equity_cents), bold: true },
  ];
}

function FinancialMonthTable({
  headers,
  rows,
  showTotal,
  totalLabel,
  code,
}: {
  headers: string[];
  rows: ApxRow[];
  showTotal: boolean;
  totalLabel: string;
  code: string;
}) {
  return (
    <View style={FA.table}>
      <View style={FA.tableHeaderRow}>
        <Text style={[FA.labelCell, FA.labelCellBold]}>Line item</Text>
        {headers.map((h, i) => (
          <Text key={`${h}-${i}`} style={[FA.valueCell, FA.valueCellBold]}>{h}</Text>
        ))}
        {showTotal && (
          <Text style={[FA.valueCell, FA.valueCellBold]}>{totalLabel}</Text>
        )}
      </View>
      {rows.map((row, i) => {
        const total = row.values.reduce((s, v) => s + v, 0);
        return (
          <View
            key={`${row.label}-${i}`}
            style={[
              FA.tableRow,
              row.bold ? FA.tableRowBold : i % 2 === 1 ? FA.tableRowAlt : {},
            ]}
          >
            <Text style={[FA.labelCell, row.bold ? FA.labelCellBold : {}]}>
              {row.label}
            </Text>
            {row.values.map((v, j) => (
              <Text
                key={`v-${j}`}
                style={[
                  FA.valueCell,
                  row.bold ? FA.valueCellBold : {},
                  (row.negative || v < 0) ? FA.valueCellNeg : {},
                ]}
              >
                {formatMinorUnits(v, code)}
              </Text>
            ))}
            {showTotal && (
              <Text
                style={[
                  FA.valueCell,
                  FA.totalCell,
                  (row.negative || total < 0) ? FA.valueCellNeg : {},
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

function FinancialAppendixPages({
  mp,
  equipment,
  shopName,
  date,
}: {
  mp: MonthlyProjections;
  equipment: EquipmentSummary;
  shopName: string;
  date: string;
}) {
  const code = mp.currency_code ?? "USD";
  const fiscalStart = mp.fiscal_year_start_month ?? 1;
  const months = fiscalYearMonthLabels(fiscalStart);

  const slices = computeMonthlySlices(mp, equipment, {});
  const year1 = slices.filter((s) => s.year === 1);
  if (year1.length === 0) return null;

  const plRows = buildApxPlRows(year1, fiscalStart);
  const cfRows = buildApxCashFlowRows(year1, fiscalStart);
  const bsRows = buildApxBalanceSheetRows(year1, fiscalStart);

  // 5-year annual summary rows
  const years = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
  const annualRevRow: ApxRow = {
    label: "Net revenue",
    values: [1, 2, 3, 4, 5].map((y) =>
      slices.filter((s) => s.year === y).reduce((acc, s) => acc + s.net_revenue_cents, 0)
    ),
    bold: true,
  };
  const annualNetRow: ApxRow = {
    label: "Net income",
    values: [1, 2, 3, 4, 5].map((y) =>
      slices.filter((s) => s.year === y).reduce((acc, s) => acc + s.net_income_cents, 0)
    ),
    bold: true,
  };
  const annualCashRow: ApxRow = {
    label: "Ending cash",
    values: [1, 2, 3, 4, 5].map((y) => {
      const ys = slices.filter((s) => s.year === y);
      return ys.length > 0 ? ys[ys.length - 1].cash_cents : 0;
    }),
    bold: true,
  };
  const annualEbitdaRow: ApxRow = {
    label: "EBITDA",
    values: [1, 2, 3, 4, 5].map((y) =>
      slices.filter((s) => s.year === y).reduce((acc, s) => acc + s.operating_income_cents, 0)
    ),
    bold: true,
  };

  return (
    <>
      {/* Annual summary + Year 1 P&L (landscape) */}
      <Page size="A4" orientation="landscape" style={FA.pageLandscape}>
        <PdfHeader shopName={shopName} workspaceName="Financial Appendix" />
        <View style={FA.headingBar}>
          <Text style={FA.heading}>5-Year Financial Summary</Text>
        </View>
        <FinancialMonthTable
          headers={years}
          rows={[annualRevRow, annualEbitdaRow, annualNetRow, annualCashRow]}
          showTotal={false}
          totalLabel=""
          code={code}
        />
        <View style={FA.headingBar}>
          <Text style={FA.heading}>Year 1: Monthly Profit & Loss</Text>
        </View>
        <FinancialMonthTable
          headers={months}
          rows={plRows}
          showTotal={true}
          totalLabel="Year 1"
          code={code}
        />
        <PdfFooter generatedDate={date} />
      </Page>

      {/* Year 1 Cash Flow (landscape) */}
      <Page size="A4" orientation="landscape" style={FA.pageLandscape}>
        <PdfHeader shopName={shopName} workspaceName="Financial Appendix" />
        <View style={FA.headingBar}>
          <Text style={FA.heading}>Year 1: Monthly Cash Flow</Text>
        </View>
        <FinancialMonthTable
          headers={months}
          rows={cfRows}
          showTotal={true}
          totalLabel="Year 1"
          code={code}
        />
        <PdfFooter generatedDate={date} />
      </Page>

      {/* Year 1 Balance Sheet (landscape) */}
      <Page size="A4" orientation="landscape" style={FA.pageLandscape}>
        <PdfHeader shopName={shopName} workspaceName="Financial Appendix" />
        <View style={FA.headingBar}>
          <Text style={FA.heading}>Year 1: Monthly Balance Sheet (End of Month)</Text>
        </View>
        <FinancialMonthTable
          headers={months}
          rows={bsRows}
          showTotal={false}
          totalLabel=""
          code={code}
        />
        <PdfFooter generatedDate={date} />
      </Page>
    </>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function TocPage({ sections, shopName, date }: { sections: BusinessPlanSectionData[]; shopName: string; date: string }) {
  const visible = sections.filter((s) => s.isVisible);
  return (
    <Page size={BRAND.page.size} style={S.page}>
      <PdfHeader shopName={shopName} workspaceName="Business Plan" />
      <Text style={S.tocTitle}>Table of Contents</Text>
      {visible.map((section, i) => (
        <View key={section.key} style={S.tocRow}>
          <Text style={S.tocLabel}>{i + 1}. {section.title}</Text>
          <Text style={S.tocNumber}>{i + 2}</Text>
        </View>
      ))}
      <PdfFooter generatedDate={date} />
    </Page>
  );
}

function SectionPage({
  section,
  shopName,
  date,
}: {
  section: BusinessPlanSectionData;
  shopName: string;
  date: string;
}) {
  const content = section.userContent ?? section.autoContent;
  const isEmpty = !content || content.includes("workspace to populate");

  return (
    <Page size={BRAND.page.size} style={S.page}>
      <PdfHeader shopName={shopName} workspaceName={section.title} />
      <View style={{ marginBottom: 8 }}>
        <Text style={S.sectionTitle}>{section.title}</Text>
        <Text style={S.sourceLabel}>{section.sourceLabel}</Text>
        <View style={S.rule} />
        {isEmpty ? (
          <Text style={S.noContent}>{content}</Text>
        ) : (
          <Text style={S.body}>{content}</Text>
        )}
      </View>
      <PdfFooter generatedDate={date} />
    </Page>
  );
}

// ── Template ──────────────────────────────────────────────────────────────────

export const businessPlanTemplate: PdfTemplate<BusinessPlanPdfContent> = {
  workspace_key: "concept", // fallback; dataLoader is used
  render({ content }) {
    const { shopName, sections, cover, financialData } = content;
    const displayName = shopName ?? "Coffee Shop Business Plan";
    const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const visible = sections.filter((s) => s.isVisible);

    return (
      <PdfDocument>
        {renderCover(cover.template_id, {
          shopName: displayName,
          tagline: cover.tagline ?? undefined,
          preparedFor: cover.prepared_for ?? undefined,
          authorName: cover.author_name ?? undefined,
          date,
          accentColor: cover.accent_color ?? undefined,
          logo: cover.logo,
        })}
        <TocPage sections={sections} shopName={displayName} date={date} />
        {visible.map((section) => (
          <SectionPage key={section.key} section={section} shopName={displayName} date={date} />
        ))}
        {financialData && (
          <FinancialAppendixPages
            mp={financialData.mp}
            equipment={financialData.equipment}
            shopName={displayName}
            date={date}
          />
        )}
      </PdfDocument>
    );
  },
  filename({ plan }) {
    const slug = (plan.shop_name ?? "business-plan").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    return `${slug}-business-plan.pdf`;
  },
  async dataLoader(planId, _userId, supabase) {
    const [
      { data: plan },
      { data: conceptDoc },
      { data: locationRows },
      { data: equipmentRows },
      { data: menuRows },
      { data: launchRows },
      { data: hiringRows },
      { data: marketingDoc },
      { data: financialModel },
      { data: savedSections },
      { data: coverRow },
    ] = await Promise.all([
      supabase.from("coffee_shop_plans").select("id, plan_name").eq("id", planId).single(),
      supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "concept").maybeSingle(),
      supabase.from("location_candidates").select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes").eq("plan_id", planId).eq("archived", false).order("position"),
      supabase.from("buildout_equipment_items").select("id, name, cost_usd, category, notes").eq("plan_id", planId).eq("archived", false).order("position"),
      supabase.from("menu_items_with_cogs").select("id, name, category_name, price_cents").eq("plan_id", planId).order("position"),
      supabase.from("launch_timeline_items").select("id, milestone, target_date, status").eq("plan_id", planId).order("order_index"),
      supabase.from("hiring_plan_roles").select("id, role_title, headcount, start_date, monthly_cost_cents, status").eq("plan_id", planId).order("created_at"),
      supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "marketing").maybeSingle(),
      supabase.from("financial_models").select("forecast_inputs, monthly_projections, startup_costs").eq("plan_id", planId).maybeSingle(),
      supabase.from("business_plan_sections").select("section_key, user_content, is_visible").eq("plan_id", planId),
      supabase.from("business_plan_cover").select("template_id, accent_color, logo_path, tagline, prepared_for, author_name").eq("plan_id", planId).maybeSingle(),
    ]);

    const savedMap = new Map(
      (savedSections ?? []).map((s: { section_key: string; user_content: string | null; is_visible: boolean }) => [s.section_key, s])
    );

    const autoContent: Record<string, string> = {
      executive_summary: (savedMap.get("executive_summary") as { user_content: string | null } | undefined)?.user_content ?? "Complete the other sections and generate an executive summary.",
      company_concept: assembleCompanyConcept(conceptDoc?.content),
      market_analysis: assembleMarketAnalysis(conceptDoc?.content),
      location_real_estate: assembleLocationSection((locationRows ?? []) as BpLocationCandidate[]),
      buildout_equipment: assembleBuildoutEquipment((equipmentRows ?? []) as BpEquipmentItem[], financialModel),
      menu_pricing: assembleMenuPricing((menuRows ?? []) as BpMenuItem[]),
      marketing_plan: assembleMarketingPlan(toBpMarketingPlanning(marketingDoc?.content)),
      operations_launch: assembleOperationsLaunch((launchRows ?? []) as BpLaunchItem[]),
      team_hiring: assembleTeamHiring((hiringRows ?? []) as BpHiringRole[]),
      financial_plan: assembleFinancialPlan(financialModel, equipmentRows ?? []),
      funding_request: "",
    };

    const sections: BusinessPlanSectionData[] = BUSINESS_PLAN_SECTIONS.map((meta) => {
      const saved = savedMap.get(meta.key) as { user_content: string | null; is_visible: boolean } | undefined;
      return {
        key: meta.key,
        title: meta.title,
        sourceLabel: meta.sourceLabel,
        autoContent: autoContent[meta.key] ?? "",
        userContent: saved?.user_content ?? null,
        isVisible: saved?.is_visible ?? meta.defaultVisible,
      };
    });

    // Download logo bytes when a path is set.
    let logoData: { data: Buffer; format: "png" | "jpg" } | undefined;
    if (coverRow?.logo_path) {
      const { data: logoBlob } = await supabase.storage
        .from("business-plan-logos")
        .download(coverRow.logo_path);
      if (logoBlob) {
        const ab = await logoBlob.arrayBuffer();
        const ext = coverRow.logo_path.endsWith(".jpg") ? "jpg" : "png";
        logoData = { data: Buffer.from(ab), format: ext as "png" | "jpg" };
      }
    }

    const cover: BusinessPlanCoverData = {
      template_id: coverRow?.template_id ?? "classic",
      accent_color: coverRow?.accent_color ?? null,
      tagline: coverRow?.tagline ?? null,
      prepared_for: coverRow?.prepared_for ?? null,
      author_name: coverRow?.author_name ?? null,
      logo: logoData,
    };

    // Build financial appendix data from the financial model.
    let financialData: BusinessPlanPdfContent["financialData"];
    if (financialModel) {
      const mp = normalizeMonthlyProjections(
        financialModel.forecast_inputs ?? financialModel.monthly_projections
      );
      const totalEquipCostUsd = (equipmentRows ?? []).reduce(
        (sum: number, e: { cost_usd?: number }) => sum + (e.cost_usd ?? 0),
        0
      );
      const equipment: EquipmentSummary = {
        total_cost_cents: Math.round(totalEquipCostUsd * 100),
        financed_cost_cents: Math.round(totalEquipCostUsd * 100),
      };
      financialData = { mp, equipment };
    }

    return {
      shopName: plan?.plan_name ?? null,
      sections,
      cover,
      financialData,
    };
  },
};
