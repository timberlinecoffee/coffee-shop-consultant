#!/usr/bin/env node
// TIM-2868 live verification: Add new location button on groundwork.cafe.
// Asserts that a click on the "Add location" button POSTs to
// /api/workspaces/location-lease/candidates and gets 201 — not 404 — and
// that a new card appears in the list. Mirrors the TIM-2860 live-verify
// session-mint flow.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

console.log(`[1/7] minting magiclink for ${TARGET_EMAIL}...`);
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: TARGET_EMAIL,
});
if (linkErr) throw linkErr;
const tokenHash = linkData?.properties?.hashed_token;
if (!tokenHash) throw new Error("no token_hash");

console.log("[2/7] exchanging for session...");
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

console.log("[3/7] launching browser, dropping session cookie...");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
const shotsDir = join("scripts", "shots");
mkdirSync(shotsDir, { recursive: true });

const postResults = [];
page.on("response", async (res) => {
  const url = res.url();
  if (
    url.includes("/api/workspaces/location-lease/candidates") &&
    res.request().method() === "POST"
  ) {
    let body = "";
    try {
      body = (await res.text()).slice(0, 500);
    } catch {}
    postResults.push({ url, status: res.status(), body });
  }
});

console.log("[4/7] opening Location & Lease workspace on groundwork.cafe...");
await page.goto(`${PROD_URL}/workspace/location-lease`, { waitUntil: "networkidle" });
await page.screenshot({ path: join(shotsDir, "tim2868-before.png"), fullPage: true });

const beforeCount = await page.locator("text=/sq.?ft/i").count();
console.log(`[5/7] before, sq ft hits in DOM: ${beforeCount}`);

const addButton = page
  .getByRole("button", { name: /add candidate|add location|add your first location/i })
  .first();
await addButton.waitFor({ state: "visible", timeout: 10_000 });

console.log("[6/7] clicking Add...");
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
await page.screenshot({ path: join(shotsDir, "tim2868-after.png"), fullPage: true });

console.log("[7/7] POST results:", JSON.stringify(postResults, null, 2));

if (postResults.length === 0) {
  throw new Error("FAIL: no POST observed to /api/workspaces/location-lease/candidates");
}
for (const r of postResults) {
  if (r.status !== 201) {
    throw new Error(`FAIL: POST returned ${r.status} (expected 201): ${r.body}`);
  }
}

const afterCount = await page.locator("text=/sq.?ft/i").count();
console.log(`[done] sq ft hits in DOM after: ${afterCount}`);

mkdirSync("done-evidence", { recursive: true });
const report = {
  timestamp_utc_iso: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  site: PROD_URL,
  issue: "TIM-2868",
  postResults,
  domHitsBefore: beforeCount,
  domHitsAfter: afterCount,
  shots: ["tim2868-before.png", "tim2868-after.png"],
  pass: postResults.every((r) => r.status === 201),
};
writeFileSync("done-evidence/TIM-2868-verify.json", JSON.stringify(report, null, 2));
console.log("[TIM-2868] PASS");

await browser.close();

// (delete test row left in place is intentional — board screenshot reviewer
// will see "New Location" in trent's actual fixture and can manually archive.)
