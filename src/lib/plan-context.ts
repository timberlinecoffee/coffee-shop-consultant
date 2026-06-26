// TIM-1418: Single live-table loader for AI prompt context.
// Replaces stale `users.onboarding_data` reads (shop_name / shop_vision /
// target_customer / differentiation / brand_pillars / location) with the
// canonical workspace tables. Onboarding-only fields with no workspace home
// (motivation, timeline) are still read directly from users.onboarding_data
// by callers — this helper does not surface them.
//
// TIM-2377: Also exports getActivePlanId — the single canonical resolver for
// a user's active plan ID. Replaces ~20 inline getPlanId definitions across
// the workspace API routes. Reads users.current_plan_id first (set by
// projects PATCH /activate), falls back to latest-by-created_at during the
// deploy window before all users are backfilled.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeConceptV2 } from "./concept.ts";
import type { PlanStateCompetitor } from "./business-plan/local-claims.ts";

export interface PlanContext {
  shop_name: string;
  vision: string;
  target_customer: string;
  differentiation: string;
  brand_pillars: string[];
  location_country: string | null;
  // TIM-2340: user-entered competitors + explicit "no competitors" toggle
  // from the concept workspace. Surfaced into plan_state.local_claims so the
  // narrative prompt names only real businesses. Normalized to the plan-state
  // shape here (address: string | null) so route call sites can pass through
  // without a per-route conversion.
  competitors: PlanStateCompetitor[];
  no_direct_competitors_identified: boolean;
  // TIM-2340: resolved city label ("Calgary", "Seattle") for the geography
  // validator. Built from the chosen location_candidate when present.
  city_label: string | null;
  // TIM-3151: per-project onboarding answers from coffee_shop_plans.onboarding_data.
  // Non-null when the founder completed (or partially completed) the trimmed
  // new-project interview. Callers merge this over users.onboarding_data so
  // project-scoped fields (stage, shop_type, location, etc.) take precedence.
  plan_onboarding_data: Record<string, unknown> | null;
}

export const EMPTY_PLAN_CONTEXT: PlanContext = {
  shop_name: "",
  vision: "",
  target_customer: "",
  differentiation: "",
  brand_pillars: [],
  location_country: null,
  competitors: [],
  no_direct_competitors_identified: false,
  city_label: null,
  plan_onboarding_data: null,
};

function parsePillars(differentiator: unknown): string[] {
  if (typeof differentiator !== "string") return [];
  return differentiator
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function brandPillarsFromMarketingDoc(content: unknown): string[] {
  if (!content || typeof content !== "object") return [];
  const story = (content as { story?: { differentiator?: unknown } }).story;
  return parsePillars(story?.differentiator);
}

function brandPillarsFromOnboarding(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const value = (data as { brand_pillars?: unknown }).brand_pillars;
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function targetCustomerFromConcept(
  concept: ReturnType<typeof normalizeConceptV2>,
): string {
  const personas = concept.personas ?? [];
  if (personas.length > 0) {
    const primary = personas.find((p) => p.isPrimary) ?? personas[0];
    const parts: string[] = [];
    if (primary.name.trim()) parts.push(primary.name.trim());
    if (primary.whyTheyVisit.trim()) parts.push(primary.whyTheyVisit.trim());
    const joined = parts.join(" — ");
    if (joined.length > 0) return joined;
    if (primary.notes && primary.notes.trim()) return primary.notes.trim();
  }
  return concept.components.target_customer.content;
}

function locationCountryFromCandidates(
  candidates: Array<{ country?: string | null; status?: string | null; archived?: boolean | null }> | null | undefined,
): string | null {
  if (!candidates || candidates.length === 0) return null;
  const withCountry = candidates.filter((c) => typeof c.country === "string" && c.country.trim().length > 0);
  if (withCountry.length === 0) return null;
  const signed = withCountry.find((c) => c.status === "signed");
  if (signed?.country) return signed.country.trim();
  const firstLive = withCountry.find((c) => !c.archived);
  return firstLive?.country?.trim() ?? null;
}

// TIM-2340: resolve a human-readable city label from the chosen (or first
// non-archived) location candidate. Prefer city column; fall back to a best-
// effort parse of the address string when city is missing. Returns null when
// nothing usable is present.
function cityLabelFromCandidates(
  candidates: Array<{ city?: string | null; address?: string | null; status?: string | null; archived?: boolean | null }> | null | undefined,
): string | null {
  if (!candidates || candidates.length === 0) return null;
  const ordered = [
    ...candidates.filter((c) => c.status === "signed"),
    ...candidates.filter((c) => c.status !== "signed" && !c.archived),
  ];
  for (const c of ordered) {
    if (typeof c.city === "string" && c.city.trim().length > 0) return c.city.trim();
    // Fallback: pull the second-to-last comma-separated token from the address
    // ("123 Main St, Inglewood, Calgary, AB" → "Calgary"). Only used when the
    // city column is empty (older rows from before TIM-1145).
    if (typeof c.address === "string") {
      const parts = c.address.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 3) return parts[parts.length - 2];
    }
  }
  return null;
}

export async function loadPlanContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<PlanContext> {
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name, onboarding_data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) return { ...EMPTY_PLAN_CONTEXT };

  const [
    conceptRes,
    marketingRes,
    locationsRes,
    hiringSettingsRes,
    profileRes,
  ] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", plan.id)
      .eq("workspace_key", "concept")
      .maybeSingle(),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", plan.id)
      .eq("workspace_key", "marketing")
      .maybeSingle(),
    supabase
      .from("location_candidates")
      .select("country, city, address, status, archived, position")
      .eq("plan_id", plan.id)
      .order("position", { ascending: true }),
    supabase
      .from("plan_hiring_settings")
      .select("hiring_country")
      .eq("plan_id", plan.id)
      .maybeSingle(),
    supabase
      .from("users")
      .select("onboarding_data")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const concept = normalizeConceptV2(conceptRes.data?.content);

  // brand_pillars priority: marketing.story.differentiator (live, user-editable)
  // > coffee_shop_plans.onboarding_data.brand_pillars (TIM-3151 per-project intake)
  // > users.onboarding_data.brand_pillars (frozen signup answer, first project).
  const livePillars = brandPillarsFromMarketingDoc(marketingRes.data?.content);
  const planOd = (plan.onboarding_data as Record<string, unknown> | null) ?? null;
  const brand_pillars =
    livePillars.length > 0
      ? livePillars
      : brandPillarsFromOnboarding(planOd ?? profileRes.data?.onboarding_data);

  const location_country =
    (hiringSettingsRes.data?.hiring_country ?? null) ||
    locationCountryFromCandidates(locationsRes.data);

  return {
    shop_name:
      (plan.plan_name ?? "").trim() || concept.components.shop_identity.content,
    vision: concept.components.vision.content,
    target_customer: targetCustomerFromConcept(concept),
    differentiation: concept.components.differentiation.content,
    brand_pillars,
    location_country,
    competitors: (concept.competitors ?? []).map<PlanStateCompetitor>((c) => ({
      id: c.id,
      name: c.name,
      address: c.address ?? null,
      what_they_do_well: c.what_they_do_well ?? null,
      gaps: c.gaps ?? null,
    })),
    no_direct_competitors_identified: concept.no_direct_competitors_identified ?? false,
    city_label: cityLabelFromCandidates(locationsRes.data),
    plan_onboarding_data: planOd,
  };
}

// TIM-2377: Canonical active-plan resolver. Replaces ~20 inline getPlanId
// definitions across workspace API routes. Priority:
//   1. users.current_plan_id (explicit activation via PATCH /api/projects/:id)
//   2. Latest coffee_shop_plans.created_at (back-compat during deploy window)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getActivePlanId(supabase: SupabaseClient<any>, userId: string): Promise<string | null> {
  const { data: userRow } = await supabase
    .from("users")
    .select("current_plan_id")
    .eq("id", userId)
    .maybeSingle();

  if (userRow?.current_plan_id) return userRow.current_plan_id as string;

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return plan?.id ?? null;
}
