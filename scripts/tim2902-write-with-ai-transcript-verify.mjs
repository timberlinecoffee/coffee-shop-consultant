// TIM-2902 live verify on groundwork.cafe against the trent@simpler.coffee
// fixture. Proves: pressing the per-field "Write with AI" buttons in
// PersonaEditor submits the seeded prompt as a real user turn, so the prompt
// appears in the Scout transcript as a normal user message (instead of
// silently sitting in the composer).
//
// Tests all 3 per-field buttons: whyTheyVisit, painPoints, typicalOrder.
//
// Strategy:
//   1. Mint a service-role magiclink for trent@simpler.coffee, exchange for
//      session, drop the @supabase/ssr cookie into Playwright.
//   2. Intercept /api/copilot/stream with a synthetic SSE payload so the
//      verify is deterministic and free of Anthropic spend (mirrors the
//      TIM-2900 / TIM-2901 pattern).
//   3. Navigate to /workspace/concept, expand a persona card so the editor
//      mounts with all 3 "Write with AI" buttons present.
//   4. For each of the 3 fields (whyTheyVisit, painPoints, typicalOrder):
//        a. Click its "Write with AI" button
//        b. Assert Scout drawer opens
//        c. Assert the seeded prompt appears as a user bubble in the
//           transcript (data-testid="copilot-bubble" + data-role="user").
//        d. Assert the composer textarea is EMPTY (not pre-filled).
//        e. Open a fresh thread before the next field so transcripts don't
//           mix.
//   5. Screenshot evidence.
//
// Run from project root: `node scripts/tim2902-write-with-ai-transcript-verify.mjs`

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
page.on("console", (msg) => {
  if (msg.type() === "error") console.log(`  [browser error] ${msg.text()}`);
});

// TIM-2902: Deterministic SSE intercept (per the TIM-2900 / TIM-2901 pattern).
// Returns a synthetic delta + done event so the streaming hook completes
// quickly without hitting Anthropic.
let streamCount = 0;
await page.route("**/api/copilot/stream", async (route) => {
  streamCount += 1;
  const body =
    `event: text\ndata: ${JSON.stringify({ delta: "TIM-2902 verify reply." })}\n\n` +
    `event: done\ndata: ${JSON.stringify({ threadId: `verify-${streamCount}`, modelUsed: "synthetic", trialRemaining: null, creditsRemaining: null })}\n\n`;
  await route.fulfill({
    status: 200,
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
    body,
  });
});

mkdirSync("scripts/shots", { recursive: true });

console.log("[4/7] loading /workspace/concept...");
const res = await page.goto(`${PROD_URL}/workspace/concept`, { waitUntil: "domcontentloaded" });
console.log(`  status ${res?.status()}  url=${page.url()}`);
if (page.url().includes("/login") || page.url().includes("/auth")) {
  console.error("  redirected to login -- auth cookie not accepted");
  process.exit(1);
}

await page.waitForLoadState("networkidle").catch(() => {});

// Dismiss cookie banner if present.
const acceptBtn = page.getByRole("button", { name: /^Accept All$/ });
if (await acceptBtn.first().isVisible().catch(() => false)) {
  await acceptBtn.first().click();
  console.log("  dismissed cookie banner");
  await page.waitForTimeout(300);
}

console.log("[5/7] expanding a persona card...");
await page.getByRole("heading", { name: /Target Customer/i }).first().scrollIntoViewIfNeeded().catch(() => {});

// PersonaCard's main toggle button has aria-label="Expand <PersonaName>".
const expandButtons = page.getByRole("button", { name: /^Expand / });
const expandCount = await expandButtons.count();
console.log(`  found ${expandCount} persona Expand buttons`);

let editorOpen = false;
for (let i = 0; i < Math.min(expandCount, 8); i++) {
  await expandButtons.nth(i).scrollIntoViewIfNeeded().catch(() => {});
  await expandButtons.nth(i).click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  const labelCount = await page.locator('label[for="persona-name"]').count();
  if (labelCount > 0) {
    console.log(`  ✓ persona editor opened on card ${i}`);
    editorOpen = true;
    break;
  }
}

if (!editorOpen) {
  await page.screenshot({ path: "scripts/shots/tim2902-FAIL-no-editor.png", fullPage: true });
  console.error("  ✗ could not open persona editor");
  process.exit(1);
}

await page.screenshot({ path: "scripts/shots/tim2902-editor-open.png", fullPage: true });

// Confirm all 3 per-field "Write with AI" buttons exist.
const writeWithAIButtons = page.getByRole("button", { name: /^Write with AI$/ });
const writeWithAICount = await writeWithAIButtons.count();
console.log(`  Write with AI button count: ${writeWithAICount}`);
if (writeWithAICount < 3) {
  await page.screenshot({ path: "scripts/shots/tim2902-FAIL-not-3-buttons.png", fullPage: true });
  console.error(`  ✗ expected at least 3 Write with AI buttons, found ${writeWithAICount}`);
  process.exit(1);
}
console.log("  ✓ 3 per-field Write with AI buttons present");

console.log("[6/7] verifying each per-field button submits prompt to transcript...");

// For each field: click button, assert transcript has user bubble with the
// seeded prompt, assert composer is empty.
const fields = [
  { fieldId: "persona-why", label: "Why they visit", expectInPrompt: /describe the "Why they visit"/i },
  { fieldId: "persona-pain", label: "Pain points", expectInPrompt: /describe the "Pain points"/i },
  { fieldId: "persona-order", label: "Typical order", expectInPrompt: /typically order/i },
];

let pass = 0;
const results = [];

for (const { fieldId, label, expectInPrompt } of fields) {
  console.log(`  → ${label} (${fieldId})`);

  // Each field's Write with AI lives in the same parent container as its
  // <label htmlFor=fieldId>. The container is one level up.
  const labelLocator = page.locator(`label[for="${fieldId}"]`);
  const labelExists = await labelLocator.count();
  if (labelExists === 0) {
    console.error(`    ✗ ${label}: label[for="${fieldId}"] not found`);
    results.push({ field: label, pass: false, reason: "label not found" });
    continue;
  }

  const container = labelLocator.locator("xpath=ancestor::div[1]");
  const fieldButton = container.getByRole("button", { name: /^Write with AI$/ });
  const buttonCount = await fieldButton.count();
  if (buttonCount === 0) {
    console.error(`    ✗ ${label}: Write with AI button missing in field container`);
    results.push({ field: label, pass: false, reason: "button missing" });
    continue;
  }

  await fieldButton.first().scrollIntoViewIfNeeded().catch(() => {});
  await fieldButton.first().click({ force: true });
  // Give the listener time to dispatch + perform send + SSE round-trip.
  await page.waitForTimeout(1500);

  // Find the Scout transcript. User bubbles render via MessageBubble with
  // data-testid="copilot-bubble" + data-role="user".
  const userBubbles = page.locator('[data-testid="copilot-bubble"][data-role="user"]');
  const userBubbleCount = await userBubbles.count();
  let userBubbleText = "";
  if (userBubbleCount > 0) {
    userBubbleText = (await userBubbles.last().innerText()).trim();
  }

  // Composer should be empty after auto-submit.
  const composer = page.getByPlaceholder(/Ask Scout/i).first();
  const composerValue = await composer.inputValue().catch(() => "");

  const promptMatches = expectInPrompt.test(userBubbleText);
  const composerEmpty = composerValue.trim().length === 0;
  const fieldPass = userBubbleCount >= 1 && promptMatches && composerEmpty;

  console.log(`    user bubbles: ${userBubbleCount}, matches prompt: ${promptMatches}, composer empty: ${composerEmpty}`);
  console.log(`    last user bubble: ${userBubbleText.slice(0, 80).replace(/\n/g, " ")}…`);

  results.push({
    field: label,
    pass: fieldPass,
    userBubbleCount,
    userBubblePreview: userBubbleText.slice(0, 120),
    composerEmpty,
  });

  if (fieldPass) {
    pass += 1;
    console.log(`    ✓ ${label}: prompt visible as user bubble, composer empty`);
  } else {
    console.error(`    ✗ ${label}: failed acceptance`);
  }

  await page.screenshot({ path: `scripts/shots/tim2902-${fieldId}.png`, fullPage: true });

  // Start a fresh thread before the next field so the transcript stays
  // scoped to the next prompt only. Click "New chat" button. If not found,
  // close and re-open the drawer.
  const newChatBtn = page.getByRole("button", { name: /New chat|New conversation|^New$/i });
  if (await newChatBtn.first().isVisible().catch(() => false)) {
    await newChatBtn.first().click();
    await page.waitForTimeout(400);
  } else {
    // Fallback: dispatch a close + re-open by clicking outside backdrop.
    const closeBtn = page.getByRole("button", { name: /Close Scout/i });
    if (await closeBtn.first().isVisible().catch(() => false)) {
      await closeBtn.first().click();
      await page.waitForTimeout(300);
    }
  }
}

console.log("[7/7] summary:");
console.log(JSON.stringify({ pass, total: fields.length, streamCount, results }, null, 2));

await browser.close();

if (pass === fields.length) {
  console.log("\n--- RESULT ---");
  console.log(`PASS — ${pass}/${fields.length} per-field buttons submit prompt to transcript`);
  console.log("Screenshots: scripts/shots/tim2902-*.png");
  process.exit(0);
} else {
  console.log("\n--- RESULT ---");
  console.log(`FAIL — ${pass}/${fields.length} per-field buttons satisfy acceptance`);
  process.exit(1);
}
