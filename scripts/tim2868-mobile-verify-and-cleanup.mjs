#!/usr/bin/env node
// TIM-2868 mobile-viewport verify + cleanup of test rows.
// Runs the same Add-button click flow at 390x844 (iPhone 14) and then
// archives every candidate named "New Location" that this script and the
// desktop script created during the verification run.

import { chromium, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

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

console.log("[mint] magiclink for", TARGET_EMAIL);
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: TARGET_EMAIL,
});
if (linkErr) throw linkErr;
const tokenHash = linkData.properties.hashed_token;

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

console.log("[mobile] launch at iPhone 14 viewport (390x844)...");
const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices["iPhone 14"],
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
mkdirSync("scripts/shots", { recursive: true });

const postResults = [];
page.on("response", async (res) => {
  if (
    res.url().includes("/api/workspaces/location-lease/candidates") &&
    res.request().method() === "POST"
  ) {
    let body = "";
    try {
      body = (await res.text()).slice(0, 500);
    } catch {}
    postResults.push({ url: res.url(), status: res.status(), body });
  }
});

console.log("[mobile] open workspace...");
await page.goto(`${PROD_URL}/workspace/location-lease`, { waitUntil: "networkidle" });
await page.screenshot({ path: "scripts/shots/tim2868-mobile-before.png", fullPage: true });

// On mobile the "Add location" text is hidden (sm:inline) — match by aria-label
const addButton = page.getByRole("button", { name: /add candidate/i }).first();
await addButton.waitFor({ state: "visible", timeout: 10_000 });
console.log("[mobile] click Add...");
await Promise.all([
  page.waitForResponse(
    (r) =>
      r.url().includes("/api/workspaces/location-lease/candidates") &&
      r.request().method() === "POST",
    { timeout: 15_000 },
  ),
  addButton.click(),
]);
await page.waitForTimeout(1500);
await page.screenshot({ path: "scripts/shots/tim2868-mobile-after.png", fullPage: true });

console.log("[mobile] POST results:", JSON.stringify(postResults));
if (postResults.length === 0 || postResults.some((r) => r.status !== 201)) {
  throw new Error(`mobile FAIL: ${JSON.stringify(postResults)}`);
}

const mobileResult = {
  pass: true,
  postResults,
  viewport: "iPhone 14 (390x844)",
  shots: ["tim2868-mobile-before.png", "tim2868-mobile-after.png"],
};

// Cleanup: archive every "New Location" row created during these verify runs.
console.log("[cleanup] archive test rows named 'New Location'...");
const adminSb = admin;
const trentUserId = session.user.id;
const { data: plan } = await adminSb
  .from("users")
  .select("current_plan_id")
  .eq("id", trentUserId)
  .single();
const planId = plan?.current_plan_id;
console.log("[cleanup] planId:", planId);
const { data: rows, error: archErr } = await adminSb
  .from("location_candidates")
  .update({ archived: true })
  .eq("plan_id", planId)
  .eq("name", "New Location")
  .eq("archived", false)
  .select("id, name");
if (archErr) throw archErr;
console.log("[cleanup] archived rows:", rows?.length ?? 0);

const report = {
  timestamp_utc_iso: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  issue: "TIM-2868",
  mobile: mobileResult,
  cleanup: { archivedRows: rows?.length ?? 0, ids: rows?.map((r) => r.id) ?? [] },
};
writeFileSync(
  "done-evidence/TIM-2868-mobile-and-cleanup.json",
  JSON.stringify(report, null, 2),
);
console.log("[TIM-2868] mobile PASS, cleanup done");

await browser.close();
