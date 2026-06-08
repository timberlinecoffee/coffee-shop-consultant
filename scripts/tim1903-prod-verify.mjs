// TIM-1903 prod-verify: provision a synthetic free_trial user with 5 days
// remaining, drive /dashboard, assert TrialBanner renders with correct
// days-left and "Choose your plan" CTA. Then mutate trial_ends_at to <24h and
// re-load to confirm the warning tone + "Last day" copy. Finally simulate
// the trial→active transition by stamping trial_just_converted_to and
// confirm the WelcomeToast renders.
//
// Mirrors the auth-mint recipe used in scripts/tim1956-prod-verify.mjs.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "fs";

const BASE = process.env.PROD_URL || "https://coffee-shop-consultant.vercel.app";
const HOST = new URL(BASE).host;
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !ANON || !SERVICE) {
  console.error("env missing: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
const REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];
mkdirSync("scripts/shots", { recursive: true });

const svc = createClient(SUPABASE_URL, SERVICE);
const TS = Date.now();
const EMAIL = `tim1903+${TS}@verify.local`;
const PW = `t1m1903_${TS}`;
console.log("[prov] email:", EMAIL);

const { data: u, error: ue } = await svc.auth.admin.createUser({
  email: EMAIL, password: PW, email_confirm: true,
});
if (ue) { console.error("createUser failed", ue); process.exit(2); }
const uid = u.user.id;

// Seed as a Starter-bound trialist with 5 days remaining.
const fiveDaysOut = new Date(Date.now() + 5 * 86_400_000).toISOString();
await svc.from("users").update({
  subscription_status: "free_trial",
  subscription_tier: "starter",
  trial_ends_at: fiveDaysOut,
  ai_credits_remaining: 75,
  onboarding_completed: true,
  full_name: "TIM-1903 Verify",
  trial_just_converted_to: null,
}).eq("id", uid);
await svc.from("coffee_shop_plans").insert({ user_id: uid });

const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
});
const link = await linkRes.json();
const tokenHash = link.properties?.hashed_token ?? link.hashed_token;
const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
});
const auth = await verifyRes.json();
if (!auth.access_token) { console.error("verify failed", auth); process.exit(2); }
console.log("[auth] minted session for", auth.user.email);

const cookieValue = JSON.stringify({
  access_token: auth.access_token, refresh_token: auth.refresh_token,
  expires_in: auth.expires_in, expires_at: auth.expires_at,
  token_type: auth.token_type, user: auth.user,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
await ctx.addCookies([
  { name: `sb-${REF}-auth-token`, value: cookieValue, domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax" },
  { name: "gw_consent", value: "1", domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax" },
]);
const page = await ctx.newPage();

const results = [];
async function step(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`[PASS] ${name}`); }
  catch (e) { results.push({ name, ok: false, err: String(e?.message ?? e) }); console.log(`[FAIL] ${name} → ${e?.message ?? e}`); }
}

await step("5 days left: banner shows correct days + non-warning tone", async () => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const banner = page.getByTestId("trial-banner");
  await banner.waitFor({ timeout: 10000 });
  const text = await banner.innerText();
  if (!/5 days left/.test(text)) throw new Error(`expected "5 days left" copy; got: ${text}`);
  if (!/Choose your plan/.test(text)) throw new Error(`expected "Choose your plan" CTA; got: ${text}`);
  const warn = await banner.getAttribute("data-warn");
  if (warn !== "0") throw new Error(`expected warn=0 with 5 days left; got ${warn}`);
  await page.screenshot({ path: "scripts/shots/tim1903-banner-5days.png", fullPage: false });
});

await step("18h left: banner shows last-day copy + warning tone", async () => {
  const eighteenHours = new Date(Date.now() + 18 * 3600_000).toISOString();
  await svc.from("users").update({ trial_ends_at: eighteenHours }).eq("id", uid);
  await page.goto(`${BASE}/dashboard?ts=${Date.now()}`, { waitUntil: "domcontentloaded" });
  const banner = page.getByTestId("trial-banner");
  await banner.waitFor({ timeout: 10000 });
  const text = await banner.innerText();
  if (!/Last day/.test(text)) throw new Error(`expected "Last day" copy; got: ${text}`);
  const warn = await banner.getAttribute("data-warn");
  if (warn !== "1") throw new Error(`expected warn=1 on last day; got ${warn}`);
  await page.screenshot({ path: "scripts/shots/tim1903-banner-lastday.png", fullPage: false });
});

await step("post-conversion: welcome toast renders", async () => {
  await svc.from("users").update({
    subscription_status: "active",
    subscription_tier: "pro",
    trial_ends_at: null,
    trial_just_converted_to: "pro",
  }).eq("id", uid);
  await page.goto(`${BASE}/dashboard?ts=${Date.now()}`, { waitUntil: "domcontentloaded" });
  const toast = page.getByTestId("trial-welcome-toast");
  await toast.waitFor({ timeout: 10000 });
  const text = await toast.innerText();
  if (!/Welcome to Pro/.test(text)) throw new Error(`expected "Welcome to Pro"; got: ${text}`);
  await page.screenshot({ path: "scripts/shots/tim1903-welcome-toast.png", fullPage: false });
});

await step("toast cleared on second load (one-time)", async () => {
  // The toast fires dismiss-welcome-toast on mount. Re-load and assert absence.
  await page.waitForTimeout(800); // give the fetch time to land
  await page.goto(`${BASE}/dashboard?ts=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const toast = page.getByTestId("trial-welcome-toast");
  const count = await toast.count();
  if (count > 0) throw new Error("expected welcome toast cleared on second load");
});

await browser.close();
await svc.auth.admin.deleteUser(uid).catch(() => {});

const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
console.log(`\n=== TIM-1903 prod-verify: ${pass}/${results.length} passed ===`);
for (const r of results) {
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}${r.err ? " — " + r.err : ""}`);
}
process.exit(fail > 0 ? 1 : 0);
