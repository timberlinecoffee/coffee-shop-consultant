// TIM-834: Concept workspace v2 — backed by workspace_documents.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import { normalizeConceptV2 } from "@/lib/concept";
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

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
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
      .select("subscription_status, subscription_tier, copilot_trial_messages_used")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const initialDoc = normalizeConceptV2(doc?.content);
  const canEdit = isSubscriptionActive(profile?.subscription_status);
  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  return (
    <ConceptWorkspace
      planId={plan.id}
      initialDoc={initialDoc}
      initialUpdatedAt={doc?.updated_at ?? null}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
    />
  );
}
