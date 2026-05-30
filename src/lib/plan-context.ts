// TIM-1418: Single live-table loader for AI prompt context.
// Replaces stale `users.onboarding_data` reads (shop_name / shop_vision /
// target_customer / differentiation / brand_pillars / location) with the
// canonical workspace tables. Onboarding-only fields with no workspace home
// (motivation, timeline) are still read directly from users.onboarding_data
// by callers — this helper does not surface them.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeConceptV2 } from "./concept.ts";

export interface PlanContext {
  shop_name: string;
  vision: string;
  target_customer: string;
  differentiation: string;
  brand_pillars: string[];
  location_country: string | null;
}

export const EMPTY_PLAN_CONTEXT: PlanContext = {
  shop_name: "",
  vision: "",
  target_customer: "",
  differentiation: "",
  brand_pillars: [],
  location_country: null,
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

export async function loadPlanContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<PlanContext> {
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
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
      .select("country, status, archived, position")
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
  // > users.onboarding_data.brand_pillars (frozen onboarding answer).
  // TIM-1417 removed the marketing_brand table, so the differentiator string is
  // now the canonical live-table source. Onboarding stays as a fallback for
  // founders who never opened the Marketing workspace.
  const livePillars = brandPillarsFromMarketingDoc(marketingRes.data?.content);
  const brand_pillars =
    livePillars.length > 0
      ? livePillars
      : brandPillarsFromOnboarding(profileRes.data?.onboarding_data);

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
  };
}
