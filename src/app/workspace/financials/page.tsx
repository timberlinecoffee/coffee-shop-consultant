// TIM-972: Financial Suite workspace page — loads from DB tables.
// Equipment from buildout_equipment_items; forecast from financial_models.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import { normalizeMonthlyProjections, defaultMonthlyProjections } from "@/lib/financial-projection";
import type { CritiqueResult } from "@/lib/financials";
import { FinancialsWorkspace } from "./financials-workspace";
import type { EquipmentItem } from "./financials-workspace";

export const dynamic = "force-dynamic";

export default async function FinancialsWorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) redirect("/onboarding");

  const [equipmentResult, modelResult, profileResult] = await Promise.all([
    supabase
      .from("buildout_equipment_items")
      .select("*")
      .eq("plan_id", plan.id)
      .eq("archived", false)
      .order("position"),
    supabase
      .from("financial_models")
      .select("*")
      .eq("plan_id", plan.id)
      .maybeSingle(),
    supabase
      .from("users")
      .select("subscription_status, subscription_tier, copilot_trial_messages_used")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const equipment = (equipmentResult.data ?? []) as EquipmentItem[];

  let modelRow = modelResult.data;

  // Auto-create financial_models row if it doesn't exist
  if (!modelRow) {
    const { data: created } = await supabase
      .from("financial_models")
      .insert({
        plan_id: plan.id,
        monthly_projections: defaultMonthlyProjections(),
        startup_costs: { total_equipment_cents: 0 },
      })
      .select()
      .single();
    modelRow = created;
  }

  const initialProjections = normalizeMonthlyProjections(modelRow?.monthly_projections);
  const initialCritique = (modelRow?.critique as CritiqueResult | null) ?? null;
  const initialModelUpdatedAt = modelRow?.updated_at ?? null;
  const initialNeedsReviewAt = modelRow?.needs_review_at ?? null;

  const profile = profileResult.data;
  const canEdit = isSubscriptionActive(profile?.subscription_status);
  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  return (
    <FinancialsWorkspace
      planId={plan.id}
      initialEquipment={equipment}
      initialProjections={initialProjections}
      initialModelUpdatedAt={initialModelUpdatedAt}
      initialCritique={initialCritique}
      initialNeedsReviewAt={initialNeedsReviewAt}
      initialModelUpdatedAtForReview={initialModelUpdatedAt}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
    />
  );
}
