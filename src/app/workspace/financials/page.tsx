// TIM-1019: Financial Suite Phase 2 — server page shell.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { FinancialsWorkspace } from "./financials-workspace";

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

  const [{ data: doc }, { data: profile }] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("content, updated_at")
      .eq("plan_id", plan.id)
      .eq("workspace_key", "financials")
      .maybeSingle(),
    supabase
      .from("users")
      .select("subscription_status, subscription_tier, copilot_trial_messages_used, beta_waiver_until")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const canEdit =
    isSubscriptionActive(profile?.subscription_status) ||
    isBetaWaived(profile?.beta_waiver_until);

  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  return (
    <FinancialsWorkspace
      planId={plan.id}
      initialContent={doc?.content ?? null}
      initialUpdatedAt={doc?.updated_at ?? null}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
    />
  );
}
