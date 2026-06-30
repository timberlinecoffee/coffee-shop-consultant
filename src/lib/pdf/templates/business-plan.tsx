// TIM-1037: Business Plan Generator PDF template.
// TIM-1225: wires in branded cover (renderCover) and logo bytes via dataLoader.
// TIM-1316: financial appendix pages (P&L, cash flow, balance sheet).
// TIM-1496: YYC-matched Financial Plan sub-blocks (Forecast / Financing / Statements / Appendix).

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { BRAND, registerFonts, type BrandTokens } from "../brand";
import { PdfDocument } from "../components/PdfDocument";
import { PdfHeader } from "../components/PdfHeader";
import { PdfFooter } from "../components/PdfFooter";
import type { PdfTemplate } from "../registry";
import type { BusinessPlanSectionData, CustomSectionData } from "@/lib/business-plan";
import { buildFinancialDocVisibility, type FinancialDocumentVisibility } from "@/lib/business-plan-financials";
import { renderCover } from "@/lib/pdf/business-plan/covers";
import { MarkdownBlocks } from "@/lib/pdf/business-plan/markdown-blocks";
import { FinancialPlanPages } from "@/lib/pdf/business-plan/financial-plan-pages";
import {
  assembleCompanyConcept,
  assembleTargetMarket,
  assembleExecutionOperations,
  assembleExecutionMarketingSales,
  assembleOperationsLaunch,
  assembleTeamHiring,
  assembleFinancialPlan,
  // TIM-2341: lender-ready section assemblers.
  assembleUnitEconomicsSection,
  assembleBreakEvenSection,
  assembleSensitivitySection,
  assembleDscrSection,
  assembleCapexScheduleSection,
  assembleDepreciationScheduleSection,
  assembleWorkingCapitalSection,
  assembleRisksPlaceholderSection,
  BUSINESS_PLAN_SECTIONS,
  BUSINESS_PLAN_GROUPS,
  type BpLocationCandidate,
  type BpEquipmentItem,
  type BpMenuItem,
  type BpLaunchItem,
  type BpHiringRole,
  toBpMarketingPlanning,
} from "@/lib/business-plan";
import {
  normalizeMonthlyProjections,
  computeMenuBlendedCogsPct,
  type MonthlyProjections,
  type EquipmentSummary,
} from "@/lib/financial-projection";
// TIM-2341: PDF dataLoader builds plan_state so the lender-ready sections
// in the exported PDF read the same numbers the workspace UI shows.
import { buildPlanState } from "@/lib/business-plan/plan-state";

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
  // TIM-3111: custom sections rendered after standard sections.
  customSections?: CustomSectionData[];
  cover: BusinessPlanCoverData;
  financialData?: { mp: MonthlyProjections; equipment: EquipmentSummary };
  financialDocVisibility?: FinancialDocumentVisibility;
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
    tocTitle: {
      fontFamily: brand.fonts.serif,
      fontSize: 16,
      fontWeight: 600,
      color: brand.colors.ink,
      marginBottom: 16,
    },
    tocRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 4,
      borderBottomWidth: 0.5,
      borderBottomColor: brand.colors.rule,
    },
    tocLabel: {
      fontSize: 10,
      color: brand.colors.ink,
    },
    tocGroupRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: 10,
      paddingBottom: 4,
      borderBottomWidth: 0.5,
      borderBottomColor: brand.colors.rule,
    },
    tocGroupLabel: {
      fontFamily: brand.fonts.serif,
      fontSize: 11,
      fontWeight: 700,
      color: brand.colors.ink,
    },
    tocSubRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 4,
      paddingLeft: 16,
      borderBottomWidth: 0.5,
      borderBottomColor: brand.colors.rule,
    },
    tocNumber: {
      fontSize: 10,
      color: brand.colors.muted,
    },
    sectionEyebrow: {
      fontFamily: brand.fonts.sans,
      fontSize: 9,
      fontWeight: 600,
      letterSpacing: 1.6,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    sectionTitle: {
      fontFamily: brand.fonts.serif,
      fontSize: 22,
      fontWeight: 600,
      color: brand.colors.primary,
      marginBottom: 6,
      lineHeight: 1.15,
    },
    sourceLabel: {
      fontSize: 8,
      color: brand.colors.muted,
      marginBottom: 14,
      fontStyle: "italic",
    },
    rule: {
      borderBottomWidth: 1,
      borderBottomColor: brand.colors.rule,
      marginBottom: 16,
    },
    noContent: {
      fontSize: 10,
      color: brand.colors.muted,
      fontStyle: "italic",
    },
  });
}


// ── Components ────────────────────────────────────────────────────────────────

// TIM-1498: two-level TOC. Top-level sections (Executive Summary) appear in
// their own row. Grouped subsections appear under a bold group header with
// indented child rows. Page numbers are per subsection.
function TocPage({ sections, customSections, shopName, date, brand, accentColor }: { sections: BusinessPlanSectionData[]; customSections?: CustomSectionData[]; shopName: string; date: string; brand: BrandTokens; accentColor?: string | null }) {
  const S = makeStyles(brand);
  const tocColor = accentColor || brand.colors.accent;
  const visible = sections.filter((s) => s.isVisible);
  const visibleCustom = (customSections ?? []).filter((cs) => cs.isVisible);
  const sectionMetaByKey = new Map(BUSINESS_PLAN_SECTIONS.map((m) => [m.key, m]));

  // TOC content starts on page 2 (cover is page 1); first visible section page
  // is 3. Each visible subsection occupies one page in the current layout.
  const visibleWithPages = visible.map((section, idx) => ({
    section,
    pageNumber: 3 + idx,
  }));

  const customStartPage = 3 + visible.length;

  type TocRow =
    | { kind: "section"; section: BusinessPlanSectionData; page: number }
    | { kind: "group"; title: string }
    | { kind: "sub"; section: BusinessPlanSectionData; page: number }
    | { kind: "custom-group" }
    | { kind: "custom"; title: string; page: number };

  const rows: TocRow[] = [];
  const seenGroups = new Set<string>();

  for (const { section, pageNumber } of visibleWithPages) {
    const meta = sectionMetaByKey.get(section.key as never);
    const groupKey = meta?.groupKey ?? null;
    if (groupKey === null) {
      rows.push({ kind: "section", section, page: pageNumber });
      continue;
    }
    if (!seenGroups.has(groupKey)) {
      const groupMeta = BUSINESS_PLAN_GROUPS.find((g) => g.key === groupKey);
      if (groupMeta) {
        rows.push({ kind: "group", title: groupMeta.title });
        seenGroups.add(groupKey);
      }
    }
    rows.push({ kind: "sub", section, page: pageNumber });
  }

  // TIM-3111: custom section TOC rows.
  if (visibleCustom.length > 0) {
    rows.push({ kind: "custom-group" });
    visibleCustom.forEach((cs, idx) => {
      rows.push({ kind: "custom", title: cs.title, page: customStartPage + idx });
    });
  }

  return (
    <Page size={brand.page.size} style={S.page}>
      <PdfHeader shopName={shopName} workspaceName="Business Plan" brand={brand} />
      <Text style={[S.tocTitle, { color: tocColor }]}>Table of Contents</Text>
      {rows.map((row, i) => {
        if (row.kind === "group") {
          return (
            <View key={`g-${row.title}-${i}`} style={S.tocGroupRow}>
              <Text style={S.tocGroupLabel}>{row.title}</Text>
              <Text style={S.tocNumber} />
            </View>
          );
        }
        if (row.kind === "sub") {
          return (
            <View key={`s-${row.section.key}-${i}`} style={S.tocSubRow}>
              <Text style={S.tocLabel}>{row.section.title}</Text>
              <Text style={S.tocNumber}>{row.page}</Text>
            </View>
          );
        }
        if (row.kind === "custom-group") {
          return (
            <View key={`cg-${i}`} style={S.tocGroupRow}>
              <Text style={S.tocGroupLabel}>Custom Sections</Text>
              <Text style={S.tocNumber} />
            </View>
          );
        }
        if (row.kind === "custom") {
          return (
            <View key={`cs-${row.title}-${i}`} style={S.tocSubRow}>
              <Text style={S.tocLabel}>{row.title}</Text>
              <Text style={S.tocNumber}>{row.page}</Text>
            </View>
          );
        }
        return (
          <View key={`t-${row.section.key}-${i}`} style={S.tocRow}>
            <Text style={S.tocLabel}>{row.section.title}</Text>
            <Text style={S.tocNumber}>{row.page}</Text>
          </View>
        );
      })}
      <PdfFooter generatedDate={date} brand={brand} />
    </Page>
  );
}

function SectionPage({
  section,
  shopName,
  date,
  brand,
  accentColor,
  groupTitle,
}: {
  section: BusinessPlanSectionData;
  shopName: string;
  date: string;
  brand: BrandTokens;
  accentColor?: string | null;
  groupTitle?: string;
}) {
  const S = makeStyles(brand);
  const content = section.userContent ?? section.autoContent;
  const isEmpty = !content || content.includes("workspace to populate");
  const titleColor = accentColor || brand.colors.accent;
  // TIM-2315: render "Business Plan" in the running header (not the section
  // title) so the body title isn't duplicated on every page.
  return (
    <Page size={brand.page.size} style={S.page}>
      <PdfHeader shopName={shopName} workspaceName="Business Plan" brand={brand} />
      <View style={{ marginBottom: 8 }}>
        {groupTitle ? (
          <Text style={[S.sectionEyebrow, { color: brand.colors.muted }]}>{groupTitle}</Text>
        ) : null}
        <Text style={[S.sectionTitle, { color: titleColor }]}>{section.title}</Text>
        <Text style={S.sourceLabel}>{section.sourceLabel}</Text>
        <View style={[S.rule, { borderBottomColor: titleColor }]} />
        {isEmpty ? (
          <Text style={S.noContent}>{content}</Text>
        ) : (
          <MarkdownBlocks content={content} brand={brand} accentColor={accentColor ?? null} />
        )}
      </View>
      <PdfFooter generatedDate={date} brand={brand} />
    </Page>
  );
}

// TIM-3111: Custom section PDF page — same chrome as SectionPage but no sourceLabel.
function CustomSectionPage({
  section,
  shopName,
  date,
  brand,
  accentColor,
}: {
  section: CustomSectionData;
  shopName: string;
  date: string;
  brand: BrandTokens;
  accentColor?: string | null;
}) {
  const S = makeStyles(brand);
  const content = section.userContent ?? "";
  const isEmpty = !content.trim();
  const titleColor = accentColor || brand.colors.accent;
  return (
    <Page size={brand.page.size} style={S.page}>
      <PdfHeader shopName={shopName} workspaceName="Business Plan" brand={brand} />
      <View style={{ marginBottom: 8 }}>
        <Text style={[S.sectionEyebrow, { color: brand.colors.muted }]}>Custom Section</Text>
        <Text style={[S.sectionTitle, { color: titleColor }]}>{section.title}</Text>
        <View style={[S.rule, { borderBottomColor: titleColor }]} />
        {isEmpty ? (
          <Text style={S.noContent}>No content added for this section.</Text>
        ) : (
          <MarkdownBlocks content={content} brand={brand} accentColor={accentColor ?? null} />
        )}
      </View>
      <PdfFooter generatedDate={date} brand={brand} />
    </Page>
  );
}

// ── Template ──────────────────────────────────────────────────────────────────

export const businessPlanTemplate: PdfTemplate<BusinessPlanPdfContent> = {
  workspace_key: "concept", // fallback; dataLoader is used
  render(ctx) {
    const { content } = ctx;
    const brand = ctx.brand;
    const { shopName, sections, customSections, cover, financialData, financialDocVisibility } = content;
    const displayName = shopName ?? "Coffee Shop Business Plan";
    const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const visible = sections.filter((s) => s.isVisible);
    const visibleCustom = (customSections ?? []).filter((cs) => cs.isVisible);

    const sectionMetaByKey = new Map(BUSINESS_PLAN_SECTIONS.map((m) => [m.key, m]));
    const groupTitleByKey = new Map(BUSINESS_PLAN_GROUPS.map((g) => [g.key, g.title]));

    return (
      <PdfDocument shopName={shopName}>
        {renderCover(cover.template_id, {
          shopName: displayName,
          tagline: cover.tagline ?? undefined,
          preparedFor: cover.prepared_for ?? undefined,
          authorName: cover.author_name ?? undefined,
          date,
          accentColor: cover.accent_color ?? undefined,
          logo: cover.logo,
        }, brand)}
        <TocPage sections={sections} customSections={customSections} shopName={displayName} date={date} brand={brand} accentColor={cover.accent_color} />
        {visible.map((section) => {
          const meta = sectionMetaByKey.get(section.key as never);
          const groupTitle = meta?.groupKey ? groupTitleByKey.get(meta.groupKey) : undefined;
          return (
            <SectionPage
              key={section.key}
              section={section}
              shopName={displayName}
              date={date}
              brand={brand}
              accentColor={cover.accent_color}
              groupTitle={groupTitle}
            />
          );
        })}
        {/* TIM-3111: custom section pages rendered after standard sections */}
        {visibleCustom.map((cs) => (
          <CustomSectionPage
            key={cs.id}
            section={cs}
            shopName={displayName}
            date={date}
            brand={brand}
            accentColor={cover.accent_color}
          />
        ))}
        {financialData && (
          <FinancialPlanPages
            mp={financialData.mp}
            equipment={financialData.equipment}
            shopName={displayName}
            date={date}
            brand={brand}
            visibility={financialDocVisibility ?? {
              key_assumptions: true, revenue_by_month: true, expenses_by_month: true, net_profit_by_year: true,
              use_of_funds: true, sources_of_funds: true,
              projected_pl: true, projected_balance_sheet: true, projected_cash_flow: true,
              monthly_pl: true, monthly_balance_sheet: true, monthly_cash_flow: true,
            }}
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
      { data: financialDocRows },
      { data: customSectionRows },
    ] = await Promise.all([
      supabase.from("coffee_shop_plans").select("id, plan_name").eq("id", planId).single(),
      supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "concept").maybeSingle(),
      // TIM-2341: include city + country so plan_state.lender_metrics inherits
      // the region-aware tax + lender posture in the exported PDF.
      supabase.from("location_candidates").select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes, city, country").eq("plan_id", planId).eq("archived", false).order("position"),
      supabase.from("buildout_equipment_items").select("id, name, cost_local, category, notes").eq("plan_id", planId).eq("archived", false).order("position"),
      // TIM-2341: include cogs columns so menuBlendedCogsPct is computed for
      // the lender-metrics block (mirrors the regenerate-all path).
      supabase.from("menu_items_with_cogs").select("id, name, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived").eq("plan_id", planId).order("position"),
      supabase.from("launch_timeline_items").select("id, milestone, target_date, status").eq("plan_id", planId).order("order_index"),
      supabase.from("hiring_plan_roles").select("id, role_title, headcount, start_date, monthly_cost_cents").eq("plan_id", planId).order("created_at"),
      supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "marketing").maybeSingle(),
      supabase.from("financial_models").select("forecast_inputs, monthly_projections, startup_costs").eq("plan_id", planId).maybeSingle(),
      supabase.from("business_plan_sections").select("section_key, user_content, is_visible").eq("plan_id", planId),
      supabase.from("business_plan_cover").select("template_id, accent_color, logo_path, tagline, prepared_for, author_name").eq("plan_id", planId).maybeSingle(),
      supabase.from("business_plan_financial_documents").select("document_key, is_visible").eq("plan_id", planId),
      supabase.from("business_plan_custom_sections").select("id, title, user_content, is_visible, sort_order").eq("plan_id", planId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    ]);

    const savedMap = new Map(
      (savedSections ?? []).map((s: { section_key: string; user_content: string | null; is_visible: boolean }) => [s.section_key, s])
    );

    // TIM-2341: build plan_state ONCE so the lender-ready section auto-content
    // in the PDF reads the same engine slices as the workspace UI + the AI
    // regenerate-all path. Country is read off the chosen location candidate
    // (plan_state's own resolveRegion handles the absent-country case).
    const menuBlendedCogsPctPdf = computeMenuBlendedCogsPct((menuRows ?? []) as { name?: string; price_cents: number; cogs_cents?: number | null; computed_cogs_cents?: number | null; expected_mix_pct?: number | null; expected_popularity?: "low" | "medium" | "high" | null; archived?: boolean | null }[]);
    const chosenLoc = (locationRows ?? []).find((c: { status?: string }) => c.status === "chosen") ?? (locationRows ?? [])[0];
    const planState = buildPlanState({
      shopName: plan?.plan_name ?? "this coffee shop",
      financialModel,
      locationCandidates: (locationRows ?? []) as BpLocationCandidate[],
      equipment: (equipmentRows ?? []) as BpEquipmentItem[],
      hiringRoles: (hiringRows ?? []) as BpHiringRole[],
      menuBlendedCogsPct: menuBlendedCogsPctPdf,
      locationCountry: (chosenLoc as { country?: string | null })?.country ?? null,
    });
    const currencyCodePdf = planState.meta.currency_code;
    const lenderMetricsPdf = financialModel ? planState.lender_metrics : null;

    // TIM-1498: two-level taxonomy autoContent map.
    // TIM-2341: lender-ready sections plug straight into plan_state.
    const autoContent: Record<string, string> = {
      "executive-summary":
        (savedMap.get("executive-summary") as { user_content: string | null } | undefined)?.user_content
        ?? "Complete the other sections and generate an executive summary.",
      "opportunity-problem-solution": "",
      "opportunity-target-market": assembleTargetMarket(conceptDoc?.content),
      "opportunity-competition": "",
      "opportunity-risks": assembleRisksPlaceholderSection(),
      "execution-marketing-sales": assembleExecutionMarketingSales(
        (menuRows ?? []) as BpMenuItem[],
        toBpMarketingPlanning(marketingDoc?.content),
        currencyCodePdf,
      ),
      "execution-operations": assembleExecutionOperations(
        (locationRows ?? []) as BpLocationCandidate[],
        (equipmentRows ?? []) as BpEquipmentItem[],
        financialModel,
        currencyCodePdf,
      ),
      "execution-milestones-metrics": assembleOperationsLaunch(
        (launchRows ?? []) as BpLaunchItem[],
      ),
      "company-overview": assembleCompanyConcept(conceptDoc?.content),
      "company-team": assembleTeamHiring((hiringRows ?? []) as BpHiringRole[], currencyCodePdf),
      "financial-plan-forecast": assembleFinancialPlan(financialModel, equipmentRows ?? [], menuBlendedCogsPctPdf, currencyCodePdf),
      "financial-plan-unit-economics": assembleUnitEconomicsSection(lenderMetricsPdf, currencyCodePdf),
      "financial-plan-break-even": assembleBreakEvenSection(lenderMetricsPdf, currencyCodePdf),
      "financial-plan-sensitivity": assembleSensitivitySection(lenderMetricsPdf, currencyCodePdf),
      "financial-plan-financing": "",
      "financial-plan-dscr": assembleDscrSection(lenderMetricsPdf, currencyCodePdf),
      "financial-plan-capex-schedule": assembleCapexScheduleSection(lenderMetricsPdf, currencyCodePdf),
      "financial-plan-depreciation": assembleDepreciationScheduleSection(lenderMetricsPdf, currencyCodePdf),
      "financial-plan-working-capital": assembleWorkingCapitalSection(lenderMetricsPdf, currencyCodePdf),
      "financial-plan-statements": assembleFinancialPlan(financialModel, equipmentRows ?? [], menuBlendedCogsPctPdf, currencyCodePdf),
      "appendix-monthly-statements": "Monthly P&L, cash flow, and balance sheet statements appear in the Financial Appendix pages that follow.",
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
      const totalEquipCostLocal = (equipmentRows ?? []).reduce(
        (sum: number, e: { cost_local?: number }) => sum + (e.cost_local ?? 0),
        0
      );
      const equipment: EquipmentSummary = {
        total_cost_cents: Math.round(totalEquipCostLocal * 100),
        financed_cost_cents: Math.round(totalEquipCostLocal * 100),
      };
      financialData = { mp, equipment };
    }

    const financialDocVisibility = buildFinancialDocVisibility(
      (financialDocRows ?? []) as { document_key: string; is_visible: boolean }[]
    );

    // TIM-3111: map custom section DB rows to CustomSectionData.
    const customSections: CustomSectionData[] = (customSectionRows ?? []).map(
      (row: { id: string; title: string; user_content: string | null; is_visible: boolean; sort_order: number }) => ({
        id: row.id,
        title: row.title ?? "Custom Section",
        userContent: row.user_content ?? null,
        isVisible: row.is_visible ?? true,
        sortOrder: row.sort_order ?? 0,
      })
    );

    return {
      shopName: plan?.plan_name ?? null,
      sections,
      customSections,
      cover,
      financialData,
      financialDocVisibility,
    };
  },
};
