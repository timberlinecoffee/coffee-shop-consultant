// TIM-1942: Change a member's subscription plan via Stripe + sync to DB.
// CSRF-safe: state-changing route + admin auth gate + JSON body parse + no
// browser navigations consume this.

import { requireAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAdminAction } from "@/lib/admin-audit";
import { stripe, PLANS, type PlanKey } from "@/lib/stripe";
import type { ChangePlanRequest } from "@/types/admin";
import type Stripe from "stripe";

export const runtime = "nodejs";

function planKey(tier: string, interval: string): PlanKey | null {
  const key = `${tier}_${interval}` as PlanKey;
  return key in PLANS ? key : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  let body: ChangePlanRequest;
  try {
    body = (await request.json()) as ChangePlanRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.tier || !body.interval) {
    return Response.json({ error: "tier and interval required" }, { status: 400 });
  }
  const key = planKey(body.tier, body.interval);
  if (!key) return Response.json({ error: "Unknown plan" }, { status: 400 });
  const plan = PLANS[key];
  if (!plan.priceId) {
    return Response.json({ error: "Plan price ID not configured in env" }, { status: 503 });
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("users")
    .select("id, email, subscription_status, subscription_tier")
    .eq("id", id)
    .maybeSingle();
  if (!profile) return Response.json({ error: "Member not found" }, { status: 404 });

  const { data: existing } = await svc
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, tier, status, current_period_end")
    .eq("user_id", id)
    .maybeSingle();

  const proration: Stripe.SubscriptionUpdateParams.ProrationBehavior =
    body.proration === "none" ? "none" : "create_prorations";

  let stripeSubId: string | null = existing?.stripe_subscription_id ?? null;
  let stripeCustomerId: string | null = existing?.stripe_customer_id ?? null;
  let resultSub: Stripe.Subscription | null = null;

  try {
    if (stripeSubId) {
      const current = await stripe.subscriptions.retrieve(stripeSubId);
      const itemId = current.items.data[0]?.id;
      if (!itemId) {
        return Response.json({ error: "Stripe subscription has no items" }, { status: 500 });
      }
      resultSub = await stripe.subscriptions.update(stripeSubId, {
        items: [{ id: itemId, price: plan.priceId }],
        proration_behavior: proration,
        metadata: { admin_action: "change_plan", admin_email: auth.email, target_user_id: id },
      });
    } else {
      if (!stripeCustomerId && profile.email) {
        const found = await stripe.customers.list({ email: profile.email, limit: 5 });
        const match = found.data.find((c) => !c.deleted);
        stripeCustomerId = match?.id ?? null;
      }
      if (!stripeCustomerId) {
        const created = await stripe.customers.create({
          email: profile.email,
          metadata: { user_id: id, source: "admin_portal" },
        });
        stripeCustomerId = created.id;
      }
      resultSub = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: plan.priceId }],
        metadata: { admin_action: "change_plan", admin_email: auth.email, target_user_id: id },
      });
      stripeSubId = resultSub.id;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return Response.json({ error: `Stripe call failed: ${message}` }, { status: 502 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subAny = resultSub as unknown as any;
  const item = subAny.items?.data?.[0];
  const periodStart = item?.current_period_start ?? subAny.current_period_start ?? null;
  const periodEnd = item?.current_period_end ?? subAny.current_period_end ?? null;

  const updates = {
    user_id: id,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubId,
    tier: plan.tier,
    status: "active",
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  };
  await svc.from("subscriptions").upsert(updates, { onConflict: "user_id" });
  await svc
    .from("users")
    .update({ subscription_status: "active", subscription_tier: plan.tier })
    .eq("id", id);

  await recordAdminAction({
    actor: { userId: auth.userId, email: auth.email },
    target: { userId: id, email: profile.email },
    action: "change_plan",
    before: {
      tier: existing?.tier ?? null,
      status: existing?.status ?? profile.subscription_status,
      stripe_subscription_id: existing?.stripe_subscription_id ?? null,
    },
    after: {
      tier: plan.tier,
      interval: plan.interval,
      status: "active",
      stripe_subscription_id: stripeSubId,
    },
    metadata: { proration_behavior: proration },
  });

  return Response.json({ ok: true, subscriptionId: stripeSubId, tier: plan.tier, interval: plan.interval });
}
