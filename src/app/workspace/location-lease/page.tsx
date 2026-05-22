import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CandidateListCard } from "@/components/location-lease/CandidateListCard";
import type { Candidate } from "@/components/location-lease/CandidateListCard";
import { RubricGridCard } from "@/components/location-lease/RubricGridCard";
import { LeaseTermsCard } from "@/components/location-lease/LeaseTermsCard";

export const dynamic = "force-dynamic";

export default async function LocationLeaseWorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: plan }] = await Promise.all([
    supabase
      .from("users")
      .select("ai_credits_remaining, subscription_tier")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("coffee_shop_plans")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!plan) redirect("/onboarding");

  const { data: rows } = await supabase
    .from("location_candidates")
    .select("*")
    .eq("plan_id", plan.id)
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
  }));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <CandidateListCard
        initialCandidates={initialCandidates}
        planId={plan.id}
        aiCreditsRemaining={profile?.ai_credits_remaining ?? 0}
        subscriptionTier={profile?.subscription_tier ?? "free"}
      />
      <RubricGridCard />
      <LeaseTermsCard />
    </div>
  );
}
