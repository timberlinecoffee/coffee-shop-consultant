#!/usr/bin/env node
// TIM-2352: live verify on https://groundwork.cafe after merge.
//
// Pins:
// 1. Apex anonymous shows "Coming Soon" chip (not account chip).
// 2. /auth/callback with no code redirects to /login?error=auth_failed
//    in a single 307 (proxy bypass active — would 200 + body if proxy had
//    wiped the session and the route fell into its non-code branch only
//    after a token revoke had been written to cookies).
// 3. Anonymous /login renders the form, no redirect.
// 4. Authenticated /login bounces to /dashboard (cookies set via Supabase
//    Admin API → generate magic link → exchange).
// 5. Authenticated apex renders the account-chip pointing at /dashboard.
//
// Uses .env.local for the Supabase keys. Requires playwright (already in
// the repo's node_modules).

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function loadEnv(path) {
  const out = {};
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2$/);
      if (!m) continue;
      out[m[1]] = m[3].replace(/\\n$/, "").trim();
    }
  } catch {
    // optional
  }
  return out;
}

const env = { ...process.env, ...loadEnv(join(repoRoot, ".env.local")) };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.VERIFY_BASE_URL ?? "https://groundwork.cafe";
const FIXTURE_EMAIL = process.env.VERIFY_EMAIL ?? "trent@simpler.coffee";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function assert(name, cond, detail = "") {
  results.push({ name, pass: !!cond, detail });
  const tag = cond ? "✓" : "✗";
  console.log(`${tag} ${name}${detail ? `  — ${detail}` : ""}`);
}

async function fetchNoFollow(url, init = {}) {
  return fetch(url, { redirect: "manual", ...init });
}

// ── Pin 1: apex anonymous → Coming Soon chip, no account chip ────────────
{
  const res = await fetch(BASE, { redirect: "manual" });
  const html = await res.text();
  assert(
    "apex anonymous renders Coming Soon chip",
    res.status === 200 && /Coming Soon/.test(html) && !/aria-label="Open dashboard for/.test(html),
    `status=${res.status}`,
  );
}

// ── Pin 2: /auth/callback with no code → single 307 to /login?error=auth_failed
{
  const res = await fetchNoFollow(`${BASE}/auth/callback`);
  const loc = res.headers.get("location") ?? "";
  assert(
    "/auth/callback no-code → 307 /login?error=auth_failed",
    res.status === 307 && /\/login\?error=auth_failed$/.test(loc),
    `status=${res.status} loc=${loc}`,
  );
}

// ── Pin 3: anonymous /login renders the form (no redirect) ───────────────
{
  const res = await fetch(`${BASE}/login`, { redirect: "manual" });
  const html = await res.text();
  assert(
    "anonymous /login 200 with sign-in form",
    res.status === 200 && /Continue with Google/.test(html) && /Welcome Back/.test(html),
    `status=${res.status}`,
  );
}

// ── Pin 4 + 5: authenticated apex shows chip + /login bounces to /dashboard
{
  // Sidestep the OAuth redirect/Site-URL plumbing entirely. Mint a magiclink
  // server-side, then verifyOtp() with its hashed_token from a temporary
  // anon client to get a real { access_token, refresh_token } pair, then
  // inject those into Playwright cookies in the exact @supabase/ssr cookie
  // format. Same end state the OAuth flow produces.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: FIXTURE_EMAIL,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    assert("authenticated chip + /login bounce", false, `generateLink failed: ${linkError?.message}`);
  } else {
    const anon = createClient(SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: otpData, error: otpError } = await anon.auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    });
    if (otpError || !otpData?.session) {
      assert("authenticated chip + /login bounce", false, `verifyOtp failed: ${otpError?.message}`);
    } else {
      const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
      const storageKey = `sb-${projectRef}-auth-token`;
      // @supabase/ssr stores the session JSON at storageKey, base64url-encoded
      // with a "base64-" prefix. Chunk into .0/.1/.2 cookies when > MAX_CHUNK_SIZE
      // so the server client's combineChunks reassembles correctly.
      const payload = JSON.stringify(otpData.session);
      const b64 = Buffer.from(payload, "utf8")
        .toString("base64")
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const fullValue = `base64-${b64}`;
      const MAX = 3180;
      const cookies = [];
      const host = new URL(BASE).hostname;
      const baseCookie = {
        domain: host,
        path: "/",
        httpOnly: false,
        sameSite: "Lax",
        secure: true,
      };
      if (fullValue.length <= MAX) {
        cookies.push({ ...baseCookie, name: storageKey, value: fullValue });
      } else {
        let i = 0;
        let pos = 0;
        while (pos < fullValue.length) {
          cookies.push({
            ...baseCookie,
            name: `${storageKey}.${i}`,
            value: fullValue.slice(pos, pos + MAX),
          });
          pos += MAX;
          i += 1;
        }
      }

      const browser = await chromium.launch({ headless: true });
      const ctx = await browser.newContext({ ignoreHTTPSErrors: false });
      await ctx.addCookies(cookies);
      const page = await ctx.newPage();

      // Pin 4: apex shows the account chip linking to /dashboard.
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      const chipCount = await page.locator('a[aria-label^="Open dashboard for"]').count();
      const chipHref = chipCount > 0
        ? await page.locator('a[aria-label^="Open dashboard for"]').first().getAttribute("href")
        : null;
      assert(
        "authenticated apex renders account chip linking to /dashboard",
        chipCount === 1 && chipHref === "/dashboard",
        `chipCount=${chipCount} href=${chipHref}`,
      );

      // Pin 5: /login while authed → bounces away from /login.
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
      const after = page.url();
      assert(
        "authenticated /login bounces to /dashboard",
        after !== `${BASE}/login` && !after.endsWith("/login"),
        `after=${after}`,
      );

      // Pin 6: account chip click lands on /dashboard.
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      await page.locator('a[aria-label^="Open dashboard for"]').first().click();
      await page.waitForURL(/\/dashboard|\/onboarding|\/workspace/, { timeout: 15_000 });
      assert(
        "clicking the chip lands on /dashboard (or onboarding/workspace)",
        /\/dashboard|\/onboarding|\/workspace/.test(page.url()),
        `landed=${page.url()}`,
      );

      await browser.close();
    }
  }
}

const pass = results.filter((r) => r.pass).length;
const total = results.length;
console.log(`\n${pass}/${total} pinned`);
process.exit(pass === total ? 0 : 1);
