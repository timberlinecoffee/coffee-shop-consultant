// TIM-1037: Business Plan Generator PDF template.
// TIM-1225: wires in branded cover (renderCover) and logo bytes via dataLoader.

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { BRAND } from "../brand";
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
  type BpMarketingBrand,
} from "@/lib/business-plan";

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
    const { shopName, sections, cover } = content;
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
      { data: marketingBrandRow },
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
      supabase.from("marketing_brand").select("positioning_statement, brand_pillar_1, brand_pillar_2, brand_pillar_3").eq("plan_id", planId).maybeSingle(),
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
      marketing_plan: assembleMarketingPlan(marketingBrandRow as BpMarketingBrand | null),
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

    return {
      shopName: plan?.plan_name ?? null,
      sections,
      cover,
    };
  },
};
