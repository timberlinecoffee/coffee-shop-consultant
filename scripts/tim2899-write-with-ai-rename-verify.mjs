// TIM-2899 live verify on groundwork.cafe against the trent@simpler.coffee fixture.
//
// Proves the platform-wide rename:
//   1) Concept page (desktop): 0 "Ask AI" | 0 "Improve with AI" | 0 "Write this for me",
//      and >=6 "Write with AI" buttons (per-card trigger on each non-Persona card).
//   2) AIAssistCallout modal: opens via a "Write with AI" trigger; the secondary action
//      button reads "Write with AI" (was "Write this for me"); zero residual variants.
//   3) Persona editor: contains exactly 3 "Write with AI" buttons (whyTheyVisit /
//      painPoints / typicalOrder).
//   4) Concept page (mobile 390x844 viewport): same negative assertions hold; mobile
//      copy is identical to desktop.
//   5) Smoke on a non-Concept workspace (Brand): page renders without any orphan
//      "Ask AI" / "Improve with AI" / "Write this for me" labels.
//
// Cookie/auth pattern mirrors TIM-2897 / TIM-2898 verify scripts.
//
// Run from project root: `node scripts/tim2899-write-with-ai-rename-verify.mjs`

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

console.log(`[1/9] minting magiclink for ${TARGET_EMAIL}...`);
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: TARGET_EMAIL,
});
if (linkErr) throw linkErr;
const tokenHash = linkData?.properties?.hashed_token;
if (!tokenHash) throw new Error("no token_hash");

console.log("[2/9] exchanging for session...");
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

mkdirSync("scripts/shots", { recursive: true });

async function newCtx(viewport) {
  const ctx = await browser.newContext({ viewport });
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
  return ctx;
}

const OLD_VARIANTS = ["Ask AI", "Improve with AI", "Write this for me"];

async function assertNoOldVariants(page, surfaceLabel) {
  for (const v of OLD_VARIANTS) {
    const n = await page.getByText(v, { exact: true }).count();
    if (n !== 0) {
      await page.screenshot({
        path: `scripts/shots/tim2899-FAIL-${surfaceLabel}-${v.replace(/\s+/g, "-")}.png`,
        fullPage: true,
      });
      throw new Error(`[${surfaceLabel}] FAIL — found ${n} '${v}' instance(s); expected 0`);
    }
  }
  console.log(`  ✓ [${surfaceLabel}] zero old variants ('Ask AI', 'Improve with AI', 'Write this for me')`);
}

console.log("[3/9] launching browser...");
const browser = await chromium.launch();
const ctx = await newCtx({ width: 1440, height: 900 });
const page = await ctx.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") console.log(`  [browser error] ${msg.text()}`);
});

console.log("[4/9] desktop Concept — loading /workspace/concept...");
const res = await page.goto(`${PROD_URL}/workspace/concept`, { waitUntil: "domcontentloaded" });
console.log(`  status ${res?.status()}  url=${page.url()}`);
if (page.url().includes("/login") || page.url().includes("/auth")) {
  console.error("  redirected to login — auth cookie not accepted");
  process.exit(1);
}
await page.waitForLoadState("networkidle").catch(() => {});

await assertNoOldVariants(page, "concept-desktop");

// New label present, on per-card triggers. Reveal-on-hover means we still get DOM nodes;
// expect at least 6 (one per non-Persona card per TIM-2859 + TIM-2897 audit).
const writeWithAIDesktop = await page.getByRole("button", { name: "Write with AI" }).count();
console.log(`  'Write with AI' button count (desktop concept): ${writeWithAIDesktop}`);
if (writeWithAIDesktop < 6) {
  await page.screenshot({
    path: "scripts/shots/tim2899-FAIL-too-few-write-with-ai-desktop.png",
    fullPage: true,
  });
  throw new Error(`FAIL — expected >=6 'Write with AI' buttons on Concept, found ${writeWithAIDesktop}`);
}
console.log("  ✓ Surface 1 PASS (desktop Concept cards)");
await page.screenshot({ path: "scripts/shots/tim2899-concept-desktop.png", fullPage: true });

console.log("[5/9] AIAssistCallout — opening modal via first 'Write with AI' trigger...");
// Hover the first non-Persona card to reveal the button, then click.
await page.getByRole("button", { name: "Write with AI" }).first().scrollIntoViewIfNeeded();
await page.getByRole("button", { name: "Write with AI" }).first().click({ force: true });
await page.waitForSelector("[role=\"dialog\"][aria-labelledby=\"ai-assist-title\"]", { timeout: 10000 });
const modal = page.locator("[role=\"dialog\"][aria-labelledby=\"ai-assist-title\"]");
await assertNoOldVariants(modal, "callout-modal");
// The secondary action button is the renamed "Write this for me" → "Write with AI".
// (The "Improve this" primary stays the same.)
const modalWriteWithAI = await modal.getByRole("button", { name: "Write with AI" }).count();
console.log(`  modal 'Write with AI' action button count: ${modalWriteWithAI}`);
if (modalWriteWithAI < 1) {
  await page.screenshot({
    path: "scripts/shots/tim2899-FAIL-modal-missing-write-with-ai.png",
    fullPage: true,
  });
  throw new Error("FAIL — AIAssistCallout missing 'Write with AI' action button");
}
const modalImproveThis = await modal.getByRole("button", { name: "Improve this" }).count();
console.log(`  modal 'Improve this' action button count: ${modalImproveThis}`);
if (modalImproveThis !== 1) {
  throw new Error(`FAIL — AIAssistCallout 'Improve this' button missing or duplicated (${modalImproveThis})`);
}
await page.screenshot({ path: "scripts/shots/tim2899-callout-modal.png", fullPage: false });
console.log("  ✓ Surface 2 PASS (AIAssistCallout modal)");
// Close modal.
await modal.getByRole("button", { name: "Close" }).click();
await page.waitForSelector("[role=\"dialog\"][aria-labelledby=\"ai-assist-title\"]", { state: "detached", timeout: 5000 }).catch(() => {});

console.log("[6/9] Persona editor — opening via '+ Add another persona' or existing edit...");
// Debug: list all button names containing 'persona' or 'expand'
const allBtnDbg = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("button")).map((b) => ({
    text: (b.textContent || "").trim().slice(0, 60),
    aria: b.getAttribute("aria-label"),
  })).filter(
    (b) =>
      /persona|expand|customer/i.test(b.text || "") || /persona|expand|customer/i.test(b.aria || ""),
  );
});
console.log(`  persona/expand-related buttons: ${JSON.stringify(allBtnDbg).slice(0, 500)}`);
// PersonaSection's add button text is "+ Add another persona" (PersonaSection.tsx:242).
// If trent's plan already has MAX_PERSONAS, that button is hidden — fall back to the
// "Edit persona" aria-label on an existing persona row.
let openedPersona = false;
// Empty-state copy is "Add your first persona"; populated section uses "+ Add another persona".
const addPersona = page.getByRole("button", { name: /Add (your first|another) persona/i });
const addCount = await addPersona.count();
console.log(`  add-persona button count: ${addCount}`);
if (addCount) {
  await addPersona.first().scrollIntoViewIfNeeded().catch(() => {});
  // Native HTMLElement.click() — bypasses Playwright pointer-event guards
  // (per TIM-2901 memory note: works on overlay/below-fold targets).
  await addPersona.first().evaluate((el) => el.click()).catch(() => {});
  openedPersona = await page
    .locator("#persona-why")
    .first()
    .waitFor({ state: "attached", timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  console.log(`  opened via add? ${openedPersona}`);
  if (openedPersona) {
    await page.locator("#persona-why").first().scrollIntoViewIfNeeded().catch(() => {});
  }
}
if (!openedPersona) {
  // PersonaCard renders an expand button labelled "Expand {name}" or just "Expand".
  const expandBtn = page.getByRole("button", { name: /^Expand( .+)?$/ });
  const count = await expandBtn.count();
  console.log(`  Expand-persona button count: ${count}`);
  if (count) {
    await expandBtn.first().scrollIntoViewIfNeeded().catch(() => {});
    await expandBtn.first().click({ force: true }).catch(() => {});
  }
}
// PersonaEditor renders the textarea ids #persona-why / #persona-pain / #persona-order.
await page.waitForSelector("#persona-why", { timeout: 8000 });
await assertNoOldVariants(page, "persona-editor");
// Persona editor adds 3 new "Write with AI" buttons (one per textarea) on top of the
// 6 per-card buttons already present. Total expected: 9.
const totalAfterPersona = await page.getByRole("button", { name: "Write with AI" }).count();
const personaWriteCount = totalAfterPersona - writeWithAIDesktop;
console.log(
  `  total 'Write with AI' after persona: ${totalAfterPersona}; delta vs concept-cards-only (${writeWithAIDesktop}): ${personaWriteCount} (expected 3)`,
);
if (personaWriteCount !== 3) {
  await page.screenshot({
    path: "scripts/shots/tim2899-FAIL-persona-wrong-count.png",
    fullPage: true,
  });
  throw new Error(`FAIL — expected 3 'Write with AI' in Persona editor, found ${personaWriteCount}`);
}
await page.screenshot({ path: "scripts/shots/tim2899-persona-editor.png", fullPage: false });
console.log("  ✓ Surface 3 PASS (Persona editor)");
await page.close();

console.log("[7/9] mobile Concept — viewport 390x844...");
const mctx = await newCtx({ width: 390, height: 844 });
const mpage = await mctx.newPage();
await mpage.goto(`${PROD_URL}/workspace/concept`, { waitUntil: "domcontentloaded" });
await mpage.waitForLoadState("networkidle").catch(() => {});
await assertNoOldVariants(mpage, "concept-mobile");
const mobileWriteCount = await mpage.getByRole("button", { name: "Write with AI" }).count();
console.log(`  mobile 'Write with AI' count: ${mobileWriteCount}`);
if (mobileWriteCount < 6) {
  await mpage.screenshot({ path: "scripts/shots/tim2899-FAIL-mobile.png", fullPage: true });
  throw new Error(`FAIL — mobile Concept expected >=6 'Write with AI', found ${mobileWriteCount}`);
}
await mpage.screenshot({ path: "scripts/shots/tim2899-concept-mobile.png", fullPage: true });
console.log("  ✓ Surface 4 PASS (mobile Concept)");
await mpage.close();

console.log("[8/9] non-Concept smoke — marketing / hiring / business-plan orphan-label check...");
const otherWorkspaces = ["marketing", "hiring", "business-plan"];
const bctx = await newCtx({ width: 1440, height: 900 });
const bpage = await bctx.newPage();
for (const ws of otherWorkspaces) {
  const wres = await bpage.goto(`${PROD_URL}/workspace/${ws}`, { waitUntil: "domcontentloaded" });
  console.log(`  ${ws} status ${wres?.status()} url=${bpage.url()}`);
  await bpage.waitForLoadState("networkidle").catch(() => {});
  await assertNoOldVariants(bpage, `${ws}-desktop`);
  await bpage.screenshot({ path: `scripts/shots/tim2899-${ws}-desktop.png`, fullPage: true });
}
console.log("  ✓ Surface 5 PASS (marketing/hiring/business-plan orphan check)");
await bpage.close();

console.log("[9/9] all surfaces verified.");
console.log("\n--- RESULT ---");
console.log("PASS — TIM-2899 platform-wide rename verified on groundwork.cafe.");
console.log(`  desktop Concept 'Write with AI' count: ${writeWithAIDesktop}`);
console.log(`  AIAssistCallout 'Write with AI' action: ${modalWriteWithAI}`);
console.log(`  Persona editor 'Write with AI' count:  ${personaWriteCount}`);
console.log(`  mobile Concept 'Write with AI' count:  ${mobileWriteCount}`);
console.log("  marketing/hiring/business-plan orphan check: clean");
await browser.close();
process.exit(0);
