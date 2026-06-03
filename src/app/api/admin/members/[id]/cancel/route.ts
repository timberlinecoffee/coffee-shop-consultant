// TIM-1942: Manually cancel a member's subscription.
// when=immediate: cancel the Stripe subscription now (no proration credit).
// when=period_end: schedule cancel_at_period_end so the user keeps access
// until the paid-through date, then drops to free.

import { requireAdmin, assertAdminRequestSecurity } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAdminAction } from "@/lib/admin-audit";
import { stripe } from "@/lib/stripe";
import type { CancelRequest } from "@/types/admin";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = assertAdminRequestSecurity(request);
  if (csrfError) return csrfError;

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  let body: CancelRequest;
  try {
    body = (await request.json()) as CancelRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.when !== "immediate" && body.when !== "period_end") {
    return Response.json({ error: "when must be 'immediate' or 'period_end'" }, { status: 400 });
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
    .select("stripe_subscription_id, tier, status, current_period_end")
    .eq("user_id", id)
    .maybeSingle();

  if (!existing?.stripe_subscription_id) {
    // No active Stripe sub; just mark the user as cancelled in DB.
    await svc
      .from("users")
      .update({ subscription_status: "cancelled", subscription_tier: "free" })
      .eq("id", id);
    await recordAdminAction({
      actor: { userId: auth.userId, email: auth.email },
      target: { userId: id, email: profile.email },
      action: "cancel_account",
      before: { status: profile.subscription_status, tier: profile.subscription_tier },
      after: { status: "cancelled", tier: "free" },
      metadata: { when: body.when, stripe: "no_subscription" },
    });
    return Response.json({ ok: true, cancelledStripe: false });
  }

  try {
    if (body.when === "immediate") {
      await stripe.subscriptions.cancel(existing.stripe_subscription_id, {
        prorate: false,
      });
      await svc.from("subscriptions").update({ status: "cancelled" }).eq("user_id", id);
      await svc
        .from("users")
        .update({ subscription_status: "cancelled", subscription_tier: "free" })
        .eq("id", id);
    } else {
      await stripe.subscriptions.update(existing.stripe_subscription_id, {
        cancel_at_period_end: true,
        metadata: { admin_action: "cancel_period_end", admin_email: auth.email, target_user_id: id },
      });
      // Keep tier/status as-is until period_end (the webhook will flip on
      // customer.subscription.deleted). Just mark the sub row.
      await svc.from("subscriptions").update({ status: "active" }).eq("user_id", id);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return Response.json({ error: `Stripe call failed: ${message}` }, { status: 502 });
  }

  await recordAdminAction({
    actor: { userId: auth.userId, email: auth.email },
    target: { userId: id, email: profile.email },
    action: "cancel_account",
    before: {
      status: existing.status ?? profile.subscription_status,
      tier: existing.tier ?? profile.subscription_tier,
      stripe_subscription_id: existing.stripe_subscription_id,
    },
    after:
      body.when === "immediate"
        ? { status: "cancelled", tier: "free" }
        : { status: "cancel_at_period_end", cancel_at: existing.current_period_end },
    metadata: { when: body.when },
  });

  return Response.json({ ok: true, cancelledStripe: true, when: body.when });
}
