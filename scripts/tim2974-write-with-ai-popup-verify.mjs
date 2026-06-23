// TIM-2974: live verify that persona per-field "Write with AI" buttons now
// open the structured AIAssistCallout popup (apply-to-plan path) instead of
// the chat companion. Board ask on TIM-2973 was "always the popup".
//
// Strategy:
//   1. Mint magiclink for trent@simpler.coffee, drop session cookie
//   2. Navigate to /workspace/concept on the target URL (preview or prod)
//   3. Expand a persona card so the editor mounts with all 3 "Write with AI"
//      buttons
//   4. For each field (whyTheyVisit, painPoints, typicalOrder):
//        a. Click the "Write with AI" button
//        b. Assert the AIAssistCallout dialog opens
//           (role="dialog" aria-labelledby="ai-assist-title" containing
//           "Improve: <field label>")
//        c. Assert the chat companion drawer is NOT open
//           (CoPilotDrawer's open shell is not present)
//        d. Screenshot
//        e. Close the popup before the next field
//   5. Intercept /api/copilot/improve with a synthetic SSE so the verify is
//      deterministic and free of Anthropic spend
//
// Defaults to the preview deploy URL via TARGET_URL env (override with prod).
// Run: TARGET_URL=https://coffee-shop-consultant-git-fi-d14a91-... node \
//      scripts/tim2974-write-with-ai-popup-verify.mjs

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
const TARGET = process.env.TARGET_URL ?? "https://groundwork.cafe";
const HOST = new URL(TARGET).host;
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

// Deterministic SSE intercept for /api/copilot/improve so the verify is fast +
// free of Anthropic spend. Mirrors TIM-2902's stream-intercept pattern.
let improveCount = 0;
await page.route("**/api/copilot/improve", async (route) => {
  improveCount += 1;
  const body =
    `event: text\ndata: ${JSON.stringify({ delta: "TIM-2974 verify reply." })}\n\n` +
    `event: done\ndata: ${JSON.stringify({ text: "TIM-2974 verify reply.", modelUsed: "synthetic" })}\n\n`;
  await route.fulfill({
    status: 200,
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
    body,
  });
});

mkdirSync("scripts/shots", { recursive: true });

console.log(`[4/6] loading ${TARGET}/workspace/concept...`);
const res = await page.goto(`${TARGET}/workspace/concept`, { waitUntil: "domcontentloaded" });
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
  await page.waitForTimeout(300);
}

console.log("[5/6] expanding a persona card...");
await page.getByRole("heading", { name: /Target Customer/i }).first().scrollIntoViewIfNeeded().catch(() => {});

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
  await page.screenshot({ path: "scripts/shots/tim2974-FAIL-no-editor.png", fullPage: true });
  console.error("  ✗ could not open persona editor");
  process.exit(1);
}

const writeWithAIButtons = page.getByRole("button", { name: /^Write with AI$/ });
const writeWithAICount = await writeWithAIButtons.count();
console.log(`  Write with AI button count: ${writeWithAICount}`);
if (writeWithAICount < 3) {
  await page.screenshot({ path: "scripts/shots/tim2974-FAIL-not-3-buttons.png", fullPage: true });
  console.error(`  ✗ expected 3 Write with AI buttons, found ${writeWithAICount}`);
  process.exit(1);
}

console.log("[6/6] verifying each per-field button opens AIAssistCallout popup (not chat)...");

const fields = [
  { fieldId: "persona-why",   label: "Why they visit"  },
  { fieldId: "persona-pain",  label: "Pain points"     },
  { fieldId: "persona-order", label: "Typical order"   },
];

let pass = 0;
const results = [];

for (const { fieldId, label } of fields) {
  console.log(`  → ${label} (${fieldId})`);

  // Each field's "Write with AI" lives in the field's container next to its <label>.
  const labelLocator = page.locator(`label[for="${fieldId}"]`);
  const container = labelLocator.locator("xpath=ancestor::div[1]");
  const fieldButton = container.getByRole("button", { name: /^Write with AI$/ });

  await fieldButton.first().scrollIntoViewIfNeeded().catch(() => {});
  await fieldButton.first().click({ force: true });
  await page.waitForTimeout(500);

  // ── (a) AIAssistCallout dialog must be open ────────────────────────────────
  // AIAssistCallout renders [role="dialog"][aria-labelledby="ai-assist-title"]
  // with header text "Improve: <field label>".
  const popupDialog = page.locator('[role="dialog"][aria-labelledby="ai-assist-title"]');
  const popupOpen = await popupDialog.first().isVisible().catch(() => false);
  let popupHeaderText = "";
  if (popupOpen) {
    popupHeaderText = (await popupDialog.locator("#ai-assist-title").innerText().catch(() => "")).trim();
  }
  const headerMatches = popupHeaderText.includes(label);

  // ── (b) Chat companion drawer must NOT be open ─────────────────────────────
  // CoPilotDrawer's open shell has an "Ask Scout" placeholder textarea. If it
  // were open, the placeholder would be visible.
  const chatPlaceholder = page.getByPlaceholder(/Ask Scout/i);
  const chatVisible = await chatPlaceholder.first().isVisible().catch(() => false);

  const fieldPass = popupOpen && headerMatches && !chatVisible;
  console.log(`    popup open: ${popupOpen}  header matches "${label}": ${headerMatches}  chat NOT open: ${!chatVisible}`);

  await page.screenshot({ path: `scripts/shots/tim2974-${fieldId}.png`, fullPage: true });

  results.push({
    field: label,
    pass: fieldPass,
    popupOpen,
    popupHeader: popupHeaderText,
    chatNotOpen: !chatVisible,
  });

  if (fieldPass) {
    pass += 1;
    console.log(`    ✓ ${label}: popup opens, chat is not open`);
  } else {
    console.error(`    ✗ ${label}: acceptance failed`);
  }

  // Close the popup before the next field.
  const closeBtn = popupDialog.getByRole("button", { name: /^Close$/ });
  if (await closeBtn.first().isVisible().catch(() => false)) {
    await closeBtn.first().click();
    await page.waitForTimeout(300);
  } else {
    // Escape fallback (works in draft state per AIAssistCallout's handler).
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
}

console.log("summary:");
console.log(JSON.stringify({ pass, total: fields.length, improveCount, results }, null, 2));

await browser.close();

if (pass === fields.length) {
  console.log("\n--- RESULT ---");
  console.log(`PASS — ${pass}/${fields.length} per-field "Write with AI" buttons open AIAssistCallout (not chat)`);
  console.log("Screenshots: scripts/shots/tim2974-*.png");
  process.exit(0);
} else {
  console.log("\n--- RESULT ---");
  console.log(`FAIL — ${pass}/${fields.length} buttons satisfy acceptance`);
  process.exit(1);
}
