// TIM-1903: trial-end email dispatch job.
//
// Daily Vercel cron. Reads `users` for anyone trialing (day5/day7) or who has
// freshly converted (day8), runs the pure selector, dispatches via Resend,
// and stamps `users.trial_reminders_sent` per-user so a delivered day is
// never re-sent. Failures leave the stamp untouched so the next daily run
// retries.

import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  selectDueReminders,
  type TrialUserRow,
} from "@/lib/trial-reminders";
import { sendTrialReminderEmail } from "@/lib/email/trial-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function baseUrl(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  // Fallback to the request host so previews work without an env var.
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("host") ?? "";
  return host ? `${proto}://${host}` : "https://coffee-shop-consultant.vercel.app";
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const now = new Date();

  // Pull only the candidate set: trialing within ~3 days OR freshly converted.
  // The selector applies the precise windowing.
  const cutoffFuture = new Date(now.getTime() + 3 * 86_400_000).toISOString();
  const cutoffRecentPast = new Date(now.getTime() - 3 * 86_400_000).toISOString();

  const { data: trialingRows, error: trialingErr } = await svc
    .from("users")
    .select("id, email, full_name, subscription_status, subscription_tier, trial_ends_at, trial_just_converted_to, trial_reminders_sent")
    .eq("subscription_status", "free_trial")
    .not("trial_ends_at", "is", null)
    .lte("trial_ends_at", cutoffFuture);

  if (trialingErr) {
    return Response.json(
      { error: `trialing query failed: ${trialingErr.message}` },
      { status: 500 },
    );
  }

  const { data: convertedRows, error: convertedErr } = await svc
    .from("users")
    .select("id, email, full_name, subscription_status, subscription_tier, trial_ends_at, trial_just_converted_to, trial_reminders_sent, updated_at")
    .eq("subscription_status", "active")
    .not("trial_just_converted_to", "is", null)
    .gte("updated_at", cutoffRecentPast);

  if (convertedErr) {
    return Response.json(
      { error: `converted query failed: ${convertedErr.message}` },
      { status: 500 },
    );
  }

  const rows: TrialUserRow[] = [...(trialingRows ?? []), ...(convertedRows ?? [])].map(
    (r) => ({
      userId: r.id as string,
      email: (r.email as string | null) ?? "",
      firstName:
        (r.full_name as string | null)?.split(" ")[0] ?? null,
      subscriptionStatus: (r.subscription_status as string) ?? "",
      subscriptionTier: (r.subscription_tier as string | null) ?? null,
      trialEndsAt: (r.trial_ends_at as string | null) ?? null,
      trialJustConvertedTo: (r.trial_just_converted_to as string | null) ?? null,
      remindersSent: (r.trial_reminders_sent as Record<string, string> | null) ?? {},
    }),
  );

  const due = selectDueReminders(rows, now);

  const base = baseUrl(request);
  const results: Array<{
    userId: string;
    day: string;
    outcome: string;
  }> = [];
  let sent = 0;

  for (const cand of due) {
    const result = await sendTrialReminderEmail({
      ...cand,
      baseUrl: base,
    });

    if (!result.ok) {
      results.push({
        userId: cand.userId,
        day: cand.day,
        outcome: result.skipped
          ? `skipped:${result.reason}`
          : `failed:${result.status}:${result.error.slice(0, 120)}`,
      });
      continue;
    }

    // Stamp on success. JSONB merge via .update() with a fresh object.
    const existing = rows.find((r) => r.userId === cand.userId)?.remindersSent ?? {};
    const next = { ...existing, [cand.day]: now.toISOString() };

    const { error: upErr } = await svc
      .from("users")
      .update({ trial_reminders_sent: next })
      .eq("id", cand.userId);

    if (upErr) {
      results.push({
        userId: cand.userId,
        day: cand.day,
        outcome: `sent-but-stamp-failed:${upErr.message}`,
      });
      continue;
    }

    sent += 1;
    results.push({ userId: cand.userId, day: cand.day, outcome: "sent" });
  }

  return Response.json({
    scanned: rows.length,
    due: due.length,
    sent,
    results,
  });
}
