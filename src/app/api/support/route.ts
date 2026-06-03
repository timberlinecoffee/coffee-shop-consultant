// TIM-1941: customer-facing support form endpoint.
//
// POST /api/support  { name, email, subject, message, hp?, page_url? }
//
// - Anti-spam: hidden honeypot (`hp`) — silently accept-and-drop if filled.
// - Light validation: required fields, email shape, length caps.
// - Writes a row to public.support_messages via the service-role client
//   (RLS allows anon insert, but service-role keeps payload-size and audit
//   columns server-controlled).
// - Fires an email to hello@timberline.coffee via Resend (best-effort).
//   If RESEND_API_KEY is not provisioned, the row still lands and the admin
//   inbox in TIM-1940b reads it. The route logs a structured warning.

import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendSupportEmail } from "@/lib/email/send-support";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LIMITS = {
  name: 200,
  email: 320,
  subject: 200,
  message: 8000,
};

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  // Honeypot: bots love filling every input. Silently 200 — looks accepted to
  // the bot, no row created, no email sent.
  if (typeof payload.hp === "string" && payload.hp.trim().length > 0) {
    return json({ ok: true, dropped: true });
  }

  const name = clean(payload.name, LIMITS.name);
  const email = clean(payload.email, LIMITS.email);
  const subject = clean(payload.subject, LIMITS.subject);
  const message = clean(payload.message, LIMITS.message);
  const pageUrl =
    typeof payload.page_url === "string"
      ? payload.page_url.trim().slice(0, 500)
      : null;

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Please enter your name.";
  if (!email) errors.email = "Please enter your email.";
  else if (!EMAIL_RE.test(email)) errors.email = "That doesn't look like a valid email.";
  if (!subject) errors.subject = "Please add a subject.";
  if (!message) errors.message = "Please write a message.";
  if (message && message.length < 10) {
    errors.message = "Please include a bit more detail (10 characters or more).";
  }

  if (Object.keys(errors).length > 0) {
    return json({ error: "validation", fields: errors }, { status: 400 });
  }

  const userAgent =
    request.headers.get("user-agent")?.slice(0, 500) ?? null;

  const supabase = createServiceClient();
  const { data: row, error: insertError } = await supabase
    .from("support_messages")
    .insert({
      name,
      email,
      subject,
      message,
      page_url: pageUrl,
      user_agent: userAgent,
    })
    .select("id, created_at")
    .single();

  if (insertError || !row) {
    console.error("[/api/support] insert failed", insertError);
    return json({ error: "server_error" }, { status: 500 });
  }

  const emailResult = await sendSupportEmail({
    id: row.id,
    name,
    email,
    subject,
    message,
    pageUrl,
    createdAt: row.created_at,
  });

  if (!emailResult.ok) {
    if ("skipped" in emailResult && emailResult.skipped) {
      console.warn(
        "[/api/support] email skipped — RESEND_API_KEY not configured. Row id=" +
          row.id
      );
    } else {
      console.error("[/api/support] email send failed", emailResult);
    }
  }

  return json({ ok: true, id: row.id });
}
