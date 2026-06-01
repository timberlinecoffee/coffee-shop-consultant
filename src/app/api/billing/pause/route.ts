// TIM-1544: Pause subscription — switch to $2.99/mo pause price.
// Webhook (TIM-1535-E) handles DB sync; this endpoint only kicks Stripe.

import { createClient } from "@/lib/supabase/server";
import { stripe, PAUSE_PRICE_ID } from "@/lib/stripe";
import Stripe from "stripe";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, status, tier")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return Response.json({ error: "No active subscription found." }, { status: 404 });
  }

  if (sub.status === "past_due") {
    return Response.json(
      { error: "Your subscription has a past-due balance. Please update your payment method before pausing.", code: "past_due" },
      { status: 422 }
    );
  }

  if (!PAUSE_PRICE_ID) {
    return Response.json({ error: "Pause plan is not configured." }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id) as unknown as any;

  if (stripeSub.items?.data?.[0]?.price?.recurring?.interval === "year") {
    return Response.json(
      {
        error: "Pause is not available on annual plans. It becomes available when your plan renews monthly.",
        code: "annual_not_supported",
      },
      { status: 422 }
    );
  }

  const item = stripeSub.items?.data?.[0] as Stripe.SubscriptionItem | undefined;
  if (!item) {
    return Response.json({ error: "Subscription item not found." }, { status: 500 });
  }

  const updateParams: Stripe.SubscriptionUpdateParams = {
    items: [{ id: item.id, price: PAUSE_PRICE_ID }],
    proration_behavior: "none",
    metadata: {
      paused_from_tier: sub.tier,
      paused_at: new Date().toISOString(),
    },
  };

  // If already scheduled to cancel at period end, unset that first.
  if (stripeSub.cancel_at_period_end) {
    updateParams.cancel_at_period_end = false;
  }

  await stripe.subscriptions.update(sub.stripe_subscription_id, updateParams);

  return Response.json({ ok: true });
}
