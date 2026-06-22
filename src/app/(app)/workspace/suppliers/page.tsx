// TIM-1059: Suppliers & Vendors workspace — server entrypoint.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import type { VendorCandidate, VendorCustomCategory, VendorDecision } from "@/lib/suppliers";
import { SuppliersWorkspace } from "./suppliers-workspace";
import { getActivePlanId } from "@/lib/plan-context";

export const dynamic = "force-dynamic";

export default async function SuppliersWorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) redirect("/onboarding");

  const [candidatesRes, decisionsRes, customCatsRes, profileRes] = await Promise.all([
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
    <SuppliersWorkspace
      planId={planId}
      canEdit={canEdit}
      initialCandidates={(candidatesRes.data ?? []) as VendorCandidate[]}
      initialDecisions={(decisionsRes.data ?? []) as VendorDecision[]}
      initialCustomCategories={(customCatsRes.data ?? []) as VendorCustomCategory[]}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
    />
  );
}
