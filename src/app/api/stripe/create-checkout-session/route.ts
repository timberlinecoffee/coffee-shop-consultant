import { createClient } from "@/lib/supabase/server";
import { stripe, PLANS, PlanKey } from "@/lib/stripe";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { planKey } = body as { planKey: PlanKey };

  if (!planKey || !(planKey in PLANS)) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  const plan = PLANS[planKey];

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
    success_url: `${origin}/account/billing?success=true`,
    cancel_url: `${origin}/pricing`,
    metadata: { userId: user.id, planKey },
    subscription_data: {
      metadata: { userId: user.id, planKey },
    },
  });

  return Response.json({ url: session.url });
}
