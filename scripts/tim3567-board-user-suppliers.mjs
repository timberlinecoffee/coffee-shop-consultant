/**
 * TIM-3567 — screenshot Suppliers-and-Vendors on the board's actual account
 * for the side-by-side comparison against v2 Hiring. Board says v2 Hiring
 * should have "the same layout as the suppliers and vendors that we had
 * before." Suppliers ships with 9 hardcoded categories so the left nav is
 * populated even on a brand-new plan; Hiring uses DB-backed roles so a plan
 * with 0 roles shows "No roles yet."
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots", "tim3567");

const SUPABASE_URL = "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SUPABASE_SECRET = process.env.SUPABASE_NEW_SECRET_KEY;
const SUPABASE_PUBLISHABLE = process.env.SUPABASE_NEW_PUBLISHABLE_KEY;
const BOARD_EMAIL = "trentrollings@gmail.com";
const BASE_URL = "https://groundwork.cafe";
const PROJECT_REF = "ltmcttjftxzpgynhnrpg";
const COOKIE_DOMAIN = ".groundwork.cafe";

const CHROMIUM = "/home/briefli/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";
const LD_LIB = "/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu";
process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
  ? `${LD_LIB}:${process.env.LD_LIBRARY_PATH}`
  : LD_LIB;

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getSession() {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: BOARD_EMAIL,
  });
  if (error) throw error;
  const hashed = data?.properties?.hashed_token;
  const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: vd } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: hashed });
  return vd.session;
}

function buildAuthCookies(session, domain) {
  const tokenJson = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: "bearer",
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    user: session.user,
  });
  const encoded = "base64-" + Buffer.from(tokenJson).toString("base64");
  const baseName = `sb-${PROJECT_REF}-auth-token`;
  const CHUNK = 3200;
  const base = { domain, path: "/", httpOnly: false, secure: true, sameSite: "Lax", expires: Math.floor(Date.now() / 1000) + 3600 };
  const cookies = [];
  if (encoded.length <= CHUNK) cookies.push({ name: baseName, value: encoded, ...base });
  else { let i = 0; for (let start = 0; start < encoded.length; start += CHUNK) { cookies.push({ name: `${baseName}.${i}`, value: encoded.slice(start, start + CHUNK), ...base }); i++; } }
  return cookies;
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  const session = await getSession();
  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await ctx.addCookies(buildAuthCookies(session, COOKIE_DOMAIN));
  await ctx.addCookies([{ name: "gw_consent", value: encodeURIComponent(JSON.stringify({ version: 1, analytics: false, marketing: false, decidedAt: new Date().toISOString() })), domain: COOKIE_DOMAIN, path: "/", httpOnly: false, secure: true, sameSite: "Lax", expires: Math.floor(Date.now() / 1000) + 3600 * 24 * 30 }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/workspace/suppliers`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(OUT_DIR, "02-suppliers-vendors-board-user.png"), fullPage: true });
  console.log("suppliers shot saved");
  await browser.close();
}
run().catch(e => { console.error(e); process.exit(1); });
