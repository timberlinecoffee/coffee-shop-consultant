// TIM-3096: founder-voice 1:1 sender for Day 0 onboarding.
//
// Mirrors send-support.ts / send-account-email.ts: Resend REST, no SDK dep,
// returns a result rather than throwing so the route boundary owns the response.
//
// Voice Mandate: callers (CSM) own copy; this helper does not edit it. Defaults
// strip HTML and send plain text — founder-voice 1:1 looks like a real person
// typed it in Gmail, not a templated marketing email.
//
// Env vars:
//   RESEND_API_KEY      — provisioned via Vercel project env (shared w/ TIM-1941)
//   FOUNDER_FROM_EMAIL  — verified sender on Resend (defaults to the spec value
//                         "Trent (Timberline) <hello@timberline.coffee>")
//   FOUNDER_REPLY_TO    — reply-to inbox the board reads (defaults to
//                         hello@timberline.coffee)

export type FounderEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type FounderEmailResult =
  | { ok: true; provider: "resend"; id: string }
  | { ok: false; skipped: true; reason: "no_api_key" }
  | { ok: false; skipped: false; status: number; error: string };

const DEFAULT_FROM = "Trent (Timberline) <hello@timberline.coffee>";
const DEFAULT_REPLY_TO = "hello@timberline.coffee";

export async function sendFounderEmail(
  input: FounderEmailInput,
): Promise<FounderEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, skipped: true, reason: "no_api_key" };

  const from = process.env.FOUNDER_FROM_EMAIL ?? DEFAULT_FROM;
  const replyTo = process.env.FOUNDER_REPLY_TO ?? DEFAULT_REPLY_TO;

  const body: Record<string, unknown> = {
    from,
    to: [input.to],
    reply_to: replyTo,
    subject: input.subject,
    text: input.text,
  };
  if (input.html) body.html = input.html;

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
      return {
        ok: false,
        skipped: false,
        status: res.status,
        error: text.slice(0, 500),
      };
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
