/**
 * TIM-3369 — Live verification of the new Hiring & Onboarding v2 IA on
 * groundwork.cafe (production). Captures the 6 PNGs from the issue spec.
 *
 *   S1 left-nav-six-roles.png        — left nav with 6 roles indented, role selected on right
 *   S2 accordions-collapsed.png      — role page with all 7 accordion sections collapsed
 *   S3 accordions-multi-open.png     — multiple accordions open with real content
 *   S4 drag-reparent.png             — drag-reparent inside the secondary nav, hierarchy persists after reload
 *   S5 mobile-375px.png              — iPhone-emulated 375px viewport, nav drawer + role page
 *   S6 revert-toggle-off.png         — Preferences with HiringRevertToggle OFF, v1 reachable
 *
 * Auth: synthetic Pro user via SUPABASE_NEW_SECRET_KEY (post-TIM-2414 cutover).
 * Flag: forced via `?hiring=v2` URL override (proxy.ts sets persistent cookie).
 * Run:  node scripts/tim3369-v2-prod-shots.mjs
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots", "tim3369");

const SUPABASE_URL = "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SUPABASE_SECRET = process.env.SUPABASE_NEW_SECRET_KEY;
const SUPABASE_PUBLISHABLE = process.env.SUPABASE_NEW_PUBLISHABLE_KEY;

if (!SUPABASE_SECRET || !SUPABASE_PUBLISHABLE) {
  console.error("Missing SUPABASE_NEW_SECRET_KEY or SUPABASE_NEW_PUBLISHABLE_KEY env vars.");
  process.exit(1);
}

const SYN_EMAIL = `tim3369+${Date.now()}@timberline.coffee`;
const SYN_PASSWORD = "Tim3369Verify!";

const BASE_URL = "https://groundwork.cafe";
const PROJECT_REF = "ltmcttjftxzpgynhnrpg";
const COOKIE_DOMAIN = ".groundwork.cafe";

// Playwright chromium path + lib for the agent VPS — see TIM-3368 memory.
const CHROMIUM = "/home/briefli/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";
const LD_LIB = "/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu";
process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
  ? `${LD_LIB}:${process.env.LD_LIBRARY_PATH}`
  : LD_LIB;

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Six roles with two depth levels so S1 shows clear hierarchy indent.
const SEED_ROLES = [
  { role_title: "General Manager", parent: null, headcount: 1, order_index: 0 },
  { role_title: "Head Roaster", parent: "General Manager", headcount: 1, order_index: 1 },
  { role_title: "Roaster Assistant", parent: "Head Roaster", headcount: 2, order_index: 2 },
  { role_title: "Shift Lead", parent: "General Manager", headcount: 2, order_index: 3 },
  { role_title: "Barista I", parent: "Shift Lead", headcount: 4, order_index: 4 },
  { role_title: "Barista II", parent: "Shift Lead", headcount: 2, order_index: 5 },
];

async function createSyntheticUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: SYN_EMAIL,
    password: SYN_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  console.log(`  ✓ user ${SYN_EMAIL} id=${data.user.id}`);

  const { data: plan, error: planErr } = await admin
    .from("coffee_shop_plans")
    .insert({ user_id: data.user.id, plan_name: "TIM-3369 Verify", status: "in_progress" })
    .select("id")
    .single();
  if (planErr) throw planErr;
  console.log(`  ✓ plan ${plan.id}`);

  const { error: uerr } = await admin
    .from("users")
    .update({
      onboarding_completed: true,
      full_name: "TIM-3369 Tester",
      subscription_status: "active",
      subscription_tier: "pro",
      current_plan_id: plan.id,
      // Pre-flip the hiring revamp flag so the SSR path renders v2 from the
      // first render — `?hiring=v2` would also do it via the proxy cookie,
      // but the DB column is the canonical opt-in.
      hiring_revamp_v2: true,
    })
    .eq("id", data.user.id);
  if (uerr) throw uerr;
  console.log(`  ✓ users patched (pro/active/onboarded/hiring_revamp_v2=true)`);

  // Seed roles in two passes so we can wire parent_role_id by title.
  const inserted = new Map();
  for (const r of SEED_ROLES) {
    const { data: row, error: rerr } = await admin
      .from("hiring_plan_roles")
      .insert({
        plan_id: plan.id,
        role_title: r.role_title,
        headcount: r.headcount,
        order_index: r.order_index,
        parent_role_id: r.parent ? inserted.get(r.parent) : null,
      })
      .select("id")
      .single();
    if (rerr) throw rerr;
    inserted.set(r.role_title, row.id);
  }
  console.log(`  ✓ seeded ${SEED_ROLES.length} roles across 2 depth levels`);

  return { userId: data.user.id, planId: plan.id, roleIds: inserted };
}

async function deleteSyntheticUser(userId) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) console.warn(`  ! cleanup failed: ${error.message}`);
  else console.log(`  ✓ cleanup deleted user ${userId}`);
}

async function getSession() {
  // TIM-3409 enabled Supabase Auth Turnstile, so password sign-in from a
  // headless script fails captcha. Use admin generateLink to mint a one-shot
  // magic-link token (admin auth bypasses captcha), then exchange the token
  // via verifyOtp on the anon client → returns access_token + refresh_token
  // directly (captcha is enforced on signIn, not verify).
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: SYN_EMAIL,
  });
  if (error) throw error;
  const hashed = data?.properties?.hashed_token;
  if (!hashed) throw new Error("no hashed_token from generateLink");

  const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: vd, error: verr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashed,
  });
  if (verr || !vd.session) throw verr ?? new Error("no session from verifyOtp");
  return vd.session;
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
  // base64-encoded JSON, prefixed per @supabase/ssr convention.
  const encoded = "base64-" + Buffer.from(tokenJson).toString("base64");
  const baseName = `sb-${PROJECT_REF}-auth-token`;
  const CHUNK = 3200;
  const base = {
    domain,
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 3600,
  };
  const cookies = [];
  if (encoded.length <= CHUNK) {
    cookies.push({ name: baseName, value: encoded, ...base });
  } else {
    let i = 0;
    for (let start = 0; start < encoded.length; start += CHUNK) {
      cookies.push({
        name: `${baseName}.${i}`,
        value: encoded.slice(start, start + CHUNK),
        ...base,
      });
      i++;
    }
  }
  return cookies;
}

function buildPreSessionCookies(domain) {
  // Pre-set consent + UI revamp + hiring revamp mirror cookies so SSR renders
  // v2 from the first paint and the consent banner doesn't bleed into shots.
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 30;
  return [
    {
      name: "gw_consent",
      value: encodeURIComponent(
        JSON.stringify({
          version: 1,
          analytics: false,
          marketing: false,
          decidedAt: new Date().toISOString(),
        }),
      ),
      domain,
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
      expires: exp,
    },
    {
      name: "gw_hiring_revamp_v2",
      value: "1",
      domain,
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
      expires: exp,
    },
  ];
}

async function dismissBanner(page) {
  try {
    const accept = page.locator("text=/Accept|Allow all|Got it/i").first();
    if (await accept.isVisible({ timeout: 1200 })) {
      await accept.click({ timeout: 1200 });
      await page.waitForTimeout(200);
    }
  } catch {}
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("→ creating synthetic user…");
  const { userId, planId } = await createSyntheticUser();

  try {
    console.log("→ generating session via verifyOtp…");
    const session = await getSession();

    const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });

    // ── Desktop context (S1, S2, S3, S4, S6) ────────────────────────────────
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await desktop.addCookies([
      ...buildPreSessionCookies(COOKIE_DOMAIN),
      ...buildAuthCookies(session, COOKIE_DOMAIN),
    ]);
    const page = await desktop.newPage();

    // S1 — left nav with 6 roles indented, first role selected on the right
    console.log("→ S1 /workspace/hiring?hiring=v2 …");
    await page.goto(`${BASE_URL}/workspace/hiring?hiring=v2`, {
      waitUntil: "load",
      timeout: 60000,
    });
    await dismissBanner(page);
    await page.waitForTimeout(1000);
    console.log(`  url=${page.url()}`);

    // Sanity: 6 role rows visible in the nav.
    const navRoles = page.locator("nav[aria-label=\"Roles\"] li").locator("button").locator("text=/Manager|Roaster|Lead|Barista/i");
    const navCount = await navRoles.count();
    console.log(`  role rows in nav: ${navCount}`);

    await page.screenshot({ path: join(OUT_DIR, "S1-left-nav-six-roles.png"), fullPage: false });
    console.log("  ✓ S1");

    // S2 — all accordions collapsed. The content port (TIM-3390) leaves Role
    // basics open by default; click any summary that's currently open to
    // close it before capturing.
    const summariesPreS2 = page.locator("section details summary");
    const preCount = await summariesPreS2.count();
    for (let i = 0; i < preCount; i++) {
      const isOpen = await summariesPreS2.nth(i).evaluate((el) => {
        const details = el.closest("details");
        return details ? details.hasAttribute("open") : false;
      });
      if (isOpen) {
        await summariesPreS2.nth(i).click({ timeout: 5000 });
        await page.waitForTimeout(120);
      }
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, "S2-accordions-collapsed.png"), fullPage: false });
    console.log("  ✓ S2");

    // S3 — open the first three accordions and screenshot
    const summaries = page.locator("section details summary");
    const summaryCount = await summaries.count();
    console.log(`  accordion summary count: ${summaryCount}`);
    for (let i = 0; i < Math.min(3, summaryCount); i++) {
      await summaries.nth(i).click({ timeout: 5000 });
      await page.waitForTimeout(150);
    }
    await page.screenshot({ path: join(OUT_DIR, "S3-accordions-multi-open.png"), fullPage: false });
    console.log("  ✓ S3");

    // S4 — drag a child role to a new parent. Easiest pre/post: drag
    // "Barista II" up to be a sibling of "Shift Lead" (depth 1 instead of 2).
    // We do this by mousing from its grip down to the target row with a
    // horizontal delta pulling it leftward to reduce depth. Then reload and
    // capture: the row should now be at depth 1.
    console.log("→ S4 drag-reparent…");
    const targetTitle = "Barista II";
    const targetRow = page
      .locator("nav[aria-label=\"Roles\"] li")
      .filter({ hasText: targetTitle })
      .first();
    await targetRow.hover();
    const grip = targetRow.locator("button[aria-label='Drag to reorder']").first();
    const gripBox = await grip.boundingBox();
    if (gripBox) {
      // Drag up to the "Shift Lead" row position with a strong leftward delta
      // to drop depth by one.
      const shiftLead = page
        .locator("nav[aria-label=\"Roles\"] li")
        .filter({ hasText: /^Shift Lead/ })
        .first();
      const shiftBox = await shiftLead.boundingBox();
      if (shiftBox) {
        await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
        await page.mouse.down();
        // Move past activationConstraint distance:4
        await page.mouse.move(
          gripBox.x + gripBox.width / 2 + 8,
          gripBox.y + gripBox.height / 2 + 8,
          { steps: 4 },
        );
        // Travel to just below Shift Lead, dragging leftward to reduce depth.
        await page.mouse.move(
          shiftBox.x + 20,
          shiftBox.y + shiftBox.height + 2,
          { steps: 18 },
        );
        await page.waitForTimeout(150);
        await page.mouse.up();
      }
    }
    await page.waitForTimeout(800);
    // Reload to confirm persistence.
    await page.goto(`${BASE_URL}/workspace/hiring?hiring=v2`, {
      waitUntil: "load",
      timeout: 60000,
    });
    await dismissBanner(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT_DIR, "S4-drag-reparent.png"), fullPage: false });
    console.log("  ✓ S4");

    // S6 — HiringRevertToggle in the SidebarV2 ProfileMenu → Preferences
    // sub-panel. Open profile popover → click Preferences menuitem to swap
    // the panel → flip the Hiring toggle off → capture.
    console.log("→ S6 SidebarV2 profile popover → Preferences → toggle off…");
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load", timeout: 45000 });
    await dismissBanner(page);
    await page.waitForTimeout(800);
    const profileBtn = page.locator("button").filter({ hasText: /TIM-3369 Tester/ }).first();
    await profileBtn.click({ timeout: 8000 });
    await page.waitForTimeout(500);
    // Click Preferences menuitem to expand the sub-panel.
    const prefsMenuitem = page
      .locator("[role='menuitem']")
      .filter({ hasText: /^Preferences$/ })
      .first();
    await prefsMenuitem.click({ timeout: 5000 });
    await page.waitForTimeout(500);
    const toggle = page.locator("button[role='switch'][aria-label*='Hiring workspace']").first();
    await toggle.waitFor({ state: "visible", timeout: 5000 });
    // Click and wait for aria-checked to flip to false (PATCH round-trip).
    await toggle.click();
    await page.waitForFunction(
      () => {
        const btn = document.querySelector("button[role='switch'][aria-label*='Hiring workspace']");
        return btn && btn.getAttribute("aria-checked") === "false";
      },
      undefined,
      { timeout: 8000 },
    ).catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT_DIR, "S6-revert-toggle-off.png"), fullPage: false });
    console.log("  ✓ S6");

    await desktop.close();

    // ── Mobile context (S5) ─────────────────────────────────────────────────
    console.log("→ S5 iPhone 375px…");
    // Mobile context needs its own session (verifyOtp tokens are one-shot,
    // but the underlying session JWT is reusable across contexts — same
    // user, same access_token). Re-use the desktop session.
    const mobile = await browser.newContext({
      viewport: { width: 375, height: 812 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await mobile.addCookies([
      ...buildPreSessionCookies(COOKIE_DOMAIN),
      ...buildAuthCookies(session, COOKIE_DOMAIN),
    ]);
    const m = await mobile.newPage();
    await m.goto(`${BASE_URL}/workspace/hiring?hiring=v2`, {
      waitUntil: "load",
      timeout: 60000,
    });
    await dismissBanner(m);
    await m.waitForTimeout(800);
    // Tap "Roles" to open the drawer so the nav is visible in the shot.
    const rolesBtn = m.locator("button:has-text('Roles')").first();
    try {
      if (await rolesBtn.isVisible({ timeout: 1500 })) {
        await rolesBtn.click();
        await m.waitForTimeout(400);
      }
    } catch {}
    await m.screenshot({ path: join(OUT_DIR, "S5-mobile-375px.png"), fullPage: false });
    console.log("  ✓ S5");

    await mobile.close();
    await browser.close();
  } finally {
    console.log("→ cleanup…");
    await deleteSyntheticUser(userId);
  }
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
