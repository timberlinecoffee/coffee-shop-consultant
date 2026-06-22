// TIM-2898 live verify on groundwork.cafe against the trent@simpler.coffee
// fixture. Proves: the "What do they typically order?" persona field now has
// a per-field "Ask AI" button (parity with "Why they visit" and "Pain points")
// which dispatches the copilot:open-with-prompt event and opens Scout with a
// seeded prompt scoped to the persona.
//
// Strategy:
//   1. Mint a service-role magiclink for trent@simpler.coffee, exchange for
//      session, drop the @supabase/ssr cookie into Playwright.
//   2. Navigate to /workspace/concept and dismiss the cookie banner.
//   3. Scroll to the personas section. Trent has 2 personas seeded -- expand
//      one and assert the editor opens.
//   4. Inside the expanded editor, count "Ask AI" buttons. After this fix
//      there must be 3 (whyTheyVisit, painPoints, typicalOrder). Pre-fix
//      there were only 2.
//   5. Click the typical-order Ask AI button. Assert Scout drawer opens AND
//      the textarea is pre-filled with a prompt referencing "typically
//      orders" (the seeded prompt body from triggerAI("typicalOrder")).
//   6. Screenshot evidence.
//
// Run from project root: `node scripts/tim2898-typical-order-ask-ai-verify.mjs`

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

mkdirSync("scripts/shots", { recursive: true });

console.log("[4/6] loading /workspace/concept...");
const res = await page.goto(`${PROD_URL}/workspace/concept`, { waitUntil: "domcontentloaded" });
console.log(`  status ${res?.status()}  url=${page.url()}`);
if (page.url().includes("/login") || page.url().includes("/auth")) {
  console.error("  redirected to login -- auth cookie not accepted");
  process.exit(1);
}

await page.waitForLoadState("networkidle").catch(() => {});

// Dismiss cookie banner if present (blocks Scout floating button).
const acceptBtn = page.getByRole("button", { name: /^Accept All$/ });
if (await acceptBtn.first().isVisible().catch(() => false)) {
  await acceptBtn.first().click();
  console.log("  dismissed cookie banner");
  await page.waitForTimeout(300);
}

console.log("[5/6] expanding a persona card...");
// PersonaCard buttons live inside `rounded-xl border bg-white` items in the
// personas section. Trent's fixture has 2 personas seeded. We expand the
// first by clicking its card header.
// PersonaCard renders the persona name as a heading; clicking the card
// region calls onToggleExpand. Easiest path: click on the persona name.
const personaCards = page.locator('div.rounded-xl.border.bg-white').filter({
  has: page.locator('button[aria-label*="Edit"], button[aria-label*="View"], button').filter({ hasText: /./ }),
});

// Robust path: find the first persona name on the page that looks like a
// persona (Title Case 2-5 words inside a heading-shaped element) and click
// its container. Easier: click the first persona-shaped button.
// PersonaCard's onToggleExpand fires on click of its header button.
// Inspecting PersonaCard.tsx shape would help, but pragmatically: scroll to
// the "Target Customer" heading and click the FIRST persona expansion control.
await page.getByRole("heading", { name: /Target Customer/i }).first().scrollIntoViewIfNeeded().catch(() => {});

// PersonaCard has a "Edit" / chevron button; clicking it toggles expand.
// Match by aria-label that contains "persona" or "Edit" or just click the
// first persona name heading.
// Fallback strategy: click the FIRST element that contains a known persona
// name on Trent's fixture. We don't know exact names, so use a structural
// approach: click the first <button> inside a persona-shaped card that
// contains "primary" badge OR has a Visit Frequency tag.

// Simpler: PersonaSection renders cards with role= or with a clearly named
// edit toggle. Inspecting the code, PersonaCard's clickable surface is the
// outermost button-like region; click the first one inside the personas
// list region.
const expandedEditorBeforeClick = await page.locator('label[for="persona-name"]').count();
console.log(`  editor label count before click: ${expandedEditorBeforeClick}`);

// Try clicking persona cards until the editor mounts (look for
// label[for="persona-name"] to appear in the DOM).
const expandable = page.locator('div.rounded-xl.border').filter({ hasText: /Visits|Primary|values/i });
const expandableCount = await expandable.count();
console.log(`  found ${expandableCount} expandable card-shaped containers`);

let editorOpen = false;
for (let i = 0; i < Math.min(expandableCount, 8); i++) {
  const card = expandable.nth(i);
  await card.scrollIntoViewIfNeeded().catch(() => {});
  // Click the most likely toggle: the first heading-shaped element inside,
  // or the topmost button.
  const headingInCard = card.getByRole("button").first();
  await headingInCard.click({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
  const labelCount = await page.locator('label[for="persona-name"]').count();
  if (labelCount > 0) {
    console.log(`  ✓ persona editor opened on card ${i}`);
    editorOpen = true;
    break;
  }
}

if (!editorOpen) {
  // Last resort: open the "Add another persona" button to get a fresh editor.
  console.log("  could not expand existing persona; opening a new persona editor...");
  const addBtn = page.getByRole("button", { name: /Add another persona|Add your first persona/i });
  if (await addBtn.first().isVisible().catch(() => false)) {
    await addBtn.first().click();
    await page.waitForTimeout(300);
    const labelCount = await page.locator('label[for="persona-name"]').count();
    editorOpen = labelCount > 0;
  }
}

if (!editorOpen) {
  await page.screenshot({ path: "scripts/shots/tim2898-FAIL-no-editor.png", fullPage: true });
  console.error("  ✗ could not open persona editor");
  process.exit(1);
}

await page.screenshot({ path: "scripts/shots/tim2898-editor-open.png", fullPage: true });

// Verify the typical-order label is present.
const typicalOrderLabel = page.locator('label[for="persona-order"]');
const labelExists = await typicalOrderLabel.count();
console.log(`  typical-order label present: ${labelExists > 0}`);
if (labelExists === 0) {
  console.error("  ✗ typical-order field missing");
  process.exit(1);
}

// Count Ask AI buttons in the open editor. With fix: 3 (why, pain, order).
// Without fix: 2.
const askAIButtons = page.getByRole("button", { name: /^Ask AI$/ });
const askAICount = await askAIButtons.count();
console.log(`  Ask AI button count: ${askAICount}`);

// Confirm the typical-order Ask AI button is the sibling of the
// typical-order label by checking the textarea right after the button click.
// First identify the Ask AI nearest the typical-order label.
const typicalOrderContainer = typicalOrderLabel.locator('xpath=ancestor::div[1]');
const typicalOrderAskAI = typicalOrderContainer.getByRole("button", { name: /^Ask AI$/ });
const typicalOrderAskAICount = await typicalOrderAskAI.count();
console.log(`  typical-order Ask AI button present: ${typicalOrderAskAICount > 0}`);

if (typicalOrderAskAICount === 0 || askAICount < 3) {
  await page.screenshot({ path: "scripts/shots/tim2898-FAIL-no-ask-ai-on-order.png", fullPage: true });
  console.error("  ✗ typical-order textarea has no Ask AI button (or fewer than 3 total)");
  process.exit(1);
}
console.log("  ✓ typical-order field has Ask AI button (3 Ask AI buttons total)");

console.log("[6/6] clicking Ask AI on typical-order; assert Scout drawer opens with seeded prompt...");
await typicalOrderAskAI.first().click();
await page.waitForTimeout(800);

// Assert Scout drawer is open: look for the Scout chat textarea.
const scoutInput = page.getByPlaceholder(/Ask Scout/i);
const scoutInputVisible = await scoutInput.first().isVisible().catch(() => false);
console.log(`  Scout drawer opened: ${scoutInputVisible}`);

if (!scoutInputVisible) {
  await page.screenshot({ path: "scripts/shots/tim2898-FAIL-no-scout.png", fullPage: true });
  console.error("  ✗ Scout drawer did not open");
  process.exit(1);
}

// Assert the seeded prompt is pre-filled.
const seededValue = (await scoutInput.first().inputValue()) ?? "";
console.log(`  seeded prompt: "${seededValue.slice(0, 80)}..."`);

const matchesSeed = /typically order/i.test(seededValue);
if (!matchesSeed) {
  await page.screenshot({ path: "scripts/shots/tim2898-FAIL-no-seed.png", fullPage: true });
  console.error("  ✗ Scout input not seeded with the typical-order prompt");
  process.exit(1);
}
console.log("  ✓ Scout opened with the typical-order seeded prompt");

await page.screenshot({ path: "scripts/shots/tim2898-scout-with-seed.png", fullPage: true });

console.log("\n--- RESULT ---");
console.log("PASS -- TIM-2898 acceptance:");
console.log(`  - typical-order field has Ask AI button (total Ask AI buttons in editor: ${askAICount})`);
console.log("  - clicking it opens Scout with a typical-order-scoped seeded prompt");
console.log("Screenshots:");
console.log("  scripts/shots/tim2898-editor-open.png       -- persona editor open showing Ask AI buttons");
console.log("  scripts/shots/tim2898-scout-with-seed.png   -- Scout drawer with seeded prompt");

await browser.close();
process.exit(0);
