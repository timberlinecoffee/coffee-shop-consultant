// TIM-2917: Repro "Add Item button does nothing" on the live demo persona
// (trent@simpler.coffee) at groundwork.cafe. Just looks at the menu-pricing
// workspace, finds the Add button, clicks it, and captures network + console.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
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
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_URL = "https://groundwork.cafe";
const HOST = new URL(PROD_URL).host;
const TARGET_EMAIL = "trent@simpler.coffee";

const REF = new URL(SUPABASE_URL).hostname.split(".")[0];

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`[1] minting magiclink for ${TARGET_EMAIL}...`);
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: TARGET_EMAIL,
});
if (linkErr) throw linkErr;
const tokenHash = linkData?.properties?.hashed_token;
if (!tokenHash) throw new Error("no token_hash");

const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { data: sessData, error: sessErr } = await anon.auth.verifyOtp({
  token_hash: tokenHash,
  type: "magiclink",
});
if (sessErr) throw sessErr;
const session = sessData.session;

const cookieValue = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  token_type: "bearer",
  user: session.user,
});

console.log("[2] launching browser...");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.addCookies([
  {
    name: `sb-${REF}-auth-token`,
    value: cookieValue,
    domain: HOST,
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  },
]);

const page = await ctx.newPage();
const consoleMessages = [];
const networkPosts = [];
const networkErrors = [];

page.on("console", (msg) => {
  consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  if (msg.type() === "error" || msg.type() === "warning") {
    console.log(`  [browser ${msg.type()}] ${msg.text()}`);
  }
});

page.on("pageerror", (err) => {
  console.log(`  [pageerror] ${err.message}`);
  consoleMessages.push(`[pageerror] ${err.message}\n${err.stack || ""}`);
});

page.on("request", (req) => {
  if (req.method() === "POST" && req.url().includes("/api/")) {
    networkPosts.push(`POST ${req.url()}`);
    console.log(`  → POST ${req.url()}`);
  }
});

page.on("response", (res) => {
  if (res.url().includes("/api/") && res.status() >= 400) {
    networkErrors.push(`${res.status()} ${res.url()}`);
    console.log(`  ← ${res.status()} ${res.url()}`);
  }
});

mkdirSync("scripts/shots", { recursive: true });

console.log("[3] loading /workspace/menu-pricing...");
const r = await page.goto(`${PROD_URL}/workspace/menu-pricing`, { waitUntil: "domcontentloaded" });
console.log(`  status ${r?.status()}  url=${page.url()}`);

await page.waitForLoadState("networkidle").catch(() => {});

const acceptBtn = page.getByRole("button", { name: /^Accept All$/ });
if (await acceptBtn.first().isVisible().catch(() => false)) {
  await acceptBtn.first().click();
  console.log("  dismissed cookie banner");
  await page.waitForTimeout(300);
}

await page.screenshot({ path: "scripts/shots/tim2917-menu-before.png", fullPage: true });
console.log("[4] screenshot before click saved");

const itemsBefore = await page.locator('input[placeholder*="Item name" i], input[aria-label*="Item name" i]').count();
console.log(`  items rendered before click: ${itemsBefore}`);

// "+ Add" button in each CategoryHeader (lines 2556-2565 of menu-workspace.tsx)
const addButtons = page.getByRole("button", { name: /^Add$/ });
const addCount = await addButtons.count();
console.log(`[5] found ${addCount} "+ Add" buttons (per category header)`);

if (addCount === 0) {
  console.log("  ✗ no Add buttons rendered — categories may be empty");
  // Fall back to any add control
  const allBtns = await page.locator('button').allTextContents();
  console.log("  available buttons:", allBtns.slice(0, 30).map(s => s.trim().slice(0, 40)));
  await page.screenshot({ path: "scripts/shots/tim2917-no-add-button.png", fullPage: true });
  await browser.close();
  process.exit(1);
}

const firstAdd = addButtons.first();
await firstAdd.scrollIntoViewIfNeeded();
await page.screenshot({ path: "scripts/shots/tim2917-add-button-visible.png", fullPage: false });

console.log("[6] clicking first Add button...");
const beforeClickTs = Date.now();
await firstAdd.click();
await page.waitForTimeout(1500);

console.log(`  POST calls observed: ${networkPosts.length}`);
networkPosts.forEach(p => console.log(`    ${p}`));
console.log(`  4xx/5xx errors: ${networkErrors.length}`);
networkErrors.forEach(e => console.log(`    ${e}`));

const itemsAfter = await page.locator('input[placeholder*="Item name" i], input[aria-label*="Item name" i]').count();
console.log(`  items rendered after click: ${itemsAfter} (delta ${itemsAfter - itemsBefore})`);

await page.screenshot({ path: "scripts/shots/tim2917-menu-after-click.png", fullPage: true });

const errorPosts = consoleMessages.filter(m => m.toLowerCase().includes("error"));
if (errorPosts.length) {
  console.log("[7] error console messages:");
  errorPosts.slice(0, 10).forEach(m => console.log(`  ${m}`));
}

await browser.close();

if (itemsAfter > itemsBefore) {
  console.log("\n=> PASS: Add Item works (item count increased)");
  process.exit(0);
} else {
  console.log("\n=> FAIL: clicking Add did NOT add an item");
  process.exit(1);
}
