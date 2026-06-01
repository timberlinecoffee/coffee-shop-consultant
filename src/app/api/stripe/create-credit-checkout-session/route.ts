// TIM-1687: one-off credit top-up checkout (Stripe mode="payment").
//
// Lets a signed-in user buy a credit pack mid-month. On payment, the Stripe
// webhook (checkout.session.completed, mode=payment, kind=credit_pack) grants
// the credits into ai_credits_remaining + the credit_transactions ledger. The
// credit amount is carried in our own session metadata and re-resolved
// server-side from the pack key — the client cannot inflate the grant.
import { createClient } from "@/lib/supabase/server";
import { stripe, creditPackPriceId } from "@/lib/stripe";
import { CREDIT_PACKS_BY_KEY, isCreditPackKey } from "@/lib/credits/packs";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const packKey = typeof body.packKey === "string" ? body.packKey : "";

  if (!isCreditPackKey(packKey)) {
    return Response.json({ error: "Invalid credit pack" }, { status: 400 });
  }

  const pack = CREDIT_PACKS_BY_KEY[packKey];
  const priceId = creditPackPriceId(packKey);

  if (!priceId) {
    return Response.json({ error: "Credit packs are not available yet" }, { status: 503 });
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
  // Land the buyer back where they were buying from (the drawer refetches the
  // credit balance on open), falling back to the billing page.
  const returnPath =
    typeof body.returnPath === "string" && body.returnPath.startsWith("/")
      ? body.returnPath
      : "/account/billing";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer: subscription?.stripe_customer_id ?? undefined,
    customer_email: subscription?.stripe_customer_id ? undefined : (profile?.email ?? user.email),
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}${returnPath}${returnPath.includes("?") ? "&" : "?"}credits_added=1`,
    cancel_url: `${origin}${returnPath}${returnPath.includes("?") ? "&" : "?"}credits_canceled=1`,
    metadata: {
      userId: user.id,
      kind: "credit_pack",
      packKey,
      credits: String(pack.credits),
    },
    payment_intent_data: {
      metadata: { userId: user.id, kind: "credit_pack", packKey, credits: String(pack.credits) },
    },
  });

  return Response.json({ url: session.url });
}
