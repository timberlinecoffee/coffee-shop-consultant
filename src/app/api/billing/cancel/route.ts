// TIM-1544: Cancel subscription — sets cancel_at_period_end: true.
// Webhook (TIM-1535-E) handles DB status sync.

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

  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    cancel_at_period_end: true,
  });

  return Response.json({ ok: true });
}
