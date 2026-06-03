// TIM-1748: Server page for the /plan/[moduleNumber] route. Fetches plan,
// user profile, section responses, and conversations, then renders ModuleClient.
// CurrencyProvider is wired in the parent plan/layout.tsx.
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive } from "@/lib/access";
import { ModuleClient } from "./module-client";

export const dynamic = "force-dynamic";

export default async function PlanModulePage({
  params,
}: {
  params: Promise<{ moduleNumber: string }>;
}) {
  const { moduleNumber: moduleParam } = await params;
  const moduleNumber = parseInt(moduleParam, 10);
  if (!moduleNumber || moduleNumber < 1 || moduleNumber > 8) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [planResult, profileResult] = await Promise.all([
    supabase
      .from("coffee_shop_plans")
      .select("id, plan_name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("users")
      .select("full_name, onboarding_data, ai_credits_remaining, subscription_tier, subscription_status")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (!planResult.data) redirect("/onboarding");

  const plan = planResult.data;
  const profile = profileResult.data;

  const [responsesResult, conversationsResult] = await Promise.all([
    supabase
      .from("plan_section_responses")
      .select("section_key, response_data, status")
      .eq("plan_id", plan.id)
      .eq("module_number", moduleNumber),
    supabase
      .from("plan_section_conversations")
      .select("section_key, messages")
      .eq("plan_id", plan.id)
      .eq("module_number", moduleNumber),
  ]);

  const initialResponses: Record<string, { response_data: Record<string, unknown>; status: string }> = {};
  for (const row of responsesResult.data ?? []) {
    initialResponses[row.section_key] = {
      response_data: (row.response_data as Record<string, unknown>) ?? {},
      status: row.status ?? "not_started",
    };
  }

  const initialConversations: Record<string, { role: "user" | "assistant"; content: string }[]> = {};
  for (const row of conversationsResult.data ?? []) {
    initialConversations[row.section_key] = (row.messages as { role: "user" | "assistant"; content: string }[]) ?? [];
  }

  const subscriptionTier = profile?.subscription_tier ?? "free";
  const freePreview = !isSubscriptionActive(profile?.subscription_status);

  return (
    <ModuleClient
      moduleNumber={moduleNumber}
      planId={plan.id}
      planName={plan.plan_name ?? "My Coffee Shop"}
      userProfile={{
        full_name: profile?.full_name ?? null,
        onboarding_data: (profile?.onboarding_data as Record<string, unknown>) ?? {},
        ai_credits_remaining: profile?.ai_credits_remaining ?? 0,
        subscription_tier: subscriptionTier,
      }}
      initialResponses={initialResponses}
      initialConversations={initialConversations}
      freePreview={freePreview}
    />
  );
}
