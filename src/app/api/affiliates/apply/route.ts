import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const KLAVIYO_API_URL = "https://a.klaviyo.com/api/events/";
const KLAVIYO_REVISION = "2024-10-15";

async function sendKlaviyoEvent(
  apiKey: string,
  metricName: string,
  email: string,
  profileAttrs: Record<string, string>,
  properties: Record<string, string>,
) {
  const res = await fetch(KLAVIYO_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      "Content-Type": "application/json",
      revision: KLAVIYO_REVISION,
    },
    body: JSON.stringify({
      data: {
        type: "event",
        attributes: {
          metric: {
            data: {
              type: "metric",
              attributes: { name: metricName },
            },
          },
          profile: {
            data: {
              type: "profile",
              attributes: { email, ...profileAttrs },
            },
          },
          properties,
        },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`Klaviyo event "${metricName}" failed ${res.status}: ${text}`);
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    firstName,
    lastName,
    email,
    businessName,
    role,
    roleOther,
    platformAudience,
    whyReferring,
    affiliateAgreement,
    caslConsent,
  } = body as Record<string, unknown>;

  if (
    typeof firstName !== "string" || !firstName.trim() ||
    typeof lastName !== "string" || !lastName.trim() ||
    typeof email !== "string" || !email.trim() ||
    typeof businessName !== "string" || !businessName.trim() ||
    typeof role !== "string" || !role.trim() ||
    typeof platformAudience !== "string" || !platformAudience.trim() ||
    typeof whyReferring !== "string" || !whyReferring.trim() ||
    affiliateAgreement !== true ||
    caslConsent !== true
  ) {
    return Response.json({ error: "All required fields must be completed." }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const caslConsentAt = new Date().toISOString();

  const supabase = createServiceClient();
  const { error: dbError } = await supabase.from("affiliate_applications").insert({
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    email: email.trim().toLowerCase(),
    business_name: businessName.trim(),
    role: role.trim(),
    role_other: typeof roleOther === "string" && roleOther.trim() ? roleOther.trim() : null,
    platform_audience: platformAudience.trim(),
    why_referring: whyReferring.trim(),
    affiliate_agreement_accepted: true,
    casl_consent_accepted: true,
    casl_consent_at: caslConsentAt,
    casl_consent_ip: ip,
    status: "pending",
  });

  if (dbError) {
    console.error("affiliate_applications insert error:", dbError);
    return Response.json(
      { error: "Could not save your application. Please try again." },
      { status: 500 },
    );
  }

  const klaviyoKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  if (klaviyoKey) {
    const displayRole =
      role === "other" && typeof roleOther === "string" && roleOther.trim()
        ? roleOther.trim()
        : role;

    await Promise.allSettled([
      sendKlaviyoEvent(
        klaviyoKey,
        "Affiliate Application Received",
        email.trim().toLowerCase(),
        { first_name: firstName.trim(), last_name: lastName.trim() },
        {
          business_name: businessName.trim(),
          role: displayRole,
          platform_audience: platformAudience.trim(),
          why_referring: whyReferring.trim(),
        },
      ),
      sendKlaviyoEvent(
        klaviyoKey,
        "Affiliate Application Submitted Notification",
        "trent@simpler.coffee",
        { first_name: "Trent" },
        {
          applicant_name: `${firstName.trim()} ${lastName.trim()}`,
          applicant_email: email.trim().toLowerCase(),
          business_name: businessName.trim(),
          role: displayRole,
          platform_audience: platformAudience.trim(),
          why_referring: whyReferring.trim(),
          submitted_at: caslConsentAt,
        },
      ),
    ]);
  }

  return Response.json({ success: true });
}
