import { stripe, tierFromPriceId, MONTHLY_CREDITS, TRIAL_CREDITS, PAUSE_PRICE_ID } from "@/lib/stripe";
import { creditsForPackKey } from "@/lib/credits/packs";
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

  // Idempotency: skip already-processed events (replay safety)
  const { error: insertErr } = await supabase
    .from("stripe_processed_events")
    .insert({ event_id: event.id, event_type: event.type });

  if (insertErr) {
    // Unique violation means we already processed this event
    if (insertErr.code === "23505") {
      return Response.json({ received: true, skipped: true });
    }
    console.error("Failed to record stripe event:", insertErr);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      // TIM-1687: one-off credit top-up. Grant purchased credits into the
      // balance + ledger. Idempotency is guaranteed by stripe_processed_events
      // above, so this read-modify-write is safe against Stripe event replays.
      if (session.mode === "payment" && session.metadata?.kind === "credit_pack") {
        const userId = session.metadata?.userId;
        const packKey = session.metadata?.packKey ?? "";
        const credits = creditsForPackKey(packKey);

        // Only grant on a genuinely paid session; never trust a client-supplied amount.
        if (!userId || credits === null || credits <= 0) break;
        if (session.payment_status !== "paid") break;

        const { data: prof } = await supabase
          .from("users")
          .select("ai_credits_remaining")
          .eq("id", userId)
          .single();

        const current = prof?.ai_credits_remaining ?? 0;

        await supabase.from("users").update({
          ai_credits_remaining: current + credits,
        }).eq("id", userId);

        await supabase.from("credit_transactions").insert({
          user_id: userId,
          amount: credits,
          type: "purchase",
          description: `Credit top-up: ${packKey} pack (+${credits})`,
        });
        break;
      }

      if (session.mode !== "subscription") break;

      const userId = session.metadata?.userId;
      if (!userId) break;

      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = subscription as unknown as any;
      const item = sub.items?.data?.[0];
      const priceId: string = item?.price?.id ?? "";
      const tier = tierFromPriceId(priceId);
      // In Stripe API 2026+, current_period_end/start moved to the subscription item
      const periodStart = item?.current_period_start ?? sub.current_period_start;
      const periodEnd = item?.current_period_end ?? sub.current_period_end;

      // TIM-1902: a freshly-created subscription with trial_period_days starts
      // in 'trialing' state. Detect that and seed trial state instead of
      // granting a monthly allocation. The trial-to-active transition is
      // handled in customer.subscription.updated below.
      const isTrialing = sub.status === "trialing";
      const trialEnd = typeof sub.trial_end === "number" ? sub.trial_end : null;
      const trialEndIso = trialEnd ? new Date(trialEnd * 1000).toISOString() : null;

      await supabase.from("subscriptions").upsert({
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        tier,
        status: isTrialing ? "trialing" : "active",
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      }, { onConflict: "user_id" });

      if (isTrialing) {
        // Trial: one-time 75-credit grant; subscription_tier records the plan
        // the user chose to convert to (Starter or Pro). Pro-feature unlock for
        // the trial window is handled in src/lib/access.ts (effectiveTierForRead
        // returns 'pro' while free_trial + trial_ends_at is future).
        await supabase.from("users").update({
          subscription_status: "free_trial",
          subscription_tier: tier,
          ai_credits_remaining: TRIAL_CREDITS,
          trial_ends_at: trialEndIso,
          trial_credits_granted: true,
        }).eq("id", userId);

        await supabase.from("credit_transactions").insert({
          user_id: userId,
          amount: TRIAL_CREDITS,
          type: "monthly_allocation",
          description: `${tier} 7-day trial: initial allocation`,
        });
      } else {
        // Non-trial path (e.g. resubscribe after a previous cancel): grant the
        // chosen plan's monthly allotment immediately.
        await supabase.from("users").update({
          subscription_status: "active",
          subscription_tier: tier,
          ai_credits_remaining: MONTHLY_CREDITS[tier] ?? 0,
          trial_ends_at: null,
        }).eq("id", userId);

        if (tier !== "free") {
          await supabase.from("credit_transactions").insert({
            user_id: userId,
            amount: MONTHLY_CREDITS[tier] ?? 0,
            type: "monthly_allocation",
            description: `${tier} plan: initial allocation`,
          });
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subscription = event.data.object as unknown as any;
      const updatedItem = subscription.items?.data?.[0];
      const priceId: string = updatedItem?.price?.id ?? "";
      const tier = tierFromPriceId(priceId);

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id, current_period_end, tier, status")
        .eq("stripe_subscription_id", subscription.id)
        .single();

      if (!sub) break;

      // In Stripe API 2026+, current_period_end/start moved to the subscription item
      const rawPeriodEnd = updatedItem?.current_period_end ?? subscription.current_period_end;
      const rawPeriodStart = updatedItem?.current_period_start ?? subscription.current_period_start;
      const newPeriodEnd = rawPeriodEnd ? new Date(rawPeriodEnd * 1000).toISOString() : null;

      // --- Pause: switching to the $2.99 pause price ---
      if (PAUSE_PRICE_ID && priceId === PAUSE_PRICE_ID) {
        await supabase.from("subscriptions").update({
          status: "paused",
          paused_from_tier: sub.tier, // read before overwrite — preserve original tier
          paused_at: new Date().toISOString(),
          // tier is intentionally NOT updated
        }).eq("stripe_subscription_id", subscription.id);

        await supabase.from("users").update({
          subscription_status: "paused",
          // subscription_tier intentionally NOT changed — access.ts reads paused_from_tier
        }).eq("id", sub.user_id);
        break;
      }

      // --- Resume: returning to a real tier from paused ---
      if (sub.status === "paused" && tier !== "free") {
        await supabase.from("subscriptions").update({
          status: "active",
          tier,
          paused_from_tier: null,
          paused_at: null,
          current_period_start: rawPeriodStart ? new Date(rawPeriodStart * 1000).toISOString() : null,
          current_period_end: newPeriodEnd,
        }).eq("stripe_subscription_id", subscription.id);

        await supabase.from("users").update({
          subscription_status: "active",
          subscription_tier: tier,
        }).eq("id", sub.user_id);
        break;
      }

      // --- Default: plan change, renewal, status sync, trial conversion ---
      const status = subscription.status === "active" ? "active"
        : subscription.status === "canceled" ? "cancelled"
        : subscription.status === "past_due" ? "past_due"
        : subscription.status === "trialing" ? "trialing"
        : "cancelled";
      const isRenewal = newPeriodEnd !== sub.current_period_end;
      // TIM-1902: trialing → active means Stripe just successfully auto-charged
      // the card on day 7. Replace the 75 trial credits with the chosen plan's
      // monthly allotment, clear trial_ends_at, and stamp subscription_status
      // active. invoice.payment_failed on this same charge is handled below.
      const trialConverted = sub.status === "trialing" && status === "active";

      await supabase.from("subscriptions").update({
        tier,
        status,
        current_period_start: rawPeriodStart ? new Date(rawPeriodStart * 1000).toISOString() : null,
        current_period_end: newPeriodEnd,
      }).eq("stripe_subscription_id", subscription.id);

      const usersUpdate: Record<string, unknown> = {
        subscription_status: status === "trialing" ? "free_trial" : status,
        subscription_tier: status === "active" || status === "trialing" ? tier : "free",
      };

      // Trial conversion: replace trial credits with the monthly grant.
      if (trialConverted && tier !== "free") {
        usersUpdate.ai_credits_remaining = MONTHLY_CREDITS[tier] ?? 0;
        usersUpdate.trial_ends_at = null;
        usersUpdate.past_due_since = null;
        // TIM-1903: stamp the converted-to plan so /dashboard can show a
        // one-time "Welcome to {plan}" toast on the next load. The dashboard
        // toast clears the column via POST /api/account/dismiss-welcome-toast.
        usersUpdate.trial_just_converted_to = tier;
        await supabase.from("credit_transactions").insert({
          user_id: sub.user_id,
          amount: MONTHLY_CREDITS[tier] ?? 0,
          type: "monthly_allocation",
          description: `${tier} plan: trial converted — initial allocation`,
        });
      } else if (isRenewal && status === "active" && tier !== "free" && !trialConverted) {
        // Standard monthly renewal — refresh the credit balance.
        usersUpdate.ai_credits_remaining = MONTHLY_CREDITS[tier] ?? 0;
        usersUpdate.past_due_since = null;
        await supabase.from("credit_transactions").insert({
          user_id: sub.user_id,
          amount: MONTHLY_CREDITS[tier] ?? 0,
          type: "monthly_allocation",
          description: `${tier} plan: monthly renewal`,
        });
      } else if (status === "active") {
        // Recovered from past_due via successful retry — clear the dunning stamp.
        usersUpdate.past_due_since = null;
      }

      await supabase.from("users").update(usersUpdate).eq("id", sub.user_id);
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

      // Clear pause columns on hard cancel (covers paused → cancelled via failed dunning)
      await supabase.from("subscriptions").update({
        status: "cancelled",
        paused_from_tier: null,
        paused_at: null,
      }).eq("stripe_subscription_id", subscription.id);

      // Downgrade immediately on hard cancellation; clear trial + dunning state.
      await supabase.from("users").update({
        subscription_status: "cancelled",
        subscription_tier: "free",
        trial_ends_at: null,
        past_due_since: null,
      }).eq("id", sub.user_id);
      break;
    }

    case "invoice.payment_failed": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoice = event.data.object as unknown as any;
      // Stripe dahlia API moved subscription to parent.subscription_details.subscription
      const stripeSubscriptionId: string =
        invoice.subscription ??
        invoice.parent?.subscription_details?.subscription ??
        "";
      if (!stripeSubscriptionId) break;

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_subscription_id", stripeSubscriptionId)
        .single();

      if (!sub) break;

      // Mark past_due — Stripe will retry; paywall enforced on next write (TIM-643).
      await supabase.from("subscriptions").update({
        status: "past_due",
      }).eq("stripe_subscription_id", stripeSubscriptionId);

      // TIM-1902: stamp past_due_since on first failure only. The billing UI
      // uses this to render the update-payment banner and to drive the 3-day
      // grace before write access is fully revoked. invoice.payment_failed
      // fires for each Stripe retry, but we keep the original timestamp so the
      // grace clock starts from the FIRST failure, not the most recent.
      const { data: existing } = await supabase
        .from("users")
        .select("past_due_since")
        .eq("id", sub.user_id)
        .single();

      const usersUpdate: Record<string, unknown> = { subscription_status: "past_due" };
      if (!existing?.past_due_since) {
        usersUpdate.past_due_since = new Date().toISOString();
      }
      await supabase.from("users").update(usersUpdate).eq("id", sub.user_id);

      // After Stripe exhausts retries it fires customer.subscription.deleted;
      // that handler downgrades to free. No grace-period timer needed here.
      break;
    }
  }

  return Response.json({ received: true });
}
