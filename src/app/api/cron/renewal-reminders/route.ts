// TIM-1663: renewal-reminder dispatch job.
//
// Runs daily (Vercel cron, see vercel.json). For each annual subscriber who
// opted in via TIM-1660, fires a Klaviyo "Renewal Reminder Due" event N days
// before their plan renews, then stamps the pref so the same period is not
// reminded twice. Re-arms automatically when the subscription rolls into its
// next annual period.
//
// Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`. The route
// rejects anything without the configured secret so it cannot be triggered
// publicly.

import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, isAnnualPriceId } from "@/lib/stripe";
import { trackKlaviyoEvent } from "@/lib/klaviyo";
import {
  DEFAULT_REMINDER_DAYS,
  RENEWAL_REMINDER_METRIC,
  RENEWAL_REMINDER_PREF_KEY,
  selectDateEligible,
  type PrefRow,
  type RenewalReminderPrefData,
  type SubscriptionRow,
} from "@/lib/renewal-reminder";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
// Don't cache; this mutates and must run fresh each invocation.
export const dynamic = "force-dynamic";

function reminderWindowDays(): number {
  const raw = process.env.RENEWAL_REMINDER_DAYS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_REMINDER_DAYS;
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const now = new Date();
  const withinDays = reminderWindowDays();

  // 1. All renewal-reminder opt-in prefs.
  const { data: prefRows, error: prefErr } = await svc
    .from("user_ui_prefs")
    .select("user_id, pref_data")
    .eq("pref_key", RENEWAL_REMINDER_PREF_KEY);

  if (prefErr) {
    return Response.json({ error: `prefs query failed: ${prefErr.message}` }, { status: 500 });
  }

  const prefs: PrefRow[] = (prefRows ?? []).map((r) => ({
    userId: r.user_id as string,
    prefData: (r.pref_data ?? {}) as RenewalReminderPrefData,
  }));

  if (prefs.length === 0) {
    return Response.json({ scanned: 0, due: 0, sent: 0, results: [] });
  }

  // 2. Their subscriptions (current_period_end + status).
  const userIds = [...new Set(prefs.map((p) => p.userId))];
  const { data: subRows, error: subErr } = await svc
    .from("subscriptions")
    .select("user_id, status, current_period_end, stripe_subscription_id")
    .in("user_id", userIds);

  if (subErr) {
    return Response.json({ error: `subscriptions query failed: ${subErr.message}` }, { status: 500 });
  }

  const subByUser = new Map<string, { stripeSubscriptionId: string | null }>();
  const subscriptions: SubscriptionRow[] = (subRows ?? []).map((s) => {
    subByUser.set(s.user_id as string, {
      stripeSubscriptionId: (s.stripe_subscription_id as string | null) ?? null,
    });
    return {
      userId: s.user_id as string,
      status: s.status as string,
      currentPeriodEnd: (s.current_period_end as string | null) ?? null,
    };
  });

  // 3. Pure selection: opted-in, active, within window, not already reminded.
  const candidates = selectDateEligible(prefs, subscriptions, now, withinDays);

  // 4. Authoritative annual check + send + idempotent stamp.
  const stripe = getStripe();
  const results: Array<{ userId: string; outcome: string }> = [];
  let sent = 0;

  for (const cand of candidates) {
    // Confirm the plan is still annual (a subscriber may have switched to
    // monthly after opting in). Stripe is authoritative.
    const stripeSubId = subByUser.get(cand.userId)?.stripeSubscriptionId;
    if (!stripeSubId) {
      results.push({ userId: cand.userId, outcome: "skipped:no-stripe-subscription" });
      continue;
    }

    let priceId: string | null = null;
    try {
      const sub = await stripe.subscriptions.retrieve(stripeSubId);
      priceId = sub.items?.data?.[0]?.price?.id ?? null;
    } catch (err) {
      results.push({
        userId: cand.userId,
        outcome: `skipped:stripe-error:${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    if (!isAnnualPriceId(priceId)) {
      results.push({ userId: cand.userId, outcome: "skipped:not-annual" });
      continue;
    }

    const result = await trackKlaviyoEvent(RENEWAL_REMINDER_METRIC, cand.email, {
      renewalDate: cand.currentPeriodEnd,
      leadDays: withinDays,
    });

    if (!result.ok) {
      // Leave the pref unstamped so the next daily run retries.
      results.push({ userId: cand.userId, outcome: `failed:klaviyo:${result.status}:${result.error ?? ""}` });
      continue;
    }

    // Idempotency stamp: record the period we reminded for. Re-arms next cycle.
    const stamped: RenewalReminderPrefData = {
      ...prefs.find((p) => p.userId === cand.userId)!.prefData,
      remindedForPeriodEnd: cand.currentPeriodEnd,
      remindedAt: now.toISOString(),
    };
    const { error: upErr } = await svc
      .from("user_ui_prefs")
      .update({ pref_data: stamped, updated_at: now.toISOString() })
      .eq("user_id", cand.userId)
      .eq("pref_key", RENEWAL_REMINDER_PREF_KEY);

    if (upErr) {
      results.push({ userId: cand.userId, outcome: `sent-but-stamp-failed:${upErr.message}` });
      continue;
    }

    sent += 1;
    results.push({ userId: cand.userId, outcome: "sent" });
  }

  return Response.json({ scanned: prefs.length, due: candidates.length, sent, results });
}
