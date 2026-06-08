// TIM-1903: trial-end email senders. Copy verbatim from TIM-1905 §2.
//
// Delivery via Resend's REST API, same pattern as send-support.ts. The cron
// route batches sends; failures are returned to the caller so the per-user
// stamp is only written when delivery succeeds (next daily run retries).
//
// Cancel link target = /api/billing/cancel-via-email?token=<hmac>. Token is
// signed with TRIAL_CANCEL_SECRET (env). Required by FTC: Day 5 + Day 7 only.

import { createHmac } from "node:crypto";
import {
  PLAN_FEATURE_LIST,
  PLAN_MONTHLY_PRICE,
  type DueTrialReminder,
  type TrialReminderDay,
} from "@/lib/trial-reminders";

export interface TrialReminderSendInput extends DueTrialReminder {
  // Site origin used to construct the cancel link (https://...).
  baseUrl: string;
  // For day8: how the receipt should report the charge.
  cardLast4?: string | null;
  chargeDateIso?: string | null;
}

export type TrialReminderSendResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true; reason: "no_api_key" | "no_cancel_secret" }
  | { ok: false; skipped: false; status: number; error: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bullets(items: string[]): { html: string; text: string } {
  const html = `<ul style="padding-left:20px;margin:8px 0;">${items
    .map(
      (i) =>
        `<li style="margin:4px 0;color:#1a1a1a;font-size:14px;">${escapeHtml(i)}</li>`,
    )
    .join("")}</ul>`;
  const text = items.map((i) => `  • ${i}`).join("\n");
  return { html, text };
}

function greeting(firstName: string | null): string {
  return firstName ? `Hi ${firstName},` : "Hi there,";
}

export function buildCancelToken(userId: string, expiresAt: number): string {
  const secret = process.env.TRIAL_CANCEL_SECRET ?? "";
  const payload = `${userId}.${expiresAt}`;
  const mac = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

export function verifyCancelToken(
  token: string,
  now: Date,
): { ok: true; userId: string } | { ok: false; reason: string } {
  const secret = process.env.TRIAL_CANCEL_SECRET ?? "";
  if (!secret) return { ok: false, reason: "no_secret" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [userId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp)) return { ok: false, reason: "bad_exp" };
  if (now.getTime() > exp * 1000) return { ok: false, reason: "expired" };
  const expected = createHmac("sha256", secret)
    .update(`${userId}.${expRaw}`)
    .digest("hex");
  // Length-independent compare avoids timing leaks.
  if (sig.length !== expected.length) return { ok: false, reason: "sig" };
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return { ok: false, reason: "sig" };
  return { ok: true, userId };
}

function cancelUrl(baseUrl: string, userId: string, trialEndsInDays: number): string {
  // Token expires 2 days after the trial would naturally end — that's the
  // full window the user might reasonably try to cancel from the email.
  const exp = Math.floor(Date.now() / 1000) + (trialEndsInDays + 2) * 86_400;
  const token = buildCancelToken(userId, exp);
  return `${baseUrl}/api/billing/cancel-via-email?token=${encodeURIComponent(token)}`;
}

interface RenderedEmail {
  subject: string;
  preview: string;
  html: string;
  text: string;
}

function renderDay5(input: TrialReminderSendInput): RenderedEmail {
  const url = cancelUrl(input.baseUrl, input.userId, 5);
  const list = bullets(PLAN_FEATURE_LIST[input.planKey] ?? PLAN_FEATURE_LIST.pro);
  const altPitch =
    input.planKey === "starter"
      ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.55;color:#1a1a1a;">If you chose Starter and want to keep deep research, pricing benchmarks, and unlimited projects, you can switch to Pro before day 7 in Settings &gt; Billing.</p>`
      : "";
  const altPitchText =
    input.planKey === "starter"
      ? `\nIf you chose Starter and want to keep deep research, pricing benchmarks, and unlimited projects, you can switch to Pro before day 7 in Settings > Billing.\n`
      : "";

  return {
    subject: "Your Groundwork trial ends in 2 days",
    preview: "Here's what you'll keep when you convert.",
    html: emailWrap(
      `
${greetingP(input.firstName)}
<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#1a1a1a;">Your free trial ends in 2 days.</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#1a1a1a;">When your trial converts, here's what you'll have on ${escapeHtml(input.planName)}:</p>
${list.html}
${altPitch}
<p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#1a1a1a;">Running low on credits? <a href="${input.baseUrl}/account/billing" style="color:#155e63;">You can buy more anytime</a> — no plan upgrade needed.</p>
<p style="margin:12px 0 0;font-size:14px;line-height:1.55;color:#1a1a1a;">Not ready to commit? Cancel before day 7 and you won't be charged.</p>
${cancelButton(url, "Cancel my trial")}
${signoff()}
      `,
    ),
    text: [
      `${greeting(input.firstName)}`,
      ``,
      `Your free trial ends in 2 days.`,
      ``,
      `When your trial converts, here's what you'll have on ${input.planName}:`,
      list.text,
      altPitchText.trim(),
      `Running low on credits? You can buy more anytime — no plan upgrade needed.`,
      `${input.baseUrl}/account/billing`,
      ``,
      `Not ready to commit? Cancel before day 7 and you won't be charged.`,
      ``,
      `Cancel my trial: ${url}`,
      ``,
      `Trent`,
      `Groundwork`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function renderDay7(input: TrialReminderSendInput): RenderedEmail {
  const url = cancelUrl(input.baseUrl, input.userId, 1);
  const price = PLAN_MONTHLY_PRICE[input.planKey] ?? "99";

  return {
    subject: "Your Groundwork trial ends today",
    preview: "Cancel before midnight if you're not ready. No questions.",
    html: emailWrap(
      `
${greetingP(input.firstName)}
<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#1a1a1a;">Today is the last day of your free trial.</p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#1a1a1a;">Your ${escapeHtml(input.planName)} subscription begins at midnight. Your card on file will be charged $${escapeHtml(price)}/month automatically.</p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#1a1a1a;">Want to cancel first? Use the link below now and you won't be charged anything.</p>
${cancelButton(url, "Cancel my trial")}
${signoff()}
      `,
    ),
    text: [
      `${greeting(input.firstName)}`,
      ``,
      `Today is the last day of your free trial.`,
      ``,
      `Your ${input.planName} subscription begins at midnight. Your card on file will be charged $${price}/month automatically.`,
      ``,
      `Want to cancel first? Use the link below now and you won't be charged anything.`,
      ``,
      `Cancel my trial: ${url}`,
      ``,
      `Trent`,
      `Groundwork`,
    ].join("\n"),
  };
}

function renderDay8(input: TrialReminderSendInput): RenderedEmail {
  const list = bullets(PLAN_FEATURE_LIST[input.planKey] ?? PLAN_FEATURE_LIST.pro);
  const price = PLAN_MONTHLY_PRICE[input.planKey] ?? "99";
  const last4 = input.cardLast4 ?? "your card";
  const chargeDate = input.chargeDateIso
    ? new Date(input.chargeDateIso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "today";

  return {
    subject: `You're on ${input.planName} — here's your receipt`,
    preview: "Your subscription is active.",
    html: emailWrap(
      `
${greetingP(input.firstName)}
<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#1a1a1a;">Your ${escapeHtml(input.planName)} subscription is active.</p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#1a1a1a;">We charged the card ending in ${escapeHtml(last4)} $${escapeHtml(price)} on ${escapeHtml(chargeDate)}.</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#1a1a1a;">What you have access to:</p>
${list.html}
<p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#1a1a1a;">Manage or cancel your subscription in Settings &gt; Billing. If something looks wrong, reply to this email.</p>
${signoff()}
      `,
    ),
    text: [
      `${greeting(input.firstName)}`,
      ``,
      `Your ${input.planName} subscription is active.`,
      ``,
      `We charged the card ending in ${last4} $${price} on ${chargeDate}.`,
      ``,
      `What you have access to:`,
      list.text,
      ``,
      `Manage or cancel your subscription in Settings > Billing. If something looks wrong, reply to this email.`,
      ``,
      `Trent`,
      `Groundwork`,
    ].join("\n"),
  };
}

function greetingP(firstName: string | null): string {
  return `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#1a1a1a;">${escapeHtml(greeting(firstName))}</p>`;
}

function cancelButton(href: string, label: string): string {
  return `
<p style="margin:18px 0;">
  <a href="${href}" style="display:inline-block;background:#155e63;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:600;">${escapeHtml(label)}</a>
</p>`;
}

function signoff(): string {
  return `
<p style="margin:24px 0 0;font-size:14px;line-height:1.55;color:#1a1a1a;">Trent<br/>Groundwork</p>`;
}

function emailWrap(inner: string): string {
  return `
<table style="width:100%;max-width:560px;margin:0 auto;font-family:-apple-system,system-ui,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <tr><td>${inner}</td></tr>
</table>`.trim();
}

export function renderTrialReminder(
  day: TrialReminderDay,
  input: TrialReminderSendInput,
): RenderedEmail {
  switch (day) {
    case "day5":
      return renderDay5(input);
    case "day7":
      return renderDay7(input);
    case "day8":
      return renderDay8(input);
  }
}

export async function sendTrialReminderEmail(
  input: TrialReminderSendInput,
): Promise<TrialReminderSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, skipped: true, reason: "no_api_key" };

  // For day5/day7 (cancel-link emails) the secret is required. For day8 the
  // email contains no cancel link — secret is not strictly needed, but we
  // require it everywhere to fail loudly if config is missing.
  if (!process.env.TRIAL_CANCEL_SECRET && input.day !== "day8") {
    return { ok: false, skipped: true, reason: "no_cancel_secret" };
  }

  const from =
    process.env.TRIAL_FROM_EMAIL ??
    "Groundwork <hello@timberline.coffee>";

  const rendered = renderTrialReminder(input.day, input);

  const body = {
    from,
    to: [input.email],
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: {
      // Preview text in clients that honor it (Gmail web does).
      "X-Entity-Ref-ID": `tim1903-${input.day}-${input.userId}`,
    },
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, skipped: false, status: res.status, error: text.slice(0, 500) };
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: data?.id ?? "unknown" };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
