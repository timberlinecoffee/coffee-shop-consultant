// TIM-1903: one-click cancel link landing for trial-end emails.
//
// Day 5 and Day 7 emails embed a signed token URL pointing here. The route:
//   1. Verifies the HMAC + expiry (no session required — that's the point).
//   2. Looks up the user's active Stripe subscription.
//   3. Sets cancel_at_period_end=true so the trial cancellation lands at
//      Stripe's authoritative clock (avoids races on the conversion charge).
//   4. Redirects to /account/billing/cancelled (a static confirmation page).
//
// FTC Negative Option Rule: this is the same-friction-as-signup path required
// by 16 CFR Part 425. The user does not have to log in or click through menus.

import type { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyCancelToken } from "@/lib/email/trial-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) {
    return Response.redirect(
      new URL("/account/billing/cancelled?status=invalid", request.url),
      302,
    );
  }

  const verified = verifyCancelToken(token, new Date());
  if (!verified.ok) {
    return Response.redirect(
      new URL(
        `/account/billing/cancelled?status=${encodeURIComponent(verified.reason)}`,
        request.url,
      ),
      302,
    );
  }

  const svc = createServiceClient();
  const { data: sub } = await svc
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", verified.userId)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return Response.redirect(
      new URL("/account/billing/cancelled?status=no_subscription", request.url),
      302,
    );
  }

  if (sub.status === "cancelled") {
    return Response.redirect(
      new URL("/account/billing/cancelled?status=already", request.url),
      302,
    );
  }

  try {
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
      metadata: { cancelled_via: "email_one_click" },
    });
  } catch (err) {
    return Response.redirect(
      new URL(
        `/account/billing/cancelled?status=error&reason=${encodeURIComponent(
          err instanceof Error ? err.message : "stripe",
        )}`,
        request.url,
      ),
      302,
    );
  }

  return Response.redirect(
    new URL("/account/billing/cancelled?status=ok", request.url),
    302,
  );
}
