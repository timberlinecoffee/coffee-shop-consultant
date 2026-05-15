import { stripe, tierFromPriceId, MONTHLY_CREDITS } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature") ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;

      const userId = session.metadata?.userId;
      if (!userId) break;

      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = subscription as unknown as any;
      const priceId: string = sub.items?.data?.[0]?.price?.id ?? "";
      const tier = tierFromPriceId(priceId);

      await supabase.from("subscriptions").upsert({
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        tier,
        status: "active",
        current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
        current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      }, { onConflict: "user_id" });

      await supabase.from("users").update({
        subscription_status: "active",
        subscription_tier: tier,
        ai_credits_remaining: MONTHLY_CREDITS[tier] ?? 0,
      }).eq("id", userId);

      if (tier !== "free") {
        await supabase.from("credit_transactions").insert({
          user_id: userId,
          amount: MONTHLY_CREDITS[tier] ?? 0,
          type: "monthly_allocation",
          description: `${tier} plan: initial allocation`,
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subscription = event.data.object as unknown as any;
      const priceId: string = subscription.items?.data?.[0]?.price?.id ?? "";
      const tier = tierFromPriceId(priceId);
      const status = subscription.status === "active" ? "active"
        : subscription.status === "canceled" ? "cancelled"
        : subscription.status === "past_due" ? "past_due"
        : subscription.status === "trialing" ? "trialing"
        : "cancelled";

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id, current_period_end")
        .eq("stripe_subscription_id", subscription.id)
        .single();

      if (!sub) break;

      const newPeriodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null;
      const isRenewal = newPeriodEnd !== sub.current_period_end;

      await supabase.from("subscriptions").update({
        tier,
        status,
        current_period_start: subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000).toISOString()
          : null,
        current_period_end: newPeriodEnd,
      }).eq("stripe_subscription_id", subscription.id);

      const updates: Record<string, unknown> = {
        subscription_status: status,
        subscription_tier: status === "active" ? tier : "free",
      };

      if (isRenewal && status === "active" && tier !== "free") {
        updates.ai_credits_remaining = MONTHLY_CREDITS[tier] ?? 0;
        await supabase.from("credit_transactions").insert({
          user_id: sub.user_id,
          amount: MONTHLY_CREDITS[tier] ?? 0,
          type: "monthly_allocation",
          description: `${tier} plan: monthly renewal`,
        });
      }

      await supabase.from("users").update(updates).eq("id", sub.user_id);
      break;
    }

    case "customer.subscription.deleted": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subscription = event.data.object as unknown as any;

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_subscription_id", subscription.id)
        .single();

      if (!sub) break;

      await supabase.from("subscriptions").update({
        status: "cancelled",
      }).eq("stripe_subscription_id", subscription.id);

      await supabase.from("users").update({
        subscription_status: "cancelled",
        subscription_tier: "free",
      }).eq("id", sub.user_id);
      break;
    }
  }

  return Response.json({ received: true });
}
