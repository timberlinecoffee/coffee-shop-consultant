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
import type { BusinessPlanSectionData } from "@/lib/business-plan";
import { buildFinancialDocVisibility, type FinancialDocumentVisibility } from "@/lib/business-plan-financials";
import { renderCover } from "@/lib/pdf/business-plan/covers";
import { FinancialPlanPages } from "@/lib/pdf/business-plan/financial-plan-pages";
import {
  assembleCompanyConcept,
  assembleTargetMarket,
  assembleExecutionOperations,
  assembleExecutionMarketingSales,
  assembleOperationsLaunch,
  assembleTeamHiring,
  assembleFinancialPlan,
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
  type MonthlyProjections,
  type EquipmentSummary,
} from "@/lib/financial-projection";

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
    sectionTitle: {
      fontFamily: brand.fonts.serif,
      fontSize: 18,
      fontWeight: 600,
      color: brand.colors.primary,
      marginBottom: 6,
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
    body: {
      fontSize: 10,
      color: brand.colors.ink,
      lineHeight: 1.55,
      whiteSpace: "pre-wrap",
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
function TocPage({ sections, shopName, date, brand }: { sections: BusinessPlanSectionData[]; shopName: string; date: string; brand: BrandTokens }) {
  const S = makeStyles(brand);
  const visible = sections.filter((s) => s.isVisible);
  const sectionMetaByKey = new Map(BUSINESS_PLAN_SECTIONS.map((m) => [m.key, m]));

  // TOC content starts on page 2 (cover is page 1); first visible section page
  // is 3. Each visible subsection occupies one page in the current layout.
  const visibleWithPages = visible.map((section, idx) => ({
    section,
    pageNumber: 3 + idx,
  }));

  type TocRow =
    | { kind: "section"; section: BusinessPlanSectionData; page: number }
    | { kind: "group"; title: string }
    | { kind: "sub"; section: BusinessPlanSectionData; page: number };

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

  return (
    <Page size={brand.page.size} style={S.page}>
      <PdfHeader shopName={shopName} workspaceName="Business Plan" brand={brand} />
      <Text style={S.tocTitle}>Table of Contents</Text>
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
}: {
  section: BusinessPlanSectionData;
  shopName: string;
  date: string;
  brand: BrandTokens;
}) {
  const S = makeStyles(brand);
  const content = section.userContent ?? section.autoContent;
  const isEmpty = !content || content.includes("workspace to populate");

  return (
    <Page size={brand.page.size} style={S.page}>
      <PdfHeader shopName={shopName} workspaceName={section.title} brand={brand} />
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
    const { shopName, sections, cover, financialData, financialDocVisibility } = content;
    const displayName = shopName ?? "Coffee Shop Business Plan";
    const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const visible = sections.filter((s) => s.isVisible);

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
        <TocPage sections={sections} shopName={displayName} date={date} brand={brand} />
        {visible.map((section) => (
          <SectionPage key={section.key} section={section} shopName={displayName} date={date} brand={brand} />
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
      supabase.from("business_plan_financial_documents").select("document_key, is_visible").eq("plan_id", planId),
    ]);

    const savedMap = new Map(
      (savedSections ?? []).map((s: { section_key: string; user_content: string | null; is_visible: boolean }) => [s.section_key, s])
    );

    // TIM-1498: two-level taxonomy autoContent map.
    const autoContent: Record<string, string> = {
      "executive-summary":
        (savedMap.get("executive-summary") as { user_content: string | null } | undefined)?.user_content
        ?? "Complete the other sections and generate an executive summary.",
      "opportunity-problem-solution": "",
      "opportunity-target-market": assembleTargetMarket(conceptDoc?.content),
      "opportunity-competition": "",
      "execution-marketing-sales": assembleExecutionMarketingSales(
        (menuRows ?? []) as BpMenuItem[],
        toBpMarketingPlanning(marketingDoc?.content),
      ),
      "execution-operations": assembleExecutionOperations(
        (locationRows ?? []) as BpLocationCandidate[],
        (equipmentRows ?? []) as BpEquipmentItem[],
        financialModel,
      ),
      "execution-milestones-metrics": assembleOperationsLaunch(
        (launchRows ?? []) as BpLaunchItem[],
      ),
      "company-overview": assembleCompanyConcept(conceptDoc?.content),
      "company-team": assembleTeamHiring((hiringRows ?? []) as BpHiringRole[]),
      "financial-plan-forecast": assembleFinancialPlan(financialModel, equipmentRows ?? []),
      "financial-plan-financing": "",
      "financial-plan-statements": assembleFinancialPlan(financialModel, equipmentRows ?? []),
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

    const financialDocVisibility = buildFinancialDocVisibility(
      (financialDocRows ?? []) as { document_key: string; is_visible: boolean }[]
    );

    return {
      shopName: plan?.plan_name ?? null,
      sections,
      cover,
      financialData,
      financialDocVisibility,
    };
  },
};
