// TIM-1061: Operations Playbook (SOPs) workspace page.
// TIM-1416: V1 binder — SOPs (opening, closing, cleaning, cash, food safety),
// recipes pulled read-only from Menu, plus roles, vendor contacts, and
// training. Daily-execution logs are out of scope (V2).

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import {
  normalizeOperationsPlaybook,
  seededPlaybook,
  isPlaybookEmpty,
} from "@/lib/operations-playbook";
import { loadOperationsRecipeCards } from "@/lib/operations-recipes";
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
    recipeCards,
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
      .select("subscription_status, subscription_tier, copilot_trial_messages_used, beta_waiver_until, onboarding_data")
      .eq("id", user.id)
      .maybeSingle(),
    loadOperationsRecipeCards(supabase, planId),
  ]);

  const stored = normalizeOperationsPlaybook(doc?.content);
  const shopType = (() => {
    const od = profile?.onboarding_data as Record<string, unknown> | null | undefined;
    if (!od) return undefined;
    const raw = od.shop_type;
    if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
    if (typeof raw === "string" && raw.length > 0) return raw;
    return undefined;
  })();
  const initialDoc = isPlaybookEmpty(stored) ? seededPlaybook(shopType) : stored;

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
      initialRecipeCards={recipeCards}
    />
  );
}
