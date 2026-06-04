// TIM-2254: POST /api/account/delete
//
// Spec: TIM-2250 deletion-spec §2 (deletion sequence).
// Standing rules applied (TIM-2242 §1–5):
//   Rule 1 — Writes only land via service-role; RLS on every new table.
//   Rule 2 — JWT-authenticated user; confirmation field must match the
//            authenticated user's email server-side (constant-time compare).
//   Rule 3 — zod validation on body; reject empty/oversized payloads.
//   Rule 4 — Rate-limit 3 attempts per user per 24h.
//   Rule 5 — Sanitised errors; never leak stack/sql.
//
// Returns 204 on success (session is invalid after we return).
// 401 on auth fail, 400 on bad confirmation, 429 on rate-limit, 500 on error.

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  executeDeletionSequence,
  hashWithSalt,
  timingSafeEqualStr,
} from "@/lib/account-deletion";
import { sendAccountDeletedEmail } from "@/lib/email/send-account-email";

export const runtime = "nodejs";

const BodySchema = z.object({
  confirmation: z.string().min(3).max(320),
});

function sanitised(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return sanitised(401, "Unauthorized");

  // Rule 4: rate-limit deletion attempts per user.
  const rl = await enforceRateLimit({
    bucket: "account-delete",
    id: user.id,
    limit: 3,
    windowSec: 24 * 60 * 60,
  });
  if (rl) return rl;

  // Rule 3: validate input.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return sanitised(400, "Invalid request body");
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return sanitised(400, "Invalid request body");

  // Server-side confirmation match. Constant-time compare.
  const submitted = parsed.data.confirmation.trim().toLowerCase();
  const expected = user.email.trim().toLowerCase();
  if (!timingSafeEqualStr(submitted, expected)) {
    return sanitised(400, "Confirmation does not match account email");
  }

  const svc = createServiceClient();
  const ipHash = hashWithSalt(
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon",
  );

  // Audit: requested.
  await svc.from("account_deletion_audit_log").insert({
    action: "delete_requested",
    user_hash: hashWithSalt(user.id),
    email_hash: hashWithSalt(user.email),
    request_ip_hash: ipHash,
  });

  // Snapshot Stripe identifiers BEFORE the row is deleted/anonymised; the
  // audit log retains them as a non-PII legal trace.
  let stripeSubscriptionId: string | null = null;
  let stripeCustomerId: string | null = null;
  try {
    const { data: sub } = await svc
      .from("subscriptions")
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    stripeSubscriptionId = sub?.stripe_subscription_id ?? null;
    stripeCustomerId = sub?.stripe_customer_id ?? null;
  } catch (err) {
    console.error("[account-delete] stripe id lookup failed", err);
  }

  try {
    const summary = await executeDeletionSequence({
      userId: user.id,
      email: user.email,
    });

    // Best-effort confirmation email — must dispatch BEFORE the auth row is
    // banned/anonymised in case Resend cares about the address ownership.
    // The email body itself is generic so even if delivery is delayed, no PII
    // leaks.
    await sendAccountDeletedEmail({ to: user.email });

    await svc.from("account_deletion_audit_log").insert({
      action: "delete_completed",
      user_hash: hashWithSalt(user.id),
      email_hash: hashWithSalt(user.email),
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: stripeCustomerId,
      request_ip_hash: ipHash,
      data_summary: {
        plansDeleted: summary.plansDeleted,
        storageObjectsDeleted: summary.storageObjectsDeleted,
        storageBuckets: summary.storageBuckets,
        stripeSubscriptionCancelled: summary.stripeSubscriptionCancelled,
        klaviyoSuppressed: summary.klaviyoSuppressed,
        supportMessagesRedacted: summary.supportMessagesRedacted,
        authSessionsRevoked: summary.authSessionsRevoked,
        planScopedRowsDeleted: summary.planScopedRowsDeleted,
        userScopedRowsDeleted: summary.userScopedRowsDeleted,
      },
    });

    // Sign the user out of the current cookie session as well so the browser
    // does not keep the stale JWT.
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[account-delete] cookie sign-out failed", err);
    }

    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("[account-delete] sequence failed", err);
    await svc.from("account_deletion_audit_log").insert({
      action: "delete_failed",
      user_hash: hashWithSalt(user.id),
      email_hash: hashWithSalt(user.email),
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: stripeCustomerId,
      request_ip_hash: ipHash,
      error_message: (err instanceof Error ? err.message : String(err)).slice(
        0,
        500,
      ),
    });
    return sanitised(500, "Deletion failed. Contact support@timberline.coffee.");
  }
}
