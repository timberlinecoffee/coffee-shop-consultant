#!/usr/bin/env node
// TIM-3427 — authenticated-surface mobile QA. Walks 16 logged-in surfaces
// (dashboard, Scout/Past Chats drawers, 5 Settings tabs, 6 workspaces,
// delete-confirm modal, paywall modal) across 4 viewports.
//
// Output:
//   scripts/screenshots/tim3418/auth/<device>/<surface>.png
//   scripts/screenshots/tim3418/auth/qa-report-auth.json
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_NEW_SECRET_KEY \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_NEW_PUBLISHABLE_KEY \
//     node scripts/tim3427-auth-mobile-qa.mjs

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

process.env.LD_LIBRARY_PATH =
  "/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = path.join(__dirname, "screenshots", "tim3418", "auth");
fs.mkdirSync(OUT_ROOT, { recursive: true });

const PROD_URL = "https://groundwork.cafe";
const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_NEW_SECRET_KEY;
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_NEW_PUBLISHABLE_KEY;
if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY / SUPABASE_NEW_SECRET_KEY required");
  process.exit(1);
}
if (!ANON_KEY) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_NEW_PUBLISHABLE_KEY required",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEVICES = [
  {
    id: "iphone-portrait",
    label: "iPhone Safari — portrait",
    width: 375,
    height: 812,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
  {
    id: "iphone-landscape",
    label: "iPhone Safari — landscape",
    width: 812,
    height: 375,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
  {
    id: "android-portrait",
    label: "Android Chrome — portrait (Pixel 5 equiv.)",
    width: 393,
    height: 851,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  },
  {
    id: "android-landscape",
    label: "Android Chrome — landscape (Pixel 5 equiv.)",
    width: 851,
    height: 393,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  },
];

// One row per surface. `kind` keys the navigation/action recipe.
const SURFACES = [
  { id: "dashboard", label: "Dashboard / home", kind: "page", url: "/dashboard" },
  { id: "scout-drawer-open", label: "Scout drawer open", kind: "scout-open" },
  { id: "past-chats-drawer", label: "Past Chats drawer", kind: "past-chats" },
  { id: "settings-account", label: "Settings: Account tab", kind: "settings-tab", tab: "Account" },
  { id: "settings-billing", label: "Settings: Billing tab (Subscription)", kind: "settings-tab", tab: "Billing" },
  { id: "settings-notifications", label: "Settings: Notifications tab", kind: "settings-tab", tab: "Notifications" },
  { id: "settings-business-profile", label: "Settings: Business profile tab (Workspace)", kind: "settings-tab", tab: "Business profile" },
  { id: "settings-appearance", label: "Settings: Appearance tab (Brand)", kind: "settings-tab", tab: "Appearance" },
  { id: "workspace-concept", label: "Workspace: Concept", kind: "page", url: "/workspace/concept" },
  { id: "workspace-business-plan", label: "Workspace: Business Plan", kind: "page", url: "/workspace/business-plan" },
  { id: "workspace-financial", label: "Workspace: Financial", kind: "page", url: "/workspace/financials" },
  { id: "workspace-equipment", label: "Workspace: Equipment & Supplies", kind: "page", url: "/workspace/buildout-equipment" },
  { id: "workspace-hiring", label: "Workspace: Hiring & Onboarding", kind: "page", url: "/workspace/hiring" },
  { id: "workspace-menu", label: "Workspace: Menu", kind: "page", url: "/workspace/menu-pricing" },
  { id: "modal-delete-confirm", label: "Delete confirmation modal", kind: "delete-modal" },
  { id: "modal-paywall", label: "Paywall / upgrade modal", kind: "paywall-modal" },
];

async function getSessionCookies(email) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw error;
  const tokenHash = data.properties.hashed_token;
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const verify = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verify.error) throw verify.error;
  const session = verify.data.session;
  if (!session) throw new Error("no session from verifyOtp");
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const cookieName = `sb-${ref}-auth-token`;
  const payload = JSON.stringify(session);
  const b64 = "base64-" + Buffer.from(payload, "utf8").toString("base64");
  const chunkSize = 3200;
  const chunks = [];
  for (let i = 0; i < b64.length; i += chunkSize) {
    chunks.push(b64.slice(i, i + chunkSize));
  }
  return chunks.map((value, idx) => ({
    name: chunks.length === 1 ? cookieName : `${cookieName}.${idx}`,
    value,
    domain: ".groundwork.cafe",
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  }));
}

// Runs in the page. Returns {hasDocHscroll, viewportWidth, scrollWidth, tapDeficits[]}.
async function pageAudit(page, surfaceLabel, deviceLabel) {
  return await page.evaluate(
    ({ surfaceLabel, deviceLabel }) => {
      const docW = document.documentElement.scrollWidth;
      const viewW = document.documentElement.clientWidth;
      const overflow = docW > viewW + 1;

      const els = Array.from(
        document.querySelectorAll(
          'a, button, input[type="checkbox"], input[type="radio"], [role="button"]',
        ),
      );
      const deficits = [];
      for (const el of els) {
        const style = window.getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // Only count visible-in-viewport, screen-reader-skip-link is intentional.
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        if (r.width < 44 || r.height < 44) {
          let selector = el.tagName.toLowerCase();
          if (el.className && typeof el.className === "string") {
            const cleaned = el.className
              .trim()
              .split(/\s+/)
              .filter((c) => c && !c.startsWith("h-") && !c.startsWith("w-"))
              .slice(0, 3)
              .join(".");
            if (cleaned) selector += "." + cleaned;
          }
          deficits.push({
            selector,
            text: (el.textContent || "").trim().slice(0, 30),
            width: Math.round(r.width),
            height: Math.round(r.height),
            surface: surfaceLabel,
            device: deviceLabel,
          });
        }
      }
      return {
        hasDocHscroll: overflow,
        viewportWidth: viewW,
        scrollWidth: docW,
        tapDeficits: deficits,
      };
    },
    { surfaceLabel, deviceLabel },
  );
}

async function captureSurface(page, surface, deviceOut, surfaceLabel, deviceLabel) {
  const file = path.join(deviceOut, `${surface.id}.png`);
  try {
    switch (surface.kind) {
      case "page": {
        await page.goto(`${PROD_URL}${surface.url}`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await page.waitForTimeout(1400);
        break;
      }
      case "scout-open": {
        await page.goto(`${PROD_URL}/dashboard`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await page.waitForTimeout(1200);
        const fab = page.locator('button[aria-label^="Open Scout"]').first();
        await fab.click({ force: true, timeout: 5000 });
        await page.waitForSelector(
          'aside[role="dialog"][aria-label^="Scout"]',
          { timeout: 5000 },
        );
        await page.waitForTimeout(700);
        break;
      }
      case "past-chats": {
        await page.goto(`${PROD_URL}/dashboard`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await page.waitForTimeout(1200);
        const fab = page.locator('button[aria-label^="Open Scout"]').first();
        await fab.click({ force: true, timeout: 5000 });
        await page.waitForSelector(
          'aside[role="dialog"][aria-label^="Scout"]',
          { timeout: 5000 },
        );
        await page.waitForTimeout(500);
        const trigger = page.locator('[data-testid="past-chats-trigger"]').first();
        await trigger.click({ force: true, timeout: 5000 });
        await page.waitForSelector('[data-testid="past-chats-drawer"]', {
          timeout: 5000,
        });
        await page.waitForTimeout(600);
        break;
      }
      case "settings-tab": {
        await page.goto(`${PROD_URL}/account`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await page.waitForTimeout(1400);
        if (surface.tab && surface.tab !== "Account") {
          const tabBtn = page
            .locator(`button:has-text("${surface.tab}")`)
            .first();
          await tabBtn.click({ force: true, timeout: 5000 });
          await page.waitForTimeout(700);
        }
        break;
      }
      case "delete-modal": {
        await page.goto(`${PROD_URL}/account`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await page.waitForTimeout(1200);
        // Click into the Data tab where the delete control lives (TIM-2254).
        const dataTab = page.locator('button:has-text("Data")').first();
        await dataTab.click({ force: true, timeout: 5000 });
        await page.waitForTimeout(600);
        const delBtn = page
          .locator('[data-testid="delete-account-button"]')
          .first();
        await delBtn.click({ force: true, timeout: 5000 });
        await page.waitForSelector('[role="dialog"][aria-labelledby="delete-account-title"]', {
          timeout: 5000,
        });
        await page.waitForTimeout(500);
        break;
      }
      case "paywall-modal": {
        await page.goto(`${PROD_URL}/dashboard`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await page.waitForTimeout(1200);
        // Mount the paywall modal markup directly. The component is template-only
        // (open/closed via React state in a parent); injecting the rendered DOM
        // gives a faithful layout check at the chosen viewport.
        await page.evaluate(() => {
          const wrap = document.createElement("div");
          wrap.setAttribute("data-qa-injected", "paywall");
          wrap.innerHTML = `
<div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="paywall-modal-title">
  <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true"></div>
  <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-[min(24rem,calc(100vw-1rem))] max-h-[100dvh] overflow-y-auto p-8 text-center">
    <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--teal)]/10 flex items-center justify-center">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    </div>
    <h2 id="paywall-modal-title" class="text-lg font-bold text-[var(--foreground)] mb-2">Start a plan to save your work</h2>
    <p class="text-sm text-[var(--muted-foreground)] leading-relaxed mb-6">You can explore for free. To save your answers and build your full plan, start a 7-day free trial on Starter or Pro.</p>
    <div class="flex flex-col gap-3">
      <a href="/pricing" class="block bg-[var(--teal)] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[var(--teal-dark)] transition-colors">Choose a plan</a>
      <button type="button" class="text-sm text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors py-1">Not now</button>
    </div>
  </div>
</div>`;
          document.body.appendChild(wrap);
        });
        await page.waitForTimeout(400);
        break;
      }
    }
    const audit = await pageAudit(page, surfaceLabel, deviceLabel);
    await page.screenshot({ path: file, fullPage: false });
    return {
      surface: surfaceLabel,
      surfaceId: surface.id,
      file: path.relative(OUT_ROOT, file),
      ok: true,
      hasDocHscroll: audit.hasDocHscroll,
      viewportWidth: audit.viewportWidth,
      scrollWidth: audit.scrollWidth,
      tapDeficitCount: audit.tapDeficits.length,
      tapDeficits: audit.tapDeficits,
    };
  } catch (e) {
    // Best-effort error shot.
    try {
      await page.screenshot({ path: file, fullPage: false });
    } catch {}
    return {
      surface: surfaceLabel,
      surfaceId: surface.id,
      file: path.relative(OUT_ROOT, file),
      ok: false,
      error: String(e.message || e),
    };
  }
}

async function seedUser() {
  const email = `tim3427-${Date.now()}@test.groundwork.cafe`;
  const password = "Test1234!";
  const { data: authData, error: authErr } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (authErr) throw authErr;
  const userId = authData.user.id;

  await supabase.from("users").upsert({
    id: userId,
    subscription_status: "active",
    subscription_tier: "pro",
    onboarding_completed: true,
  });

  const { data: plan, error: planErr } = await supabase
    .from("coffee_shop_plans")
    .insert({
      user_id: userId,
      plan_name: "TIM-3427 QA Shop",
      status: "in_progress",
    })
    .select()
    .single();
  if (planErr) throw planErr;

  await supabase
    .from("users")
    .update({ current_plan_id: plan.id })
    .eq("id", userId);

  return { email, userId, planId: plan.id };
}

async function tearDown(seed) {
  try {
    await supabase
      .from("coffee_shop_plans")
      .delete()
      .eq("id", seed.planId);
  } catch (e) {
    console.warn("plan delete:", e.message || e);
  }
  try {
    await supabase.auth.admin.deleteUser(seed.userId);
  } catch (e) {
    console.warn("user delete:", e.message || e);
  }
}

async function main() {
  const seed = await seedUser();
  console.log("Seeded user:", seed.email, "plan:", seed.planId);

  const browser = await chromium.launch({
    executablePath:
      "/home/briefli/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });

  const startedAt = new Date().toISOString();
  const sha = (process.env.GIT_SHA || "").trim() || null;
  const report = {
    issue: "TIM-3427 (parent TIM-3418)",
    prodUrl: PROD_URL,
    capturedAt: startedAt,
    sha,
    devices: DEVICES.map((d) => d.label),
    results: [],
  };

  try {
    for (const device of DEVICES) {
      console.log(`\n=== ${device.label} (${device.width}x${device.height}) ===`);
      const deviceOut = path.join(OUT_ROOT, device.id);
      fs.mkdirSync(deviceOut, { recursive: true });

      const ctx = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: 2,
        isMobile: device.isMobile,
        hasTouch: device.hasTouch,
        userAgent: device.userAgent,
      });
      await ctx.addCookies([
        {
          name: "gw_consent",
          value: encodeURIComponent(
            JSON.stringify({
              version: 1,
              analytics: false,
              marketing: false,
              decidedAt: startedAt,
            }),
          ),
          domain: ".groundwork.cafe",
          path: "/",
          httpOnly: false,
          secure: true,
          sameSite: "Lax",
        },
      ]);
      const sessionCookies = await getSessionCookies(seed.email);
      await ctx.addCookies(sessionCookies);

      const page = await ctx.newPage();
      page.on("pageerror", (e) => console.log("  [pageerr]", e.message));

      const deviceRow = {
        device: device.label,
        deviceId: device.id,
        viewport: `${device.width}x${device.height}`,
        surfaces: [],
        tapDeficits: [],
      };

      for (const surface of SURFACES) {
        process.stdout.write(`  ${surface.id} ... `);
        const r = await captureSurface(
          page,
          surface,
          deviceOut,
          surface.label,
          device.label,
        );
        if (r.ok) {
          console.log(
            `ok (overflow=${r.hasDocHscroll} deficits=${r.tapDeficitCount})`,
          );
        } else {
          console.log("FAIL", r.error);
        }
        deviceRow.surfaces.push({
          surface: surface.label,
          surfaceId: surface.id,
          file: r.file,
          ok: r.ok,
          error: r.error,
          hasDocHscroll: r.hasDocHscroll,
          viewportWidth: r.viewportWidth,
          scrollWidth: r.scrollWidth,
          tapDeficits: r.tapDeficitCount,
        });
        if (r.tapDeficits && r.tapDeficits.length) {
          deviceRow.tapDeficits.push(...r.tapDeficits);
        }
      }

      report.results.push(deviceRow);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await tearDown(seed);
  }

  const reportFile = path.join(OUT_ROOT, "qa-report-auth.json");
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log("\nReport:", reportFile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
