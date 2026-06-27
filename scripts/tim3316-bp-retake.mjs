// TIM-3316 — retake just the Business Plan header so the "Saved · HH:MM"
// stamp appears between "Improve with Scout" and "Save". BP only renders the
// stamp after a real save event with actual dirty state — typing into the
// first section textarea + clicking Save sets saveState to "saved".

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

const BASE_URL = "https://groundwork.cafe";
const PASSWORD = "Tim3316!Verify_" + Math.random().toString(36).slice(2, 8);
const EMAIL = `tim3316-bp-${Date.now()}@simpler.coffee`;

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (cErr) throw cErr;
  const userId = created.user.id;

  await admin.from("users").upsert({
    id: userId,
    email: EMAIL,
    subscription_tier: "pro",
    subscription_status: "active",
    onboarding_completed: true,
  });
  const { data: planRow } = await admin
    .from("coffee_shop_plans")
    .insert({ user_id: userId, plan_name: "TIM-3316 BP", status: "in_progress" })
    .select()
    .single();
  console.log(`seeded user=${userId} plan=${planRow.id}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    // dismiss cookie banner if present
    for (const sel of ['button:has-text("Accept all")', 'button:has-text("Accept")']) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
        await el.click().catch(() => {});
        break;
      }
    }
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });

    await page.goto(`${BASE_URL}/workspace/business-plan`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Expand all sections then click into Cover & Branding first.
    const expand = page.locator("text=Expand all").first();
    if (await expand.isVisible({ timeout: 1500 }).catch(() => false)) {
      await expand.click().catch(() => {});
      await page.waitForTimeout(800);
    }
    // Many BP sections render their inline edit via an "Edit" button that
    // toggles a textarea. Click the first one to enter edit mode.
    const editBtn = page
      .locator('main button:has-text("Edit"), main button[aria-label="Edit"]')
      .first();
    if (await editBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editBtn.click().catch(() => {});
      await page.waitForTimeout(600);
    }

    const editor = page
      .locator('main textarea:visible, main [contenteditable="true"]:visible')
      .first();
    if (await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editor.focus();
      await page.keyboard.type("TIM-3316 verify", { delay: 30 });
      console.log("typed into BP editor");
    } else {
      console.log("no editor found — BP will save header-state only");
    }

    // Click the header Save button
    const save = page.locator('header button:has-text("Save")').first();
    await save.click({ trial: false }).catch((e) => console.error("save click:", e.message));
    // Wait for "Saving…" to transition to "Saved · "
    await page
      .locator('text=/Saved\\s*·/')
      .first()
      .waitFor({ state: "visible", timeout: 6000 })
      .catch((e) => console.error("saved stamp:", e.message));
    await page.waitForTimeout(500);

    const path = join(OUT_DIR, "business-plan.png");
    await page.screenshot({ path, clip: { x: 0, y: 0, width: 1440, height: 360 } });
    console.log(`screenshot → ${path}`);
  } finally {
    await browser.close();
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
