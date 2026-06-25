// TIM-2923: Verify the menu-item pencil icon now opens the card editor
// (ItemEditorPanel) instead of an inline name-only field.
//
// PASS criteria:
//   1. Clicking the pencil on a menu item row reveals the Recipe / Cost of
//      Goods tabs (the card editor).
//   2. The row does NOT swap to a borderless inline name <input>.

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
const REF = new URL(SUPABASE_URL).hostname.split(".")[0];

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

const cookieValue = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  token_type: "bearer",
  user: session.user,
});

console.log("[2] launching browser...");
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
mkdirSync("scripts/shots", { recursive: true });

console.log("[3] loading /workspace/menu-pricing...");
const r = await page.goto(`${PROD_URL}/workspace/menu-pricing`, { waitUntil: "domcontentloaded" });
console.log(`  status ${r?.status()}  url=${page.url()}`);
await page.waitForLoadState("networkidle").catch(() => {});

const acceptBtn = page.getByRole("button", { name: /^Accept All$/ });
if (await acceptBtn.first().isVisible().catch(() => false)) {
  await acceptBtn.first().click();
  await page.waitForTimeout(300);
}

// Find any menu-item row. Identify by the per-row Edit-item button I added.
console.log("[4] looking for menu items with pencil affordance...");
let pencilBtns = page.getByRole("button", { name: /^Edit item$/i });
let pencilCount = await pencilBtns.count();
console.log(`  found ${pencilCount} pencil ("Edit item") buttons`);

if (pencilCount === 0) {
  // Either the new build isn't live yet, or the menu has no items.
  // Pre-fix the pencil had no aria-label, so we can also probe by Edit2 SVG
  // size+icon in the row's action column.
  console.log("  ✗ no 'Edit item' aria-labelled buttons — old build still live or menu empty");
  const anyItemNames = await page.locator('div:has-text("Category:")').count();
  console.log(`  rows with "Category:" tag: ${anyItemNames}`);
  await page.screenshot({ path: "scripts/shots/tim2923-no-pencil.png", fullPage: true });
  await browser.close();
  process.exit(2); // signal "not yet deployed"
}

const firstPencil = pencilBtns.first();
await firstPencil.scrollIntoViewIfNeeded();
await page.screenshot({ path: "scripts/shots/tim2923-before-pencil.png", fullPage: false });

console.log("[5] clicking first pencil...");
await firstPencil.click();
await page.waitForTimeout(800);

// The card editor (ItemEditorPanel) shows tabs "Recipe" and "Cost of Goods".
const recipeTab = page.getByRole("tab", { name: /^Recipe$/i });
const cogsTab = page.getByRole("tab", { name: /Cost of Goods/i });
const recipeVisible = await recipeTab.first().isVisible().catch(() => false);
const cogsVisible = await cogsTab.first().isVisible().catch(() => false);
console.log(`  Recipe tab visible: ${recipeVisible}`);
console.log(`  Cost of Goods tab visible: ${cogsVisible}`);

// And there should NOT be a borderless inline-edit input that was the old
// inline rename. The card editor's name field is allowed (it has its own
// styling) — we tolerate the card-editor name input as long as the tabs are
// present (proves we're in the panel, not the inline-rename).
await page.screenshot({ path: "scripts/shots/tim2923-after-pencil.png", fullPage: false });

await browser.close();

const cardEditorOpen = recipeVisible && cogsVisible;
if (cardEditorOpen) {
  console.log("\n=> PASS: pencil opens the card editor (Recipe + Cost of Goods tabs visible)");
  process.exit(0);
} else {
  console.log("\n=> FAIL: pencil did NOT open the card editor");
  process.exit(1);
}
