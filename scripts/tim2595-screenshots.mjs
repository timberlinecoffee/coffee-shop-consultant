#!/usr/bin/env node
/**
 * TIM-2595 — Screenshot capture for PR verification
 *
 * Authenticates by injecting @supabase/ssr-format cookies directly, then captures:
 *   - v1 desktop + mobile: /workspace/buildout-equipment?ui=v1
 *   - v2 desktop + mobile: /workspace/build?tab=equipment&ui=v2
 *   - v2 build nav desktop + mobile: /workspace/build?ui=v2
 *
 * Usage:
 *   node scripts/tim2595-screenshots.mjs [base-url]
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const SHOTS_DIR = join(__dirname, "shots");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOARD_EMAIL  = "trentrollings@gmail.com";

// @supabase/ssr 0.10.x: cookie key is sb-{project-ref}-auth-token
// Project ref extracted from Supabase URL: https://{ref}.supabase.co
const PROJECT_REF = SUPABASE_URL.replace("https://", "").split(".")[0];
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

// Mirror of @supabase/ssr's BASE64_PREFIX + stringToBase64URL (custom base64url)
const TO_BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split("");

function stringToBase64URL(str) {
  // UTF-8 encode then base64url encode (matching @supabase/ssr's implementation)
  const bytes = Buffer.from(str, "utf8");
  let base64 = bytes.toString("base64");
  // Convert standard base64 to base64url (no padding, +→-, /→_)
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function main() {
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Project ref: ${PROJECT_REF}, Storage key: ${STORAGE_KEY}`);

  // Step 1: Generate a fresh magic link token
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: BOARD_EMAIL,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error("generateLink failed:", linkErr);
    process.exit(1);
  }

  // Step 2: Exchange hashed_token for a real session via verifyOtp
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, flowType: "implicit" },
  });
  const { data: sessionData, error: otpErr } = await anonClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (otpErr || !sessionData?.session) {
    console.error("verifyOtp failed:", otpErr);
    process.exit(1);
  }

  const session = sessionData.session;
  console.log(`Session obtained for: ${sessionData.user?.email}, expires_at: ${session.expires_at}`);

  // Step 3: Encode the session JSON in @supabase/ssr 0.10.x format:
  // value = "base64-" + base64url(JSON.stringify(session))
  const sessionJSON = JSON.stringify(session);
  const encoded = "base64-" + stringToBase64URL(sessionJSON);
  console.log(`Encoded session length: ${encoded.length} chars (${sessionJSON.length} raw)`);

  // Step 4: Set cookies in Playwright context
  const cookies = [
    {
      name: STORAGE_KEY,
      value: encoded,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ];

  const captures = [
    { label: "v1-desktop",           url: `${BASE_URL}/workspace/buildout-equipment?ui=v1`, viewport: { width: 1280, height: 800 } },
    { label: "v1-mobile",            url: `${BASE_URL}/workspace/buildout-equipment?ui=v1`, viewport: { width: 375, height: 812 } },
    { label: "v2-desktop",           url: `${BASE_URL}/workspace/build?tab=equipment&ui=v2`, viewport: { width: 1280, height: 800 } },
    { label: "v2-mobile",            url: `${BASE_URL}/workspace/build?tab=equipment&ui=v2`, viewport: { width: 375, height: 812 } },
    { label: "v2-desktop-build-nav", url: `${BASE_URL}/workspace/build?ui=v2`,              viewport: { width: 1280, height: 800 } },
    { label: "v2-mobile-build-nav",  url: `${BASE_URL}/workspace/build?ui=v2`,              viewport: { width: 375, height: 812 } },
  ];

  const browser = await chromium.launch({ headless: true });

  for (const { label, url, viewport } of captures) {
    console.log(`Capturing ${label} @ ${url}`);
    const ctx = await browser.newContext({ viewport });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);
      const landed = page.url();
      console.log(`  Landed: ${landed}`);
      if (landed.includes("/login")) {
        console.warn(`  WARNING: still on login page — auth cookie not accepted`);
      }
      const path = join(SHOTS_DIR, `tim2595-${label}.png`);
      await page.screenshot({ path, fullPage: false });
      console.log(`  Saved: ${path}`);
    } catch (e) {
      console.error(`  Error capturing ${label}:`, e.message);
    } finally {
      await ctx.close();
    }
  }

  await browser.close();
  console.log("Done.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
