// TIM-2285: Groundwork.AI waitlist signup → Klaviyo list VZpvBY.
//
// TIM-2350: Swapped off `profile-subscription-bulk-create-jobs` (returned 202
// but the async queue silently dropped profiles between 2026-06-04T16:47Z and
// the fix landing). The Klaviyo client now lives in
// `lib/waitlist/klaviyo-subscribe.ts` and verifies landing synchronously
// before returning ok. We return 200 only after both the profile-create and
// list-add succeed (Standing Rule 5: sanitized error to client, full reason
// to server log).
import type { NextRequest } from "next/server";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { subscribeToWaitlist } from "@/lib/waitlist/klaviyo-subscribe";

// Conservative RFC 5322-ish email regex — good enough for a waitlist form.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SubscribeBody = {
  email?: unknown;
  cf_turnstile_token?: unknown;
  source?: unknown;
};

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);

  // 5 attempts per IP per hour is generous for a waitlist signup; a real human
  // signs up once and a bot trying to seed Klaviyo fans out fast.
  const rl = await enforceRateLimit({
    bucket: "waitlist:groundwork-ai",
    id: ip,
    limit: 5,
    windowSec: 3600,
  });
  if (rl) return rl;

  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const emailRaw = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!emailRaw || !EMAIL_RE.test(emailRaw) || emailRaw.length > 254) {
    return Response.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const captcha = await verifyTurnstileToken(
    typeof body.cf_turnstile_token === "string" ? body.cf_turnstile_token : null,
    ip,
  );
  if (!captcha.ok) {
    return Response.json(
      { error: "Bot protection check failed. Please refresh and try again." },
      { status: 400 },
    );
  }

  const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  if (!apiKey) {
    console.error("[waitlist] KLAVIYO_PRIVATE_API_KEY not configured");
    return Response.json(
      { error: "Waitlist signup is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }

  const source =
    typeof body.source === "string" && body.source.length <= 80
      ? body.source
      : "groundwork-ai-coming-soon";

  const result = await subscribeToWaitlist(apiKey, emailRaw, source);
  if (!result.ok) {
    console.error(`[waitlist] klaviyo subscribe failed: ${result.reason}`);
    if (result.status === 429) {
      return Response.json(
        { error: "Too many signups right now. Please try again in a minute." },
        { status: 429 },
      );
    }
    return Response.json(
      { error: "We couldn't add you to the waitlist. Please try again." },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
}
