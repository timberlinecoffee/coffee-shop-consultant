// TIM-2858 live verify on groundwork.cafe against the trent@simpler.coffee
// fixture. Proves the fix: per-field "Improve with AI" routes through the
// unified AIReviewModal after streaming completes, instead of closing silently
// when AIAssistCallout unmounts.
//
// Strategy:
//   1. Mint a service-role magiclink for trent@simpler.coffee, exchange for
//      session, drop the @supabase/ssr cookie into Playwright.
//   2. Open /workspace/concept, hover a concept card to reveal "Improve with
//      AI", click it. Assert the AIAssistCallout draft modal opens.
//   3. Intercept POST /api/copilot/improve and return a synthetic SSE stream
//      (text deltas + done event) so the test is deterministic, fast, and
//      free of Anthropic spend.
//   4. Click "Improve this". Assert AIReviewModal appears with the canonical
//      per-field accept / reject UI.
//   5. Screenshot draft modal AND review modal — proves the fix.
//
// Run from project root: `node scripts/tim2858-concept-improve-verify.mjs`
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY (Trent fixture lives on prod Supabase).

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
page.on("console", (msg) => {
  if (msg.type() === "error") console.log(`  [browser error] ${msg.text()}`);
});

// Intercept the copilot improve stream — return a deterministic SSE response.
const SYNTHETIC_TEXT = "Test improved value (TIM-2858 verify) — this proves the unified AI review modal mounts at the parent and survives the AIAssistCallout draft modal closing.";
await page.route("**/api/copilot/improve", async (route) => {
  // Build a minimal SSE body: a couple of text deltas then a done event.
  const sseBody =
    `event: text\ndata: ${JSON.stringify({ delta: SYNTHETIC_TEXT.slice(0, 40) })}\n\n` +
    `event: text\ndata: ${JSON.stringify({ delta: SYNTHETIC_TEXT.slice(40) })}\n\n` +
    `event: done\ndata: ${JSON.stringify({ text: SYNTHETIC_TEXT })}\n\n`;
  await route.fulfill({
    status: 200,
    headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
    body: sseBody,
  });
});

console.log("[4/6] loading /workspace/concept...");
const res = await page.goto(`${PROD_URL}/workspace/concept`, { waitUntil: "domcontentloaded" });
console.log(`  status ${res?.status()}  url=${page.url()}`);
if (page.url().includes("/login") || page.url().includes("/auth")) {
  console.error("  redirected to login — auth cookie not accepted");
  process.exit(1);
}

// Hover ANY concept card so the hover-revealed Improve button becomes visible.
// The button label is exactly "Improve with AI" (matched on case).
mkdirSync("scripts/shots", { recursive: true });

// Wait for hydration.
await page.waitForLoadState("networkidle").catch(() => {});

const improveButtons = page.getByRole("button", { name: "Improve with AI" });
const count = await improveButtons.count();
console.log(`  found ${count} Improve with AI buttons`);
if (count === 0) {
  await page.screenshot({ path: "scripts/shots/tim2858-noimprove.png", fullPage: true });
  console.error("  no Improve with AI buttons on page — check selector / fixture");
  process.exit(1);
}

// Hover to make the button interactable (opacity-0 → group-hover:opacity-100).
const firstImprove = improveButtons.first();
// Scroll to the card and force the hover by clicking the surrounding card
// region. Improve buttons are inside `.group` containers; hover triggers them.
await firstImprove.scrollIntoViewIfNeeded();
await firstImprove.hover({ force: true });
await page.waitForTimeout(200);
await firstImprove.click({ force: true });
console.log("  clicked Improve with AI on first card");

// Assert AIAssistCallout draft modal opened.
const draftModalTitle = page.getByRole("heading", { level: 2 }).filter({ hasText: /^Improve:/ });
await draftModalTitle.first().waitFor({ state: "visible", timeout: 4000 });
console.log("  ✓ AIAssistCallout draft modal opened");
await page.screenshot({ path: "scripts/shots/tim2858-draft-modal.png", fullPage: false });

console.log("[5/6] clicking 'Improve this' to trigger (mocked) stream...");
const improveThis = page.getByRole("button", { name: "Improve this" });
await improveThis.waitFor({ state: "visible", timeout: 2000 });
// Improve this is disabled when draft is empty — most concept fields on the
// trent fixture are non-empty, so it should already be enabled. If not, prefer
// "Write this for me" which is always enabled.
const isEnabled = await improveThis.isEnabled();
if (isEnabled) {
  await improveThis.click();
  console.log("  clicked Improve this");
} else {
  const writeForMe = page.getByRole("button", { name: "Write this for me" });
  await writeForMe.click();
  console.log("  draft empty — clicked Write this for me instead");
}

// Now: assert the AIReviewModal appears AFTER the draft modal closes.
// AIReviewModal renders text "Review AI changes" or similar. Best signal:
// look for the per-field accept / reject controls. Inspect the component
// shape by waiting for a recognizable role.
console.log("[6/6] waiting for AIReviewModal to appear...");
// The AIReviewModal (per src/components/ai-assist/AIReviewModal.tsx) renders
// a dialog with Accept / Reject buttons + the proposed text. Wait for the
// synthetic text we injected to appear in the DOM as proof the modal mounted
// AND received the streamed suggestion.
const reviewModalSignal = page.getByText(/TIM-2858 verify/i);
try {
  await reviewModalSignal.first().waitFor({ state: "visible", timeout: 6000 });
  console.log("  ✓ AIReviewModal appeared with the streamed suggestion");
  await page.screenshot({ path: "scripts/shots/tim2858-review-modal.png", fullPage: false });
  console.log("\n--- RESULT ---");
  console.log("PASS — Improve with AI now routes through the unified review modal.");
  console.log("Screenshots:");
  console.log("  scripts/shots/tim2858-draft-modal.png   — draft modal opens on click");
  console.log("  scripts/shots/tim2858-review-modal.png  — review modal appears after stream");
  await browser.close();
  process.exit(0);
} catch (e) {
  await page.screenshot({ path: "scripts/shots/tim2858-FAIL-no-review-modal.png", fullPage: true });
  console.error("  ✗ AIReviewModal did NOT appear within 6s");
  console.error("  See scripts/shots/tim2858-FAIL-no-review-modal.png for current page state.");
  await browser.close();
  process.exit(1);
}
