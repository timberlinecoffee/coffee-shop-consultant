// TIM-1544: /account/cancel — pause-offer intercept page.
// TIM-2578: harden against Stripe errors (No such subscription on stale ids,
// test/prod mismatch, network blips). Never raw-500 a paid cancel surface;
// fall back to /account/billing with a clear nothing-to-cancel state.

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
  pro: "$99/month",
};

// TIM-2578: cancellable states. `past_due` is included so users with a failed
// payment can still cancel — blocking them is a Consumer Protection / Stripe
// dispute risk (Standing Rule context, issue AC1).
const CANCELLABLE_STATUSES = new Set(["active", "trialing", "paused", "past_due"]);

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

  if (!sub?.stripe_subscription_id || !CANCELLABLE_STATUSES.has(sub.status ?? "")) {
    redirect("/account/billing?nothing_to_cancel=1");
  }

  const tier = sub.tier ?? "starter";
  const tierDisplayName = PLAN_DISPLAY_NAMES[tier] ?? tier;
  const currentRate = MONTHLY_RATES[tier] ?? "";
  const periodEnd = sub.current_period_end;

  // TIM-2578: Stripe can throw `No such subscription` (and similar) when the
  // stored id points at a sub that was deleted, lives in test mode, or just
  // hiccups. Any throw here used to crash the whole page (raw 500 to the
  // user). Treat any failure as "nothing to retrieve" and route to billing.
  let stripeSub: Stripe.Subscription | null = null;
  try {
    stripeSub = (await stripe.subscriptions.retrieve(
      sub.stripe_subscription_id,
    )) as unknown as Stripe.Subscription;
  } catch (err) {
    console.error("[/account/cancel] stripe.subscriptions.retrieve failed", {
      userId: user.id,
      stripeSubscriptionId: sub.stripe_subscription_id,
      message: err instanceof Error ? err.message : String(err),
    });
    redirect("/account/billing?nothing_to_cancel=1");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const interval: string = (stripeSub as any)?.items?.data?.[0]?.price?.recurring?.interval ?? "month";

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
