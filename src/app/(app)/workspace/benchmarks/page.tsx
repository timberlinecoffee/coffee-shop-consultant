// TIM-2498: Benchmarks workspace page — makes the benchmark feature
// discoverable via the sidebar. Pro users (and active trialists, who are
// treated as Pro per TIM-1902) see the full BenchmarkDashboard; Starter users
// see an UpgradeGate linking to /pricing.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { effectivePlanForGating, isBetaWaived } from "@/lib/access";
import { UpgradeGate } from "@/components/upgrade-gate";
import { BenchmarksWorkspace } from "./benchmarks-workspace";
import { getActivePlanId } from "@/lib/plan-context";

export const dynamic = "force-dynamic";

export default async function BenchmarksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) redirect("/onboarding");

  const { data: profile } = await supabase
    .from("users")
    .select(
      "subscription_status, subscription_tier, paused_from_tier, trial_ends_at, beta_waiver_until, copilot_trial_messages_used",
    )
    .eq("id", user.id)
    .maybeSingle();

  const tier = effectivePlanForGating({
    subscription_status: profile?.subscription_status,
    subscription_tier: profile?.subscription_tier,
    paused_from_tier: profile?.paused_from_tier,
    trial_ends_at: profile?.trial_ends_at,
  });

  const betaWaived = isBetaWaived(profile?.beta_waiver_until);

  if (tier !== "pro" && !betaWaived) {
    return (
      <div className="w-full px-4 sm:px-6 pt-8 pb-16">
        <UpgradeGate
          title="Benchmarks"
          description="See how your coffee shop numbers compare to real independent shops in your area. Available on Pro."
          benefits={[
            "Revenue and traffic benchmarks by shop model",
            "Cost of Goods Sold and labor rate comparisons",
            "Real estate and fit-out cost ranges",
            "Menu pricing and margin health checks",
          ]}
          returnHref="/workspace/benchmarks"
        />
      </div>
    );
  }

  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  return (
    <BenchmarksWorkspace
      planId={planId}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
    />
  );
}
