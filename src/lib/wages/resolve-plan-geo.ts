// TIM-2518: Resolve a plan's (city, country) geo signal for minimum-wage
// lookups. Mirrors the plan-context.ts location precedence:
//   1. plan_hiring_settings.hiring_country override (TIM-1300).
//   2. Signed location_candidate.
//   3. First non-archived location_candidate.
//
// City comes from the same chosen candidate. Returns nulls when nothing
// matches so callers can fall back to the system default.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveMinimumWage, type MinWageInfo } from "./minimum-wage.ts";

interface PlanGeo {
  city: string | null;
  countryCode: string | null;
}

interface LocationCandidateRow {
  city?: string | null;
  country?: string | null;
  status?: string | null;
  archived?: boolean | null;
}

function pickCandidate(
  candidates: LocationCandidateRow[] | null | undefined,
): LocationCandidateRow | null {
  if (!candidates || candidates.length === 0) return null;
  const signed = candidates.find((c) => c.status === "signed");
  if (signed) return signed;
  return candidates.find((c) => !c.archived) ?? null;
}

export async function resolvePlanGeo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  planId: string,
): Promise<PlanGeo> {
  const [hiringRes, locationsRes] = await Promise.all([
    supabase
      .from("plan_hiring_settings")
      .select("hiring_country")
      .eq("plan_id", planId)
      .maybeSingle(),
    supabase
      .from("location_candidates")
      .select("city, country, status, archived, position")
      .eq("plan_id", planId)
      .order("position", { ascending: true }),
  ]);

  const override = (hiringRes.data?.hiring_country ?? null) as string | null;
  const chosen = pickCandidate(locationsRes.data as LocationCandidateRow[] | null);

  return {
    city: chosen?.city?.trim() || null,
    countryCode: override || chosen?.country?.trim() || null,
  };
}

export async function resolvePlanMinimumWage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  planId: string,
): Promise<MinWageInfo | null> {
  const geo = await resolvePlanGeo(supabase, planId);
  return resolveMinimumWage(geo);
}
