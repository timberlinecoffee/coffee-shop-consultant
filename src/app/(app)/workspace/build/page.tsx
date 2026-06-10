// TIM-2595: Build workspace (ui_revamp_v2) — consolidates Location, Equipment,
// Suppliers, Menu, Hiring, and Launch Plan into one page with sub-tabs.
// Each tab renders the existing workspace client component with data fetched
// server-side, identical to the standalone workspace pages. No rewrite of
// inner content; only the sub-tab chrome is new.
//
// Deep links: the 6 old workspace routes redirect here via proxy.ts when v2
// mode is active. Flag-off path (v1): proxy does not redirect; standalone
// pages render unchanged.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { normalizeCurrencyCode } from "@/lib/currency";
import { normalizeConceptV2 } from "@/lib/concept";
import { normalizeLaunchPlanConfig } from "@/lib/launch-plan";
import { resolvePlanMinimumWage } from "@/lib/wages/resolve-plan-geo";
import { CandidateListCard } from "@/components/location-lease/CandidateListCard";
import type { Candidate } from "@/components/location-lease/CandidateListCard";
import { BuildoutEquipmentWorkspace } from "../buildout-equipment/buildout-workspace";
import { SuppliersWorkspace } from "../suppliers/suppliers-workspace";
import { MenuWorkspace } from "../menu-pricing/menu-workspace";
import { HiringWorkspace } from "../hiring/hiring-workspace";
import { OpeningMonthPlanWorkspace } from "../opening-month-plan/opening-month-plan-workspace";
import { BuildSubNav } from "./build-sub-nav";
import type { BuildTab } from "./build-sub-nav";
import type { EquipmentItem } from "@/app/(app)/workspace/financials/financials-workspace";
import type { ListSection } from "@/types/buildout";
import type { VendorCandidate, VendorCustomCategory, VendorDecision } from "@/lib/suppliers";
import type {
  MenuItemWithCogs,
  MenuIngredient,
  MenuItemIngredient,
  MenuCategory,
  CategoryDefaultIngredient,
} from "@/lib/menu";
import type {
  OrgRole,
  InterviewCandidate,
  InterviewQuestion,
  InterviewScore,
  OnboardingPlanInstance,
  OnboardingTask,
  StaffCompetency,
  StaffFile,
  CompetencyEvaluation,
  PlanHiringSettings,
  HiringRequirementSet,
  HiringCountry,
} from "@/lib/hiring";
import type { Milestone } from "@/lib/launch-plan";
import { MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

const VALID_TABS: ReadonlySet<BuildTab> = new Set([
  "location",
  "equipment",
  "suppliers",
  "menu",
  "hiring",
  "launch-plan",
]);

const SHOP_TYPE_MARGIN: Record<string, number> = {
  "Full cafe with food": 0.62,
  "Full cafe (dine-in, food menu)": 0.62,
  "Roastery cafe": 0.65,
  "Mobile cart or kiosk": 0.72,
  "Kiosk (mall, airport, lobby)": 0.72,
  "Mobile cart or pop-up": 0.72,
  "Drive-through": 0.74,
  "Drive-through window": 0.74,
  "Espresso bar (drinks only)": 0.76,
};

function marginFromShopTypes(shopTypes: string[]): number {
  const margins = shopTypes
    .map((t) => SHOP_TYPE_MARGIN[t])
    .filter((m): m is number => m !== undefined);
  return margins.length > 0 ? Math.min(...margins) : 0.75;
}

const MENU_DEFAULT_CATEGORIES = [
  { name: "Espresso", position: 0 },
  { name: "Brewed Coffee", position: 1 },
  { name: "Food", position: 2 },
  { name: "Retail", position: 3 },
  { name: "Seasonal", position: 4 },
];

export default async function BuildWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawTab = typeof params.tab === "string" ? params.tab : "location";
  const activeTab: BuildTab = VALID_TABS.has(rawTab as BuildTab)
    ? (rawTab as BuildTab)
    : "location";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, target_gross_margin")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) redirect("/onboarding");

  const planId = plan.id;

  // ── Location tab ───────────────────────────────────────────────────────────
  if (activeTab === "location") {
    const [{ data: profileData }, { data: rows }] = await Promise.all([
      supabase
        .from("users")
        .select("ai_credits_remaining, subscription_tier")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("location_candidates")
        .select("*")
        .eq("plan_id", planId)
        .eq("archived", false)
        .order("position"),
    ]);

    const initialCandidates: Candidate[] = (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address ?? null,
      neighborhood: r.neighborhood ?? null,
      sq_ft: r.sq_ft ?? null,
      asking_rent_cents: r.asking_rent_cents ?? null,
      cam_cents: r.cam_cents ?? null,
      listing_url: r.listing_url ?? null,
      broker_contact: r.broker_contact ?? null,
      status: (r.status ?? "shortlisted") as Candidate["status"],
      notes: r.notes ?? null,
      position: r.position ?? 0,
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      city: r.city ?? null,
      postal_code: r.postal_code ?? null,
      country: r.country ?? null,
      area_analysis: r.area_analysis ?? null,
      area_analysis_at: r.area_analysis_at ?? null,
    }));

    return (
      <div className="bg-[var(--background)]">
        <div className="max-w-4xl mx-auto px-6 pt-8 pb-12">
          <BuildSubNav active={activeTab} />
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4 min-[1200px]:flex-nowrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <MapPin
                  className="w-5 h-5 text-[var(--teal)] flex-shrink-0"
                  aria-hidden="true"
                />
                <h1 className="text-[28px] font-bold text-[var(--foreground)] leading-tight">
                  Location &amp; Lease
                </h1>
              </div>
              <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
                Compare candidate sites and weigh lease terms before you sign.
              </p>
            </div>
          </header>
          <CandidateListCard
            initialCandidates={initialCandidates}
            planId={planId}
            aiCreditsRemaining={profileData?.ai_credits_remaining ?? 0}
            subscriptionTier={profileData?.subscription_tier ?? "free"}
          />
        </div>
      </div>
    );
  }

  // ── Equipment tab ──────────────────────────────────────────────────────────
  if (activeTab === "equipment") {
    const [equipmentResult, sectionsResult, modelResult, profileResult] =
      await Promise.all([
        supabase
          .from("buildout_equipment_items")
          .select("*")
          .eq("plan_id", planId)
          .eq("archived", false)
          .order("position"),
        supabase
          .from("buildout_list_sections")
          .select("*")
          .eq("plan_id", planId)
          .eq("list_type", "equipment")
          .order("position"),
        supabase
          .from("financial_models")
          .select("updated_at, needs_review_at, forecast_inputs")
          .eq("plan_id", planId)
          .maybeSingle(),
        supabase
          .from("users")
          .select("subscription_status, subscription_tier, copilot_trial_messages_used")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

    const equipment = (equipmentResult.data ?? []) as EquipmentItem[];
    const sections = (sectionsResult.data ?? []) as ListSection[];
    const modelRow = modelResult.data;
    const profile = profileResult.data;
    const canEdit = isSubscriptionActive(profile?.subscription_status);
    const initialTrialMessagesUsed =
      profile?.subscription_tier === "free"
        ? (profile.copilot_trial_messages_used ?? 0)
        : undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawCurrencyCode = (modelRow?.forecast_inputs as any)?.currency_code;
    const initialCurrencyCode = normalizeCurrencyCode(rawCurrencyCode ?? "USD");

    return (
      <div className="bg-[var(--background)]">
        <div className="max-w-5xl mx-auto px-6 pt-8 pb-12">
          <BuildSubNav active={activeTab} />
          <BuildoutEquipmentWorkspace
            planId={planId}
            initialEquipment={equipment}
            initialSections={sections}
            initialModelUpdatedAt={modelRow?.updated_at ?? null}
            initialNeedsReviewAt={modelRow?.needs_review_at ?? null}
            initialModelUpdatedAtForReview={modelRow?.updated_at ?? null}
            canEdit={canEdit}
            initialTrialMessagesUsed={initialTrialMessagesUsed}
            initialCurrencyCode={initialCurrencyCode}
          />
        </div>
      </div>
    );
  }

  // ── Suppliers tab ──────────────────────────────────────────────────────────
  if (activeTab === "suppliers") {
    const [candidatesRes, decisionsRes, customCatsRes, profileRes] =
      await Promise.all([
        supabase
          .from("vendor_candidates")
          .select("*")
          .eq("plan_id", planId)
          .order("category", { ascending: true })
          .order("position", { ascending: true }),
        supabase
          .from("vendor_decisions")
          .select("*")
          .eq("plan_id", planId)
          .eq("is_current", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("vendor_custom_categories")
          .select("*")
          .eq("plan_id", planId)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("users")
          .select("subscription_status, subscription_tier, copilot_trial_messages_used")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

    const profile = profileRes.data;
    const canEdit = isSubscriptionActive(profile?.subscription_status);
    const initialTrialMessagesUsed =
      profile?.subscription_tier === "free"
        ? (profile.copilot_trial_messages_used ?? 0)
        : undefined;

    return (
      <div className="bg-[var(--background)]">
        <div className="max-w-5xl mx-auto px-6 pt-8 pb-12">
          <BuildSubNav active={activeTab} />
          <SuppliersWorkspace
            planId={planId}
            canEdit={canEdit}
            initialCandidates={(candidatesRes.data ?? []) as VendorCandidate[]}
            initialDecisions={(decisionsRes.data ?? []) as VendorDecision[]}
            initialCustomCategories={
              (customCatsRes.data ?? []) as VendorCustomCategory[]
            }
            initialTrialMessagesUsed={initialTrialMessagesUsed}
          />
        </div>
      </div>
    );
  }

  // ── Menu tab ───────────────────────────────────────────────────────────────
  if (activeTab === "menu") {
    const [{ data: userProfile }] = await Promise.all([
      supabase
        .from("users")
        .select("onboarding_data")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const rawMargin =
      typeof plan.target_gross_margin === "number"
        ? plan.target_gross_margin
        : typeof plan.target_gross_margin === "string"
          ? Number(plan.target_gross_margin)
          : 0.75;

    const targetGrossMargin = (() => {
      if (rawMargin !== 0.75) return rawMargin;
      const onboarding =
        (userProfile?.onboarding_data as Record<string, unknown> | null) ?? {};
      const shopTypes = Array.isArray(onboarding.shop_type)
        ? (onboarding.shop_type as string[])
        : [];
      return marginFromShopTypes(shopTypes);
    })();

    // Auto-seed default categories if this plan has none yet.
    {
      const { data: existing } = await supabase
        .from("menu_categories")
        .select("id")
        .eq("plan_id", planId)
        .limit(1);
      if (!existing || existing.length === 0) {
        await supabase.from("menu_categories").insert(
          MENU_DEFAULT_CATEGORIES.map((c) => ({
            plan_id: planId,
            name: c.name,
            position: c.position,
            is_default: true,
          })),
        );
      }
    }

    const [
      { data: itemsData },
      { data: ingredientsData },
      { data: itemIngredientsData },
      { data: categoriesData },
      { data: defaultsData },
      { data: profile },
      { data: conceptDoc },
    ] = await Promise.all([
      supabase
        .from("menu_items_with_cogs")
        .select("*")
        .eq("plan_id", planId)
        .order("position", { ascending: true }),
      supabase
        .from("menu_ingredients")
        .select("*")
        .eq("plan_id", planId)
        .order("name", { ascending: true }),
      supabase.from("menu_item_ingredients").select("*"),
      supabase
        .from("menu_categories")
        .select("*")
        .eq("plan_id", planId)
        .order("position", { ascending: true }),
      supabase
        .from("category_default_ingredients")
        .select(
          "id, category_id, ingredient_id, amount, unit, position, created_at, menu_categories!inner(plan_id)",
        )
        .eq("menu_categories.plan_id", planId),
      supabase
        .from("users")
        .select("subscription_status, subscription_tier, copilot_trial_messages_used")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("workspace_documents")
        .select("content")
        .eq("plan_id", planId)
        .eq("workspace_key", "concept")
        .maybeSingle(),
    ]);

    const canEdit = isSubscriptionActive(profile?.subscription_status);
    const initialTrialMessagesUsed =
      profile?.subscription_tier === "free"
        ? (profile.copilot_trial_messages_used ?? 0)
        : undefined;

    let conceptContext:
      | {
          shop_identity?: string;
          location?: string;
          target_customer?: string;
          vision?: string;
        }
      | undefined;

    if (conceptDoc?.content) {
      try {
        const raw =
          typeof conceptDoc.content === "string"
            ? JSON.parse(conceptDoc.content)
            : conceptDoc.content;
        const version = (raw as Record<string, unknown>)?.version;
        if (version === 2) {
          const doc = normalizeConceptV2(raw);
          const c = doc.components;
          conceptContext = {
            shop_identity: c.shop_identity?.content || undefined,
            location: c.location?.content || undefined,
            target_customer: c.target_customer?.content || undefined,
            vision: c.vision?.content || undefined,
          };
        } else {
          const v1 = raw as Record<string, string>;
          conceptContext = {
            shop_identity: v1.name || undefined,
            target_customer: v1.target_market || undefined,
            vision: v1.mission || undefined,
          };
        }
      } catch {
        // Concept parse failure is non-fatal
      }
    }

    const cleanedDefaults: CategoryDefaultIngredient[] = (defaultsData ?? []).map(
      ({ menu_categories: _mc, ...rest }) => rest as CategoryDefaultIngredient,
    );

    return (
      <div className="bg-[var(--background)]">
        <div className="max-w-5xl mx-auto px-6 pt-8 pb-12">
          <BuildSubNav active={activeTab} />
          <MenuWorkspace
            planId={planId}
            canEdit={canEdit}
            initialTrialMessagesUsed={initialTrialMessagesUsed}
            initialItems={(itemsData ?? []) as MenuItemWithCogs[]}
            initialIngredients={(ingredientsData ?? []) as MenuIngredient[]}
            initialItemIngredients={(itemIngredientsData ?? []) as MenuItemIngredient[]}
            initialCategories={(categoriesData ?? []) as MenuCategory[]}
            initialCategoryDefaults={cleanedDefaults}
            initialTargetGrossMargin={
              Number.isFinite(targetGrossMargin) ? targetGrossMargin : 0.75
            }
            conceptContext={conceptContext}
          />
        </div>
      </div>
    );
  }

  // ── Hiring tab ─────────────────────────────────────────────────────────────
  if (activeTab === "hiring") {
    const [
      { data: rolesData },
      { data: candidatesData },
      { data: questionsData },
      { data: scoresData },
      { data: instancesData },
      { data: tasksData },
      { data: competenciesData },
      { data: staffData },
      { data: evalsData },
      { data: profile },
      { data: hiringSettingsData },
      { data: locationCandidatesData },
    ] = await Promise.all([
      supabase
        .from("hiring_plan_roles")
        .select("*")
        .eq("plan_id", planId)
        .order("created_at", { ascending: true }),
      supabase
        .from("interview_candidates")
        .select("*")
        .eq("plan_id", planId)
        .order("position", { ascending: true }),
      supabase
        .from("interview_questions")
        .select("*")
        .eq("plan_id", planId)
        .order("order_index", { ascending: true }),
      supabase.from("interview_scores").select("*"),
      supabase
        .from("onboarding_plan_instances")
        .select("*")
        .eq("plan_id", planId)
        .order("created_at", { ascending: true }),
      supabase
        .from("onboarding_tasks")
        .select("*")
        .order("order_index", { ascending: true }),
      supabase
        .from("staff_competencies")
        .select("*")
        .eq("plan_id", planId)
        .order("order_index", { ascending: true }),
      supabase
        .from("staff_files")
        .select("*")
        .eq("plan_id", planId)
        .order("created_at", { ascending: true }),
      supabase.from("competency_evaluations").select("*"),
      supabase
        .from("users")
        .select("subscription_status, subscription_tier, copilot_trial_messages_used")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("plan_hiring_settings")
        .select("hiring_country")
        .eq("plan_id", planId)
        .maybeSingle(),
      supabase
        .from("location_candidates")
        .select("country, status, archived, position")
        .eq("plan_id", planId)
        .not("country", "is", null)
        .order("position", { ascending: true }),
    ]);

    function normalizeCountry(raw: string | null): HiringCountry | null {
      if (!raw) return null;
      const upper = raw.toUpperCase().trim() as HiringCountry;
      const supported: HiringCountry[] = ["US", "GB", "CA", "AU", "MX"];
      if (supported.includes(upper)) return upper;
      const MAP: Record<string, HiringCountry> = {
        "UNITED STATES": "US",
        "UNITED STATES OF AMERICA": "US",
        USA: "US",
        "UNITED KINGDOM": "GB",
        UK: "GB",
        "GREAT BRITAIN": "GB",
        ENGLAND: "GB",
        SCOTLAND: "GB",
        WALES: "GB",
        CANADA: "CA",
        AUSTRALIA: "AU",
        MEXICO: "MX",
        "MÉXICO": "MX",
      };
      return MAP[upper] ?? null;
    }

    const hiringCountryOverride = (hiringSettingsData?.hiring_country ??
      null) as HiringCountry | null;
    const candidatesForCountry = locationCandidatesData ?? [];
    let effectiveCountry: HiringCountry | null = hiringCountryOverride;
    if (!effectiveCountry) {
      const signed = candidatesForCountry.find((c) => c.status === "signed");
      effectiveCountry = normalizeCountry(signed?.country ?? null);
      if (!effectiveCountry) {
        const first = candidatesForCountry.find((c) => !c.archived);
        effectiveCountry = normalizeCountry(first?.country ?? null);
      }
    }

    let initialRequirementSets: HiringRequirementSet[] = [];
    if (effectiveCountry) {
      const { data: reqSets } = await supabase
        .from("hiring_requirement_sets")
        .select("*")
        .eq("country_code", effectiveCountry)
        .eq("is_system", true)
        .order("order_index", { ascending: true });
      initialRequirementSets = (reqSets ?? []) as HiringRequirementSet[];
    }

    const initialHiringSettings: PlanHiringSettings = {
      hiring_country: hiringCountryOverride,
      effective_country: effectiveCountry,
    };

    const planMinimumWage = await resolvePlanMinimumWage(supabase, planId);

    const canEdit = isSubscriptionActive(profile?.subscription_status);
    const initialTrialMessagesUsed =
      profile?.subscription_tier === "free"
        ? (profile.copilot_trial_messages_used ?? 0)
        : undefined;

    return (
      <div className="bg-[var(--background)]">
        <div className="max-w-5xl mx-auto px-6 pt-8 pb-12">
          <BuildSubNav active={activeTab} />
          <HiringWorkspace
            planId={planId}
            canEdit={canEdit}
            initialTrialMessagesUsed={initialTrialMessagesUsed}
            initialRoles={(rolesData ?? []) as OrgRole[]}
            initialCandidates={(candidatesData ?? []) as InterviewCandidate[]}
            initialQuestions={(questionsData ?? []) as InterviewQuestion[]}
            initialScores={(scoresData ?? []) as InterviewScore[]}
            initialOnboardingInstances={
              (instancesData ?? []) as OnboardingPlanInstance[]
            }
            initialOnboardingTasks={(tasksData ?? []) as OnboardingTask[]}
            initialCompetencies={(competenciesData ?? []) as StaffCompetency[]}
            initialStaffFiles={(staffData ?? []) as StaffFile[]}
            initialCompetencyEvals={(evalsData ?? []) as CompetencyEvaluation[]}
            initialHiringSettings={initialHiringSettings}
            initialRequirementSets={initialRequirementSets}
            minimumWage={planMinimumWage}
          />
        </div>
      </div>
    );
  }

  // ── Launch Plan tab ────────────────────────────────────────────────────────
  // (activeTab === "launch-plan")
  const [
    { data: milestonesData },
    { data: configDoc },
    { data: launchProfile },
    { data: sourceDocs },
  ] = await Promise.all([
    supabase
      .from("launch_milestones")
      .select("*")
      .eq("plan_id", planId)
      .order("order_index", { ascending: true })
      .order("target_date", { ascending: true }),
    supabase
      .from("workspace_documents")
      .select("content, updated_at")
      .eq("plan_id", planId)
      .eq("workspace_key", "opening_month_plan")
      .maybeSingle(),
    supabase
      .from("users")
      .select(
        "subscription_status, subscription_tier, copilot_trial_messages_used, beta_waiver_until",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("workspace_documents")
      .select("workspace_key, updated_at")
      .eq("plan_id", planId)
      .in("workspace_key", [
        "concept",
        "location_lease",
        "buildout_equipment",
        "hiring",
        "financials",
      ]),
  ]);

  const config = normalizeLaunchPlanConfig(configDoc?.content);

  const sourcesUpdatedAt =
    sourceDocs && sourceDocs.length > 0
      ? sourceDocs.reduce<string | null>((max, d) => {
          if (!max) return d.updated_at;
          return d.updated_at > max ? d.updated_at : max;
        }, null)
      : null;

  const canEditLaunch =
    isSubscriptionActive(launchProfile?.subscription_status ?? "free_trial") ||
    isBetaWaived(launchProfile?.beta_waiver_until ?? null);

  const initialTrialMessagesUsedLaunch =
    launchProfile?.subscription_tier === "free"
      ? (launchProfile.copilot_trial_messages_used ?? 0)
      : undefined;

  return (
    <div className="bg-[var(--background)]">
      <div className="max-w-5xl mx-auto px-6 pt-8 pb-12">
        <BuildSubNav active={activeTab} />
        <OpeningMonthPlanWorkspace
          planId={planId}
          initialMilestones={(milestonesData ?? []) as Milestone[]}
          initialConfig={config}
          initialSourcesUpdatedAt={sourcesUpdatedAt}
          canEdit={canEditLaunch}
          initialTrialMessagesUsed={initialTrialMessagesUsedLaunch}
          section="milestones"
        />
      </div>
    </div>
  );
}
