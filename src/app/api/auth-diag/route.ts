// TIM-2786: client-side OAuth diagnostic beacon sink.
//
// Public, default-on, rate-limited. Receives the pre-nav and post-bounce
// client beacons sent by /login (see login-form.tsx and OAuthDiagBeacon.tsx),
// validates a thin schema, redacts anything resembling a secret, and emits
// one OAUTH_DIAG line to Vercel runtime logs. We do NOT persist beacons to a
// database — the channel is the team's existing log dashboard.
//
// Standing Engineering Rules applied:
//   Rule 2 — no privileged action; the route only writes to stdout. No user
//     identity, no plan tier, no admin gate needed.
//   Rule 3 — input validated server-side; size capped; arrays truncated;
//     strings capped at 512 chars before logging.
//   Rule 4 — rate-limited via shared enforceRateLimit() on (ip, bucket).
//   Rule 5 — catch on the boundary; sanitized 4xx/5xx; no inner exception
//     reaches the browser.

import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { logOAuthDiag, type OAuthDiagEvent } from "@/lib/oauth-diag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;
const ALLOWED_EVENTS = new Set<OAuthDiagEvent>([
  "pre_nav_intent",
  "login_bounce_view",
  "client_beacon",
]);

function clip(v: unknown, max = 200): string {
  if (typeof v !== "string") return "";
  return v.slice(0, max);
}

function clipArray(v: unknown, maxLen = 80, eachMax = 80): string[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, maxLen).map((x) => clip(x, eachMax));
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ip = clientIp(request.headers);
    // 60/min per IP. A normal user flow emits at most 2 beacons per attempt
    // (pre_nav, bounce); 60/min is a 30x headroom while still throttling
    // anyone trying to flood the log channel.
    const limited = await enforceRateLimit({
      bucket: "auth-diag",
      id: ip,
      limit: 60,
      windowSec: 60,
    });
    if (limited) return limited;

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "payload_too_large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }

    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (typeof parsed !== "object" || parsed === null) {
      return new Response(JSON.stringify({ error: "invalid_body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = parsed as Record<string, unknown>;
    const rawEvent = clip(body.event, 40);
    if (!ALLOWED_EVENTS.has(rawEvent as OAuthDiagEvent)) {
      return new Response(JSON.stringify({ error: "unknown_event" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Whitelist exactly the fields the client may surface. Everything else is
    // dropped so a misbehaving page can't smuggle PII into the log channel.
    const safe: Record<string, unknown> = {
      corrId: clip(body.corrId, 64),
      ua: clip(body.ua, 200),
      vw: typeof body.vw === "number" ? Math.floor(body.vw) : 0,
      vh: typeof body.vh === "number" ? Math.floor(body.vh) : 0,
      cookie_names: clipArray(body.cookie_names, 80, 80),
      verifier_present: Boolean(body.verifier_present),
      stale_verifiers: typeof body.stale_verifiers === "number" ? body.stale_verifiers : null,
      authorize_host: clip(body.authorize_host, 120),
      authorize_path: clip(body.authorize_path, 120),
      third_party_cookie_hint: clip(body.third_party_cookie_hint, 40),
      next_set: Boolean(body.next_set),
      // Bounce-page fields
      error_param: clip(body.error_param, 80),
      diag_len: typeof body.diag_len === "number" ? body.diag_len : null,
      diag_head: clip(body.diag_head, 200),
      performance_nav_ms: typeof body.performance_nav_ms === "number" ? Math.floor(body.performance_nav_ms) : null,
      referrer: clip(body.referrer, 200),
      console_errors: clipArray(body.console_errors, 10, 200),
      ip_hash: await hashIp(ip),
    };

    logOAuthDiag(rawEvent as OAuthDiagEvent, safe);
    return new Response(JSON.stringify({ ok: true }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // Standing Rule 5: never leak the inner exception. The route is diag-only
    // so a swallowed error here just means one observation lost.
    return new Response(JSON.stringify({ error: "diag_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Hash the client IP so the log channel never holds the raw address. SHA-256
// truncated to 16 hex chars is enough to spot a flood from one IP without
// keeping the address. Process-stable salt: `OAUTH_DIAG_IP_SALT` env, or
// the deploy commit sha as a fallback (per-deploy is fine for a diag stream).
async function hashIp(ip: string): Promise<string> {
  try {
    const salt = process.env.OAUTH_DIAG_IP_SALT || process.env.VERCEL_GIT_COMMIT_SHA || "tim2786";
    const data = new TextEncoder().encode(`${salt}:${ip}`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const arr = Array.from(new Uint8Array(digest));
    return arr.slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "hash_failed";
  }
}
