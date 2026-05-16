import { createClient } from "@/lib/supabase/server";
import { stripe, PLANS, planKeyFromParams } from "@/lib/stripe";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Accept either the new (tier + interval) shape or the legacy planKey shape
  // so existing links don't break during the transition window.
  let planKey = body.planKey ?? null;
  if (!planKey && body.tier && body.interval) {
    planKey = planKeyFromParams(body.tier as string, body.interval as string);
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

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer: subscription?.stripe_customer_id ?? undefined,
    customer_email: subscription?.stripe_customer_id ? undefined : (profile?.email ?? user.email),
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: `${origin}/account/billing?success=1`,
    cancel_url: `${origin}/pricing?canceled=1`,
    metadata: { userId: user.id, planKey, tier: plan.tier, interval: plan.interval },
    subscription_data: {
      metadata: { userId: user.id, planKey, tier: plan.tier, interval: plan.interval },
    },
  });

  return Response.json({ url: session.url });
}
