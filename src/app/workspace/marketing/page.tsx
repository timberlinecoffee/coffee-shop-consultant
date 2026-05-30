// TIM-1417: Marketing planning workspace — one entry point on the V1 owner
// workspace. Replaces the V2 execution tooling and the separate Marketing &
// Pre-Launch surface. Owner-written planning only: Overview, Channels,
// Story And Brand, Pre-launch Plan.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { normalizeMarketing, type MarketingDocument } from "@/lib/marketing";
import { normalizeConceptV2 } from "@/lib/concept";
import { MarketingWorkspace } from "./marketing-workspace";

export const dynamic = "force-dynamic";

export default async function MarketingWorkspacePage() {
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
      .eq("workspace_key", "marketing")
      .maybeSingle(),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "concept")
      .maybeSingle(),
    supabase
      .from("users")
      .select("subscription_status, subscription_tier, copilot_trial_messages_used, beta_waiver_until, target_opening_date")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const initialDoc: MarketingDocument = normalizeMarketing(doc?.content);

  const concept = normalizeConceptV2(conceptDoc?.content);
  const conceptShopIdentity =
    (plan.plan_name?.trim() ?? "") || concept.components.shop_identity.content;
  const conceptBrandVoice = concept.components.brand_voice.content;

  const canEdit =
    isSubscriptionActive(profile?.subscription_status ?? "free_trial") ||
    isBetaWaived(profile?.beta_waiver_until ?? null);

  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  return (
    <MarketingWorkspace
      planId={planId}
      canEdit={canEdit}
      initialDoc={initialDoc}
      conceptShopIdentity={conceptShopIdentity}
      conceptBrandVoice={conceptBrandVoice}
      targetOpeningDate={profile?.target_opening_date ?? null}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
    />
  );
}
