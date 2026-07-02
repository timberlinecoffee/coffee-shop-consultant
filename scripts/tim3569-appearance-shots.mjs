#!/usr/bin/env node
// TIM-3569: Prod evidence for the Appearance tab (theme selector).
// Target: groundwork.cafe (production, commit 2011a404).
// Pattern: cookie-injection auth (TIM-2902) via magiclink → verifyOtp (TIM-3559).
//
// Shots:
//   S1 — /settings → Appearance, Light selected (default state)
//   S2 — /settings → Appearance, Dark selected
//   S3 — /settings → Appearance, Auto selected
//   S4 — /account (dashboard) rendered in Dark mode
//   S5 — /workspace/business-plan rendered in Dark mode
//
// DOM assertions on each shot:
//   - <html> has the expected class ("dark" or absent) matching the mode
//   - <html> data-theme attribute matches the selected mode

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.SUPABASE_NEW_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_NEW_SECRET_KEY;
const PROD_URL = "https://groundwork.cafe";
const HOST = new URL(PROD_URL).host;
const REF = new URL(SUPABASE_URL).hostname.split(".")[0];

if (!SUPABASE_URL || !PUBLISHABLE || !SECRET) {
  console.error("Missing SUPABASE_URL / SUPABASE_NEW_PUBLISHABLE_KEY / SUPABASE_NEW_SECRET_KEY");
  process.exit(1);
}

const OUT = "scripts/screenshots/tim3569";
mkdirSync(OUT, { recursive: true });
const shot = (n) => `${OUT}/${n}.png`;

const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(SUPABASE_URL, PUBLISHABLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = "tim3569";
const password = "Test-Password-A1b2C3!";
const email = `${stamp}-${Math.random().toString(36).slice(2, 8)}@test.timberline.local`;

console.log(`[1/6] create synth user ${email}`);
const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (userErr) throw userErr;
const uid = userRes.user.id;

console.log("[2/6] seed plan + subscription");
const { data: planRow, error: planErr } = await admin
  .from("coffee_shop_plans")
  .insert({ user_id: uid, plan_name: "Groundwater Coffee", status: "in_progress" })
  .select("id")
  .single();
if (planErr) throw planErr;
const planId = planRow.id;

await admin.from("users").upsert({
  id: uid,
  email,
  subscription_status: "active",
  subscription_tier: "pro",
  onboarding_completed: true,
  current_plan_id: planId,
});

console.log("[3/6] mint magiclink + exchange for session");
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
});
if (linkErr) throw linkErr;
const tokenHash = linkData?.properties?.hashed_token;
if (!tokenHash) throw new Error("no token_hash from generateLink");
const { data: sessData, error: sessErr } = await anon.auth.verifyOtp({
  token_hash: tokenHash,
  type: "magiclink",
});
if (sessErr) throw sessErr;
const session = sessData.session;
if (!session) throw new Error("no session after verifyOtp");
const cookieValue = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  token_type: "bearer",
  user: session.user,
});

console.log("[4/6] launch browser");
const LD = "/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu";
const browser = await chromium.launch({
  env: { ...process.env, LD_LIBRARY_PATH: `${LD}:${process.env.LD_LIBRARY_PATH ?? ""}` },
});

async function newSignedInPage(themeSeed) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await ctx.addCookies([
    {
      name: "gw_consent",
      value: encodeURIComponent(JSON.stringify({
        version: 1, analytics: false, marketing: false,
        decidedAt: new Date(Date.now() - 1000).toISOString(),
      })),
      domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax",
    },
    {
      name: `sb-${REF}-auth-token`,
      value: cookieValue,
      domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax",
    },
  ]);
  await ctx.addInitScript(({ mode }) => {
    if (mode) {
      try { localStorage.setItem("gw-theme", mode); } catch {}
    }
    const s = document.createElement("style");
    s.textContent = "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-overlay]{display:none!important}";
    document.head?.appendChild(s);
  }, { mode: themeSeed ?? null });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function readThemeState(page) {
  return page.evaluate(() => ({
    className: document.documentElement.className,
    hasDark: document.documentElement.classList.contains("dark"),
    dataTheme: document.documentElement.dataset.theme ?? null,
    storedTheme: (() => { try { return localStorage.getItem("gw-theme"); } catch { return null; } })(),
  }));
}

async function gotoSettingsAppearance(page) {
  await page.goto(`${PROD_URL}/account`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("load", { timeout: 30000 });
  await page.waitForSelector("h1:has-text('Settings')", { timeout: 20000 });
  await page.click("button:has-text('Appearance')");
  await page.waitForSelector("text=Choose how Groundwork looks", { timeout: 10000 });
  await page.waitForTimeout(500);
}

const results = [];

// S1: Light — seed localStorage, load, screenshot
{
  console.log("[5/6] shot 1: /settings Light");
  const { ctx, page } = await newSignedInPage("light");
  await gotoSettingsAppearance(page);
  const st = await readThemeState(page);
  console.log("  state:", st);
  if (st.hasDark) throw new Error(`Light selected but html has .dark class: ${st.className}`);
  if (st.dataTheme !== "light") throw new Error(`Light expected data-theme=light, got ${st.dataTheme}`);
  await page.screenshot({ path: shot("01-settings-appearance-light"), fullPage: false });
  results.push({ name: "light", ...st });
  await ctx.close();
}

// S2: Dark — seed and confirm .dark class applies pre-hydration
{
  console.log("shot 2: /settings Dark");
  const { ctx, page } = await newSignedInPage("dark");
  await gotoSettingsAppearance(page);
  const st = await readThemeState(page);
  console.log("  state:", st);
  if (!st.hasDark) throw new Error(`Dark selected but html missing .dark: ${st.className}`);
  if (st.dataTheme !== "dark") throw new Error(`Dark expected data-theme=dark, got ${st.dataTheme}`);
  await page.screenshot({ path: shot("02-settings-appearance-dark"), fullPage: false });
  results.push({ name: "dark", ...st });
  await ctx.close();
}

// S3: Auto — mock prefers-color-scheme = dark; verify class applies
{
  console.log("shot 3: /settings Auto (prefers-color-scheme: dark)");
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  await ctx.addCookies([
    {
      name: "gw_consent",
      value: encodeURIComponent(JSON.stringify({
        version: 1, analytics: false, marketing: false,
        decidedAt: new Date(Date.now() - 1000).toISOString(),
      })),
      domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax",
    },
    {
      name: `sb-${REF}-auth-token`,
      value: cookieValue,
      domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax",
    },
  ]);
  await ctx.addInitScript(() => {
    try { localStorage.setItem("gw-theme", "auto"); } catch {}
    const s = document.createElement("style");
    s.textContent = "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-overlay]{display:none!important}";
    document.head?.appendChild(s);
  });
  const page = await ctx.newPage();
  await gotoSettingsAppearance(page);
  const st = await readThemeState(page);
  console.log("  state:", st);
  if (st.dataTheme !== "auto") throw new Error(`Auto expected data-theme=auto, got ${st.dataTheme}`);
  if (!st.hasDark) throw new Error(`Auto + colorScheme=dark expected .dark, got ${st.className}`);
  await page.screenshot({ path: shot("03-settings-appearance-auto-dark-system"), fullPage: false });
  results.push({ name: "auto-dark-system", ...st });
  await ctx.close();
}

// S4: /account with Dark selected — verify chrome renders as dark
{
  console.log("shot 4: /account dark chrome");
  const { ctx, page } = await newSignedInPage("dark");
  await page.goto(`${PROD_URL}/account`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("load", { timeout: 30000 });
  await page.waitForSelector("h1:has-text('Settings')", { timeout: 20000 });
  await page.waitForTimeout(500);
  const st = await readThemeState(page);
  if (!st.hasDark) throw new Error(`/account dark expected .dark, got ${st.className}`);
  await page.screenshot({ path: shot("04-account-dashboard-dark"), fullPage: true });
  results.push({ name: "account-dark", ...st });
  await ctx.close();
}

// S5: /workspace/business-plan with Dark selected — one workspace surface
{
  console.log("shot 5: /workspace/business-plan dark");
  const { ctx, page } = await newSignedInPage("dark");
  await page.goto(`${PROD_URL}/workspace/business-plan`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("load", { timeout: 30000 });
  await page.waitForTimeout(2000);
  const st = await readThemeState(page);
  if (!st.hasDark) throw new Error(`workspace dark expected .dark, got ${st.className}`);
  await page.screenshot({ path: shot("05-workspace-business-plan-dark"), fullPage: false });
  results.push({ name: "workspace-dark", ...st });
  await ctx.close();
}

console.log("[6/6] cleanup");
await browser.close();

console.log("---");
console.log(JSON.stringify(results, null, 2));
console.log(`✓ 5 shots written to ${OUT}/`);
