// TIM-2897 live verify on groundwork.cafe against the trent@simpler.coffee
// fixture. Proves the deliverable:
//   1) Zero "Improve with Scout" buttons on the Concept page.
//   2) Zero "Ask Scout" buttons on the Concept page (same AskScoutButton).
//   3) Six "Improve with AI" buttons remain — per-field controls unchanged
//      (one per concept card except target_customer / PersonaSection).
//
// Cookie/auth pattern mirrors TIM-2858 / TIM-2859 verify scripts.
//
// Run from project root: `node scripts/tim2897-concept-improve-with-scout-removal-verify.mjs`

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

console.log(`[1/5] minting magiclink for ${TARGET_EMAIL}...`);
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: TARGET_EMAIL,
});
if (linkErr) throw linkErr;
const tokenHash = linkData?.properties?.hashed_token;
if (!tokenHash) throw new Error("no token_hash");

console.log("[2/5] exchanging for session...");
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

console.log("[3/5] launching browser, dropping session cookie...");
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
page.on("console", (msg) => {
  if (msg.type() === "error") console.log(`  [browser error] ${msg.text()}`);
});

mkdirSync("scripts/shots", { recursive: true });

console.log("[4/5] loading /workspace/concept...");
const res = await page.goto(`${PROD_URL}/workspace/concept`, { waitUntil: "domcontentloaded" });
console.log(`  status ${res?.status()}  url=${page.url()}`);
if (page.url().includes("/login") || page.url().includes("/auth")) {
  console.error("  redirected to login — auth cookie not accepted");
  process.exit(1);
}
await page.waitForLoadState("networkidle").catch(() => {});

// ── Assertion 1: no "Improve with Scout" button anywhere on the page. ───────
const improveWithScout = page.getByRole("button", { name: "Improve with Scout" });
const improveWithScoutCount = await improveWithScout.count();
console.log(`  "Improve with Scout" buttons: ${improveWithScoutCount}`);
if (improveWithScoutCount !== 0) {
  await page.screenshot({ path: "scripts/shots/tim2897-FAIL-scout-still-present.png", fullPage: true });
  console.error("  ✗ FAIL — top-level 'Improve with Scout' still present.");
  await browser.close();
  process.exit(1);
}

// ── Assertion 2: no "Ask Scout" button either (same component, empty state). ─
const askScout = page.getByRole("button", { name: "Ask Scout" });
const askScoutCount = await askScout.count();
console.log(`  "Ask Scout" buttons: ${askScoutCount}`);
if (askScoutCount !== 0) {
  await page.screenshot({ path: "scripts/shots/tim2897-FAIL-ask-scout-present.png", fullPage: true });
  console.error("  ✗ FAIL — top-level 'Ask Scout' still present.");
  await browser.close();
  process.exit(1);
}
console.log("  ✓ Assertions 1+2 PASS — no top-level Scout buttons on Concept.");

// ── Assertion 3: six "Improve with AI" buttons remain unchanged. ────────────
const improveButtons = page.getByRole("button", { name: "Improve with AI" });
const improveCount = await improveButtons.count();
console.log(`  "Improve with AI" buttons: ${improveCount}`);
if (improveCount !== 6) {
  await page.screenshot({ path: "scripts/shots/tim2897-FAIL-wrong-improve-count.png", fullPage: true });
  console.error(`  ✗ FAIL — expected 6 Improve with AI buttons, found ${improveCount}`);
  await browser.close();
  process.exit(1);
}
console.log("  ✓ Assertion 3 PASS — 6 per-field 'Improve with AI' controls intact.");

// ── Screenshots ────────────────────────────────────────────────────────────
console.log("[5/5] capturing screenshots...");
await page.screenshot({ path: "scripts/shots/tim2897-concept-header-clean.png", fullPage: false });
console.log("  saved scripts/shots/tim2897-concept-header-clean.png (header, no Scout button)");
await page.screenshot({ path: "scripts/shots/tim2897-concept-fullpage.png", fullPage: true });
console.log("  saved scripts/shots/tim2897-concept-fullpage.png");

console.log("\n--- RESULT ---");
console.log("PASS — top-level 'Improve with Scout' removed; per-field 'Improve with AI' unchanged.");
console.log(`  Improve with Scout: ${improveWithScoutCount} (expected 0)`);
console.log(`  Ask Scout:          ${askScoutCount} (expected 0)`);
console.log(`  Improve with AI:    ${improveCount} (expected 6)`);
await browser.close();
process.exit(0);
