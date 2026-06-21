// TIM-2860 reproduction: load /workspace/concept as trent, type into the first
// editable text field, then click the Save button. Capture every PATCH request
// to /api/workspaces/concept including status, response body, and any console
// errors. The goal is to surface the exact failure.

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

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.error("missing supabase env");
  process.exit(2);
}

const REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`[1/6] minting magiclink for ${TARGET_EMAIL}...`);
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: TARGET_EMAIL,
});
if (linkErr) throw linkErr;
const tokenHash = linkData?.properties?.hashed_token;
if (!tokenHash) throw new Error("no token_hash");

console.log("[2/6] exchanging for session...");
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { data: sessData, error: sessErr } = await anon.auth.verifyOtp({
  token_hash: tokenHash,
  type: "magiclink",
});
if (sessErr) throw sessErr;
const session = sessData.session;
if (!session) throw new Error("no session");

const cookieValue = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  token_type: "bearer",
  user: session.user,
});

console.log("[3/6] launching browser, dropping session cookie...");
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
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

const requests = [];
page.on("requestfinished", async (req) => {
  const url = req.url();
  if (!url.includes("/api/workspaces/concept")) return;
  const method = req.method();
  if (method === "GET") return;
  try {
    const resp = await req.response();
    if (!resp) return;
    const status = resp.status();
    let text = "";
    try { text = await resp.text(); } catch {}
    requests.push({ url, method, status, body: text.slice(0, 400) });
    console.log(`  network: ${method} ${url} → ${status}`);
    if (text) console.log(`    body: ${text.slice(0, 200)}`);
  } catch (e) {
    console.log(`  network: ${method} ${url} → error ${e.message}`);
  }
});

page.on("requestfailed", (req) => {
  if (!req.url().includes("/api/workspaces/concept")) return;
  console.log(`  requestfailed: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
});

const consoleErrs = [];
page.on("console", (msg) => {
  if (msg.type() === "error") {
    consoleErrs.push(msg.text());
    console.log(`  [browser error] ${msg.text()}`);
  }
});
page.on("pageerror", (err) => {
  consoleErrs.push(String(err));
  console.log(`  [page error] ${err.message}`);
});

mkdirSync("scripts/shots", { recursive: true });

console.log("[4/6] loading /workspace/concept...");
const res = await page.goto(`${PROD_URL}/workspace/concept`, { waitUntil: "domcontentloaded" });
console.log(`  status ${res?.status()}  url=${page.url()}`);
if (page.url().includes("/login") || page.url().includes("/auth")) {
  console.error("  redirected to login — auth cookie not accepted");
  process.exit(1);
}
await page.waitForLoadState("networkidle").catch(() => {});

console.log("[5/6] editing the shop_identity input (already populated, renders as <input>)...");
// Concept editor:
//   - Empty multiline fields render as a <p> emptyPrompt (no textarea) until activated.
//   - shop_identity is non-multiline → <input>, hydrated from coffee_shop_plans.plan_name.
// Easiest reliable edit point: the shop_identity input.
const sid = page.locator("#concept-shop_identity");
const sidCount = await sid.count();
console.log(`  #concept-shop_identity inputs: ${sidCount}`);
if (sidCount === 0) {
  await page.screenshot({ path: "scripts/shots/tim2860-no-shop-identity.png", fullPage: true });
  console.error("  #concept-shop_identity not found");
  const inputCount = await page.locator("input").count();
  const taCount2 = await page.locator("textarea").count();
  console.log(`  inputs total: ${inputCount}, textareas total: ${taCount2}`);
  await browser.close();
  process.exit(1);
}
await sid.scrollIntoViewIfNeeded();
await sid.click();
const currentValue = await sid.inputValue();
const stamp = `${currentValue.replace(/ — save-probe.*$/, "")} — save-probe ${new Date().toISOString()}`;
await sid.fill(stamp);
console.log(`  set shop_identity to: ${stamp.slice(0,80)}…`);

// Wait briefly so debounced autosave can fire too, then click manual Save.
await page.waitForTimeout(900);
console.log("  clicking Save button...");
const saveBtn = page.getByRole("button", { name: /^Save$/ });
const saveCount = await saveBtn.count();
console.log(`  Save buttons matched: ${saveCount}`);
if (saveCount > 0) {
  await saveBtn.first().click({ force: true });
}
await page.waitForTimeout(3000);

// Capture state: SaveIndicator text
const indicatorText = await page.locator("body").innerText().catch(() => "");
const hint = indicatorText.match(/(Saved [^\n]{0,40}|Could not save[^\n]*|Save failed[^\n]*|saving[^\n]*|Unsaved[^\n]*)/i)?.[0];
console.log(`  indicator hint: ${hint ?? "(none matched)"}`);

await page.screenshot({ path: "scripts/shots/tim2860-after-save.png", fullPage: true });

console.log("\n[6/6] summary:");
console.log(JSON.stringify({ requests, consoleErrs: consoleErrs.slice(0, 5), indicatorHint: hint }, null, 2));

await browser.close();
process.exit(0);
