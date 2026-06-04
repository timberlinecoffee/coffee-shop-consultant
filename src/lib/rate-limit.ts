// TIM-2246: shared-store rate limiter for public + auth-adjacent endpoints.
//
// Two stores are supported:
//   1. Upstash Redis (REST API) — used in production when both
//      UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.
//   2. In-memory Map — fallback for dev, preview, and any environment that
//      hasn't provisioned Upstash yet. Per-instance state, so multi-region
//      Vercel can leak ~Nx the limit across regions. Acceptable as a baseline
//      because (a) we ALSO have Supabase Auth's built-in rate limits and
//      Cloudflare Turnstile in front of forms, and (b) Trent can flip the env
//      switch to Upstash at any time without code changes.
//
// Algorithm: fixed-window counter keyed by `<bucket>:<identifier>:<window-ts>`.
// Simpler than a sliding window and good enough for abuse mitigation. A
// burst on the window boundary can let through 2x the limit briefly — that's
// fine, the goal here is bot/script throttling, not millisecond precision.
//
// Usage:
//   const result = await rateLimit({ bucket: "support", id: ip, limit: 5, windowSec: 60 });
//   if (!result.ok) {
//     return rateLimitedResponse(result);
//   }

export type RateLimitInput = {
  bucket: string;
  id: string;
  limit: number;
  windowSec: number;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  limit: number;
  retryAfterSec: number;
  store: "upstash" | "memory";
};

interface RateStore {
  kind: "upstash" | "memory";
  incr(key: string, ttlSec: number): Promise<number>;
}

let cachedStore: RateStore | null = null;

function getStore(): RateStore {
  if (cachedStore) return cachedStore;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    cachedStore = createUpstashStore(url, token);
  } else {
    cachedStore = createMemoryStore();
  }
  return cachedStore;
}

function createUpstashStore(url: string, token: string): RateStore {
  return {
    kind: "upstash",
    async incr(key: string, ttlSec: number): Promise<number> {
      // Atomically INCR + EX. Pipeline keeps it a single round-trip.
      const res = await fetch(`${url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", key],
          ["EXPIRE", key, String(ttlSec), "NX"],
        ]),
        // Tight deadline so a slow Upstash never stalls a request path.
        signal: AbortSignal.timeout(800),
      });
      if (!res.ok) {
        // Upstash unreachable — fail OPEN so legitimate users aren't locked
        // out by an infra hiccup. Return 1 so the limit is never exceeded
        // from a single fail-open call.
        return 1;
      }
      type UpstashPipelineEntry = { result?: number; error?: string };
      const data = (await res.json()) as UpstashPipelineEntry[];
      const incr = data?.[0]?.result;
      return typeof incr === "number" ? incr : 1;
    },
  };
}

function createMemoryStore(): RateStore {
  const buckets = new Map<string, { count: number; expiresAt: number }>();
  return {
    kind: "memory",
    async incr(key: string, ttlSec: number): Promise<number> {
      const now = Date.now();
      const existing = buckets.get(key);
      if (!existing || existing.expiresAt <= now) {
        buckets.set(key, { count: 1, expiresAt: now + ttlSec * 1000 });
        // Cheap GC: every ~100 inserts, drop expired entries.
        if (buckets.size > 1000) {
          for (const [k, v] of buckets) {
            if (v.expiresAt <= now) buckets.delete(k);
          }
        }
        return 1;
      }
      existing.count += 1;
      return existing.count;
    },
  };
}

export async function rateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const { bucket, id, limit, windowSec } = input;
  const store = getStore();
  const windowStart = Math.floor(Date.now() / 1000 / windowSec) * windowSec;
  const key = `rl:${bucket}:${id}:${windowStart}`;
  const count = await store.incr(key, windowSec);
  const remaining = Math.max(0, limit - count);
  const ok = count <= limit;
  const nextWindowAt = (windowStart + windowSec) * 1000;
  const retryAfterSec = ok ? 0 : Math.max(1, Math.ceil((nextWindowAt - Date.now()) / 1000));
  return { ok, remaining, limit, retryAfterSec, store: store.kind };
}

// Pull the caller's IP from the request headers. Vercel sets
// x-forwarded-for as a comma-separated list with the client IP first.
// Falls back to a static string so anonymous/no-IP paths share one bucket
// (which is the conservative default — anonymous abuse stays throttled).
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "anon";
}

export function rateLimitedResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({ error: "rate_limited", retryAfterSec: result.retryAfterSec }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSec),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

// Convenience for routes — runs rateLimit() and returns a 429 if exceeded.
// Returns null on success so callers can keep their happy path linear.
export async function enforceRateLimit(
  input: RateLimitInput,
): Promise<Response | null> {
  const result = await rateLimit(input);
  if (!result.ok) return rateLimitedResponse(result);
  return null;
}
