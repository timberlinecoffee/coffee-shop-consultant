/**
 * TIM-3353 — Browser visual test for TIM-3350 SectionHeader replacement.
 *
 * Boots against `next dev` on http://localhost:3353 with branch
 * `feat/tim-3305-concept-business-plan` checked out, signs in as a synthetic
 * Pro user, and captures four PNGs:
 *
 *   1. concept-card.png    — Concept workspace single section card (canonical SectionHeader).
 *   2. concept-help-popover.png — Same card with (?) popover open.
 *   3. business-plan-expanded.png — BP workspace expanded section card.
 *   4. business-plan-row.png — Cropped header row, demonstrating Rotate/Eye are
 *      siblings to the right of (outside) the SectionHeader.
 *
 * Run:  cd /tmp/tim3353-visual && node scripts/tim3353-section-header-shots.mjs
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots", "tim3353");

const SUPABASE_URL = "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SUPABASE_SECRET = process.env.SUPABASE_NEW_SECRET_KEY;
const SUPABASE_PUBLISHABLE = process.env.SUPABASE_NEW_PUBLISHABLE_KEY;

if (!SUPABASE_SECRET || !SUPABASE_PUBLISHABLE) {
  console.error("Missing SUPABASE_NEW_SECRET_KEY or SUPABASE_NEW_PUBLISHABLE_KEY env vars.");
  process.exit(1);
}

const TS = Date.now();
const SYN_EMAIL = `tim3353+${TS}@timberline.coffee`;
const SYN_PASSWORD = "Tim3353Verify!";
const BASE_URL = "http://localhost:3353";
const PROJECT_REF = "ltmcttjftxzpgynhnrpg";

async function createSyntheticUser() {
  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.createUser({
    email: SYN_EMAIL,
    password: SYN_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user.id;
  console.log(`  ✓ created user ${SYN_EMAIL} id=${userId}`);

  const { data: plan, error: planErr } = await admin
    .from("coffee_shop_plans")
    .insert({ user_id: userId, plan_name: "Pine Valley Roasters" })
    .select("id")
    .single();
  if (planErr) throw planErr;
  console.log(`  ✓ plan id=${plan.id}`);

  // Pro + active so canEdit=true → SectionHeader's Write with AI button renders.
  const { error: userErr } = await admin
    .from("users")
    .update({
      onboarding_completed: true,
      subscription_status: "active",
      subscription_tier: "pro",
      full_name: "TIM-3353 Visual Test",
    })
    .eq("id", userId);
  if (userErr) throw userErr;
  console.log(`  ✓ pro+active, onboarding_completed`);

  // Seed concept doc — both shop_identity + vision content so a card has body
  // text without us having to type into the inputs.
  const conceptContent = {
    components: {
      shop_identity: { content: "Pine Valley Roasters", included: true },
      vision: {
        content:
          "Pine Valley Roasters is a neighborhood third-wave roastery for hikers and remote workers in Bend, OR — single-origin coffee, hand-pour bar, and a calm reading room that feels like a friend's living room.",
        included: true,
      },
      offering: {
        content:
          "Single-origin pour-over, espresso, drip; pastries and toast from a local bakery partner; small batch retail bags roasted on-site weekly.",
        included: true,
      },
      target_customer: { content: "", included: true },
      location: { content: "", included: true },
      brand_personality: { content: "", included: true },
      competitive_edge: { content: "", included: true },
      success_definition: { content: "", included: true },
    },
    competitors: [],
    personas: [],
    version: 2,
  };
  const { error: docErr } = await admin
    .from("workspace_documents")
    .insert({
      plan_id: plan.id,
      workspace_key: "concept",
      content: conceptContent,
    });
  if (docErr) console.warn(`  ! concept seed: ${docErr.message}`);
  else console.log(`  ✓ seeded concept doc`);

  // Seed BP saved section so an expanded card has body text + the autoContent
  // assembled from concept appears.
  const { error: bpErr } = await admin
    .from("business_plan_sections")
    .insert({
      plan_id: plan.id,
      section_key: "company-overview",
      user_content:
        "Pine Valley Roasters will operate as a single-location specialty café and roastery serving Bend, OR. The concept is grounded in third-wave coffee craftsmanship, calm hospitality, and a deliberate retail rhythm that supports both daily commuters and weekend community gatherings.",
      is_visible: true,
    });
  if (bpErr) console.warn(`  ! BP seed: ${bpErr.message}`);
  else console.log(`  ✓ seeded BP section company-overview`);

  return userId;
}

async function deleteUser(userId) {
  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) console.warn(`  ! cleanup: ${error.message}`);
  else console.log(`  ✓ deleted user ${userId}`);
}

async function getSession() {
  const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email: SYN_EMAIL,
    password: SYN_PASSWORD,
  });
  if (error || !data.session) throw error ?? new Error("no session");
  return data.session;
}

function buildCookies(session, domain) {
  const tokenJson = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: "bearer",
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    user: session.user,
  });
  const name = `sb-${PROJECT_REF}-auth-token`;
  const CHUNK = 4096;
  const base = {
    domain,
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 3600,
  };
  const cookies = [];
  if (tokenJson.length <= CHUNK) {
    cookies.push({ name, value: tokenJson, ...base });
  } else {
    let i = 0;
    for (let start = 0; start < tokenJson.length; start += CHUNK) {
      cookies.push({
        name: `${name}.${i}`,
        value: tokenJson.slice(start, start + CHUNK),
        ...base,
      });
      i++;
    }
  }
  return cookies;
}

async function dismissBanner(page) {
  const accept = page.locator("text=/Accept|Allow all|Got it/i").first();
  try {
    if (await accept.isVisible({ timeout: 1000 })) {
      await accept.click({ timeout: 1000 });
      await page.waitForTimeout(200);
    }
  } catch {}
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("→ Creating synthetic user…");
  const userId = await createSyntheticUser();

  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning")
        console.log(`  [console ${msg.type()}] ${msg.text().slice(0, 200)}`);
    });
    page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message.slice(0, 200)}`));
    page.on("requestfailed", (req) =>
      console.log(`  [reqfail] ${req.method()} ${req.url().slice(0, 100)} :: ${req.failure()?.errorText}`)
    );

    // Form-login (cookie injection on localhost is finicky; let the app set
    // its own cookies via /login → router.push("/dashboard")).
    console.log("→ /login");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
    await dismissBanner(page);
    await page.fill('input#email', SYN_EMAIL);
    await page.fill('input#password', SYN_PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    try {
      await page.waitForURL(/\/dashboard|\/onboarding|\/workspace/, { timeout: 30000 });
    } catch (e) {
      console.log(`  ! navigation timed out, current url=${page.url()}`);
      // Capture any error text shown on the form.
      const errText = await page.locator("[role='alert'], .text-red-500, .text-destructive").allTextContents().catch(() => []);
      console.log(`  ! page error text: ${JSON.stringify(errText)}`);
      throw e;
    }
    console.log(`  ✓ signed in, url: ${page.url()}`);

    // 1. Concept workspace
    console.log("→ /workspace/concept");
    await page.goto(`${BASE_URL}/workspace/concept`, { waitUntil: "networkidle", timeout: 30000 });
    await dismissBanner(page);
    console.log(`  url: ${page.url()}`);
    await page.waitForTimeout(1500);

    // Find a card whose SectionHeader title is "Vision" (always populated in seed).
    const visionTitle = page.locator("span:has-text('Vision')").first();
    await visionTitle.waitFor({ state: "visible", timeout: 15000 });
    const visionCard = visionTitle.locator("xpath=ancestor::div[contains(@class,'group')][1]");
    await visionCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await visionCard.screenshot({ path: join(OUT_DIR, "01-concept-card.png") });
    console.log("  ✓ 01-concept-card.png");

    // 2. Help popover open
    const helpBtn = visionCard.locator("button[aria-label*='Show help'], button[aria-label*='help']").first();
    if (await helpBtn.count() > 0) {
      await helpBtn.click();
      await page.waitForTimeout(300);
      // Screenshot the card + a bit below to capture popover
      const box = await visionCard.boundingBox();
      if (box) {
        await page.screenshot({
          path: join(OUT_DIR, "02-concept-help-popover.png"),
          clip: {
            x: Math.max(0, box.x - 8),
            y: Math.max(0, box.y - 8),
            width: Math.min(1280, box.width + 16),
            height: Math.min(900, box.height + 280),
          },
        });
        console.log("  ✓ 02-concept-help-popover.png");
      }
      // Close popover
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    } else {
      console.log("  ! no help (?) button found on Vision card");
    }

    // 3. Business Plan workspace — expanded section
    console.log("→ /workspace/business-plan");
    await page.goto(`${BASE_URL}/workspace/business-plan`, { waitUntil: "networkidle", timeout: 30000 });
    await dismissBanner(page);
    console.log(`  url: ${page.url()}`);
    await page.waitForTimeout(1500);

    // Expand "Business Overview" (TIM-3305-renamed section; we seeded its user_content).
    // BP collapsed rows show an h2 with the section title; click to expand.
    const companyOverviewH2 = page.locator("h2:has-text('Business Overview')").first();
    await companyOverviewH2.waitFor({ state: "visible", timeout: 15000 });
    await companyOverviewH2.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    // Click the parent button that toggles expand.
    const expandBtn = companyOverviewH2.locator("xpath=ancestor::button[1]");
    await expandBtn.click();
    await page.waitForTimeout(600);

    // Find the now-expanded card (header row with SectionHeader title=span "Business Overview").
    const bpTitleSpan = page
      .locator("span.text-sm.font-semibold:has-text('Business Overview')")
      .first();
    await bpTitleSpan.waitFor({ state: "visible", timeout: 15000 });
    const bpCard = bpTitleSpan.locator(
      "xpath=ancestor::div[contains(@class,'group') and contains(@class,'rounded-xl')][1]"
    );
    await bpCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await bpCard.screenshot({ path: join(OUT_DIR, "03-business-plan-expanded.png") });
    console.log("  ✓ 03-business-plan-expanded.png");

    // 4. Cropped header row only — to verify Rotate/Eye siblings outside SectionHeader.
    // The outer header div with chevron is the closest containing flex row.
    const headerRow = bpTitleSpan.locator(
      "xpath=ancestor::div[contains(@class,'flex') and contains(@class,'items-center') and contains(@class,'gap-2')][last()]"
    );
    const headerBox = await bpCard.boundingBox();
    if (headerBox) {
      await page.screenshot({
        path: join(OUT_DIR, "04-business-plan-header-row.png"),
        clip: {
          x: Math.max(0, headerBox.x - 4),
          y: Math.max(0, headerBox.y - 4),
          width: Math.min(1280, headerBox.width + 8),
          height: 80,
        },
      });
      console.log("  ✓ 04-business-plan-header-row.png");
    }

    await browser.close();
  } finally {
    console.log("→ Cleanup…");
    await deleteUser(userId);
  }

  console.log(`\nScreenshots saved to ${OUT_DIR}`);
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
