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

const { data: items } = await admin
  .from("menu_items")
  .select("id, name, price_cents")
  .eq("plan_id", planId)
  .eq("archived", false)
  .order("position")
  .limit(20);
if (!items?.length) throw new Error("no menu items for trent's active plan");
const target = items.find((i) => i.price_cents > 0) ?? items[0];
const beforeCents = target.price_cents;
console.log(`[3] target item: "${target.name}" id=${target.id} price=${beforeCents}c`);

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
// Each menu row exposes an Item-name input; click it to focus the editor on
// that row. The editor's "Suggest retail price" lives in the right pane.
console.log(`[5] selecting "${target.name}" row...`);
const itemInput = page.locator(`input[value="${target.name.replace(/"/g, '\\"')}"]`).first();
await itemInput.scrollIntoViewIfNeeded();
await itemInput.click();
await page.waitForTimeout(500);

await page.screenshot({ path: "scripts/shots/tim2921-editor-open.png", fullPage: true });

// ── 6. Click "Suggest retail price" ─────────────────────────────────────────
const suggestBtn = page.getByRole("button", { name: /Suggest retail price|Thinking/i });
if (!(await suggestBtn.first().isVisible().catch(() => false))) {
  await page.screenshot({ path: "scripts/shots/tim2921-no-suggest-btn.png", fullPage: true });
  await browser.close();
  throw new Error("Suggest retail price button not visible — item may need a recipe (COGS > 0) first");
}
console.log("[6] clicking Suggest retail price...");
await suggestBtn.first().click();

// ── 7. Wait for the AI Review Modal to render the proposal ─────────────────
const reviewDialog = page.locator('[role="dialog"][aria-modal="true"][aria-label*="suggestions" i]');
await reviewDialog.waitFor({ state: "visible", timeout: 60_000 });
console.log("[7] AI review modal visible");

// Wait until streaming completes (Apply button enabled).
const applyBtn = reviewDialog.locator('button', { hasText: /^Apply\s+\d+\s+change/i });
await applyBtn.first().waitFor({ state: "visible", timeout: 60_000 });

// Accept the suggestion (per-card accept button).
const acceptBtn = reviewDialog.getByRole("button", { name: /^Accept this suggestion$/i });
await acceptBtn.first().click();
console.log("[8] Accept clicked");

// Capture the proposed value text BEFORE applying so we can compare.
const proposedText = await reviewDialog.locator(".prose, .text-sm, p, div").allInnerTexts();
const dollarMatch = proposedText.join("\n").match(/\$(\d+(?:\.\d{1,2})?)/);
const proposedCents = dollarMatch ? Math.round(parseFloat(dollarMatch[1]) * 100) : null;
console.log(`  proposed price detected from modal: ${proposedCents}c (raw: ${dollarMatch?.[0] ?? "?"})`);

// ── 8. Apply the change ─────────────────────────────────────────────────────
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
const patchOk = patchResponses.some((p) => p.status >= 200 && p.status < 300);
const persistedChange = afterCents !== beforeCents;
const matchesProposal = proposedCents !== null && afterCents === proposedCents;

const verdict = {
  patchRequestCount: patchRequests.length,
  patchResponseOk: patchOk,
  patchResponses,
  beforeCents,
  afterCents,
  proposedCents,
  persistedChange,
  matchesProposal,
};
writeFileSync("scripts/shots/tim2921-verdict.json", JSON.stringify(verdict, null, 2));

if (patchOk && persistedChange && matchesProposal) {
  console.log("\n✓ PASS — AI suggestion → Accept → DB price equals proposed value");
  process.exit(0);
} else {
  console.log("\n✗ FAIL");
  console.log("  PATCH ok:", patchOk);
  console.log("  persisted:", persistedChange);
  console.log("  matches proposal:", matchesProposal);
  process.exit(1);
}
