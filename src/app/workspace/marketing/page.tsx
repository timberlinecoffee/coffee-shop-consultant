// TIM-1036: Marketing Suite workspace page.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import { MarketingWorkspace } from "./marketing-workspace";
import type { MarketingBrand, DigitalPresenceRow, ContentPost, MarketingCampaign, MarketingBudgetLine } from "@/lib/marketing";
import { DEFAULT_DIGITAL_CHANNELS, DEFAULT_BUDGET_CHANNELS } from "@/lib/marketing";

export const dynamic = "force-dynamic";

export default async function MarketingWorkspacePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: plan } = await supabase.from("coffee_shop_plans").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!plan) redirect("/onboarding");
  const planId = plan.id;

  const [
    { data: brandData },
    { data: conceptDoc },
    { data: presenceData },
    { data: postsData },
    { data: campaignsData },
    { data: budgetData },
    { data: financialModel },
    { data: profile },
  ] = await Promise.all([
    supabase.from("marketing_brand").select("*").eq("plan_id", planId).maybeSingle(),
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "concept").maybeSingle(),
    supabase.from("marketing_digital_presence").select("*").eq("plan_id", planId).order("position", { ascending: true }),
    supabase.from("marketing_content_posts").select("*").eq("plan_id", planId).order("post_date", { ascending: true }),
    supabase.from("marketing_campaigns").select("*").eq("plan_id", planId).order("created_at", { ascending: true }),
    supabase.from("marketing_budget_lines").select("*").eq("plan_id", planId).order("position", { ascending: true }),
    supabase.from("financial_models").select("forecast_inputs").eq("plan_id", planId).maybeSingle(),
    supabase.from("users").select("subscription_status, subscription_tier, copilot_trial_messages_used").eq("id", user.id).maybeSingle(),
  ]);

  let initialPresence = (presenceData ?? []) as DigitalPresenceRow[];
  if (initialPresence.length === 0) {
    const seeds = DEFAULT_DIGITAL_CHANNELS.map((c) => ({ plan_id: planId, channel_name: c.channel_name, position: c.position, status: "not_started" as const, url_or_handle: null, owner: null, last_updated_at: null, is_system: true }));
    const { data: seeded } = await supabase.from("marketing_digital_presence").insert(seeds).select();
    initialPresence = (seeded ?? []) as DigitalPresenceRow[];
  }

  let initialBudget = (budgetData ?? []) as MarketingBudgetLine[];
  if (initialBudget.length === 0) {
    const seeds = DEFAULT_BUDGET_CHANNELS.map((c) => ({ plan_id: planId, channel_name: c.channel_name, monthly_cents: 0, is_system: true, position: c.position }));
    const { data: seeded } = await supabase.from("marketing_budget_lines").insert(seeds).select();
    initialBudget = (seeded ?? []) as MarketingBudgetLine[];
  }

  const conceptContent = conceptDoc?.content as Record<string, unknown> | null;
  const conceptComponents = (conceptContent?.components as Record<string, { content: string }> | null) ?? null;
  const conceptBrandVoice = conceptComponents?.brand_voice?.content ?? "";
  const conceptShopIdentity = conceptComponents?.shop_identity?.content ?? "";

  const forecastInputs = financialModel?.forecast_inputs as Record<string, unknown> | null;
  const monthlySlices = forecastInputs?.monthly as unknown[] | null;
  let avgMonthlyRevenueCents = 0;
  if (Array.isArray(monthlySlices) && monthlySlices.length > 0) {
    const total = monthlySlices.reduce((sum: number, m: unknown) => sum + (((m as Record<string, unknown>).revenue_cents as number) ?? 0), 0);
    avgMonthlyRevenueCents = Math.round(total / monthlySlices.length);
  }

  const canEdit = isSubscriptionActive(profile?.subscription_status);
  const initialTrialMessagesUsed = profile?.subscription_tier === "free" ? (profile.copilot_trial_messages_used ?? 0) : undefined;

  return (
    <MarketingWorkspace
      planId={planId}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
      initialBrand={(brandData ?? null) as MarketingBrand | null}
      conceptBrandVoice={conceptBrandVoice}
      conceptShopIdentity={conceptShopIdentity}
      initialPresence={initialPresence}
      initialPosts={(postsData ?? []) as ContentPost[]}
      initialCampaigns={(campaignsData ?? []) as MarketingCampaign[]}
      initialBudgetLines={initialBudget}
      avgMonthlyRevenueCents={avgMonthlyRevenueCents}
    />
  );
}
