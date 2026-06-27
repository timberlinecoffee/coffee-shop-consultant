// TIM-3316 — Post-merge screenshot verification for TIM-3313 (PR #257).
// Capture all 11 workspace headers at 1440x900 on groundwork.cafe with the
// "Saved · HH:MM" state visible, plus the Menu Ingredients regression check.
//
// Pattern: synthetic Pro user via SUPABASE_NEW_SECRET_KEY (see standing
// pattern tim-3299-help-legal-in-app-chrome / tim-3226-menu-labels-shipped).
//
// Run: SUPABASE_NEW_SECRET_KEY=... node scripts/tim3316-workspace-header-grid.mjs

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots", "tim3316");

const SUPABASE_URL = "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SUPABASE_SECRET = process.env.SUPABASE_NEW_SECRET_KEY;
if (!SUPABASE_SECRET) throw new Error("SUPABASE_NEW_SECRET_KEY missing");

const BASE_URL = process.env.GW_BASE || "https://groundwork.cafe";
const PASSWORD = "Tim3316!Verify_" + Math.random().toString(36).slice(2, 8);
const EMAIL = `tim3316-${Date.now()}@simpler.coffee`;

const WORKSPACES = [
  // [group, slug, label, path]
  ["A", "concept", "01 Concept", "/workspace/concept"],
  ["A", "financials", "02 Financials", "/workspace/financials"],
  ["A", "buildout-equipment", "03 Equipment & Supplies", "/workspace/buildout-equipment"],
  ["A", "business-plan", "04 Business Plan", "/workspace/business-plan"],
  ["B", "marketing", "05 Marketing", "/workspace/marketing"],
  ["B", "operations-playbook", "06 Operations Playbook", "/workspace/operations-playbook"],
  ["C", "menu-pricing", "07 Menu & Pricing", "/workspace/menu-pricing"],
  ["C", "hiring", "08 Hiring", "/workspace/hiring"],
  ["C", "opening-month-plan", "09 Opening Month Plan", "/workspace/opening-month-plan"],
  ["C", "suppliers", "10 Suppliers", "/workspace/suppliers"],
  ["C", "location-lease", "11 Location & Lease", "/workspace/location-lease"],
];

async function seedUser(admin) {
  console.log(`→ Creating synthetic Pro user ${EMAIL}`);
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createErr) throw createErr;
  const userId = created.user.id;

  // upsert users row — server may not auto-create
  const { error: userErr } = await admin
    .from("users")
    .upsert({
      id: userId,
      email: EMAIL,
      subscription_tier: "pro",
      subscription_status: "active",
      onboarding_completed: true,
    })
    .select()
    .single();
  if (userErr) console.warn("users upsert warning:", userErr.message);

  const { data: planRow, error: planErr } = await admin
    .from("coffee_shop_plans")
    .insert({
      user_id: userId,
      plan_name: "TIM-3316 Verify Shop",
      status: "in_progress",
    })
    .select()
    .single();
  if (planErr) throw planErr;
  console.log(`  ✓ user ${userId} + plan ${planRow.id}`);
  return { userId, planId: planRow.id };
}

async function cleanupUser(admin, userId) {
  try {
    await admin.auth.admin.deleteUser(userId);
    console.log(`→ Deleted synthetic user ${userId}`);
  } catch (e) {
    console.warn("cleanup failed:", e.message);
  }
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await dismissCookieBanner(page);
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  // Wait for any post-login destination; capture error if any
  try {
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
      timeout: 30_000,
    });
  } catch (e) {
    const text = (await page.locator("body").innerText().catch(() => "")).slice(0, 500);
    await page.screenshot({ path: join(OUT_DIR, "_login-fail.png") }).catch(() => {});
    throw new Error(`login navigation failed; body excerpt: ${text}`);
  }
  console.log(`  ✓ logged in to ${page.url()}`);
}

async function dismissCookieBanner(page) {
  // TIM-3284 banner sits at document end; try a few well-known labels
  const candidates = [
    'button:has-text("Accept all")',
    'button:has-text("Accept")',
    'button:has-text("Got it")',
    'button:has-text("OK")',
  ];
  for (const sel of candidates) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
      await el.click().catch(() => {});
      await page.waitForTimeout(300);
      return;
    }
  }
}

async function triggerSave(page, group) {
  // 1) Dirty the workspace by typing into the first visible input/textarea.
  //    Some workspaces only persist when there are actual changes — clicking
  //    Save with no dirty state is a no-op (e.g. business-plan).
  const input = page
    .locator('main textarea:visible, main input[type="text"]:visible, main [contenteditable="true"]:visible')
    .first();
  let dirtied = false;
  if (await input.isVisible({ timeout: 1500 }).catch(() => false)) {
    try {
      await input.focus();
      await page.keyboard.type(" ");
      await page.waitForTimeout(150);
      await page.keyboard.press("Backspace");
      dirtied = true;
    } catch {}
  }

  // 2) Click the header Save button if there is one.
  const saveBtn = page.locator('header button:has-text("Save")').first();
  const hasButton = await saveBtn
    .isVisible({ timeout: 1500 })
    .catch(() => false);
  if (hasButton) {
    await saveBtn.click().catch(() => {});
    return dirtied ? "dirty+click" : "click-save";
  }
  // No Save button — Group A auto-save kicks in after debounce
  await page.waitForTimeout(900);
  return dirtied ? "auto-save" : "no-input";
}

async function waitForSavedStamp(page) {
  // Look for "Saved" text within 5s. The new format is "Saved · HH:MMam".
  const saved = page.locator('text=/Saved\\s*·/').first();
  await saved.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
}

async function capture(page, slug, label) {
  const path = join(OUT_DIR, `${slug}.png`);
  // Clip to top band — 1440x300 captures the canonical workspace header row
  await page.screenshot({ path, clip: { x: 0, y: 0, width: 1440, height: 360 } });
  console.log(`  📸 ${label} → ${path}`);
  return path;
}

async function captureMenuIngredientsRegression(page) {
  await page.goto(`${BASE_URL}/workspace/menu-pricing`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1200);
  // Tab labeled "Ingredients" inside the menu workspace sub-nav
  const tab = page
    .locator(
      'button:has-text("Ingredients"), a:has-text("Ingredients"), [role="tab"]:has-text("Ingredients")',
    )
    .first();
  if (await tab.isVisible({ timeout: 2500 }).catch(() => false)) {
    await tab.click().catch(() => {});
    await page.waitForTimeout(800);
  }
  const path = join(OUT_DIR, "regression-menu-ingredients.png");
  await page.screenshot({
    path,
    clip: { x: 0, y: 0, width: 1440, height: 700 },
  });
  console.log(`  📸 Menu → Ingredients regression → ${path}`);
  return path;
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { userId } = await seedUser(admin);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await login(page);
    await dismissCookieBanner(page);

    for (const [group, slug, label, path] of WORKSPACES) {
      console.log(`→ [${group}] ${label}`);
      try {
        await page.goto(`${BASE_URL}${path}`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await page.waitForTimeout(1500);
        await dismissCookieBanner(page);
        const mode = await triggerSave(page, group);
        await waitForSavedStamp(page);
        await page.waitForTimeout(400);
        await capture(page, slug, label);
        console.log(`  · save-mode=${mode}`);
      } catch (e) {
        console.error(`  ✗ ${label} failed: ${e.message}`);
      }
    }

    console.log("→ Menu Ingredients regression check");
    await captureMenuIngredientsRegression(page);
  } finally {
    await browser.close();
    await cleanupUser(admin, userId);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
