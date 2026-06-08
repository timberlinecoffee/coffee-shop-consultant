// TIM-1941: dispatch a support-form submission to hello@timberline.coffee.
//
// Delivery is via Resend's REST API (https://resend.com/docs/api-reference).
// No SDK dependency — a single fetch call. The route writes the row to
// `support_messages` regardless of whether email dispatch succeeds; this
// helper's failure must NEVER take the user-visible request down. Failures
// are returned to the caller so they can be logged at the route boundary.
//
// Env vars (all optional except in production-with-key configurations):
//   RESEND_API_KEY     — provisioned via Vercel project env
//   SUPPORT_TO_EMAIL   — recipient (defaults to hello@timberline.coffee)
//   SUPPORT_FROM_EMAIL — verified sender on the Resend account
//                        (defaults to "Groundwork Support <support@timberline.coffee>")

export type SupportEmailInput = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  pageUrl?: string | null;
  createdAt: string;
  // TIM-1955: true for Pro/trialist submitters. Drives the outbound subject
  // prefix so ops sees Pro tickets at a glance.
  priority?: boolean;
};

export type SupportEmailResult =
  | { ok: true; provider: "resend"; id: string }
  | { ok: false; skipped: true; reason: "no_api_key" }
  | { ok: false; skipped: false; status: number; error: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildSupportEmailHtml(input: SupportEmailInput): string {
  const safe = {
    name: escapeHtml(input.name),
    email: escapeHtml(input.email),
    subject: escapeHtml(input.subject),
    message: escapeHtml(input.message).replace(/\n/g, "<br />"),
    pageUrl: input.pageUrl ? escapeHtml(input.pageUrl) : "",
    id: escapeHtml(input.id),
    createdAt: escapeHtml(input.createdAt),
  };

  return `
<table style="width:100%;max-width:640px;font-family:-apple-system,system-ui,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <tr><td style="padding-bottom:16px;">
    <h2 style="margin:0 0 8px 0;font-size:18px;">New Groundwork support message</h2>
    <p style="margin:0;color:#6b6b6b;font-size:13px;">Submitted ${safe.createdAt}</p>
  </td></tr>
  <tr><td style="padding:12px 0;border-top:1px solid #efefef;">
    <p style="margin:0 0 4px 0;font-size:12px;color:#6b6b6b;">From</p>
    <p style="margin:0;font-size:14px;"><strong>${safe.name}</strong> &lt;${safe.email}&gt;</p>
  </td></tr>
  <tr><td style="padding:12px 0;border-top:1px solid #efefef;">
    <p style="margin:0 0 4px 0;font-size:12px;color:#6b6b6b;">Subject</p>
    <p style="margin:0;font-size:14px;"><strong>${safe.subject}</strong></p>
  </td></tr>
  <tr><td style="padding:12px 0;border-top:1px solid #efefef;">
    <p style="margin:0 0 4px 0;font-size:12px;color:#6b6b6b;">Message</p>
    <p style="margin:0;font-size:14px;line-height:1.55;">${safe.message}</p>
  </td></tr>
  ${safe.pageUrl ? `<tr><td style="padding:12px 0;border-top:1px solid #efefef;">
    <p style="margin:0 0 4px 0;font-size:12px;color:#6b6b6b;">From page</p>
    <p style="margin:0;font-size:13px;color:#6b6b6b;">${safe.pageUrl}</p>
  </td></tr>` : ""}
  <tr><td style="padding:16px 0 0 0;border-top:1px solid #efefef;">
    <p style="margin:0;font-size:11px;color:#9a9a9a;">support_messages.id: ${safe.id}</p>
  </td></tr>
</table>`.trim();
}

export function buildSupportEmailText(input: SupportEmailInput): string {
  return [
    `New Groundwork support message`,
    `Submitted ${input.createdAt}`,
    ``,
    `From:    ${input.name} <${input.email}>`,
    `Subject: ${input.subject}`,
    input.pageUrl ? `Page:    ${input.pageUrl}` : null,
    ``,
    input.message,
    ``,
    `--`,
    `support_messages.id: ${input.id}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export async function sendSupportEmail(
  input: SupportEmailInput
): Promise<SupportEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, skipped: true, reason: "no_api_key" };
  }

  const to = process.env.SUPPORT_TO_EMAIL ?? "hello@timberline.coffee";
  const from =
    process.env.SUPPORT_FROM_EMAIL ??
    "Groundwork Support <support@timberline.coffee>";

  // TIM-1955: Pro/trialist tickets get a [PRIORITY] prefix on the subject so
  // ops can sort by tag in the inbox without opening the row.
  const tag = input.priority ? "[PRIORITY] " : "";
  const body = {
    from,
    to: [to],
    reply_to: input.email,
    subject: `${tag}[Groundwork support] ${input.subject}`,
    html: buildSupportEmailHtml(input),
    text: buildSupportEmailText(input),
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
