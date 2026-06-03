// TIM-1933: In-place plan swap for existing subscribers. Replaces the broken
// path where every upgrade re-ran Stripe Checkout and minted a *new* sub on
// top of the old one (TIM-1932). Modifies the existing subscription via
// stripe.subscriptions.update — single sub, prorated invoice, billing-cycle
// anchor unchanged.
//
// Trial accounts (status=trialing) can also swap here; Stripe keeps trial_end
// intact and no charge is created until day 7. Proration is disabled for the
// trialing path because the trialist has not been billed yet.
//
// Paused / cancelled subs do NOT route through here — pause uses
// /api/billing/resume to come back, and a cancelled customer goes through
// /api/stripe/create-checkout-session for a fresh subscription.
import { createClient } from "@/lib/supabase/server";
import { stripe, PLANS, planKeyFromParams } from "@/lib/stripe";
import { NextRequest } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  let planKey: string | null = body.planKey ?? null;
  if (!planKey && body.tier && body.interval) {
    planKey = planKeyFromParams(body.tier as string, body.interval as string);
  }
  if (typeof planKey === "string" && planKey.startsWith("growth_")) {
    return Response.json(
      { error: "The Growth plan was retired — choose Starter or Pro." },
      { status: 410 },
    );
  }
  if (!planKey || !(planKey in PLANS)) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }
  const plan = PLANS[planKey as keyof typeof PLANS];
  if (!plan.priceId) {
    return Response.json({ error: "Price not configured" }, { status: 503 });
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, status, tier")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return Response.json(
      { error: "No subscription found. Start a free trial from /pricing.", reason: "no_subscription" },
      { status: 404 },
    );
  }

  // Paused subs MUST go through /api/billing/resume — they're on the pause price
  // and resume picks the original tier back up. Cancelled subs need a fresh
  // Checkout. Both cases would otherwise produce a misleading swap.
  if (sub.status === "paused") {
    return Response.json(
      { error: "Subscription is paused. Resume it from /account/billing first.", reason: "paused" },
      { status: 422 },
    );
  }
  if (sub.status === "cancelled") {
    return Response.json(
      { error: "Subscription is cancelled. Start a new trial from /pricing.", reason: "cancelled" },
      { status: 422 },
    );
  }

  // Retrieve the live Stripe sub so we can target the existing item by id —
  // the only correct way to swap a price on an existing subscription.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id) as unknown as any;
  const item = stripeSub.items?.data?.[0] as Stripe.SubscriptionItem | undefined;
  if (!item) {
    return Response.json({ error: "Subscription item not found in Stripe." }, { status: 500 });
  }

  const currentPriceId = item.price?.id ?? "";
  if (currentPriceId === plan.priceId) {
    return Response.json({ ok: true, unchanged: true });
  }

  const isTrialing = stripeSub.status === "trialing";

  // Trial accounts: no proration (no charge during trial). Paying accounts:
  // create_prorations so the customer is credited / debited for the remainder
  // of the current period. billing_cycle_anchor defaults to "unchanged" — do
  // not pass it explicitly; passing "unchanged" via the typed SDK is rejected.
  const updateParams: Stripe.SubscriptionUpdateParams = {
    items: [{ id: item.id, price: plan.priceId }],
    proration_behavior: isTrialing ? "none" : "create_prorations",
    metadata: {
      ...(stripeSub.metadata ?? {}),
      userId: user.id,
      planKey,
      tier: plan.tier,
      interval: plan.interval,
    },
  };

  await stripe.subscriptions.update(sub.stripe_subscription_id, updateParams);

  // Webhook (customer.subscription.updated) syncs the subscriptions row + the
  // users tier/credits, so we don't write either here.
  return Response.json({ ok: true, tier: plan.tier, interval: plan.interval });
}
