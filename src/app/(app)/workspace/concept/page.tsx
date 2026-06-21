// TIM-834: Concept workspace v2 — backed by workspace_documents.
// TIM-2860: plan lookup uses getActivePlanId() so the page reads from the user's
// active project (TIM-2378 switcher) — keeps the displayed plan aligned with
// where the workspace API route writes saves.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import { normalizeConceptV2 } from "@/lib/concept";
import { getActivePlanId } from "@/lib/plan-context";
import { ConceptWorkspace } from "./concept-editor";

export const dynamic = "force-dynamic";

export default async function ConceptWorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) {
    redirect("/onboarding");
  }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("id", planId)
    .maybeSingle();

  if (!plan) {
    redirect("/onboarding");
  }

  const [{ data: doc }, { data: profile }] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("content, updated_at")
      .eq("plan_id", plan.id)
      .eq("workspace_key", "concept")
      .maybeSingle(),
    supabase
      .from("users")
      .select("subscription_status, subscription_tier, copilot_trial_messages_used, onboarding_data")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const initialDoc = normalizeConceptV2(doc?.content);
  // TIM-1406: coffee_shop_plans.plan_name is the SoT for shop name. Hydrate
  // shop_identity from it so the editor shows the canonical value even when
  // the jsonb shadow lags (e.g. for plans that haven't re-saved since the
  // backfill).
  const planName = plan.plan_name?.trim() ?? "";
  if (planName.length > 0) {
    initialDoc.components.shop_identity = {
      ...initialDoc.components.shop_identity,
      content: planName,
    };
  }
  const canEdit = isSubscriptionActive(profile?.subscription_status);
  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  const onboarding = (profile?.onboarding_data as Record<string, unknown>) ?? {};
  const shopType = (onboarding.shop_type as string | string[] | undefined) ?? null;

  return (
    <ConceptWorkspace
      planId={plan.id}
      initialDoc={initialDoc}
      initialUpdatedAt={doc?.updated_at ?? null}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
      shopType={shopType}
    />
  );
}
