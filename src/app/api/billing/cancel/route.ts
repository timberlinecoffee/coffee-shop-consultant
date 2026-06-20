// TIM-1544: Cancel subscription — sets cancel_at_period_end: true for active
// subs; immediately cancels trialing subs (TIM-2802: cancel_at_period_end on a
// trial generates a $39 first-period invoice before canceling — immediate
// cancel avoids the charge entirely).
// Webhook (TIM-1535-E) handles DB status sync.
// TIM-2578: wrap Stripe calls so a stale/deleted subscription id returns a
// clean 404 instead of raw-500ing the cancel button.

import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

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
    .select("stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return Response.json({ error: "No active subscription found." }, { status: 404 });
  }

  try {
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);

    if (stripeSub.status === "trialing") {
      // Immediate cancel: no invoice is generated, so the user is never charged.
      // cancel_at_period_end on a trialing sub generates a first-period invoice
      // at trial_end before canceling, which wrongly charges the user (TIM-2802).
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } else {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/billing/cancel] stripe cancel failed", {
      userId: user.id,
      stripeSubscriptionId: sub.stripe_subscription_id,
      message: msg,
    });
    if (/No such subscription/i.test(msg)) {
      return Response.json({ error: "No active subscription found." }, { status: 404 });
    }
    return Response.json(
      { error: "We couldn't reach Stripe to cancel your subscription. Please try again in a moment." },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
}
