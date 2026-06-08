// TIM-2254: Resend dispatch for account-export and account-deletion emails.
//
// Mirrors src/lib/email/send-support.ts:
//   - Uses Resend REST API directly (no SDK dep).
//   - Returns a result; never throws (a delivery failure should not block the
//     route boundary).
//   - Skips with {skipped:true} when RESEND_API_KEY is missing so dev/preview
//     do not need a key configured.

type ResendResult =
  | { ok: true; provider: "resend"; id: string }
  | { ok: false; skipped: true; reason: "no_api_key" }
  | { ok: false; skipped: false; status: number; error: string };

const DEFAULT_FROM =
  "Groundwork Account <support@timberline.coffee>";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function dispatch(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<ResendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, skipped: true, reason: "no_api_key" };
  const from = process.env.SUPPORT_FROM_EMAIL ?? DEFAULT_FROM;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, skipped: false, status: res.status, error: text.slice(0, 500) };
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, provider: "resend", id: data?.id ?? "unknown" };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sendExportReadyEmail(args: {
  to: string;
  signedUrl: string;
  expiresAt: string;
  sizeBytes: number;
}): Promise<ResendResult> {
  const safeUrl = escapeHtml(args.signedUrl);
  const safeExpiry = escapeHtml(new Date(args.expiresAt).toUTCString());
  const sizeKb = Math.max(1, Math.round(args.sizeBytes / 1024));
  const html = `
<table style="width:100%;max-width:640px;font-family:-apple-system,system-ui,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <tr><td style="padding-bottom:12px;">
    <h2 style="margin:0 0 4px 0;font-size:18px;">Your Groundwork data export is ready</h2>
  </td></tr>
  <tr><td style="padding:8px 0;">
    <p style="margin:0 0 12px 0;font-size:14px;line-height:1.55;">
      You requested a copy of your Groundwork data. Download the JSON bundle below.
      The link expires in 24 hours; request a new export from Account Settings if you miss it.
    </p>
    <p style="margin:0 0 16px 0;">
      <a href="${safeUrl}" style="display:inline-block;background:#0f6e6e;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px;">Download data (${sizeKb} KB)</a>
    </p>
    <p style="margin:0;font-size:12px;color:#6b6b6b;">Link expires ${safeExpiry}.</p>
  </td></tr>
</table>`.trim();
  const text = [
    "Your Groundwork data export is ready.",
    "",
    `Download (expires ${safeExpiry}):`,
    args.signedUrl,
    "",
    "If you did not request this export, contact hello@timberline.coffee.",
  ].join("\n");
  return dispatch({
    to: args.to,
    subject: "Your Groundwork data export is ready",
    html,
    text,
  });
}

export async function sendCreditPackReceiptEmail(args: {
  to: string;
  packName: string;
  creditsAdded: number;
  amountCents: number;
  currency: string;
  newBalance: number;
}): Promise<ResendResult> {
  const safePack = escapeHtml(args.packName);
  const amountDollars = (args.amountCents / 100).toFixed(2);
  const currencyLabel = args.currency.toUpperCase();
  const html = `
<table style="width:100%;max-width:640px;font-family:-apple-system,system-ui,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <tr><td style="padding-bottom:12px;">
    <h2 style="margin:0 0 4px 0;font-size:18px;">Credit pack received</h2>
  </td></tr>
  <tr><td style="padding:8px 0;">
    <p style="margin:0 0 12px 0;font-size:14px;line-height:1.55;">
      Your ${safePack} purchase is confirmed. Here is what was added to your account:
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
      <tr>
        <td style="padding:6px 0;color:#6b6b6b;">Pack</td>
        <td style="padding:6px 0;text-align:right;">${safePack}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#6b6b6b;">Credits added</td>
        <td style="padding:6px 0;text-align:right;">${args.creditsAdded}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#6b6b6b;">Charged</td>
        <td style="padding:6px 0;text-align:right;">${currencyLabel} $${amountDollars}</td>
      </tr>
      <tr style="border-top:1px solid #e5e5e5;">
        <td style="padding:8px 0;font-weight:600;">New credit balance</td>
        <td style="padding:8px 0;text-align:right;font-weight:600;">${args.newBalance}</td>
      </tr>
    </table>
    <p style="margin:0;font-size:12px;color:#6b6b6b;">Questions? Contact hello@timberline.coffee.</p>
  </td></tr>
</table>`.trim();
  const text = [
    "Credit pack received.",
    "",
    `Pack: ${args.packName}`,
    `Credits added: ${args.creditsAdded}`,
    `Charged: ${currencyLabel} $${amountDollars}`,
    `New credit balance: ${args.newBalance}`,
    "",
    "Questions? Contact hello@timberline.coffee.",
  ].join("\n");
  return dispatch({
    to: args.to,
    subject: `Your ${args.packName} credits are ready`,
    html,
    text,
  });
}

export async function sendAccountDeletedEmail(args: {
  to: string;
}): Promise<ResendResult> {
  const html = `
<table style="width:100%;max-width:640px;font-family:-apple-system,system-ui,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <tr><td style="padding-bottom:12px;">
    <h2 style="margin:0 0 4px 0;font-size:18px;">Your Groundwork account has been deleted</h2>
  </td></tr>
  <tr><td style="padding:8px 0;">
    <p style="margin:0 0 12px 0;font-size:14px;line-height:1.55;">
      Your Groundwork account and plan content have been removed.
      Active subscriptions have been cancelled. Past invoices are retained
      for seven years to meet legal requirements; everything else is gone.
    </p>
    <p style="margin:0;font-size:13px;color:#6b6b6b;">If this was not you, contact hello@timberline.coffee immediately.</p>
  </td></tr>
</table>`.trim();
  const text = [
    "Your Groundwork account has been deleted.",
    "",
    "Active subscriptions have been cancelled. Past invoices are retained for",
    "seven years to meet legal requirements; everything else is gone.",
    "",
    "If this was not you, contact hello@timberline.coffee immediately.",
  ].join("\n");
  return dispatch({
    to: args.to,
    subject: "Your Groundwork account has been deleted",
    html,
    text,
  });
}
