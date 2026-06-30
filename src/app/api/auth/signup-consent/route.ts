// TIM-3449: CASL s.10(3) marketing-consent capture for the account signup form.
//
// Called client-side immediately after supabase.auth.signUp() succeeds and by
// /auth/callback for Google OAuth signups (via gw_oauth_marketing_consent cookie).
//
// Writes an email_consent_log row regardless of checkbox state — the absence of
// consent is as important to the CASL audit trail as the presence of it.
// When marketing_consent=true, also creates/fetches a Klaviyo profile and queues
// the SUBSCRIBED consent status via the bulk-create-jobs path (same as TIM-3448).
//
// Standing Rules applied:
//   SR-2: server-side validate — email and marketing_consent extracted server-side.
//   SR-3: all user input validated before use (email regex, boolean coercion).
//   SR-4: enforceRateLimit() guards the Klaviyo paid API call.
//   SR-5: no raw errors or Klaviyo payloads returned to caller.
//
// Caller identity (QA TIM-3449 round 1): to prevent an unauthenticated actor
// from subscribing an arbitrary email (CASL s.10(1) violation), we verify that
// the posted email corresponds to a user row in public.users created within the
// last 15 minutes. Silent no-op on mismatch to avoid email enumeration.
import type { NextRequest } from "next/server";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import {
  subscribeToWaitlist,
  setKlaviyoSubscribed,
} from "@/lib/waitlist/klaviyo-subscribe";
import { writeConsentRecord } from "@/lib/waitlist/consent-log";
import { createServiceClient } from "@/lib/supabase/service";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = { email?: unknown; marketing_consent?: unknown };

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);

  const rl = await enforceRateLimit({
    bucket: "signup-consent",
    id: ip,
    limit: 10,
    windowSec: 3600,
  });
  if (rl) return rl;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return Response.json({ error: "Invalid email address." }, { status: 400 });
  }

  // Caller identity check: only process if this email signed up in the last
  // 15 minutes. Silent no-op on mismatch to prevent email enumeration.
  const RECENCY_WINDOW_MS = 15 * 60 * 1000;
  const cutoff = new Date(Date.now() - RECENCY_WINDOW_MS).toISOString();
  const svc = createServiceClient();
  const { data: recentUser } = await svc
    .from("users")
    .select("id")
    .eq("email", email)
    .gte("created_at", cutoff)
    .maybeSingle();
  if (!recentUser) {
    return Response.json({ ok: true });
  }

  const marketingConsent = body.marketing_consent === true;
  const consentedAt = new Date();

  let klaviyoProfileId: string | null = null;
  let klaviyoSubscribed: boolean | null = null;

  if (marketingConsent) {
    const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
    if (!apiKey) {
      console.error("[signup-consent] KLAVIYO_PRIVATE_API_KEY not configured");
    } else {
      const sub = await subscribeToWaitlist(apiKey, email, "groundwork-ai-signup");
      if (sub.ok) {
        klaviyoProfileId = sub.profileId;
        const subscribeResult = await setKlaviyoSubscribed(
          apiKey,
          email,
          sub.profileId,
          consentedAt.toISOString(),
        );
        klaviyoSubscribed = subscribeResult.ok;
        if (!subscribeResult.ok) {
          console.error(
            "[signup-consent] setKlaviyoSubscribed failed:",
            subscribeResult.reason,
          );
        }
      } else {
        console.error("[signup-consent] subscribeToWaitlist failed:", sub.reason);
      }
    }
  }

  await writeConsentRecord({
    email,
    consentType: "express",
    consentSource: "signup_form",
    marketingOptedIn: marketingConsent,
    klaviyoSubscribed,
    klaviyoProfileId,
    ipAddress: ip,
    consentedAt,
  });

  return Response.json({ ok: true });
}
