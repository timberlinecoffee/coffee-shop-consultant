import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CandidateListCard } from "@/components/location-lease/CandidateListCard";
import type { Candidate } from "@/components/location-lease/CandidateListCard";
import { MapPin } from "lucide-react";

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
        {/* TIM-1894 / TIM-1937: matches the canonical WorkspaceHeader chrome
            (icon+title+description, mb-6, ≥1200px nowrap). Kept hand-rolled
            because this is a server component and the shared client
            WorkspaceHeader can't take a lucide Icon component as a prop across
            the server/client boundary. */}
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
          planId={plan.id}
          aiCreditsRemaining={profile?.ai_credits_remaining ?? 0}
          subscriptionTier={profile?.subscription_tier ?? "free"}
        />
      </div>
    </div>
  );
}
