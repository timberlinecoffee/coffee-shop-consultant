// TIM-1544: /account/cancel — pause-offer intercept page.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { PLAN_DISPLAY_NAMES } from "@/lib/plan-names";
import { CancelPageClient, AnnualCancelPageClient } from "./CancelPageClient";
import type { Metadata } from "next";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cancel Subscription | My Coffee Shop Consultant" };

const MONTHLY_RATES: Record<string, string> = {
  starter: "$39/month",
  growth: "$99/month",
  pro: "$199/month",
};

export default async function CancelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, status, tier, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub?.stripe_subscription_id || !["active", "trialing", "paused"].includes(sub.status ?? "")) {
    redirect("/pricing");
  }

  const tier = sub.tier ?? "starter";
  const tierDisplayName = PLAN_DISPLAY_NAMES[tier] ?? tier;
  const currentRate = MONTHLY_RATES[tier] ?? "";
  const periodEnd = sub.current_period_end;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id) as unknown as any;
  const interval: string = stripeSub.items?.data?.[0]?.price?.recurring?.interval ?? "month";

  if (interval === "year") {
    return (
      <AnnualCancelPageClient
        tierDisplayName={tierDisplayName}
        periodEnd={periodEnd ?? null}
        userEmail={user.email ?? ""}
      />
    );
  }

  return (
    <CancelPageClient
      tier={tier}
      tierDisplayName={tierDisplayName}
      currentRate={currentRate}
      periodEnd={periodEnd ?? null}
    />
  );
}
