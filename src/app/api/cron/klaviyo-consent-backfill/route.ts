// TIM-3448: CASL s.10(1) backfill — existing waitlist consent audit trail.
//
// Context: Klaviyo list VZpvBY has profiles from before the CASL audit
// (TIM-3311). None have email_consent_log rows. This endpoint pages through
// the Klaviyo list, checks which emails are already backfilled, and inserts
// implied consent records for the remainder.
//
// Consent classification: "implied" / "waitlist_backfill_pre_casl".
// CASL s.10(9)(a)(iii) allows implied consent where the person has conspicuously
// published their address and has not indicated they do not wish to receive CEM.
// Our waitlist form copy ("We'll only use your email for launch updates and your
// locked-in price. Unsubscribe anytime.") substantiates implied consent. The
// gap (no explicit opt-in before TIM-3448 shipped) is documented here and in
// the consent_type field.
//
// Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`.
// Run manually: curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/klaviyo-consent-backfill
//
// Standing Rule 4 (TIM-2252): Klaviyo API calls are bounded per-page (max 100
// profiles per request); no unbounded loop over paid calls.

import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { KLAVIYO_BASE, KLAVIYO_REVISION, WAITLIST_LIST_ID } from "@/lib/waitlist/klaviyo-subscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

interface KlaviyoProfile {
  id: string;
  attributes: {
    email?: string | null;
    created?: string | null;
  };
}

interface KlaviyoListProfilesResponse {
  data: KlaviyoProfile[];
  links?: {
    next?: string | null;
  };
}

async function fetchProfilePage(
  apiKey: string,
  url: string,
): Promise<KlaviyoListProfilesResponse | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: KLAVIYO_REVISION,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`[backfill] klaviyo list-profiles ${res.status}`);
      return null;
    }
    return (await res.json()) as KlaviyoListProfilesResponse;
  } catch (err) {
    console.error("[backfill] klaviyo fetch error:", String(err));
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "KLAVIYO_PRIVATE_API_KEY not configured" },
      { status: 503 },
    );
  }

  const supabase = createServiceClient();
  let cursor: string | null =
    `${KLAVIYO_BASE}/api/lists/${WAITLIST_LIST_ID}/profiles/?fields[profile]=email,created&page[size]=100`;
  let totalFetched = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let pages = 0;
  const MAX_PAGES = 50; // safety cap: 50 × 100 = 5,000 profiles max per run

  while (cursor && pages < MAX_PAGES) {
    pages++;
    const page = await fetchProfilePage(apiKey, cursor);
    if (!page) break;

    const profiles = page.data;
    totalFetched += profiles.length;

    const emailsInPage = profiles
      .map((p) => p.attributes.email?.trim().toLowerCase())
      .filter((e): e is string => !!e && e.includes("@"));

    if (emailsInPage.length === 0) {
      cursor = page.links?.next ?? null;
      continue;
    }

    // Determine which emails are already backfilled (partial unique index).
    const { data: existing } = await supabase
      .from("email_consent_log")
      .select("email")
      .eq("consent_source", "waitlist_backfill_pre_casl")
      .in("email", emailsInPage);

    const alreadyDone = new Set((existing ?? []).map((r: { email: string }) => r.email));

    const records = profiles
      .map((p) => {
        const email = p.attributes.email?.trim().toLowerCase();
        if (!email || !email.includes("@")) return null;
        if (alreadyDone.has(email)) return null;
        return {
          email,
          consent_type: "implied" as const,
          consent_source: "waitlist_backfill_pre_casl" as const,
          marketing_opted_in: true,
          klaviyo_subscribed: null,
          klaviyo_profile_id: p.id,
          ip_address: null,
          consented_at: p.attributes.created ?? new Date().toISOString(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    totalSkipped += emailsInPage.length - records.length;

    if (records.length > 0) {
      const { error } = await supabase.from("email_consent_log").insert(records);
      if (error) {
        console.error("[backfill] insert error:", error.message, error.code);
      } else {
        totalInserted += records.length;
      }
    }

    cursor = page.links?.next ?? null;
  }

  console.log(
    `[backfill] done: fetched=${totalFetched} inserted=${totalInserted} skipped=${totalSkipped} pages=${pages}`,
  );

  return Response.json({
    ok: true,
    fetched: totalFetched,
    inserted: totalInserted,
    skipped: totalSkipped,
    pages,
    note: "implied consent classification: waitlist_backfill_pre_casl — CASL s.10(9)(a)(iii) gap documented in TIM-3448",
  });
}
