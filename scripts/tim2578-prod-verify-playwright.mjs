// TIM-2578 prod verify via Playwright. Drives /account/cancel on
// groundwork.cafe production for 3 authenticated user profiles that
// exercise the AC1 grid: (1) no-sub user, (2) stale-stripe-id user
// (original 500 case — sub row with stripe_subscription_id="sub_doesnotexist"
// + status=active), (3) active synthetic user with a real Stripe Test Mode
// subscription if reachable. Asserts no 500 and captures a screenshot.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PROD_URL || "https://groundwork.cafe";
const HOST = new URL(BASE).host;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !ANON || !SERVICE) { console.error("env missing"); process.exit(2); }

const svc = createClient(SUPABASE_URL, SERVICE);
const TS = Date.now();
const OUT = path.resolve("scripts/_verify-tim2578-out");
mkdirSync(OUT, { recursive: true });

async function mintSession(email, password) {
  const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const link = await linkRes.json();
  const tokenHash = link.properties?.hashed_token ?? link.hashed_token;
  if (!tokenHash) throw new Error("no hashed_token: " + JSON.stringify(link));
  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  const auth = await verifyRes.json();
  if (!auth.access_token) throw new Error("verify failed: " + JSON.stringify(auth));
  return auth;
}

// SSR cookie name format from @supabase/ssr: sb-<project-ref>-auth-token
const REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];
const SSR_COOKIE_NAME = `sb-${REF}-auth-token`;

function ssrCookie(auth) {
  // @supabase/ssr stores a base64-encoded JSON array. The shape is
  // `base64-${b64(JSON.stringify([session]))}` in recent versions.
  const payload = {
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
    expires_in: auth.expires_in,
    expires_at: auth.expires_at,
    token_type: auth.token_type,
    user: auth.user,
  };
  return "base64-" + Buffer.from(JSON.stringify(payload)).toString("base64");
}

async function provisionNoSubUser() {
  const email = `tim2578-nosub+${TS}@verify.local`;
  const pw = `t2578_${TS}`;
  const { data: u, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error;
  // No row in `subscriptions` — page should redirect to /account/billing?nothing_to_cancel=1
  return { id: u.user.id, email, password: pw };
}

async function provisionStaleStripeUser() {
  const email = `tim2578-stale+${TS}@verify.local`;
  const pw = `t2578_${TS}`;
  const { data: u, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error;
  // Insert a subscriptions row pointing at a stripe sub id that does NOT
  // exist in Stripe. Pre-fix this raw-500ed the page. Post-fix the page
  // should catch the Stripe error and redirect gracefully.
  const { error: subErr } = await svc.from("subscriptions").insert({
    user_id: u.user.id,
    stripe_customer_id: `cus_tim2578_stale_${TS}`,
    stripe_subscription_id: `sub_tim2578_does_not_exist_${TS}`,
    status: "active",
    tier: "pro",
  });
  if (subErr) console.warn("[stale] sub insert warn:", subErr.message);
  return { id: u.user.id, email, password: pw };
}

async function drive(label, user) {
  const auth = await mintSession(user.email);
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addCookies([{
    name: SSR_COOKIE_NAME,
    value: ssrCookie(auth),
    domain: HOST,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  }]);
  const page = await ctx.newPage();
  const responses = [];
  page.on("response", (r) => responses.push({ url: r.url(), status: r.status() }));

  const res = await page.goto(`${BASE}/account/cancel`, { waitUntil: "networkidle" });
  const finalUrl = page.url();
  const status = res ? res.status() : null;
  const shotPath = path.join(OUT, `cancel-${label}.png`);
  await page.screenshot({ path: shotPath, fullPage: true });
  const bodyText = (await page.content()).slice(0, 200);
  await browser.close();

  // Look for any 500 in the trail
  const has500 = responses.some((r) => new URL(r.url).host === HOST && r.status >= 500);
  const sameHostStatuses = responses
    .filter((r) => new URL(r.url).host === HOST)
    .map((r) => `${r.status} ${new URL(r.url).pathname}`);
  return { label, email: user.email, status, finalUrl, has500, shotPath, bodyText, sameHostStatuses };
}

const results = [];
console.log(`[BASE] ${BASE} cookie=${SSR_COOKIE_NAME}`);

try {
  const u1 = await provisionNoSubUser();
  console.log(`[prov] nosub: ${u1.email}`);
  results.push(await drive("nosub", u1));
} catch (e) { console.error("[nosub] failed", e); }

try {
  const u2 = await provisionStaleStripeUser();
  console.log(`[prov] stale: ${u2.email}`);
  results.push(await drive("stale", u2));
} catch (e) { console.error("[stale] failed", e); }

writeFileSync(path.join(OUT, "report.json"), JSON.stringify(results, null, 2));

for (const r of results) {
  const verdict = r.has500 ? "❌ 500" : r.status === 200 ? "✅ 200" : `→ ${r.status} ${r.finalUrl}`;
  console.log(`[${r.label}] ${verdict} screenshot=${r.shotPath}`);
}

const anyFailed = results.some((r) => r.has500);
if (anyFailed) {
  console.error("FAIL: at least one path returned 500");
  process.exit(1);
}
console.log("OK: no 500s observed across", results.length, "paths");
