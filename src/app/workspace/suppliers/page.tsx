// TIM-1059: Suppliers & Vendors workspace — server entrypoint.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import type { VendorCandidate, VendorCustomCategory, VendorDecision } from "@/lib/suppliers";
import { SuppliersWorkspace } from "./suppliers-workspace";

export const dynamic = "force-dynamic";

export default async function SuppliersWorkspacePage() {
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

  const [candidatesRes, decisionsRes, customCatsRes, profileRes] = await Promise.all([
    supabase
      .from("vendor_candidates")
      .select("*")
      .eq("plan_id", plan.id)
      .order("category", { ascending: true })
      .order("position", { ascending: true }),
    supabase
      .from("vendor_decisions")
      .select("*")
      .eq("plan_id", plan.id)
      .eq("is_current", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("vendor_custom_categories")
      .select("*")
      .eq("plan_id", plan.id)
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
    <SuppliersWorkspace
      planId={plan.id}
      canEdit={canEdit}
      initialCandidates={(candidatesRes.data ?? []) as VendorCandidate[]}
      initialDecisions={(decisionsRes.data ?? []) as VendorDecision[]}
      initialCustomCategories={(customCatsRes.data ?? []) as VendorCustomCategory[]}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
    />
  );
}
