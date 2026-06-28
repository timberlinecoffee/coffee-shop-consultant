#!/usr/bin/env node
// TIM-3368: capture 375px live prod shots of new Menu tab + SidebarV2 drawer.
// Auth pattern: synthetic Pro user via SUPABASE_NEW_SECRET_KEY (per TIM-3273 pattern).
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

process.env.LD_LIBRARY_PATH = [
  "/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu",
  process.env.LD_LIBRARY_PATH || "",
]
  .filter(Boolean)
  .join(":");

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "screenshots", "tim3368");
mkdirSync(OUT_DIR, { recursive: true });

const BASE = "https://groundwork.cafe";
const PROJECT_REF = "ltmcttjftxzpgynhnrpg";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const COOKIE_DOMAIN = ".groundwork.cafe";

const SECRET = process.env.SUPABASE_NEW_SECRET_KEY;
const PUBLISHABLE = process.env.SUPABASE_NEW_PUBLISHABLE_KEY;
if (!SECRET || !PUBLISHABLE) {
  console.error("missing SUPABASE_NEW_SECRET_KEY / SUPABASE_NEW_PUBLISHABLE_KEY");
  process.exit(1);
}

const SYN_EMAIL = `tim3368+${Date.now()}@timberline.coffee`;
const SYN_PASSWORD = "Tim3368Verify!";

const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`[tim3368] create synthetic user ${SYN_EMAIL}`);
const created = await admin.auth.admin.createUser({
  email: SYN_EMAIL,
  password: SYN_PASSWORD,
  email_confirm: true,
});
if (created.error) throw created.error;
const userId = created.data.user.id;

// Pro tier + onboarding_completed (per dashboard redirect rule).
const { error: uErr } = await admin
  .from("users")
  .update({
    subscription_status: "active",
    subscription_tier: "pro",
    onboarding_completed: true,
  })
  .eq("id", userId);
if (uErr) throw uErr;

// Need at least one plan so workspace pages render properly.
const { data: plan, error: pErr } = await admin
  .from("coffee_shop_plans")
  .insert({ user_id: userId, plan_name: "TIM-3368 Verify", status: "in_progress" })
  .select("id")
  .single();
if (pErr) throw pErr;
console.log(`[tim3368] seeded plan ${plan.id}`);

await admin
  .from("users")
  .update({ current_plan_id: plan.id })
  .eq("id", userId);

// Sign in to capture session.
const anon = createClient(SUPABASE_URL, PUBLISHABLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: signin, error: sErr } = await anon.auth.signInWithPassword({
  email: SYN_EMAIL,
  password: SYN_PASSWORD,
});
if (sErr || !signin.session) throw sErr ?? new Error("no session");
const session = signin.session;

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
const base = {
  domain: COOKIE_DOMAIN,
  path: "/",
  httpOnly: false,
  secure: true,
  sameSite: "Lax",
  expires: Math.floor(Date.now() / 1000) + 3600,
};
const authCookies = [];
if (tokenJson.length <= CHUNK) {
  authCookies.push({ name: baseName, value: tokenJson, ...base });
} else {
  let i = 0;
  for (let start = 0; start < tokenJson.length; start += CHUNK) {
    authCookies.push({ name: `${baseName}.${i}`, value: tokenJson.slice(start, start + CHUNK), ...base });
    i++;
  }
}
console.log(`[tim3368] prepared ${authCookies.length} auth cookies`);

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/briefli/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome",
});
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  hasTouch: true,
  isMobile: true,
});
await ctx.addCookies([
  ...authCookies,
  // Pre-decided cookie consent so banner does not cover the bottom nav.
  {
    name: "gw_consent",
    value: encodeURIComponent(
      JSON.stringify({
        version: 1,
        analytics: false,
        marketing: false,
        decidedAt: new Date(0).toISOString(),
      })
    ),
    domain: COOKIE_DOMAIN,
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
  },
]);

const page = await ctx.newPage();
await page.goto(`${BASE}/workspace/concept`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(800);
console.log(`[tim3368] landed on: ${page.url()}`);

// Shot 1: full-viewport (shows 6-tab bottom nav with Menu).
const shot1 = resolve(OUT_DIR, "01-bottom-nav-6-tabs-375px.png");
await page.screenshot({ path: shot1, fullPage: false });
console.log(`[tim3368] shot 1 → ${shot1}`);

const nav = page.locator('nav[aria-label="Main navigation"].fixed.bottom-0');
await nav.waitFor({ state: "visible", timeout: 10000 });
const shot1b = resolve(OUT_DIR, "01b-bottom-nav-tight-375px.png");
await nav.screenshot({ path: shot1b });
console.log(`[tim3368] shot 1b → ${shot1b}`);

// Tap Menu.
const menuBtn = page.getByRole("button", { name: "Open navigation menu" });
await menuBtn.waitFor({ state: "visible", timeout: 5000 });
await menuBtn.tap();
await page.waitForTimeout(700);

const shot2 = resolve(OUT_DIR, "02-sidebar-drawer-open-375px.png");
await page.screenshot({ path: shot2, fullPage: false });
console.log(`[tim3368] shot 2 → ${shot2}`);

await browser.close();
console.log(`[tim3368] cleanup synthetic user ${userId}`);
const del = await admin.auth.admin.deleteUser(userId);
if (del.error) console.warn(`! cleanup failed: ${del.error.message}`);
console.log("[tim3368] DONE");
