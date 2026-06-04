// TIM-2285: Groundwork.AI waitlist signup → Klaviyo list VZpvBY.
//
// Server-side subscribe using KLAVIYO_PRIVATE_API_KEY so we never need a
// public Klaviyo key in the browser (single-field waitlist — no value in the
// client-side embed). Double opt-in is configured at the list level in
// Klaviyo, so SUBSCRIBED consent below kicks off Klaviyo's own confirmation
// email rather than recording explicit marketing consent in our DB.
//
// Standing rule 3 (validate at boundary) — zod-equivalent inline validation
// because we only accept a single email + optional Turnstile token.
// Standing rule 4 (rate-limit paid APIs) — `enforceRateLimit` on the route.
// Standing rule 5 (sanitize errors) — never echo upstream Klaviyo error bodies.
import { NextRequest } from "next/server";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";

const KLAVIYO_SUBSCRIBE_URL =
  "https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/";
const KLAVIYO_REVISION = "2024-10-15";
const WAITLIST_LIST_ID = "VZpvBY"; // Groundwork.AI Waitlist (TIM-2284)

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

  // Turnstile is optional — skips when TURNSTILE_SECRET_KEY is unset.
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

  const payload = {
    data: {
      type: "profile-subscription-bulk-create-job",
      attributes: {
        custom_source: source,
        profiles: {
          data: [
            {
              type: "profile",
              attributes: {
                email: emailRaw,
                subscriptions: {
                  email: {
                    marketing: { consent: "SUBSCRIBED" },
                  },
                },
              },
            },
          ],
        },
      },
      relationships: {
        list: { data: { type: "list", id: WAITLIST_LIST_ID } },
      },
    },
  };

  try {
    const res = await fetch(KLAVIYO_SUBSCRIBE_URL, {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        "Content-Type": "application/json",
        accept: "application/json",
        revision: KLAVIYO_REVISION,
      },
      body: JSON.stringify(payload),
    });

    // Klaviyo returns 202 Accepted for bulk subscribe jobs.
    if (res.ok || res.status === 202) {
      return Response.json({ ok: true });
    }

    const errText = await res.text().catch(() => "");
    console.error(
      `[waitlist] klaviyo subscribe failed ${res.status}: ${errText.slice(0, 500)}`,
    );

    // 429 from Klaviyo passes through as 429 to the client; everything else
    // surfaces as a generic 502 so we never echo upstream payloads.
    if (res.status === 429) {
      return Response.json(
        { error: "Too many signups right now. Please try again in a minute." },
        { status: 429 },
      );
    }
    return Response.json(
      { error: "We couldn't add you to the waitlist. Please try again." },
      { status: 502 },
    );
  } catch (err) {
    console.error("[waitlist] klaviyo request error", err);
    return Response.json(
      { error: "We couldn't add you to the waitlist. Please try again." },
      { status: 502 },
    );
  }
}
