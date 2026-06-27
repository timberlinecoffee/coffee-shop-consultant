// TIM-3339: pin that the OAuth initiation runs server-side and that the
// @supabase/ssr cookie adapter writes the PKCE verifier through the cookie
// store (which Next.js then emits as `Set-Cookie` headers on the response).
//
// Why this matters: the prior client-side `signInWithOAuth` call wrote the
// verifier to `document.cookie` from a 'use client' component just before
// `window.location.assign(...)`. `document.cookie =` is not synchronously
// durable across the page-unload that follows; the TIM-3336 diag deploy
// captured `verifier_cookies=0` + `verifier_pre_nav=absent` on 15/22
// callback entries, with `AuthPKCECodeVerifierMissingError` at exchange.
// Moving the initiation server-side guarantees the verifier ships as a
// Set-Cookie header on the response — the browser commits the cookie before
// any JS reads `data.url`, so navigation cannot race the write.
//
// The pinning has two layers:
//   1. SOURCE STRINGS — guard against accidental reversion to the browser
//      client / removal of `skipBrowserRedirect` / removal of `no-store`.
//   2. BEHAVIORAL — exercise @supabase/ssr's createServerClient with a
//      Map-backed fake cookie adapter and assert it writes a key whose name
//      matches `sb-…-auth-token-code-verifier`. signInWithOAuth's PKCE init
//      path is purely local (it generates the verifier, calls
//      `setItemAsync(storage, "<storageKey>-code-verifier", verifier)`, and
//      returns a constructed URL — no network call), so this runs offline.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const routeSrc = readFileSync(resolve(here, "route.ts"), "utf8");

// --- Source-string pins ----------------------------------------------------

test("structural: route declares nodejs runtime + force-dynamic", () => {
  assert.match(routeSrc, /export\s+const\s+runtime\s*=\s*["']nodejs["']/);
  assert.match(routeSrc, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
});

test("structural: route imports server-side Supabase client (cookie adapter), NOT browser client", () => {
  assert.match(routeSrc, /from\s+["']@\/lib\/supabase\/server["']/);
  assert.ok(
    !/from\s+["']@\/lib\/supabase\/client["']/.test(routeSrc),
    "route must not import the browser client — verifier sink would not be a Set-Cookie header",
  );
});

test("structural: signInWithOAuth uses skipBrowserRedirect:true", () => {
  // We need {url} returned as JSON so the client can navigate manually after
  // the Set-Cookie has committed; otherwise the browser would 302 to Google
  // and our Set-Cookie response would be skipped.
  assert.match(routeSrc, /skipBrowserRedirect:\s*true/);
});

test("structural: redirectTo is validated against same-origin /auth/callback (open-redirect guard)", () => {
  assert.match(routeSrc, /redirectTo\.origin\s*!==\s*reqUrl\.origin/);
  assert.match(routeSrc, /redirectTo\.pathname\s*!==\s*["']\/auth\/callback["']/);
});

test("structural: route applies enforceRateLimit (Standing Rule 4)", () => {
  assert.match(routeSrc, /enforceRateLimit\(\s*\{/);
});

test("structural: every JSON response sets Cache-Control: no-store", () => {
  // Multiple early-return paths (rate-limit, validation, supabase error,
  // happy path). Each must be uncacheable so the Set-Cookie verifier header
  // is not served from cache to a second user. We assert ≥4 occurrences —
  // one per terminal response. This is intentionally noisy so a future edit
  // that forgets the header on a new return path fails this test.
  const matches = routeSrc.match(/Cache-Control["']?\s*:\s*["']no-store/g) ?? [];
  assert.ok(
    matches.length >= 4,
    `expected ≥4 no-store directives (one per terminal response), found ${matches.length}`,
  );
});

// --- Behavioral pin: @supabase/ssr cookie adapter writes the verifier ------
//
// This exercises the real @supabase/ssr.createServerClient with a Map-backed
// cookie store. The single load-bearing assertion: after signInWithOAuth
// resolves, the store contains a key matching `sb-…-auth-token-code-verifier`.
// That is the verifier sink that, in production, becomes a Set-Cookie header
// via Next.js cookies().set inside our `src/lib/supabase/server.ts` adapter.

test("behavioral: @supabase/ssr cookie adapter writes the PKCE verifier during signInWithOAuth", async () => {
  const { createServerClient } = await import("@supabase/ssr");
  const VERIFIER_RE = /^sb-.+-auth-token-code-verifier(\.\d+)?$/;

  // Map-backed fake of the Next.js cookie store our server adapter wraps.
  // This mirrors the contract used in src/lib/supabase/server.ts: getAll
  // returns the current jar, set(name, value, options) appends a write.
  const store = new Map();
  const writes = [];

  const supabase = createServerClient(
    // The auth-js client constructs an /authorize URL from this base. We
    // never actually fetch it (skipBrowserRedirect:true returns the URL),
    // so a placeholder is fine. The PKCE verifier write is local-only.
    "https://example.supabase.co",
    "anon-placeholder-key",
    {
      cookies: {
        getAll() {
          return Array.from(store.entries()).map(([name, value]) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value);
            writes.push({ name, value, options });
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://groundwork.cafe/auth/callback",
      skipBrowserRedirect: true,
    },
  });

  assert.ok(!error, `signInWithOAuth returned an error: ${error?.message}`);
  assert.ok(data?.url, "expected data.url from signInWithOAuth");

  // The verifier must have been written via setAll → cookie adapter.
  const verifierWrites = writes.filter((w) => VERIFIER_RE.test(w.name));
  assert.ok(
    verifierWrites.length >= 1,
    `expected ≥1 Set-Cookie write matching ${VERIFIER_RE}; got writes: ${writes
      .map((w) => w.name)
      .join(",")}`,
  );

  // And the verifier value must be present and non-empty (the cookie body).
  const total = verifierWrites.reduce((n, w) => n + (w.value?.length ?? 0), 0);
  assert.ok(total > 0, "verifier cookie write had empty value");
});
