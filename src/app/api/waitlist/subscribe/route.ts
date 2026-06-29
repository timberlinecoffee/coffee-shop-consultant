// TIM-2285: Groundwork.AI waitlist signup → Klaviyo list VZpvBY.
//
// TIM-2350: Swapped off `profile-subscription-bulk-create-jobs` (returned 202
// but the async queue silently dropped profiles between 2026-06-04T16:47Z and
// the fix landing). The Klaviyo client now lives in
// `lib/waitlist/klaviyo-subscribe.ts` and verifies landing synchronously
// before returning ok. We return 200 only after both the profile-create and
// list-add succeed (Standing Rule 5: sanitized error to client, full reason
// to server log).
//
// TIM-3448: Added CASL s.10(1) consent capture.
// - `marketing_consent` bool in request body — validated server-side (SR #3).
// - Every signup writes an email_consent_log row regardless of checkbox state.
// - When consent=true, also calls setKlaviyoSubscribed() to queue a
//   profile-subscription-bulk-create-job setting SUBSCRIBED on the profile.
// - Both operations are non-fatal to the signup flow; failures are logged.
import type { NextRequest } from "next/server";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import {
  subscribeToWaitlist,
  setKlaviyoSubscribed,
} from "@/lib/waitlist/klaviyo-subscribe";
import { writeConsentRecord } from "@/lib/waitlist/consent-log";

// Conservative RFC 5322-ish email regex — good enough for a waitlist form.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SubscribeBody = {
  email?: unknown;
  cf_turnstile_token?: unknown;
  source?: unknown;
  marketing_consent?: unknown;
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

  // Server-side validation of marketing_consent (SR #3): must be boolean.
  const marketingConsent = body.marketing_consent === true;

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

  const consentedAt = new Date();

  // CASL s.10(1): set Klaviyo SUBSCRIBED when user explicitly opted in.
  let klaviyoSubscribed: boolean | null = null;
  if (marketingConsent) {
    const subResult = await setKlaviyoSubscribed(
      apiKey,
      emailRaw,
      result.profileId,
      consentedAt.toISOString(),
    );
    if (subResult.ok) {
      klaviyoSubscribed = true;
    } else {
      klaviyoSubscribed = false;
      console.error(`[waitlist] klaviyo set-subscribed failed: ${subResult.reason}`);
    }
  }

  // CASL s.10(1): write audit row regardless of checkbox state.
  await writeConsentRecord({
    email: emailRaw,
    consentType: marketingConsent ? "express" : "implied",
    consentSource: "waitlist_signup",
    marketingOptedIn: marketingConsent,
    klaviyoSubscribed,
    klaviyoProfileId: result.profileId,
    ipAddress: ip === "anon" ? null : ip,
    consentedAt,
  });

  return Response.json({ ok: true });
}
