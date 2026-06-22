// TIM-2783 (Phase 6): WorkspaceHeader + canonical v2 shell via client wrapper.
// TIM-2868: Page must resolve via getActivePlanId() so multi-plan users see
// the project they're editing — and so the page + API agree on the same plan
// (same parity rule shipped under TIM-2860 for the Concept workspace).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Candidate } from "@/components/location-lease/CandidateListCard";
import { getActivePlanId } from "@/lib/plan-context";
import { LocationLeaseWorkspace } from "./location-lease-workspace";

export const dynamic = "force-dynamic";

export default async function LocationLeaseWorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, planId] = await Promise.all([
    supabase
      .from("users")
      .select("ai_credits_remaining, subscription_tier")
      .eq("id", user.id)
      .maybeSingle(),
    getActivePlanId(supabase, user.id),
  ]);

  if (!planId) redirect("/onboarding");

  const { data: rows } = await supabase
    .from("location_candidates")
    .select("*")
    .eq("plan_id", planId)
    .eq("archived", false)
    .order("position");

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
    <LocationLeaseWorkspace
      initialCandidates={initialCandidates}
      planId={planId}
      aiCreditsRemaining={profile?.ai_credits_remaining ?? 0}
      subscriptionTier={profile?.subscription_tier ?? "free"}
    />
  );
}
