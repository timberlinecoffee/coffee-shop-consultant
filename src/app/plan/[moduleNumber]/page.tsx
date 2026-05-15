import { createClient } from "@/lib/supabase/server";
import { isModuleAvailable } from "@/lib/modules";
import { canAccessModule, isPaidTier, UPGRADE_PATH } from "@/lib/access";
import { redirect } from "next/navigation";
import { ModuleClient } from "./module-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ moduleNumber: string }>;
}

export default async function PlanModulePage({ params }: PageProps) {
  const { moduleNumber } = await params;
  const moduleNum = parseInt(moduleNumber, 10);

  // Redirect any module that doesn't have sections wired up yet, instead of
  // rendering ModuleClient with Module 1 fallback content under another
  // module's label (the source of the TIM-543 navigation crash report).
  if (!isModuleAvailable(moduleNum)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: plan }] = await Promise.all([
    supabase
      .from("users")
      .select("full_name, onboarding_data, ai_credits_remaining, subscription_tier")
      .eq("id", user.id)
      .single(),
    supabase
      .from("coffee_shop_plans")
      .select("id, plan_name")
      .eq("user_id", user.id)
      .single(),
  ]);

  if (!plan) redirect("/dashboard");

  // TIM-545: server-side paywall. Free users cannot reach paid modules at all.
  // Module 1 stays open as a preview; the client renders section-level gating
  // for everything past the free preview section.
  const subscriptionTier = (profile?.subscription_tier as string) ?? "free";
  if (!canAccessModule(subscriptionTier, moduleNum)) {
    redirect(
      `${UPGRADE_PATH}?return=${encodeURIComponent(`/plan/${moduleNum}`)}`
    );
  }

  const { data: responses } = await supabase
    .from("module_responses")
    .select("section_key, response_data, status")
    .eq("plan_id", plan.id)
    .eq("module_number", moduleNum);

  const { data: conversations } = await supabase
    .from("ai_conversations")
    .select("section_key, messages")
    .eq("plan_id", plan.id)
    .eq("module_number", moduleNum);

  const responseMap: Record<string, { response_data: Record<string, unknown>; status: string }> = {};
  (responses ?? []).forEach((r) => {
    responseMap[r.section_key] = { response_data: r.response_data, status: r.status };
  });

  type ChatMessage = { role: "user" | "assistant"; content: string };
  const conversationMap: Record<string, ChatMessage[]> = {};
  (conversations ?? []).forEach((c) => {
    const msgs = (c.messages as Array<{ role: string; content: string }>).map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    }));
    conversationMap[c.section_key] = msgs;
  });

  return (
    <ModuleClient
      moduleNumber={moduleNum}
      planId={plan.id}
      planName={plan.plan_name}
      userProfile={{
        full_name: profile?.full_name ?? null,
        onboarding_data: (profile?.onboarding_data as Record<string, unknown>) ?? {},
        ai_credits_remaining: profile?.ai_credits_remaining ?? 0,
        subscription_tier: subscriptionTier,
      }}
      initialResponses={responseMap}
      initialConversations={conversationMap}
      freePreview={!isPaidTier(subscriptionTier)}
    />
  );
}
