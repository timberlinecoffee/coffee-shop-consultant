// TIM-1061: Operations Playbook (SOPs) workspace page.
// Six SOP categories: Opening, Closing, Cleaning, Cash, Drink Recipes, Food Safety.
// Storage: workspace_documents.content jsonb where workspace_key='operations_playbook'.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import {
  normalizeOperationsPlaybook,
  seededPlaybook,
  isPlaybookEmpty,
} from "@/lib/operations-playbook";
import { normalizeConceptV2 } from "@/lib/concept";
import { OperationsPlaybookWorkspace } from "./operations-playbook-workspace";

export const dynamic = "force-dynamic";

export default async function OperationsPlaybookPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) redirect("/onboarding");

  const planId = plan.id;

  const [
    { data: doc },
    { data: conceptDoc },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("content, updated_at")
      .eq("plan_id", planId)
      .eq("workspace_key", "operations_playbook")
      .maybeSingle(),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "concept")
      .maybeSingle(),
    supabase
      .from("users")
      .select("subscription_status, subscription_tier, copilot_trial_messages_used, beta_waiver_until")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  // Seed defaults the first time the user lands on the workspace — they get a
  // working SOP they can edit rather than an empty shell.
  const stored = normalizeOperationsPlaybook(doc?.content);
  const initialDoc = isPlaybookEmpty(stored) ? seededPlaybook() : stored;

  // TIM-1406: shop name comes from coffee_shop_plans.plan_name (SoT); concept
  // jsonb is the V2 shadow read via normalizer for V1/V2 safety.
  const concept = normalizeConceptV2(conceptDoc?.content);
  const conceptShopIdentity = (plan.plan_name?.trim() ?? "") || concept.components.shop_identity.content;

  const canEdit =
    isSubscriptionActive(profile?.subscription_status ?? "free_trial") ||
    isBetaWaived(profile?.beta_waiver_until ?? null);

  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  return (
    <OperationsPlaybookWorkspace
      planId={planId}
      canEdit={canEdit}
      initialDoc={initialDoc}
      conceptShopIdentity={conceptShopIdentity}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
    />
  );
}
