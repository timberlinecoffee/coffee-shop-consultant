// TIM-3329: live prod verification that Equipment & Supplies Suite cells
// persist on Tab between fields and after a page refresh.
//
// Strategy:
//   1. Create a synthetic Pro user (subscription_status=active, tier=pro,
//      onboarding_completed=true) + an empty coffee_shop_plans row.
//   2. Magic-link → session cookie → Playwright.
//   3. Navigate to /workspace/buildout-equipment.
//   4. Click "Add item", focus the name cell of the new row, then type 5
//      items using ONLY Tab between fields (no clicks, no Enter).
//      Each item fills 9 columns; Tab past the 9th column auto-adds the
//      next blank row in handleCellKeyDown.
//   5. Wait for autosave debounce + create POSTs to settle.
//   6. Screenshot "before refresh".
//   7. Page refresh.
//   8. Screenshot "after refresh".
//   9. Read rendered name + cost cells, assert all 5 items still present.
//  10. Cleanup synthetic user via auth admin API.
//
// Default target = https://groundwork.cafe (override via TARGET_URL).
// Run: node scripts/tim3329-equipment-tab-persistence-verify.mjs

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

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
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_NEW_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET = process.env.TARGET_URL ?? "https://groundwork.cafe";
const HOST = new URL(TARGET).host;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.error("missing supabase env");
  process.exit(2);
}

const REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const tag = randomBytes(4).toString("hex");
const email = `tim3329-${tag}@simpler.coffee`;
const password = `TIM3329-${tag}-x9!Q`;
const OUT_DIR = "out/tim3329";
mkdirSync(OUT_DIR, { recursive: true });

let userId = null;
let planId = null;

const ITEMS = [
  { name: "Espresso Machine", vendor: "La Marzocco", model: "Linea Mini", supplier: "Acme Supply", cost: "8500", life: "7", notes: "Primary station" },
  { name: "Grinder", vendor: "Mahlkonig", model: "EK43", supplier: "Acme Supply", cost: "3200", life: "7", notes: "Single dose" },
  { name: "Refrigerator", vendor: "True", model: "TUC-72", supplier: "Acme Supply", cost: "4100", life: "10", notes: "Under counter" },
  { name: "POS Terminal", vendor: "Square", model: "Register", supplier: "Acme Supply", cost: "799", life: "5", notes: "Main counter" },
  { name: "Display Case", vendor: "Federal", model: "ECGD-77", supplier: "Acme Supply", cost: "5300", life: "10", notes: "Pastry display" },
];

try {
  console.log(`[1/9] create synthetic Pro user ${email}`);
  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) throw createErr;
  userId = createData.user.id;
  console.log(`      user.id=${userId}`);

  console.log("[2/9] mark user Pro + onboarded");
  const { error: updErr } = await admin.from("users").update({
    subscription_status: "active",
    subscription_tier: "pro",
    onboarding_completed: true,
  }).eq("id", userId);
  if (updErr) throw updErr;

  console.log("[3/9] seed empty coffee_shop_plans row");
  const { data: planData, error: planErr } = await admin
    .from("coffee_shop_plans")
    .insert({ user_id: userId, plan_name: "TIM-3329 Verify" })
    .select()
    .single();
  if (planErr) throw planErr;
  planId = planData.id;
  console.log(`      plan.id=${planId}`);

  console.log(`[4/9] magic-link → session for ${email}`);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
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
  if (!session) throw new Error("no session");

  const cookieValue = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: "bearer",
    user: session.user,
  });

  console.log("[5/9] launch browser, drop session cookie");
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
  // Log all relevant /api/workspaces/financials/equipment requests
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/workspaces/financials/equipment") || url.includes("/api/workspaces/buildout")) {
      console.log(`  [req] ${req.method()} ${url.split("groundwork.cafe").pop()}`);
    }
  });
  page.on("response", async (res) => {
    const url = res.url();
    if (url.includes("/api/workspaces/financials/equipment") || url.includes("/api/workspaces/buildout")) {
      console.log(`  [res] ${res.status()} ${res.request().method()} ${url.split("groundwork.cafe").pop()}`);
    }
  });

  console.log(`[6/9] open ${TARGET}/workspace/buildout-equipment`);
  await page.goto(`${TARGET}/workspace/buildout-equipment`, { waitUntil: "networkidle" });

  // Dismiss cookie banner if present
  const banner = page.locator('[data-consent-banner]');
  if (await banner.isVisible().catch(() => false)) {
    const accept = page.getByRole("button", { name: /accept|ok|got it/i }).first();
    if (await accept.isVisible().catch(() => false)) await accept.click();
  }

  // Settle any auto-open modals
  await page.waitForTimeout(1000);
  // Dismiss the Equipment seed callout if present (it has a clear X button
  // with aria-label "Dismiss this notice").
  const dismissCallout = page.getByRole("button", { name: /dismiss this notice/i }).first();
  if (await dismissCallout.isVisible({ timeout: 500 }).catch(() => false)) {
    await dismissCallout.click();
    await page.waitForTimeout(200);
  }

  console.log("[7/9] click Add row and type 5 items with Tab between fields");
  // EquipmentGrid renders a "+ Add row" button below the table.
  const addBtn = page.getByRole("button", { name: /^add row$/i }).first();
  await addBtn.scrollIntoViewIfNeeded();
  await addBtn.click();
  // Wait for addRow's focusCell (30ms setTimeout + 20ms inner setTimeout)
  await page.waitForTimeout(200);

  // Defensive: explicitly click the Name input of the newly-created blank row
  // so Playwright's keyboard.type lands there, regardless of any focus race.
  const nameInputLocator = page.locator('input[placeholder="Item name"]').first();
  if (await nameInputLocator.isVisible({ timeout: 2000 }).catch(() => false)) {
    await nameInputLocator.focus();
    console.log("      Name input focused explicitly");
  } else {
    console.warn("      WARN: Name input not visible after Add row click");
  }

  // For each item, type 9 fields separated by Tab.
  // EDITABLE_COLS order: name, vendor, model, supplier, unit_cost_cents,
  //                     financing_method, category, useful_life_years, notes
  // For select cells (financing_method, category), we Tab past without
  // changing — Tab still must NOT clear data on the inputs before/after.
  for (let i = 0; i < ITEMS.length; i++) {
    const it = ITEMS[i];
    // name
    await page.keyboard.type(it.name, { delay: 18 });
    await page.keyboard.press("Tab");
    // vendor
    await page.keyboard.type(it.vendor, { delay: 18 });
    await page.keyboard.press("Tab");
    // model
    await page.keyboard.type(it.model, { delay: 18 });
    await page.keyboard.press("Tab");
    // supplier
    await page.keyboard.type(it.supplier, { delay: 18 });
    await page.keyboard.press("Tab");
    // unit_cost_cents
    await page.keyboard.type(it.cost, { delay: 18 });
    await page.keyboard.press("Tab");
    // financing_method (select) — skip without changing
    await page.keyboard.press("Tab");
    // category (select) — skip without changing
    await page.keyboard.press("Tab");
    // useful_life_years — clear default 7 then type
    if (it.life !== "7") {
      await page.keyboard.press("Control+A");
      await page.keyboard.type(it.life, { delay: 18 });
    }
    await page.keyboard.press("Tab");
    // notes (multiline)
    await page.keyboard.type(it.notes, { delay: 18 });
    await page.keyboard.press("Tab");
    // Tab past notes triggers addRow for the next item; addRow focuses next
    // name cell after 30ms+20ms.
    await page.waitForTimeout(200);
    // Probe focus to verify it landed on next-row name (or report mishap)
    const focusInfo = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return "null";
      const tag = el.tagName.toLowerCase();
      const placeholder = el.getAttribute?.("placeholder") || "";
      const aria = el.getAttribute?.("aria-label") || "";
      const name = el.getAttribute?.("name") || "";
      const role = el.getAttribute?.("role") || "";
      return `${tag}#${el.id || ""} placeholder="${placeholder}" aria-label="${aria}" name="${name}" role="${role}"`;
    });
    console.log(`      item ${i + 1}/${ITEMS.length} typed: ${it.name} — focus after Tab: ${focusInfo}`);
  }

  // Wait for autosave debounce (400ms) + create POST round-trips to settle.
  console.log("[8/9] wait for autosave settle + screenshot before refresh");
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT_DIR}/before-refresh.png`, fullPage: true });

  console.log("      reload page (post-refresh check)");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT_DIR}/after-refresh.png`, fullPage: true });

  console.log("[9/9] assert all 5 names + cost values rendered post-refresh");
  // Names render in the inactive view as a <span> with truncate class. Pull
  // all rendered text from the table body and check each expected name +
  // each expected cost (formatted via the currency formatter — $X,XXX).
  const tableText = await page.locator("table").innerText().catch(() => "");
  const fullPageText = await page.locator("body").innerText();
  const lookIn = tableText || fullPageText;

  let pass = true;
  for (const it of ITEMS) {
    if (!lookIn.includes(it.name)) {
      console.error(`  ✗ MISSING name: ${it.name}`);
      pass = false;
    } else {
      console.log(`  ✓ name present: ${it.name}`);
    }
  }
  // Cost check — page renders cost cell as <span>$N,NNN</span> via formatCurrency.
  for (const it of ITEMS) {
    const cents = Math.round(parseFloat(it.cost) * 100);
    const dollars = (cents / 100).toLocaleString("en-US");
    // Allow "$8,500" or "$8,500.00" — match the integer dollars at minimum.
    const re = new RegExp(`\\$${dollars.replace(/,/g, ",")}(\\.\\d{2})?`);
    if (!re.test(lookIn)) {
      console.error(`  ✗ MISSING cost: ${it.name} ($${dollars})`);
      pass = false;
    } else {
      console.log(`  ✓ cost present: ${it.name} ($${dollars})`);
    }
  }

  await browser.close();
  console.log(pass ? "PASS" : "FAIL");
  if (!pass) process.exitCode = 1;
} finally {
  // Cleanup synthetic user (cascades plan + items via FK)
  if (userId) {
    console.log(`[cleanup] delete synthetic user ${userId}`);
    await admin.auth.admin.deleteUser(userId).catch((e) =>
      console.error(`  cleanup error: ${e.message}`),
    );
  }
}
