/**
 * TIM-2593 — Capture before/after dashboard screenshots for QA sign-off.
 *
 * Produces 4 PNG files in scripts/screenshots/:
 *   dashboard-v1-desktop.png   1280×900
 *   dashboard-v1-mobile.png     375×812
 *   dashboard-v2-desktop.png   1280×900
 *   dashboard-v2-mobile.png     375×812
 *
 * Run from the project root:
 *   node scripts/screenshot-dashboard.mjs
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots");

const SUPABASE_URL = "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bWN0dGpmdHh6cGd5bmhucnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTA4NjcsImV4cCI6MjA5MTk2Njg2N30.EUgFAKZSbWRZmJBTHdX9E0oEQDOVjzf39ynDH7Fs5Ok";
const SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bWN0dGpmdHh6cGd5bmhucnBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjM5MDg2NywiZXhwIjoyMDkxOTY2ODY3fQ.HsIx2BzWVKeZQYG8-VY74fEqasQuoFcRcroh34MHl7c";

const DEMO_USER_ID = "11111111-1111-1111-1111-111111111111";
const DEMO_EMAIL = "demo.owner@timberline.coffee";
const DEMO_PASSWORD = "Screenshot2593!";

const BASE_URL = "http://localhost:3000";
const PROJECT_REF = "ltmcttjftxzpgynhnrpg";

async function getSession() {
  // Step 1: set a known password via admin so we can sign in
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: updateErr } = await admin.auth.admin.updateUserById(
    DEMO_USER_ID,
    { password: DEMO_PASSWORD }
  );
  if (updateErr) {
    console.error("Failed to set demo password:", updateErr.message);
    throw updateErr;
  }

  // Step 2: sign in with email/password to get a real session
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error: signInErr } = await anon.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (signInErr || !data.session) {
    console.error("Sign-in failed:", signInErr?.message);
    throw signInErr ?? new Error("No session returned");
  }
  return data.session;
}

function buildAuthCookies(session, domain) {
  // @supabase/ssr splits the token JSON into 4096-byte chunks named
  // sb-<ref>-auth-token.0, .1, ... and a base cookie sb-<ref>-auth-token.
  // The server-side client (createServerClient) reads the chunked form.
  const tokenJson = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: "bearer",
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    user: session.user,
  });

  const baseName = `sb-${PROJECT_REF}-auth-token`;
  const CHUNK = 4096;
  const cookies = [];

  const base = {
    domain,
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
    // 1 hour
    expires: Math.floor(Date.now() / 1000) + 3600,
  };

  if (tokenJson.length <= CHUNK) {
    cookies.push({ name: baseName, value: tokenJson, ...base });
  } else {
    let i = 0;
    for (let start = 0; start < tokenJson.length; start += CHUNK) {
      cookies.push({
        name: `${baseName}.${i}`,
        value: tokenJson.slice(start, start + CHUNK),
        ...base,
      });
      i++;
    }
  }
  return cookies;
}

async function capture(page, viewport, uiFlag, label) {
  await page.setViewportSize(viewport);

  // set override cookie — this persists across navigations
  await page.context().addCookies([
    {
      name: "gw_ui_revamp_override",
      value: uiFlag,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);

  await page.goto(`${BASE_URL}/dashboard`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  // Wait for meaningful content (not the loading skeleton)
  await page
    .locator("main, [data-testid='dashboard'], h1, .min-h-screen")
    .first()
    .waitFor({ state: "visible", timeout: 15000 });

  const path = join(OUT_DIR, `${label}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log(`  ✓ ${label}.png`);
  return path;
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("→ Authenticating demo user…");
  const session = await getSession();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // inject auth cookies
  const authCookies = buildAuthCookies(session, "localhost");
  await context.addCookies(authCookies);

  const page = await context.newPage();

  console.log("→ Capturing screenshots…");

  const shots = [
    { uiFlag: "v1", viewport: { width: 1280, height: 900 }, label: "dashboard-v1-desktop" },
    { uiFlag: "v1", viewport: { width: 375,  height: 812 }, label: "dashboard-v1-mobile"  },
    { uiFlag: "v2", viewport: { width: 1280, height: 900 }, label: "dashboard-v2-desktop" },
    { uiFlag: "v2", viewport: { width: 375,  height: 812 }, label: "dashboard-v2-mobile"  },
  ];

  for (const s of shots) {
    await capture(page, s.viewport, s.uiFlag, s.label);
  }

  await browser.close();
  console.log(`\nAll screenshots saved to ${OUT_DIR}`);
}

run().catch((err) => {
  console.error("Screenshot script failed:", err);
  process.exit(1);
});
