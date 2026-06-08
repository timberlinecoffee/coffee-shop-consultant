// TIM-2350: Klaviyo synchronous subscribe client.
//
// Lives in `lib/` rather than inline in the route so node:test can exercise
// it with relative imports (Next path aliases don't resolve under the test
// runner — see TIM-2334 memory). The route is a thin wrapper that adds rate
// limiting + Turnstile + input validation and calls `subscribeToWaitlist`.
//
// Contract: synchronously verifies that the profile lands and joins the list
// before the function returns success. Never echoes upstream payloads — only
// stable reason codes flow back to the caller.
//
// IMPLEMENTATION NOTE — `subscriptions` is intentionally NOT in the payload.
// Klaviyo's `/api/profiles/` endpoint rejects the `subscriptions` field with a
// 400 ("'subscriptions' is not a valid field for the resource 'profile'") at
// every revision we tested (2024-07-15 through 2025-07-15). The only path
// that records `consent: SUBSCRIBED` is `/api/profile-subscription-bulk-create-jobs/`
// — the same async path that was silently dropping profiles in the original
// outage. We accept the tradeoff: profile lands synchronously, gets added to
// list VZpvBY, and Klaviyo derives `can_receive_email_marketing: true` from
// the list membership. Legal `consent: SUBSCRIBED` stays NEVER_SUBSCRIBED on
// these profiles until either Klaviyo's bulk path recovers (and we backfill)
// or we add a separate confirm flow.

export const KLAVIYO_BASE = "https://a.klaviyo.com";
export const KLAVIYO_REVISION = "2024-10-15";
export const WAITLIST_LIST_ID = "VZpvBY"; // Groundwork.AI Waitlist (TIM-2284)

export type SubscribeResult =
  | {
      ok: true;
      profileId: string;
      alreadyExisted: boolean;
    }
  | {
      ok: false;
      status: 429 | 502;
      reason: string;
    };

function klaviyoHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    "Content-Type": "application/json",
    accept: "application/json",
    revision: KLAVIYO_REVISION,
  };
}

function extractDuplicateProfileId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return null;
  for (const e of errors) {
    if (!e || typeof e !== "object") continue;
    const meta = (e as { meta?: unknown }).meta;
    if (!meta || typeof meta !== "object") continue;
    const id = (meta as { duplicate_profile_id?: unknown }).duplicate_profile_id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

function extractProfileId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const id = (data as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

async function createOrFetchProfile(
  apiKey: string,
  email: string,
  source: string,
): Promise<
  | { ok: true; profileId: string; alreadyExisted: boolean }
  | { ok: false; status: 429 | 502; reason: string }
> {
  const payload = {
    data: {
      type: "profile",
      attributes: {
        email,
        properties: { signup_source: source },
      },
    },
  };

  let res: Response;
  try {
    res = await fetch(`${KLAVIYO_BASE}/api/profiles/`, {
      method: "POST",
      headers: klaviyoHeaders(apiKey),
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { ok: false, status: 502, reason: `profile-create-network: ${String(err)}` };
  }

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* Klaviyo always returns JSON; if it didn't, parsed stays null. */
  }

  if (res.status === 201) {
    const id = extractProfileId(parsed);
    if (!id) return { ok: false, status: 502, reason: "profile-create-201-missing-id" };
    return { ok: true, profileId: id, alreadyExisted: false };
  }

  if (res.status === 409) {
    const id = extractDuplicateProfileId(parsed);
    if (!id) return { ok: false, status: 502, reason: "profile-create-409-missing-duplicate-id" };
    return { ok: true, profileId: id, alreadyExisted: true };
  }

  if (res.status === 429) {
    return { ok: false, status: 429, reason: "profile-create-rate-limited" };
  }

  return { ok: false, status: 502, reason: `profile-create-${res.status}` };
}

async function addProfileToWaitlist(
  apiKey: string,
  profileId: string,
): Promise<{ ok: true } | { ok: false; status: 429 | 502; reason: string }> {
  const payload = { data: [{ type: "profile", id: profileId }] };

  let res: Response;
  try {
    res = await fetch(
      `${KLAVIYO_BASE}/api/lists/${WAITLIST_LIST_ID}/relationships/profiles/`,
      {
        method: "POST",
        headers: klaviyoHeaders(apiKey),
        body: JSON.stringify(payload),
      },
    );
  } catch (err) {
    return { ok: false, status: 502, reason: `list-add-network: ${String(err)}` };
  }

  // 204 No Content == success. Klaviyo treats re-adds as a no-op 204.
  if (res.status === 204) return { ok: true };

  if (res.status === 429) {
    return { ok: false, status: 429, reason: "list-add-rate-limited" };
  }

  const errText = await res.text().catch(() => "");
  return { ok: false, status: 502, reason: `list-add-${res.status}: ${errText.slice(0, 200)}` };
}

export async function subscribeToWaitlist(
  apiKey: string,
  email: string,
  source: string,
): Promise<SubscribeResult> {
  const profile = await createOrFetchProfile(apiKey, email, source);
  if (!profile.ok) return profile;

  const listAdd = await addProfileToWaitlist(apiKey, profile.profileId);
  if (!listAdd.ok) {
    return {
      ok: false,
      status: listAdd.status,
      reason: `${listAdd.reason} (profile=${profile.profileId})`,
    };
  }

  return {
    ok: true,
    profileId: profile.profileId,
    alreadyExisted: profile.alreadyExisted,
  };
}
