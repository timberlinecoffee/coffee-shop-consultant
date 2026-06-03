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
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";

  // TIM-1902: 7-day free trial — card required at signup, Stripe owns the
  // timer via trial_period_days, auto-charges on day 7 at the chosen plan's
  // price. payment_method_collection:always forces card capture even when the
  // session would otherwise skip it for a trialing subscription. Trial credits
  // (75) and Pro-feature unlock during the trial are granted by the webhook;
  // see src/app/api/stripe/webhook/route.ts.
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    payment_method_collection: "always",
    customer: subscription?.stripe_customer_id ?? undefined,
    customer_email: subscription?.stripe_customer_id ? undefined : (profile?.email ?? user.email),
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: `${origin}/account/billing?success=1`,
    cancel_url: `${origin}/pricing?canceled=1`,
    metadata: { userId: user.id, planKey, tier: plan.tier, interval: plan.interval },
    subscription_data: {
      trial_period_days: TRIAL_PERIOD_DAYS,
      metadata: { userId: user.id, planKey, tier: plan.tier, interval: plan.interval },
    },
  });

  return Response.json({ url: session.url });
}
