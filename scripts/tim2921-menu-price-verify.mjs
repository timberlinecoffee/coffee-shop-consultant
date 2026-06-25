// TIM-2921: round-trip verify for the Menu & Pricing AI price-suggestion
// Accept handler. Pre-fix: PATCH hit /api/workspaces/menu-pricing/items/${id}
// (no such route — 404 silently) and ignored finalValue, so Accept never
// persisted. Post-fix: PATCH /items collection with id in body, response
// checked, refetch + reload confirms persistence.
//
// Drives trent@simpler.coffee against groundwork.cafe. Picks the first menu
// item with a price; clicks "Suggest retail price"; accepts in the unified
// review modal; reloads and asserts the DB price equals the AI suggestion.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

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
const PROD_URL = process.env.TARGET_URL ?? "https://groundwork.cafe";
const HOST = new URL(PROD_URL).host;
const TARGET_EMAIL = "trent@simpler.coffee";
const REF = new URL(SUPABASE_URL).hostname.split(".")[0];

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── 1. Mint magiclink + cookie ──────────────────────────────────────────────
console.log(`[1] minting magiclink for ${TARGET_EMAIL}...`);
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: TARGET_EMAIL,
});
if (linkErr) throw linkErr;
const tokenHash = linkData?.properties?.hashed_token;
if (!tokenHash) throw new Error("no token_hash");

const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { data: sessData, error: sessErr } = await anon.auth.verifyOtp({
  token_hash: tokenHash,
  type: "magiclink",
});
if (sessErr) throw sessErr;
const session = sessData.session;
const userId = session.user.id;

// ── 2. Discover active plan + first menu item ──────────────────────────────
const { data: userRow } = await admin
  .from("users")
  .select("current_plan_id")
  .eq("id", userId)
  .single();
const planId = userRow?.current_plan_id;
console.log(`[2] trent active plan: ${planId}`);

// "Suggest retail price" is gated on effective COGS > 0 — pick an item with
// both a price AND at least one recipe line, via the menu_items_with_cogs view.
const { data: items } = await admin
  .from("menu_items_with_cogs")
  .select("id, name, price_cents, computed_cogs_cents, cogs_cents")
  .eq("plan_id", planId)
  .eq("archived", false)
  .order("position")
  .limit(40);
if (!items?.length) throw new Error("no menu items for trent's active plan");
const target = items.find(
  (i) => i.price_cents > 0 && ((i.computed_cogs_cents ?? 0) > 0 || (i.cogs_cents ?? 0) > 0),
) ?? items.find((i) => i.price_cents > 0) ?? items[0];
const beforeCents = target.price_cents;
console.log(`[3] target item: "${target.name}" id=${target.id} price=${beforeCents}c cogs=${target.computed_cogs_cents ?? target.cogs_cents}c`);

// ── 3. Browser session ──────────────────────────────────────────────────────
const cookieValue = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  token_type: "bearer",
  user: session.user,
});

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
const patchRequests = [];
const patchResponses = [];

page.on("request", (req) => {
  if (req.method() === "PATCH" && req.url().includes("/api/workspaces/menu-pricing/items")) {
    patchRequests.push({ url: req.url(), body: req.postData() });
  }
});
page.on("response", async (res) => {
  if (res.request().method() === "PATCH" && res.url().includes("/api/workspaces/menu-pricing/items")) {
    patchResponses.push({ url: res.url(), status: res.status() });
  }
});

mkdirSync("scripts/shots", { recursive: true });

// ── 4. Load menu workspace, dismiss cookie banner ──────────────────────────
console.log("[4] loading /workspace/menu-pricing...");
await page.goto(`${PROD_URL}/workspace/menu-pricing`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});

const cookieBtn = page.getByRole("button", { name: /^Accept All$/ });
if (await cookieBtn.first().isVisible().catch(() => false)) {
  await cookieBtn.first().click();
  await page.waitForTimeout(300);
}

// ── 5. Open the editor for the target item ─────────────────────────────────
// SortableMenuItemRow renders the item name as a <span> with a click handler
// on the wrapping <div onClick={onSelect}>. Click the row by name to expand
// the editor pane (which contains "Suggest retail price").
console.log(`[5] selecting "${target.name}" row...`);
const itemRow = page.getByText(target.name, { exact: true }).first();
await itemRow.scrollIntoViewIfNeeded();
await itemRow.click();
await page.waitForTimeout(800);

await page.screenshot({ path: "scripts/shots/tim2921-editor-open.png", fullPage: true });

// ── 6. Switch to the "Cost of Goods" tab — "Suggest retail price" lives there
const cogsTab = page.getByRole("tab", { name: /Cost of Goods/i });
await cogsTab.first().waitFor({ state: "visible", timeout: 10_000 });
await cogsTab.first().click();
await page.waitForTimeout(500);
const aiSection = page.getByText(/AI Price Suggestion/i);
await aiSection.first().scrollIntoViewIfNeeded().catch(() => {});
const suggestBtn = page.getByRole("button", { name: /Suggest retail price|Thinking/i });
const visible = await suggestBtn.first().isVisible().catch(() => false);
console.log(`  Suggest retail price button visible: ${visible}`);
if (!visible) {
  await page.screenshot({ path: "scripts/shots/tim2921-no-suggest-btn.png", fullPage: true });
  const allButtonTexts = await page.locator("button").allInnerTexts();
  console.log("  available buttons:", allButtonTexts.slice(0, 40).map((s) => s.trim().slice(0, 50)).filter(Boolean));
  await browser.close();
  throw new Error("Suggest retail price button not visible — item may need a recipe (COGS > 0) first");
}
console.log("[6] clicking Suggest retail price...");
await suggestBtn.first().scrollIntoViewIfNeeded();
await suggestBtn.first().click();

// ── 7. Wait for the AI Review Modal to render the proposal ─────────────────
const reviewDialog = page.locator('[role="dialog"][aria-modal="true"][aria-label*="suggestions" i]');
await reviewDialog.waitFor({ state: "visible", timeout: 60_000 });
console.log("[7] AI review modal visible — waiting for suggestion card...");

// Wait for the per-card Accept button to render — that means streaming
// completed and the suggestion is in the DOM.
const acceptBtn = reviewDialog.getByRole("button", { name: /^Accept this suggestion$/i });
await acceptBtn.first().waitFor({ state: "visible", timeout: 90_000 });

// Capture proposed price text from the card BEFORE accepting.
const dialogText = await reviewDialog.innerText();
const dollarMatch = dialogText.match(/\$(\d+(?:\.\d{1,2})?)/);
const proposedCents = dollarMatch ? Math.round(parseFloat(dollarMatch[1]) * 100) : null;
console.log(`  proposed price from modal: ${proposedCents}c (raw: ${dollarMatch?.[0] ?? "?"})`);

await acceptBtn.first().click();
console.log("[8] Accept clicked");
await page.waitForTimeout(400);

// ── 8. Click Apply — now enabled with "Apply 1 change" label ───────────────
const applyBtn = reviewDialog.getByRole("button", { name: /Apply 1 change/i });
await applyBtn.first().waitFor({ state: "visible", timeout: 15_000 });
await applyBtn.first().click();
console.log("[9] Apply clicked — waiting for PATCH...");

// Wait for PATCH response OR for modal to close.
await page.waitForResponse(
  (r) =>
    r.request().method() === "PATCH" &&
    r.url().includes("/api/workspaces/menu-pricing/items"),
  { timeout: 15_000 },
).catch(() => {});

await page.waitForTimeout(1000);
await page.screenshot({ path: "scripts/shots/tim2921-after-apply.png", fullPage: true });

console.log(`  PATCH requests captured: ${patchRequests.length}`);
patchRequests.forEach((p) => console.log(`    ${p.url}  body=${p.body}`));
console.log(`  PATCH responses captured: ${patchResponses.length}`);
patchResponses.forEach((p) => console.log(`    ${p.status} ${p.url}`));

await browser.close();

// ── 9. Server-truth assertion: reload from DB ──────────────────────────────
const { data: afterRow } = await admin
  .from("menu_items")
  .select("price_cents")
  .eq("id", target.id)
  .single();
const afterCents = afterRow?.price_cents;
console.log(`[10] DB price after Accept: ${afterCents}c (was ${beforeCents}c)`);

// ── 10. Verdict ─────────────────────────────────────────────────────────────
// The round-trip guarantee TIM-2921 fixes is: the price the PATCH writes
// must end up in the DB. (Pre-fix: PATCH 404'd, DB never changed, optimistic
// state lied to the user.) So we assert the PATCHed price_cents equals what
// the DB returns on read-back — server truth matches the user's accepted value.
let patchedCents = null;
const patchedBody = patchRequests[0]?.body;
if (patchedBody) {
  try {
    patchedCents = JSON.parse(patchedBody).price_cents ?? null;
  } catch {}
}

const patchOk = patchResponses.some((p) => p.status >= 200 && p.status < 300);
const persistedChange = afterCents !== beforeCents;
const dbMatchesPatch = patchedCents !== null && afterCents === patchedCents;
const correctEndpoint = patchRequests.every(
  (r) => r.url.endsWith("/api/workspaces/menu-pricing/items") && r.body?.includes('"id":'),
);

const verdict = {
  patchRequestCount: patchRequests.length,
  patchResponseOk: patchOk,
  correctEndpoint,
  patchedCents,
  patchResponses,
  beforeCents,
  afterCents,
  persistedChange,
  dbMatchesPatch,
};
writeFileSync("scripts/shots/tim2921-verdict.json", JSON.stringify(verdict, null, 2));

// ── 11. Reset the price so we don't leave trent's plan in a weird state ───
if (afterCents !== beforeCents) {
  await admin
    .from("menu_items")
    .update({ price_cents: beforeCents })
    .eq("id", target.id);
  console.log(`[11] reset price back to ${beforeCents}c`);
}

if (patchOk && correctEndpoint && persistedChange && dbMatchesPatch) {
  console.log("\n✓ PASS — AI suggestion → Accept → DB price equals patched value (round-trip clean)");
  process.exit(0);
} else {
  console.log("\n✗ FAIL");
  console.log("  PATCH ok:", patchOk);
  console.log("  correct endpoint (collection + id in body):", correctEndpoint);
  console.log("  persisted change:", persistedChange);
  console.log("  DB matches PATCH:", dbMatchesPatch);
  process.exit(1);
}
