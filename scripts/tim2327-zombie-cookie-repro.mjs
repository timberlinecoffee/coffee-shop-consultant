// TIM-2327 (2026-06-25): 400-zombie-cookie repro. Trent's screenshot diag
// captured `stale_verifiers=400` with `verifier_cookies=0` at /auth/callback —
// the user had 400 verifier-named cookies accumulated under historic Path/
// Domain attrs that the prior `deleteAllVerifierVariants` could not clear
// (it only emitted Path=/ variants). With the cookie jar overflowing the per-
// registrable-domain cap, Chrome silently evicted supabase-js's fresh verifier
// write between pre-nav and callback.
//
// This script:
//   1. Plants 400 verifier-named cookies under varying (Path, Domain) attrs
//      that the legacy code can NOT match.
//   2. Opens /login under the local dev server.
//   3. Aborts both the Google /authorize and Supabase /authorize round-trips
//      so we can inspect document.cookie + cookie jar state IMMEDIATELY after
//      the Google click handler runs (signOut → purge → preDelete → signIn).
//   4. Asserts the purge cleared the 400 zombies AND that a fresh verifier
//      cookie was successfully written.
//
// Run: NEXT_TELEMETRY_DISABLED=1 npm run dev (in another terminal, listens on
// http://localhost:3000), then `node scripts/tim2327-zombie-cookie-repro.mjs`.
// Set TIM2327_REPRO_PORT to override port (default 3000).

import { chromium } from "playwright";

const PORT = process.env.TIM2327_REPRO_PORT ?? "3000";
const BASE = `http://localhost:${PORT}`;
const PROJECT_REF = "ltmcttjftxzpgynhnrpg"; // matches prod sb-<ref>-auth-token cookie names

function plantZombieCookies(count) {
  // Generate `count` distinct (Path) variants under host-only + Domain=localhost
  // + Domain=.localhost. The legacy purge only emits Path=/, Path=/; Domain=<host>,
  // Path=/; Domain=.<host> — so cookies under any of the paths below survive
  // the legacy attempt and remain in the jar.
  const PATHS = [
    "/", "/login", "/auth", "/auth/callback", "/dashboard", "/onboarding",
    "/workspace", "/api", "/static", "/_next",
    "/foo", "/bar", "/baz", "/qux", "/v1", "/v2", "/legacy", "/oauth",
    "/signin", "/signup",
  ];
  const DOMAINS = ["localhost", ".localhost"]; // host-only also (omit domain) below
  const cookies = [];
  let i = 0;
  while (cookies.length < count) {
    const path = PATHS[i % PATHS.length];
    // 3 domain variants per path: host-only (no Domain attr), Domain=localhost,
    // Domain=.localhost. Playwright addCookies requires `domain` to be a string,
    // so host-only is approximated by setting domain to the same as URL.
    for (const domain of DOMAINS) {
      if (cookies.length >= count) break;
      cookies.push({
        name: `sb-${PROJECT_REF}-auth-token-code-verifier`,
        value: `zombie-${cookies.length.toString().padStart(4, "0")}-${"x".repeat(40)}`,
        domain,
        path,
        secure: false,
        sameSite: "Lax",
        expires: Math.floor(Date.now() / 1000) + 3600,
      });
    }
    i += 1;
  }
  return cookies;
}

function fail(msg) {
  console.error(`\n✖ FAIL: ${msg}`);
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  try {
    // Plant 400 zombie verifier cookies. Playwright's addCookies will silently
    // drop entries that conflict; we may end up with fewer than 400 distinct
    // cookies in the jar, but anything north of ~50 reproduces the jar-overflow
    // symptom (default per-registrable-domain cap is ~180 in Chrome).
    const planted = plantZombieCookies(400);
    await ctx.addCookies(planted);
    const beforeCount = (await ctx.cookies()).filter(c =>
      c.name === `sb-${PROJECT_REF}-auth-token-code-verifier` ||
      /sb-.+-auth-token-code-verifier(\.\d+)?$/.test(c.name)
    ).length;
    console.log(`Planted ${planted.length} zombie verifier cookies; jar holds ${beforeCount} after dedup.`);
    if (beforeCount < 50) {
      console.warn(`  (warning: jar accepted only ${beforeCount} — Playwright may dedup harder than the live browser)`);
    }

    const page = await ctx.newPage();
    // Block Google to keep the test offline; block Supabase /authorize so we
    // can inspect the verifier write without leaving the page.
    let supabaseChallengeSeen = null;
    await page.route("https://accounts.google.com/**", r => r.abort());
    await page.route("https://*.supabase.co/auth/v1/authorize**", r => {
      try {
        supabaseChallengeSeen = new URL(r.request().url()).searchParams.get("code_challenge");
      } catch { /* ignore */ }
      r.abort();
    });

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });

    // Click Google login. The handler should:
    //   signOut → purgeAllSupabaseCookies → deleteAllVerifierVariants →
    //   signInWithOAuth → verifier_pre_nav sentinel → navigate.
    // We abort the navigation so we can inspect state right after.
    await page.getByRole("button", { name: /Continue with Google/i }).click().catch(() => {});
    await page.waitForTimeout(2000);

    // Read cookie jar AFTER the click handler ran.
    const afterCookies = await ctx.cookies();
    const verifierAfter = afterCookies.filter(c =>
      /sb-.+-auth-token-code-verifier(\.\d+)?$/.test(c.name)
    );
    const zombiesAfter = verifierAfter.filter(c => c.value.startsWith("zombie-"));

    console.log(`\n--- after click ---`);
    console.log(`  verifier-named cookies remaining: ${verifierAfter.length}`);
    console.log(`  of which still zombie-tagged: ${zombiesAfter.length}`);

    if (zombiesAfter.length > 0) {
      console.error("  zombie samples:");
      for (const c of zombiesAfter.slice(0, 5)) {
        console.error(`    ${c.name} Path=${c.path} Domain=${c.domain}`);
      }
      fail(`Purge left ${zombiesAfter.length} zombie verifier cookies in the jar — the broader (Path × Domain) sweep is not catching them.`);
    }

    // Supabase challenge should have been seen — that means signInWithOAuth
    // got far enough to hit /authorize. If it did not, the OAuth round-trip
    // never started (telemetry-only check; not a hard fail because the local
    // dev server may not have Supabase configured the same way as prod).
    if (supabaseChallengeSeen) {
      console.log(`  supabase /authorize code_challenge seen: ${supabaseChallengeSeen.slice(0, 12)}...`);
      // A fresh verifier should now be in the jar (supabase-js writes it via
      // its cookie storage adapter after signInWithOAuth resolves).
      const freshVerifier = verifierAfter.find(c => !c.value.startsWith("zombie-"));
      if (!freshVerifier) {
        fail(`/authorize was hit but no fresh verifier cookie landed — eviction may still be occurring.`);
      }
      console.log(`  fresh verifier landed: Path=${freshVerifier.path} Domain=${freshVerifier.domain} len=${freshVerifier.value.length}`);
    } else {
      console.log(`  (no /authorize hit — dev server may not be wired to Supabase; zombie cleanup still verified)`);
    }

    console.log(`\n✓ TIM-2327 zombie-cookie purge verified: 0 zombies remain after click.`);
  } finally {
    await browser.close();
  }
})();
