/**
 * TIM-3492 — Live verification of the Business Plan section header on prod.
 *
 * Captures `bp-collapsed.png` and `bp-expanded.png` in scripts/screenshots/tim3492/.
 *
 * The collapsed shot shows every section card with its h2 title (text-xl).
 * The expanded shot shows the first ~5 cards expanded — each title must
 * stay at the same text-xl size and there must be no floating tiny-text
 * label above the title and no Eye icon in the header row.
 *
 * Run from coffee-shop-consultant:
 *   node scripts/tim3492-bp-section-header-shots.mjs
 *
 * Required env: SUPABASE_NEW_SECRET_KEY, SUPABASE_NEW_PUBLISHABLE_KEY.
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots", "tim3492");

const SUPABASE_URL = "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SUPABASE_SECRET = process.env.SUPABASE_NEW_SECRET_KEY;
const SUPABASE_PUBLISHABLE = process.env.SUPABASE_NEW_PUBLISHABLE_KEY;

if (!SUPABASE_SECRET || !SUPABASE_PUBLISHABLE) {
  console.error("Missing SUPABASE_NEW_SECRET_KEY or SUPABASE_NEW_PUBLISHABLE_KEY env vars.");
  process.exit(1);
}

const SYN_EMAIL = `tim3492+${Date.now()}@timberline.coffee`;
const SYN_PASSWORD = "Tim3492Verify!";

const BASE_URL = process.env.BASE_URL || "https://groundwork.cafe";
const PROJECT_REF = "ltmcttjftxzpgynhnrpg";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || ".groundwork.cafe";

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createSyntheticUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: SYN_EMAIL,
    password: SYN_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  console.log(`  ✓ Created synthetic user ${SYN_EMAIL} (id=${data.user.id})`);

  const { data: plan, error: planErr } = await admin
    .from("coffee_shop_plans")
    .insert({ user_id: data.user.id, plan_name: "TIM-3492 Verify" })
    .select("id")
    .single();
  if (planErr) throw planErr;
  console.log(`  ✓ Seeded plan ${plan.id}`);

  const { error: userErr } = await admin
    .from("users")
    .update({
      onboarding_completed: true,
      full_name: "TIM-3492 Tester",
      subscription_status: "active",
      subscription_tier: "pro",
    })
    .eq("id", data.user.id);
  if (userErr) throw userErr;
  console.log("  ✓ Marked user active/pro/onboarded");

  return { user: data.user, planId: plan.id };
}

async function deleteSyntheticUser(userId) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) console.warn(`  ! Cleanup failed for ${userId}: ${error.message}`);
  else console.log(`  ✓ Deleted synthetic user ${userId}`);
}

async function generateMagicLink() {
  // Admin-generated magic link bypasses CAPTCHA / Turnstile that gates the
  // password sign-in path on prod. The returned action_link, when visited
  // by the browser, triggers Supabase's verify-and-redirect flow and sets
  // the session cookie on the response.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: SYN_EMAIL,
    options: { redirectTo: `${BASE_URL}/account` },
  });
  if (error || !data?.properties?.action_link) {
    throw error ?? new Error("No action_link returned");
  }
  return data.properties.action_link;
}

function buildAuthCookies(session, domain) {
  const tokenJson = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: "bearer",
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    user: session.user,
  });
  const baseName = `sb-${PROJECT_REF}-auth-token`;
  const CHUNK = 4096;
  const base = {
    domain,
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 3600,
  };
  const cookies = [];
  if (tokenJson.length <= CHUNK) {
    cookies.push({ name: baseName, value: tokenJson, ...base });
  } else {
    let i = 0;
    for (let start = 0; start < tokenJson.length; start += CHUNK) {
      cookies.push({
        name: `${baseName}.${i}`,
        value: tokenJson.slice(start, start + CHUNK),
        ...base,
      });
      i++;
    }
  }
  return cookies;
}

async function dismissCookieBanner(page) {
  const accept = page.locator("text=/Accept|Allow all|Got it/i").first();
  try {
    if (await accept.isVisible({ timeout: 1500 })) {
      await accept.click({ timeout: 1500 });
      await page.waitForTimeout(300);
    }
  } catch {}
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("→ Creating synthetic user…");
  const { user } = await createSyntheticUser();

  try {
    console.log("→ Generating magic link (admin)…");
    const actionLink = await generateMagicLink();
    console.log(`  action_link host=${new URL(actionLink).host}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
    const page = await context.newPage();

    console.log("→ Following magic link to extract session tokens from fragment…");
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) console.log(`    [nav] ${f.url().slice(0, 120)}…`);
    });
    await page.goto(actionLink, { waitUntil: "domcontentloaded", timeout: 30000 });
    try {
      await page.waitForURL((u) => u.host === new URL(BASE_URL).host, { timeout: 20000 });
    } catch {}
    const fragment = await page.evaluate(() => window.location.hash);
    if (!fragment.includes("access_token=")) {
      throw new Error(`No access_token in fragment after magic link: ${page.url().slice(0, 200)}`);
    }
    const params = new URLSearchParams(fragment.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const expiresAt = Number(params.get("expires_at"));
    const expiresIn = Number(params.get("expires_in"));
    if (!accessToken || !refreshToken) throw new Error("Missing tokens in fragment");
    console.log("  ✓ extracted tokens from URL fragment");

    const session = {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "bearer",
      expires_at: expiresAt,
      expires_in: expiresIn,
      user: { id: user.id, email: SYN_EMAIL },
    };
    await context.addCookies(buildAuthCookies(session, COOKIE_DOMAIN));
    console.log("  ✓ injected sb-auth-token cookies");

    console.log(`→ ${BASE_URL}/workspace/business-plan …`);
    await page.goto(`${BASE_URL}/workspace/business-plan`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await dismissCookieBanner(page);
    console.log(`  url=${page.url()}`);

    // Wait for at least one section card to render.
    await page
      .locator('h2:has-text("Executive Summary")')
      .first()
      .waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(800);

    // Force-collapse anything that's initially expanded so the collapsed shot
    // is a true "all-collapsed" baseline.
    let collapseTries = 0;
    while (collapseTries < 5) {
      const upChevrons = page.locator('button[aria-expanded="true"]');
      const count = await upChevrons.count();
      if (count === 0) break;
      for (let i = 0; i < count; i++) {
        try {
          await upChevrons.nth(0).click({ timeout: 1500 });
          await page.waitForTimeout(150);
        } catch {}
      }
      collapseTries++;
    }
    await page.waitForTimeout(400);

    await page.screenshot({
      path: join(OUT_DIR, "bp-collapsed.png"),
      fullPage: true,
    });
    console.log("  ✓ bp-collapsed.png");

    // Now expand a handful of section cards to compare title styling.
    // Pick a mix from different groups including the What-If Scenarios card
    // the board specifically named.
    const expandTargets = [
      "Business Overview",
      "Your Concept",
      "Menu, Pricing & Marketing",
      "What-If Scenarios",
    ];
    let expanded = 0;
    for (const title of expandTargets) {
      const escaped = title.replace(/"/g, '\\"');
      const btn = page
        .locator(`button[aria-label="Expand ${escaped}"]`)
        .first();
      const found = await btn.count();
      if (found === 0) {
        console.warn(`  ! no Expand button for "${title}"`);
        continue;
      }
      try {
        await btn.scrollIntoViewIfNeeded({ timeout: 2000 });
        await btn.click({ timeout: 2000 });
        await page.waitForTimeout(300);
        expanded++;
      } catch (e) {
        console.warn(`  ! failed to expand ${title}: ${e.message}`);
      }
    }
    // Scroll to top so the expanded shot starts at What-If Scenarios area.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    console.log(`  expanded ${expanded}/${expandTargets.length} sections`);
    await page.waitForTimeout(600);

    await page.screenshot({
      path: join(OUT_DIR, "bp-expanded.png"),
      fullPage: true,
    });
    console.log("  ✓ bp-expanded.png");

    // Negative-assertion sweep: in the expanded view there must be no
    // visible Eye / EyeOff lucide-icon in any header row.
    const eyeCount = await page.locator('header svg.lucide-eye, [role="banner"] svg.lucide-eye').count();
    console.log(`  Eye icons inside header roles: ${eyeCount}  (expect 0)`);

    // Title-size sanity: every visible h2 in the workspace should be text-xl.
    const titleSizes = await page.evaluate(() => {
      const h2s = Array.from(document.querySelectorAll("h2"));
      return h2s.map((h2) => ({
        text: h2.textContent?.trim().slice(0, 60) ?? "",
        fontSize: getComputedStyle(h2).fontSize,
      }));
    });
    console.log("  visible h2 font-sizes (text-xl = 20px):");
    for (const t of titleSizes.slice(0, 12)) {
      console.log(`    ${t.fontSize.padStart(6)}  ${t.text}`);
    }

    await browser.close();
  } finally {
    console.log("→ Cleanup…");
    await deleteSyntheticUser(user.id);
  }

  console.log(`\nAll screenshots saved to ${OUT_DIR}`);
}

run().catch((err) => {
  console.error("Verification script failed:", err);
  process.exit(1);
});
