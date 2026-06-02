// TIM-1663: minimal Klaviyo events client.
//
// Timberline already provisions KLAVIYO_PRIVATE_API_KEY, so transactional
// reminders ride the existing Klaviyo account rather than introducing a new
// email vendor. This helper pushes a metric event keyed to a profile email; a
// Klaviyo flow listening on that metric owns the actual email template and copy.
// That keeps the Voice Mandate copy out of code and in the marketing tool.
//
// Docs: https://developers.klaviyo.com/en/reference/create_event

const KLAVIYO_EVENTS_URL = "https://a.klaviyo.com/api/events/";
// Pinned Klaviyo API revision. Bump deliberately when adopting new fields.
const KLAVIYO_REVISION = "2024-10-15";

export interface KlaviyoEventResult {
  ok: boolean;
  status: number;
  error?: string;
}

/**
 * Fires a Klaviyo metric event for a single profile. Returns a result rather
 * than throwing so the caller can record per-recipient success/failure and stay
 * idempotent. Properties are arbitrary event metadata surfaced to the flow.
 */
export async function trackKlaviyoEvent(
  metric: string,
  email: string,
  properties: Record<string, unknown> = {},
): Promise<KlaviyoEventResult> {
  const key = process.env.KLAVIYO_PRIVATE_API_KEY;
  if (!key) {
    return { ok: false, status: 0, error: "KLAVIYO_PRIVATE_API_KEY not configured" };
  }

  const payload = {
    data: {
      type: "event",
      attributes: {
        properties,
        metric: { data: { type: "metric", attributes: { name: metric } } },
        profile: { data: { type: "profile", attributes: { email } } },
      },
    },
  };

  try {
    const res = await fetch(KLAVIYO_EVENTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${key}`,
        revision: KLAVIYO_REVISION,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: text.slice(0, 500) };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
