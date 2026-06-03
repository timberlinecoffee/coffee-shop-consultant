// TIM-1942: Admin members list.
// Returns one row per public.users record joined to the latest subscription
// row + last_sign_in_at from auth.users. The page handles search/sort/filter
// client-side because the member count is in the hundreds, not thousands.

import { requireAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { PLANS, type Tier } from "@/lib/stripe";
import type { AdminMemberSummary } from "@/types/admin";

function mrrFromTierAndInterval(tier: string, interval: string | null): number {
  if (interval !== "monthly" && interval !== "annual") {
    // Fall back to monthly equivalent if interval not yet known.
    interval = "monthly";
  }
  const key = `${tier}_${interval}` as keyof typeof PLANS;
  const plan = PLANS[key];
  if (!plan) return 0;
  if (plan.interval === "annual") return Math.round(plan.amount / 12);
  return plan.amount;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const svc = createServiceClient();

  const [{ data: profiles, error: profErr }, { data: subs }] = await Promise.all([
    svc
      .from("users")
      .select("id, email, full_name, subscription_status, subscription_tier, trial_ends_at, ai_credits_remaining, signup_source, created_at, updated_at")
      .order("created_at", { ascending: false }),
    svc
      .from("subscriptions")
      .select("user_id, tier, stripe_subscription_id, current_period_end"),
  ]);

  if (profErr) {
    return Response.json({ error: "Failed to load members" }, { status: 500 });
  }

  const subByUser = new Map<string, { tier: string | null; periodEnd: string | null }>();
  for (const s of subs ?? []) {
    subByUser.set(s.user_id, { tier: s.tier ?? null, periodEnd: s.current_period_end ?? null });
  }

  // Fetch auth.users for last_sign_in_at. listUsers paginates at 1000/page.
  const lastSignInByUser = new Map<string, string | null>();
  try {
    let page = 1;
    while (page < 20) {
      const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users?.length) break;
      for (const u of data.users) {
        lastSignInByUser.set(u.id, u.last_sign_in_at ?? null);
      }
      if (data.users.length < 1000) break;
      page += 1;
    }
  } catch (err) {
    console.error("[admin/members] listUsers failed", err);
  }

  const rows: AdminMemberSummary[] = (profiles ?? []).map((p) => {
    const sub = subByUser.get(p.id);
    const tier = (p.subscription_tier ?? "free") as Tier | "free";
    const mrr = sub?.tier && p.subscription_status === "active"
      ? mrrFromTierAndInterval(sub.tier, "monthly")
      : tier !== "free" && p.subscription_status === "active"
        ? mrrFromTierAndInterval(tier, "monthly")
        : 0;
    return {
      id: p.id,
      email: p.email,
      full_name: p.full_name ?? null,
      subscription_status: p.subscription_status,
      subscription_tier: p.subscription_tier,
      trial_ends_at: p.trial_ends_at ?? null,
      ai_credits_remaining: p.ai_credits_remaining ?? 0,
      signup_source: p.signup_source ?? null,
      created_at: p.created_at,
      updated_at: p.updated_at,
      last_sign_in_at: lastSignInByUser.get(p.id) ?? null,
      mrr_cents: mrr,
    };
  });

  return Response.json(rows);
}
