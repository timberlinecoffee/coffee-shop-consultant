// TIM-1544: Pause subscription — switch to $2.99/mo pause price.
// Webhook (TIM-1535-E) handles DB sync; this endpoint only kicks Stripe.
// TIM-2578: wrap every Stripe call so a stale/deleted subscription id (or
// transient network error) returns a sanitized JSON error instead of raw 500.

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
  let stripeSub: any;
  try {
    stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/billing/pause] stripe.subscriptions.retrieve failed", {
      userId: user.id,
      stripeSubscriptionId: sub.stripe_subscription_id,
      message: msg,
    });
    if (/No such subscription/i.test(msg)) {
      return Response.json({ error: "No active subscription found." }, { status: 404 });
    }
    return Response.json(
      { error: "We couldn't reach Stripe. Please try again in a moment." },
      { status: 502 },
    );
  }

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

  try {
    await stripe.subscriptions.update(sub.stripe_subscription_id, updateParams);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/billing/pause] stripe.subscriptions.update failed", {
      userId: user.id,
      stripeSubscriptionId: sub.stripe_subscription_id,
      message: msg,
    });
    return Response.json(
      { error: "We couldn't reach Stripe. Please try again in a moment." },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
}
