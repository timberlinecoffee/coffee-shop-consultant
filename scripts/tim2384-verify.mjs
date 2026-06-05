// TIM-2384 prod verify: confirm groundwork.cafe/account renders the
// SettingsShell (TIM-1911) — not the old single-page Account Settings layout.
//
// Method: mint a session via service-role generateLink + verifyOtp, inject
// the @supabase/ssr cookie (base64- chunked) into a Playwright context, hit
// /account, assert the tabbed shell markers exist and the old h1 does not.
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import fs from "node:fs";

function parseEnvFile(path) {
  const out = {};
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    v = v.replace(/\\n$/, "").replace(/\n$/, "").trim();
    out[m[1]] = v;
  }
  return out;
}
const env = parseEnvFile(new URL("../.env.local", import.meta.url).pathname);
const BASE = process.env.PROD_URL || "https://groundwork.cafe";
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !ANON || !SERVICE) {
  console.error("env missing");
  process.exit(2);
}

let failures = 0;
function assert(label, cond, detail = "") {
  console.log(`[${cond ? "PASS" : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const admin = createClient(SUPABASE_URL, SERVICE);
const TS = Date.now();
const EMAIL = `tim2384+${TS}@verify.local`;
const { data: u, error: ue } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: `t2384_${TS}`,
  email_confirm: true,
});
if (ue) { console.error("createUser failed", ue); process.exit(2); }
const uid = u.user.id;
await admin.from("users").update({
  subscription_status: "active",
  subscription_tier: "starter",
  onboarding_completed: true,
}).eq("id", uid);
console.log("[prov] uid", uid);

const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: EMAIL,
});
if (linkErr || !linkData?.properties?.hashed_token) {
  console.error("generateLink failed", linkErr); process.exit(2);
}
const anon = createClient(SUPABASE_URL, ANON, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({
  type: "magiclink", token_hash: linkData.properties.hashed_token,
});
if (otpErr || !otpData?.session) {
  console.error("verifyOtp failed", otpErr); process.exit(2);
}

const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
const storageKey = `sb-${projectRef}-auth-token`;
const payload = JSON.stringify(otpData.session);
const b64 = Buffer.from(payload, "utf8")
  .toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fullValue = `base64-${b64}`;
const MAX = 3180;
const host = new URL(BASE).hostname;
const baseCookie = { domain: host, path: "/", httpOnly: false, sameSite: "Lax", secure: true };
const cookies = [];
if (fullValue.length <= MAX) {
  cookies.push({ ...baseCookie, name: storageKey, value: fullValue });
} else {
  let i = 0, pos = 0;
  while (pos < fullValue.length) {
    cookies.push({ ...baseCookie, name: `${storageKey}.${i}`, value: fullValue.slice(pos, pos + MAX) });
    pos += MAX; i += 1;
  }
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: false, viewport: { width: 1440, height: 900 } });
await ctx.addCookies(cookies);
const page = await ctx.newPage();

console.log(`\n=== ${BASE}/account ===`);
const resp = await page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
assert("/account responds 200 (no auth redirect)", resp?.status() === 200, `status=${resp?.status()}`);

await page.waitForLoadState("networkidle").catch(() => {});

const h1Settings = await page.locator('h1', { hasText: /^Settings$/ }).count();
const h1Old = await page.locator('h1', { hasText: /^Account Settings$/ }).count();
const navShell = await page.locator('nav[aria-label="Settings categories"]').count();
const tabBilling = await page.locator('nav[aria-label="Settings categories"] button', { hasText: /^Billing$/ }).count();
const tabLocalization = await page.locator('nav[aria-label="Settings categories"] button', { hasText: /^Localization$/ }).count();

assert('SettingsShell h1 "Settings" present', h1Settings === 1, `count=${h1Settings}`);
assert('OLD h1 "Account Settings" NOT present', h1Old === 0, `count=${h1Old}`);
assert('Settings left-rail nav present', navShell === 1, `count=${navShell}`);
assert('Localization tab present', tabLocalization === 1);
assert('Billing tab present', tabBilling === 1);

// Click Billing tab → assert BillingTab content (not Stripe portal redirect).
if (tabBilling === 1) {
  await page.locator('nav[aria-label="Settings categories"] button', { hasText: /^Billing$/ }).first().click();
  await page.waitForTimeout(400);
  const url = page.url();
  assert("Billing tab stays on /account (no Stripe portal redirect)",
    url.startsWith(`${BASE}/account`), `url=${url}`);
}

// Screenshot for evidence.
await page.screenshot({ path: "/tmp/tim2384-account.png", fullPage: true });
console.log("[shot] /tmp/tim2384-account.png");

await browser.close();

// Cleanup.
await admin.auth.admin.deleteUser(uid).catch(() => {});

console.log(`\n${failures === 0 ? "ALL CHECKS PASS" : `${failures} FAIL`}`);
process.exit(failures === 0 ? 0 : 1);
