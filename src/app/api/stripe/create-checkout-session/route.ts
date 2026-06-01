import { createClient } from "@/lib/supabase/server";
import { stripe, PLANS, planKeyFromParams, TRIAL_PERIOD_DAYS } from "@/lib/stripe";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Accept either the new (tier + interval) shape or the legacy planKey shape
  // so existing links don't break during the transition window. TIM-1902:
  // 'growth' is retired — explicitly reject it so old emails / bookmarks fail
  // loudly with the right message instead of silently 400ing on a missing key.
  let planKey = body.planKey ?? null;
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

  const { data: profile } = await supabase
    .from("users")
    .select("email")
    .eq("id", user.id)
    .single();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  // TIM-1933: Refuse to mint a brand-new subscription when the user already
  // has a live one. Without this guard, the pricing-page "upgrade" CTA
  // produced TWO active subs on the same Stripe customer (board report on
  // TIM-1932 — every upgrader was being double-billed). Live upgrades MUST
  // go through /api/billing/change-plan, which calls
  // stripe.subscriptions.update on the existing sub. "Live" here = any state
  // where Stripe is still billing or about to bill the customer: trialing,
  // active, or past_due. Paused/cancelled subs are allowed to mint a new
  // one through this route (pause → resume restores the original plan;
  // cancelled → fresh checkout is the correct re-subscribe path).
  const liveStatuses = new Set(["trialing", "active", "past_due"]);
  if (subscription?.stripe_subscription_id && liveStatuses.has(subscription.status ?? "")) {
    return Response.json(
      {
        error: "You already have an active subscription. Use the change-plan flow to switch.",
        reason: "existing_subscription",
        currentStatus: subscription.status,
      },
      { status: 409 },
    );
  }

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";

  // Rewardful affiliate attribution (TIM-1620): the client reads the referral id
  // from `window.Rewardful.referral` and passes it here. Stripe stores it as
  // `client_reference_id`, which Rewardful reads off the subscription to attribute
  // the referral and accrue recurring commission. Omitted when there is no referral.
  const referral =
    typeof body.referral === "string" && body.referral.trim() ? body.referral.trim() : undefined;

  // TIM-1902: 7-day free trial — card required at signup, Stripe owns the
  // timer via trial_period_days, auto-charges on day 7 at the chosen plan's
  // price. payment_method_collection:always forces card capture even when the
  // session would otherwise skip it for a trialing subscription. Trial credits
  // (75) and Pro-feature unlock during the trial are granted by the webhook;
  // see src/app/api/stripe/webhook/route.ts.
  //
  // FTC Negative Option Rule auto-renew disclosure (TIM-1905 §1, Marketing +
  // Legal signed off). MUST render on Stripe Checkout before the user clicks
  // "Start free trial". Verbatim copy — do not edit without re-clearing with
  // Marketing/Legal. Stripe's custom_text.submit.message supports a markdown
  // subset including [text](url) hyperlinks; limit is 1200 chars (we use ~370).
  const ftcDisclosure =
    `Your free trial includes full Pro access for 7 days. A credit card is required at signup. ` +
    `After your trial, your card will be charged automatically for the plan you selected at signup: ` +
    `Starter at $39/month or Pro at $99/month. Cancel in Settings > Billing at any time before day 7 ` +
    `to avoid a charge. [Subscription Terms](${origin}/subscription-terms) apply.`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    payment_method_collection: "always",
    customer: subscription?.stripe_customer_id ?? undefined,
    customer_email: subscription?.stripe_customer_id ? undefined : (profile?.email ?? user.email),
    client_reference_id: referral,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: `${origin}/account/billing?success=1`,
    cancel_url: `${origin}/pricing?canceled=1`,
    metadata: { userId: user.id, planKey, tier: plan.tier, interval: plan.interval },
    subscription_data: {
      trial_period_days: TRIAL_PERIOD_DAYS,
      metadata: { userId: user.id, planKey, tier: plan.tier, interval: plan.interval },
    },
    custom_text: {
      submit: { message: ftcDisclosure },
    },
  });

  return Response.json({ url: session.url });
}
