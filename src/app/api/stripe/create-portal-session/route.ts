import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!subscription?.stripe_customer_id) {
    return Response.json({ error: "No active subscription found" }, { status: 404 });
  }

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";

  // bpc_1TdRzBCzwciIL0hn5JkVNzmu: cancel disabled, PM update + invoice history on
  // See docs/stripe-portal-config.md for full spec and rotation procedure.
  const portalConfigId = process.env.STRIPE_PORTAL_CONFIG_ID;
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${origin}/account/billing`,
    ...(portalConfigId ? { configuration: portalConfigId } : {}),
  });

  return Response.json({ url: session.url });
}
