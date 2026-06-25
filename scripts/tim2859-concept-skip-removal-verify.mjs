// TIM-2859 live verify on groundwork.cafe against the trent@simpler.coffee
// fixture. Proves the deliverable:
//   1) Zero "Skip" buttons (and zero "In doc" buttons) on the Concept page.
//   2) Six "Improve with AI" buttons — one per concept card except the
//      target_customer card, which is the PersonaSection editor.
//
// Cookie/auth pattern mirrors the TIM-2858 verify script:
// service-role magiclink → exchange for session → drop @supabase/ssr cookie
// into Playwright (raw JSON, no base64- prefix, no chunking).
//
// Run from project root: `node scripts/tim2859-concept-skip-removal-verify.mjs`

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

// ── Assertion 1: no "Skip" or "In doc" buttons anywhere on the page. ────────
// Match exact button text — the page may use "Skip" or "skip" elsewhere in
// helper copy (e.g. emptyPrompt strings), but no button should carry it.
const skipButtons = page.getByRole("button", { name: /^(Skip|In doc)$/ });
const skipCount = await skipButtons.count();
console.log(`  Skip/In doc buttons on page: ${skipCount}`);
if (skipCount !== 0) {
  await page.screenshot({ path: "scripts/shots/tim2859-FAIL-skip-still-present.png", fullPage: true });
  console.error("  ✗ FAIL — found Skip/In doc buttons; deliverable not met.");
  await browser.close();
  process.exit(1);
}
console.log("  ✓ Assertion 1 PASS — zero Skip/In doc buttons.");

// ── Assertion 2: six "Improve with AI" buttons. ────────────────────────────
// Six = one per concept card excluding target_customer (PersonaSection).
// CONCEPT_COMPONENTS_V2: shop_identity, vision, target_customer (skip),
// differentiation, brand_voice, location, offering → 6 expected.
const improveButtons = page.getByRole("button", { name: "Improve with AI" });
const improveCount = await improveButtons.count();
console.log(`  Improve with AI buttons on page: ${improveCount}`);
if (improveCount !== 6) {
  await page.screenshot({ path: "scripts/shots/tim2859-FAIL-wrong-improve-count.png", fullPage: true });
  console.error(`  ✗ FAIL — expected 6 Improve with AI buttons, found ${improveCount}`);
  await browser.close();
  process.exit(1);
}
console.log("  ✓ Assertion 2 PASS — six Improve with AI buttons (one per non-Persona card).");

// ── Screenshots: default + hovered card ────────────────────────────────────
console.log("[5/5] capturing screenshots...");
await page.screenshot({ path: "scripts/shots/tim2859-concept-default.png", fullPage: true });
console.log("  saved scripts/shots/tim2859-concept-default.png (no Skip buttons; full page)");

// Hover the first Improve button to make it visible in the shot.
const firstImprove = improveButtons.first();
await firstImprove.scrollIntoViewIfNeeded();
await firstImprove.hover({ force: true });
await page.waitForTimeout(150);
await page.screenshot({ path: "scripts/shots/tim2859-concept-hover.png", fullPage: false });
console.log("  saved scripts/shots/tim2859-concept-hover.png (Improve with AI revealed on hover)");

console.log("\n--- RESULT ---");
console.log("PASS — Skip removed; per-field action unified as Improve with AI.");
console.log(`  ${skipCount} Skip/In doc buttons (expected 0)`);
console.log(`  ${improveCount} Improve with AI buttons (expected 6)`);
console.log("Screenshots:");
console.log("  scripts/shots/tim2859-concept-default.png");
console.log("  scripts/shots/tim2859-concept-hover.png");
await browser.close();
process.exit(0);
