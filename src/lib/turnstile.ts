// TIM-2246: Cloudflare Turnstile (free CAPTCHA replacement) server verify.
//
// Turnstile is enabled only when both env vars are present:
//   TURNSTILE_SITE_KEY    — public, read by the client widget
//   TURNSTILE_SECRET_KEY  — server-only, used to verify the token
//
// When either is missing, the widget renders nothing and the server verify
// returns { ok: true, skipped: true } so dev/preview/local flows keep working.
// This is the NEEDS TRENT toggle: Trent provisions the Cloudflare account +
// site key once and Turnstile starts enforcing in prod without a code change.
//
// Verify endpoint reference:
//   https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileVerifyResult =
  | { ok: true; skipped: true; reason: "no_secret" }
  | { ok: true; skipped: false; hostname?: string }
  | { ok: false; skipped: false; errors: string[] };

export function turnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
}

export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string | null,
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    return { ok: true, skipped: true, reason: "no_secret" };
  }
  if (!token || typeof token !== "string") {
    return { ok: false, skipped: false, errors: ["missing-input-response"] };
  }
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  let res: Response;
  try {
    res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    return { ok: false, skipped: false, errors: ["network-error"] };
  }
  if (!res.ok) {
    return { ok: false, skipped: false, errors: [`http-${res.status}`] };
  }
  type TurnstileApiResponse = {
    success: boolean;
    hostname?: string;
    "error-codes"?: string[];
  };
  const data = (await res.json()) as TurnstileApiResponse;
  if (data?.success) {
    return { ok: true, skipped: false, hostname: data.hostname };
  }
  return {
    ok: false,
    skipped: false,
    errors: data?.["error-codes"] ?? ["unknown"],
  };
}
