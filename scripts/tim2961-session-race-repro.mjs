// TIM-2961 — reproduce the client-side _removeSession race on the Continue
// with Google click when the user already has a session in the cookie jar.
//
// Root-cause hypothesis (full write-up in TIM-2961 wake comment from CTO):
//
//   createClient() in handleGoogleSignIn kicks off initialize() in its
//   constructor. With a session present in storage, _recoverAndRefresh runs
//   in the background. If the refresh fails — even transiently — supabase-js
//   calls _removeSession() which removes THREE storage keys including the
//   PKCE verifier key (`sb-<ref>-auth-token-code-verifier`).
//
//   signInWithOAuth / _handleProviderSignIn does NOT take the storage lock
//   and does NOT `await this.initializePromise`. So when verifier-write
//   happens before _removeSession, the verifier gets wiped AFTER the write.
//   When the redirect lands at /auth/callback the verifier is gone →
//   AuthPKCECodeVerifierMissingError → /login?error=auth_failed.
//
// Deterministic repro: plant a session with valid-shape JSON in the cookie
// jar, intercept the /token grant_type=refresh_token call from supabase-js
// and return a 400 AFTER a short delay. The delay forces _removeSession to
// fire AFTER the verifier write — exactly the order that produces the bug.
//
// Pass/fail criteria:
//   - PRE-FIX run: with a planted session + forced refresh failure, the
//     verifier cookie is absent or empty in the cookie jar after the click.
//   - POST-FIX run (signOut-before-OAuth): the verifier cookie is present
//     in the jar after the click — _removeSession in init's recoverAndRefresh
//     ran inside the lock that signOut held, BEFORE signInWithOAuth's write.
//
// Run:  node scripts/tim2961-session-race-repro.mjs
//
// Env:  BASE_URL (default http://localhost:3741)
//       NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY required
//       (loaded from .env.local by load-env.mjs if present)

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3741";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL in env or .env.local");
  process.exit(1);
}
const SUPABASE_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const STORAGE_KEY = `sb-${SUPABASE_REF}-auth-token`;
const VERIFIER_NAME = `${STORAGE_KEY}-code-verifier`;

function plantedSessionJson() {
  // Just-enough JSON shape for supabase-js to consider this a "current session"
  // and trigger _recoverAndRefresh on init. expires_at: 0 forces it to attempt
  // a refresh immediately (refresh token will be rejected by our route below).
  return JSON.stringify({
    access_token: "fake.planted.access.token",
    refresh_token: "fake_planted_refresh_token",
    expires_in: 0,
    expires_at: 0,
    token_type: "bearer",
    user: { id: "00000000-0000-0000-0000-000000000000", aud: "authenticated", role: "authenticated", email: "planted@example.com" },
  });
}

function encodeChunked(jsonValue, name) {
  const b64 = Buffer.from(jsonValue, "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const full = `base64-${b64}`;
  const MAX = 3180;
  const out = [];
  if (full.length <= MAX) {
    out.push({ name, value: full });
  } else {
    let i = 0, pos = 0;
    while (pos < full.length) {
      out.push({ name: `${name}.${i}`, value: full.slice(pos, pos + MAX) });
      pos += MAX; i++;
    }
  }
  return out;
}

async function plantSession(ctx) {
  const host = new URL(BASE).hostname;
  const chunks = encodeChunked(plantedSessionJson(), STORAGE_KEY);
  const cookies = chunks.map((c) => ({
    name: c.name, value: c.value,
    domain: host, path: "/",
    httpOnly: false, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 3600,
  }));
  await ctx.addCookies(cookies);
  return chunks.length;
}

async function runOnce({ label, plantSessionFirst }) {
  console.log(`\n========== ${label} ==========`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();

  // Force the refresh to fail with a 400 after a short delay — simulates a
  // stale-refresh state that triggers _removeSession in the background.
  let refreshCalls = 0;
  let allSupabaseCalls = 0;
  await ctx.route(`**/auth/v1/**`, async (route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith("supabase.co")) return route.continue();
    allSupabaseCalls++;
    console.log(`  supabase call #${allSupabaseCalls}: ${route.request().method()} ${url.pathname}${url.search}`);
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
      refreshCalls++;
      console.log(`  intercepted refresh #${refreshCalls}, delaying 400ms then 400`);
      await new Promise((r) => setTimeout(r, 400));
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid Refresh Token" }),
      });
    }
    return route.continue();
  });

  // Don't let the browser actually navigate to Supabase /authorize — abort it
  // so we stay on /login and can inspect the cookie jar.
  let authorizeIntercepts = 0;
  await ctx.route(`${SUPABASE_URL}/auth/v1/authorize**`, (route) => {
    authorizeIntercepts++;
    console.log(`  authorize intercept method=${route.request().method()} url=${route.request().url().slice(0, 120)}`);
    return route.abort();
  });

  if (plantSessionFirst) {
    const planted = await plantSession(ctx);
    console.log(`  planted ${planted} chunk(s) of ${STORAGE_KEY} in jar`);
  }

  const page = await ctx.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log(`  page.${msg.type()}:`, msg.text().slice(0, 200));
    }
  });

  // ?error=auth_failed prevents /login from redirecting an authed user away.
  await page.goto(`${BASE}/login?error=auth_failed`, { waitUntil: "domcontentloaded" });

  // After the page is fully loaded but before we click, stub
  // window.location.assign so the navigation never starts and the post-click
  // refresh response resolves in the page's JS context.
  await page.evaluate(() => {
    window.__capturedAssignURL = null;
    // window.location is non-configurable; shadow `assign` on the underlying
    // prototype chain by directly overriding the property on `location`.
    // If that throws (some browsers), fall back to monkey-patching globalThis.
    try {
      window.location.assign = (url) => { window.__capturedAssignURL = url; };
    } catch (e) {
      // Fallback: wrap a global proxy used by the page's handler. The page
      // calls `window.location.assign(data.url)` directly so we can't really
      // intercept without overriding; in that case the test would lose the
      // post-click JS context anyway. Surface the error for diagnosis.
      console.error("could not stub assign:", e.message);
    }
  });

  await page.getByRole("button", { name: /Continue with Google/i }).click().catch(() => {});
  // Long enough for the 400ms refresh delay to fire AND _removeSession to run.
  await page.waitForTimeout(3000);
  const captured = await page.evaluate(() => window.__capturedAssignURL || null);
  console.log(`  captured nav URL (would-have-been): ${captured ? captured.slice(0, 80) + "..." : "none"}`);

  const all = await ctx.cookies();
  const verifierCookies = all.filter((c) => c.name === VERIFIER_NAME || c.name.startsWith(`${VERIFIER_NAME}.`));
  const verifierNonEmpty = verifierCookies.filter((c) => c.value && c.value.length > 0 && c.value !== "base64-");
  const sessionCookies = all.filter((c) => c.name === STORAGE_KEY || c.name.startsWith(`${STORAGE_KEY}.`));
  const sessionNonEmpty = sessionCookies.filter((c) => c.value && c.value.length > 0);

  console.log(`  authorize intercepts: ${authorizeIntercepts}`);
  console.log(`  refresh intercepts:   ${refreshCalls}`);
  console.log(`  session cookies (any value): ${sessionCookies.length}, non-empty: ${sessionNonEmpty.length}`);
  console.log(`  verifier cookies (any value): ${verifierCookies.length}, non-empty: ${verifierNonEmpty.length}`);
  for (const c of verifierCookies) {
    console.log(`    ${c.name} Path=${c.path} len=${c.value.length} preview=${c.value.slice(0, 40)}`);
  }

  await browser.close();

  return {
    label,
    authorize_intercepts: authorizeIntercepts,
    refresh_intercepts: refreshCalls,
    verifier_count: verifierCookies.length,
    verifier_nonempty_count: verifierNonEmpty.length,
    session_count: sessionCookies.length,
    session_nonempty_count: sessionNonEmpty.length,
  };
}

const results = [];
results.push(await runOnce({ label: "A — clean jar (control)", plantSessionFirst: false }));
results.push(await runOnce({ label: "B — planted session + refresh-400 race", plantSessionFirst: true }));

console.log("\n========== SUMMARY ==========");
console.log(JSON.stringify(results, null, 2));

// POST-FIX expected with signOut-before-OAuth in login-form:
//   A — clean jar (control):
//       authorize attempted ≥1, verifier non-empty present, session count 0
//   B — planted session race scenario:
//       authorize attempted ≥1, verifier non-empty present, session count 0
//       (signOut wiped the planted session BEFORE signInWithOAuth ran;
//        the autoRefreshTicker is now a no-op so no _removeSession race)

const A = results[0], B = results[1];
const verdict = {
  control_passed: A.authorize_intercepts >= 1 && A.verifier_nonempty_count >= 1,
  fix_wiped_planted_session: B.session_nonempty_count === 0,
  fix_left_verifier_in_jar: B.authorize_intercepts >= 1 && B.verifier_nonempty_count >= 1,
};
console.log("\nverdict:", JSON.stringify(verdict, null, 2));

if (verdict.control_passed && verdict.fix_wiped_planted_session && verdict.fix_left_verifier_in_jar) {
  console.log("\n>>> POST-FIX VERIFIED: signOut wiped planted session AND verifier landed in jar AND /authorize fired.");
  process.exit(0);
}
console.log("\n>>> FIX NOT YET PRESENT (or test broken) — verifier may still be racy or session not cleared.");
process.exit(1);
