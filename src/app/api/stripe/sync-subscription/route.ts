// TIM-1500: pull subscription state directly from Stripe and apply it to the
// user's profile. The frontend calls this when the user returns from a Stripe
// checkout (`/account/billing?success=1`) so entitlement is correct even if
// the webhook never fires or arrives late. Idempotent — safe to call repeatedly.

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe, tierFromPriceId, MONTHLY_CREDITS, TRIAL_CREDITS } from "@/lib/stripe";
import Stripe from "stripe";

export const runtime = "nodejs";

type SubLite = {
  id: string;
  status: string;
  priceId: string;
  customerId: string;
  periodStart: number | null;
  periodEnd: number | null;
};

function extractSub(sub: Stripe.Subscription): SubLite {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = sub as unknown as any;
  const item = s.items?.data?.[0];
  return {
    id: s.id,
    status: s.status,
    priceId: item?.price?.id ?? "",
    customerId: typeof s.customer === "string" ? s.customer : s.customer?.id ?? "",
    periodStart: item?.current_period_start ?? s.current_period_start ?? null,
    periodEnd: item?.current_period_end ?? s.current_period_end ?? null,
  };
}

// Maps Stripe subscription status → subscriptions.status (DB enum).
function mapStatus(stripeStatus: string): string {
  if (stripeStatus === "active") return "active";
  if (stripeStatus === "trialing") return "trialing";
  if (stripeStatus === "past_due") return "past_due";
  if (stripeStatus === "canceled") return "cancelled";
  return "cancelled";
}

// Maps Stripe subscription status → users.subscription_status (different enum:
// 'free_trial' | 'active' | 'cancelled' | 'expired' | 'paused').
// TIM-1947: "trialing" is not a valid users.subscription_status value — use "free_trial".
function mapUserStatus(stripeStatus: string): "free_trial" | "active" | "cancelled" | "expired" | "paused" {
  if (stripeStatus === "active") return "active";
  if (stripeStatus === "trialing") return "free_trial";
  if (stripeStatus === "past_due") return "active"; // still entitled; payment in grace period
  return "cancelled";
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: profile } = await service
    .from("users")
    .select("id, email, subscription_status, subscription_tier")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }

  const { data: existing } = await service
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId: string | null = existing?.stripe_customer_id ?? null;

  if (!customerId && profile.email) {
    const found = await stripe.customers.list({ email: profile.email, limit: 5 });
    const match = found.data.find((c) => !c.deleted);
    customerId = match?.id ?? null;
  }

  if (!customerId) {
    return Response.json({
      synced: false,
      reason: "no_stripe_customer",
      tier: profile.subscription_tier,
      status: profile.subscription_status,
    });
  }

  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  const ranked = list.data
    .map(extractSub)
    .sort((a, b) => {
      const rank = (s: string) =>
        s === "active" ? 0 : s === "trialing" ? 1 : s === "past_due" ? 2 : 3;
      return rank(a.status) - rank(b.status);
    });

  const sub = ranked[0];

  if (!sub) {
    return Response.json({
      synced: false,
      reason: "no_subscription_on_customer",
      tier: profile.subscription_tier,
      status: profile.subscription_status,
    });
  }

  const tier = tierFromPriceId(sub.priceId);
  const status = mapStatus(sub.status);
  const periodStartIso = sub.periodStart ? new Date(sub.periodStart * 1000).toISOString() : null;
  const periodEndIso = sub.periodEnd ? new Date(sub.periodEnd * 1000).toISOString() : null;

  await service.from("subscriptions").upsert({
    user_id: user.id,
    stripe_customer_id: sub.customerId,
    stripe_subscription_id: sub.id,
    tier,
    status,
    current_period_start: periodStartIso,
    current_period_end: periodEndIso,
  }, { onConflict: "user_id" });

  const newPeriod = periodEndIso !== (existing?.current_period_end ?? null);
  // TIM-1947: grant credits on both active renewals and the initial trialing checkout.
  const isTrial = sub.status === "trialing";
  const shouldAllocate = (sub.status === "active" || isTrial) && tier !== "free" && newPeriod;
  const creditAmount = isTrial ? TRIAL_CREDITS : (MONTHLY_CREDITS[tier] ?? 0);

  const updates: Record<string, unknown> = {
    // TIM-1947: use tier-aware status map — "trialing" is not a valid users enum value.
    subscription_status: mapUserStatus(sub.status),
    // TIM-1947: always persist the actual tier, never force "free" for trialing.
    subscription_tier: tier,
  };

  // TIM-1947: trial_ends_at is load-bearing — hasWriteAccess() / effectiveTierForRead()
  // in src/lib/access.ts require a future trial_ends_at to treat a free_trial user as
  // write-capable and Pro-feature-entitled. Without this, every trial signup is
  // read-only and starter trialists never see Pro surfaces. Mirrors the webhook
  // path at src/app/api/stripe/webhook/route.ts:120.
  if (isTrial) {
    updates.trial_ends_at = periodEndIso;
    updates.trial_credits_granted = true;
  }

  if (shouldAllocate) {
    updates.ai_credits_remaining = creditAmount;
  }

  await service.from("users").update(updates).eq("id", user.id);

  if (shouldAllocate) {
    await service.from("credit_transactions").insert({
      user_id: user.id,
      amount: creditAmount,
      type: "monthly_allocation",
      description: isTrial
        ? `${tier} plan: trial grant (TIM-1947)`
        : `${tier} plan: sync from Stripe (TIM-1500)`,
    });
  }

  return Response.json({
    synced: true,
    tier,
    status: mapUserStatus(sub.status),
    subscriptionId: sub.id,
    creditsAllocated: shouldAllocate,
    creditsAmount: shouldAllocate ? creditAmount : 0,
    currentPeriodEnd: periodEndIso,
  });
}
