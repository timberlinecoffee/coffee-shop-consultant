// TIM-2366: Supabase → Klaviyo profile-property bridge.
//
// Marketing's trial Day 0/1/3/5/7/8 flow on TIM-2365 triggers on Klaviyo
// PROFILE PROPERTIES (trial_started_at, trial_converted_at, plan,
// trial_canceled_at) — not on events. This module is the small REST shim that
// upserts those properties when our backend learns about a signup,
// trial-conversion, or cancel-during-trial.
//
// Uses the same KLAVIYO_PRIVATE_API_KEY already in prod (see src/lib/klaviyo.ts
// which fires metric events) — no new vendor / secret. Direct REST per the
// bulk-subscribe workaround pattern from TIM-2350.
//
// Klaviyo Profiles API surface used:
//   POST   /api/profiles/                       — create (409 on email collision)
//   GET    /api/profiles/?filter=equals(email,) — look up by email to get id
//   PATCH  /api/profiles/{id}/                  — update properties on existing
//
// Returns a structured result so callers (signup webhook, Stripe webhook,
// cancel route) can record success per-recipient and stay idempotent.

const KLAVIYO_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_REVISION = '2024-10-15';

export type KlaviyoBridgeResult =
  | { ok: true; action: 'created' | 'updated'; profileId: string }
  | { ok: false; skipped: true; reason: 'no_api_key' }
  | { ok: false; skipped: false; status: number; error: string };

interface KlaviyoApiResponse<T> {
  data?: T;
  errors?: Array<{ detail?: string; title?: string }>;
}

interface KlaviyoProfileResource {
  id: string;
  type: 'profile';
  attributes?: Record<string, unknown>;
}

function apiKey(): string | null {
  const raw = (process.env.KLAVIYO_PRIVATE_API_KEY ?? '')
    .replace(/\n/g, '')
    .trim();
  return raw.length > 0 ? raw : null;
}

function authHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Klaviyo-API-Key ${key}`,
    revision: KLAVIYO_REVISION,
    'content-type': 'application/json',
    accept: 'application/json',
  };
}

async function lookupProfileIdByEmail(
  email: string,
  key: string,
): Promise<{ ok: true; id: string | null } | { ok: false; status: number; error: string }> {
  const filter = `equals(email,"${email.replace(/"/g, '\\"')}")`;
  const url = `${KLAVIYO_BASE}/profiles/?filter=${encodeURIComponent(filter)}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: authHeaders(key),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: text.slice(0, 500) };
    }
    const data = (await res.json().catch(() => null)) as KlaviyoApiResponse<
      KlaviyoProfileResource[]
    > | null;
    const first = Array.isArray(data?.data) ? data!.data[0] : null;
    return { ok: true, id: first?.id ?? null };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function createProfile(
  email: string,
  properties: Record<string, unknown>,
  key: string,
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(`${KLAVIYO_BASE}/profiles/`, {
      method: 'POST',
      headers: authHeaders(key),
      body: JSON.stringify({
        data: {
          type: 'profile',
          attributes: {
            email,
            properties,
          },
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: text.slice(0, 500) };
    }
    const data = (await res.json().catch(() => null)) as KlaviyoApiResponse<
      KlaviyoProfileResource
    > | null;
    const id = data?.data?.id;
    if (!id) {
      return { ok: false, status: 0, error: 'create: missing id in response' };
    }
    return { ok: true, id };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function patchProfileProperties(
  profileId: string,
  properties: Record<string, unknown>,
  key: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(`${KLAVIYO_BASE}/profiles/${profileId}/`, {
      method: 'PATCH',
      headers: authHeaders(key),
      body: JSON.stringify({
        data: {
          type: 'profile',
          id: profileId,
          attributes: {
            properties,
          },
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: text.slice(0, 500) };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Upserts the given properties onto the Klaviyo profile keyed by email.
 * Looks up the existing profile id; PATCHes if found, POSTs to create if not.
 */
export async function upsertKlaviyoProfileProperties(
  email: string,
  properties: Record<string, unknown>,
): Promise<KlaviyoBridgeResult> {
  const key = apiKey();
  if (!key) return { ok: false, skipped: true, reason: 'no_api_key' };

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes('@')) {
    return {
      ok: false,
      skipped: false,
      status: 0,
      error: 'invalid email',
    };
  }

  const lookup = await lookupProfileIdByEmail(trimmedEmail, key);
  if (!lookup.ok) {
    return {
      ok: false,
      skipped: false,
      status: lookup.status,
      error: `lookup: ${lookup.error}`,
    };
  }

  if (lookup.id) {
    const patch = await patchProfileProperties(lookup.id, properties, key);
    if (!patch.ok) {
      return {
        ok: false,
        skipped: false,
        status: patch.status,
        error: `patch: ${patch.error}`,
      };
    }
    return { ok: true, action: 'updated', profileId: lookup.id };
  }

  const created = await createProfile(trimmedEmail, properties, key);
  if (!created.ok) {
    // Klaviyo can return 409 if two callers race; one retry-by-lookup heals it.
    if (created.status === 409) {
      const retryLookup = await lookupProfileIdByEmail(trimmedEmail, key);
      if (retryLookup.ok && retryLookup.id) {
        const patch = await patchProfileProperties(
          retryLookup.id,
          properties,
          key,
        );
        if (patch.ok) {
          return { ok: true, action: 'updated', profileId: retryLookup.id };
        }
      }
    }
    return {
      ok: false,
      skipped: false,
      status: created.status,
      error: `create: ${created.error}`,
    };
  }
  return { ok: true, action: 'created', profileId: created.id };
}

// === Trial lifecycle helpers ===

function nowIso(): string {
  return new Date().toISOString();
}

export interface TrialStartedArgs {
  email: string;
  // Optional explicit timestamp so backfills / replays can pin a non-now value.
  trialStartedAtIso?: string;
}

export async function pushTrialStarted(
  args: TrialStartedArgs,
): Promise<KlaviyoBridgeResult> {
  return upsertKlaviyoProfileProperties(args.email, {
    trial_started_at: args.trialStartedAtIso ?? nowIso(),
    trial_state: 'started',
  });
}

export interface TrialConvertedArgs {
  email: string;
  plan: string; // e.g. "starter" | "pro"
  trialConvertedAtIso?: string;
}

export async function pushTrialConverted(
  args: TrialConvertedArgs,
): Promise<KlaviyoBridgeResult> {
  return upsertKlaviyoProfileProperties(args.email, {
    trial_converted_at: args.trialConvertedAtIso ?? nowIso(),
    plan: args.plan,
    trial_state: 'converted',
  });
}

export interface TrialCanceledArgs {
  email: string;
  trialCanceledAtIso?: string;
  // Optional reason captured by the cancel flow; Marketing keys win-back on this.
  reason?: string;
}

export async function pushTrialCanceled(
  args: TrialCanceledArgs,
): Promise<KlaviyoBridgeResult> {
  const properties: Record<string, unknown> = {
    trial_canceled_at: args.trialCanceledAtIso ?? nowIso(),
    trial_state: 'canceled',
  };
  if (args.reason) properties.trial_canceled_reason = args.reason;
  return upsertKlaviyoProfileProperties(args.email, properties);
}
