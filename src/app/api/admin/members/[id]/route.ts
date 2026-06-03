// TIM-1942: Admin member detail.

import { requireAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { PLANS } from "@/lib/stripe";
import type { AdminMemberDetail } from "@/types/admin";

function mrrFromTierAndInterval(tier: string, interval: string | null): number {
  if (interval !== "monthly" && interval !== "annual") interval = "monthly";
  const key = `${tier}_${interval}` as keyof typeof PLANS;
  const plan = PLANS[key];
  if (!plan) return 0;
  if (plan.interval === "annual") return Math.round(plan.amount / 12);
  return plan.amount;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const svc = createServiceClient();

  const { data: profile, error } = await svc
    .from("users")
    .select("id, email, full_name, subscription_status, subscription_tier, trial_ends_at, ai_credits_remaining, signup_source, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) return Response.json({ error: "Failed to load member" }, { status: 500 });
  if (!profile) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: sub } = await svc
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, tier, status, current_period_start, current_period_end")
    .eq("user_id", id)
    .maybeSingle();

  const { data: tx } = await svc
    .from("credit_transactions")
    .select("amount, type, description, created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  const totalUsed = (tx ?? []).filter((t) => t.type === "usage").reduce((acc, t) => acc + Math.abs(t.amount), 0);

  let lastSignIn: string | null = null;
  try {
    const { data: au } = await svc.auth.admin.getUserById(id);
    lastSignIn = au?.user?.last_sign_in_at ?? null;
  } catch {
    // ignore
  }

  const recent = (tx ?? []).map((t) => ({
    at: t.created_at,
    kind: t.type,
    description: t.description ?? "",
  }));

  const tier = profile.subscription_tier ?? "free";
  const mrr =
    sub?.status === "active" || profile.subscription_status === "active"
      ? mrrFromTierAndInterval(sub?.tier ?? tier, "monthly")
      : 0;

  const detail: AdminMemberDetail = {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name ?? null,
    subscription_status: profile.subscription_status,
    subscription_tier: profile.subscription_tier,
    trial_ends_at: profile.trial_ends_at ?? null,
    ai_credits_remaining: profile.ai_credits_remaining ?? 0,
    signup_source: profile.signup_source ?? null,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
    last_sign_in_at: lastSignIn,
    mrr_cents: mrr,
    subscription: sub
      ? {
          stripe_customer_id: sub.stripe_customer_id ?? null,
          stripe_subscription_id: sub.stripe_subscription_id ?? null,
          tier: sub.tier ?? null,
          status: sub.status ?? null,
          current_period_start: sub.current_period_start ?? null,
          current_period_end: sub.current_period_end ?? null,
        }
      : null,
    total_credits_used: totalUsed,
    recent_activity: recent,
  };

  return Response.json(detail);
}
