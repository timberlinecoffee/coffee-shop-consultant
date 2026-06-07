#!/usr/bin/env node
// TIM-2436: capture the four required screenshots on live prod with an
// authenticated session (trent@simpler.coffee).
//
//   1. Default chat panel (simplified header), drawer closed         — desktop
//   2. "Past chats" trigger hover state                              — desktop
//   3. Past Chats Drawer open, threads visible                       — desktop
//   4. Past Chats Drawer open on mobile width (375)                  — mobile
//
// Auth flow mirrors scripts/tim2436-prod-verify.mjs (Supabase magiclink
// → verifyOtp → base64 cookie injection).

import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

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
  } catch {}
  return out;
}

const env = { ...process.env, ...loadEnv(join(repoRoot, ".env.local")) };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.VERIFY_BASE_URL ?? "https://groundwork.cafe";
const FIXTURE_EMAIL = process.env.VERIFY_EMAIL ?? "trent@simpler.coffee";
const OUT_DIR = join(repoRoot, "verify-tim2436");
mkdirSync(OUT_DIR, { recursive: true });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function mintSessionCookies() {
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({ type: "magiclink", email: FIXTURE_EMAIL });
  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${linkError?.message}`);
  }
  const anon = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: otpData, error: otpError } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (otpError || !otpData?.session) {
    throw new Error(`verifyOtp failed: ${otpError?.message}`);
  }
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const payload = JSON.stringify(otpData.session);
  const b64 = Buffer.from(payload, "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fullValue = `base64-${b64}`;
  const MAX = 3180;
  const cookies = [];
  const domain = new URL(BASE).hostname;
  const baseCookie = { domain, path: "/", httpOnly: false, secure: true, sameSite: "Lax" };
  if (fullValue.length <= MAX) {
    cookies.push({ ...baseCookie, name: storageKey, value: fullValue });
  } else {
    let i = 0, pos = 0;
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
  return cookies;
}

async function shoot() {
  const cookies = await mintSessionCookies();
  const browser = await chromium.launch();

  // ── Desktop (1440×900) ────────────────────────────────────────────────────
  const desk = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await desk.addCookies(cookies);
  const page = await desk.newPage();
  await page.goto(`${BASE}/workspace/financials`, { waitUntil: "networkidle", timeout: 60_000 });
  // Dismiss consent banner if present.
  await page.evaluate(() => {
    document
      .querySelectorAll('button')
      .forEach((b) => /accept all|got it|dismiss/i.test(b.textContent ?? "") && b.click());
  });
  await page.waitForTimeout(500);

  // Open Scout: workspace top bar Co-pilot button dispatches workspace-copilot-open.
  await page.evaluate(() => window.dispatchEvent(new Event("workspace-copilot-open")));
  await page.waitForSelector('[data-testid="past-chats-trigger"]', { timeout: 15_000 });
  await page.waitForTimeout(400);

  // 1. Default chat panel, drawer closed.
  await page.screenshot({
    path: join(OUT_DIR, "01-desktop-default-drawer-closed.png"),
    fullPage: false,
  });
  console.log("WROTE 01-desktop-default-drawer-closed.png");

  // 2. Past chats trigger hover.
  await page.hover('[data-testid="past-chats-trigger"]');
  await page.waitForTimeout(200);
  await page.screenshot({
    path: join(OUT_DIR, "02-desktop-past-chats-trigger-hover.png"),
    fullPage: false,
  });
  console.log("WROTE 02-desktop-past-chats-trigger-hover.png");

  // 3. Drawer open.
  await page.click('[data-testid="past-chats-trigger"]');
  await page.waitForSelector('[data-testid="past-chats-drawer"]', { state: "visible", timeout: 6_000 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: join(OUT_DIR, "03-desktop-past-chats-drawer-open.png"),
    fullPage: false,
  });
  console.log("WROTE 03-desktop-past-chats-drawer-open.png");

  await desk.close();

  // ── Mobile (375×800) ──────────────────────────────────────────────────────
  const mob = await browser.newContext({
    viewport: { width: 375, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await mob.addCookies(cookies);
  const mpage = await mob.newPage();
  await mpage.goto(`${BASE}/workspace/financials`, { waitUntil: "networkidle", timeout: 60_000 });
  await mpage.evaluate(() => {
    document
      .querySelectorAll('button')
      .forEach((b) => /accept all|got it|dismiss/i.test(b.textContent ?? "") && b.click());
  });
  await mpage.waitForTimeout(500);
  await mpage.evaluate(() => window.dispatchEvent(new Event("workspace-copilot-open")));
  await mpage.waitForSelector('[data-testid="past-chats-trigger"]', { timeout: 15_000 });
  // The h2 truncate sibling can intercept tap hits on a narrow viewport;
  // fire a synthetic click on the trigger to bypass the hit-test stall.
  await mpage.evaluate(() => {
    const el = document.querySelector('[data-testid="past-chats-trigger"]');
    if (el && el instanceof HTMLElement) el.click();
  });
  await mpage.waitForSelector('[data-testid="past-chats-drawer"]', { state: "visible", timeout: 6_000 });
  await mpage.waitForTimeout(500);
  // 4. Drawer open on mobile (bottom sheet).
  await mpage.screenshot({
    path: join(OUT_DIR, "04-mobile-past-chats-drawer-open.png"),
    fullPage: false,
  });
  console.log("WROTE 04-mobile-past-chats-drawer-open.png");

  await mob.close();
  await browser.close();
}

shoot().then(() => {
  console.log("DONE");
}).catch((err) => {
  console.error("shoot crashed:", err);
  process.exit(1);
});
