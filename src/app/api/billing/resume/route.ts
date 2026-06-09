// TIM-1544: Resume subscription — switch back from pause price to original tier's monthly price.
// Webhook (TIM-1535-E) handles DB sync; this endpoint only kicks Stripe.
// TIM-2578: wrap every Stripe call so a stale/deleted subscription id returns
// a sanitized JSON error instead of raw 500.

import { createClient } from "@/lib/supabase/server";
import { stripe, monthlyPriceIdForTier } from "@/lib/stripe";
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
    .select("stripe_subscription_id, status, paused_from_tier")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return Response.json({ error: "No subscription found." }, { status: 404 });
  }

  if (sub.status !== "paused") {
    return Response.json({ error: "Subscription is not paused." }, { status: 422 });
  }

  const resumeTier = sub.paused_from_tier;
  if (!resumeTier) {
    return Response.json({ redirect: "/pricing" }, { status: 200 });
  }

  const resumePriceId = monthlyPriceIdForTier(resumeTier);
  if (!resumePriceId) {
    // Tier no longer exists — send user to pricing to pick a plan.
    return Response.json({ redirect: "/pricing" }, { status: 200 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stripeSub: any;
  try {
    stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/billing/resume] stripe.subscriptions.retrieve failed", {
      userId: user.id,
      stripeSubscriptionId: sub.stripe_subscription_id,
      message: msg,
    });
    if (/No such subscription/i.test(msg)) {
      return Response.json({ error: "No subscription found." }, { status: 404 });
    }
    return Response.json(
      { error: "We couldn't reach Stripe. Please try again in a moment." },
      { status: 502 },
    );
  }
  const item = stripeSub.items?.data?.[0] as Stripe.SubscriptionItem | undefined;
  if (!item) {
    return Response.json({ error: "Subscription item not found." }, { status: 500 });
  }

  try {
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: item.id, price: resumePriceId }],
      proration_behavior: "none",
      metadata: {
        paused_from_tier: null,
        paused_at: null,
      },
    } as Stripe.SubscriptionUpdateParams);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/billing/resume] stripe.subscriptions.update failed", {
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
