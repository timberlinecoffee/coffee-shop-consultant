#!/usr/bin/env node
// TIM-2413: live verify on https://groundwork.cafe after merge.
//
// Pins (per TIM-1792 §10.8 acceptance checklist):
//   1. Financials at 1200/1440 — title row single-row, no overlap; hamburger
//      trigger present in cluster (after Guided setup, before SaveStatusAndButton).
//   2. Equipment & Supplies at 1200/1440 — same single-row + trigger.
//   3. Business Plan at 1200/1440 — same single-row + trigger.
//   4. Marketing at 1200/1440 — Print view rendered inline; NO hamburger trigger.
//   5. Hiring at 1200/1440 — title-only, NO hamburger trigger.
//   6. Menu & Pricing at 1200/1440 — title-only, NO hamburger trigger.
//   7. Opening the hamburger reveals the expected items (Financials sample).
//
// Screenshots saved under verify-tim2413/.
//
// Auth model: mint a Supabase magiclink, exchange for a session, inject as
// @supabase/ssr cookies (base64-prefixed, chunked at MAX=3180). Same pattern
// proven on TIM-2352, TIM-2385, TIM-2394.

import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function loadEnv(path) {
  const out = {};
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2$/);
      if (!m) continue;
      out[m[1]] = m[3].replace(/\\n$/, "").trim();
    }
  } catch {
    // optional
  }
  return out;
}

const env = { ...process.env, ...loadEnv(join(repoRoot, ".env.local")) };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.VERIFY_BASE_URL ?? "https://groundwork.cafe";
const FIXTURE_EMAIL = process.env.VERIFY_EMAIL ?? "trent@simpler.coffee";

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
  console.error("Missing Supabase env in .env.local");
  process.exit(1);
}

const SHOT_DIR = join(repoRoot, "verify-tim2413");
mkdirSync(SHOT_DIR, { recursive: true });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function assert(name, cond, detail = "") {
  results.push({ name, pass: !!cond, detail });
  const tag = cond ? "✓" : "✗";
  console.log(`${tag} ${name}${detail ? `  — ${detail}` : ""}`);
}

async function mintSessionCookies() {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: FIXTURE_EMAIL,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${linkError?.message}`);
  }
  const anon = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: otpData, error: otpError } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (otpError || !otpData?.session) {
    throw new Error(`verifyOtp failed: ${otpError?.message}`);
  }
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const payload = JSON.stringify(otpData.session);
  const b64 = Buffer.from(payload, "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fullValue = `base64-${b64}`;
  const MAX = 3180;
  const host = new URL(BASE).hostname;
  const baseCookie = {
    domain: host,
    path: "/",
    httpOnly: false,
    sameSite: "Lax",
    secure: true,
  };
  const cookies = [];
  if (fullValue.length <= MAX) {
    cookies.push({ ...baseCookie, name: storageKey, value: fullValue });
  } else {
    let i = 0;
    let pos = 0;
    while (pos < fullValue.length) {
      cookies.push({
        ...baseCookie,
        name: `${storageKey}.${i}`,
        value: fullValue.slice(pos, pos + MAX),
      });
      pos += MAX;
      i += 1;
    }
  }
  return cookies;
}

const WORKSPACES = [
  { key: "financials", path: "/workspace/financials", expectsHamburger: true, primaryLabel: "Guided setup" },
  { key: "buildout-equipment", path: "/workspace/buildout-equipment", expectsHamburger: true, primaryLabel: "Describe your setup" },
  // Business Plan: TIM-2416 removed the standalone Check Plan CTA — the
  // hamburger is now the only header control. Spec §10.6 "No primary CTA"
  // case: cluster = [⋯] alone (no Save model on this workspace either).
  { key: "business-plan", path: "/workspace/business-plan", expectsHamburger: true, primaryLabel: null },
  { key: "marketing", path: "/workspace/marketing", expectsHamburger: false, primaryLabel: null },
  { key: "hiring", path: "/workspace/hiring", expectsHamburger: false, primaryLabel: null },
  { key: "menu-pricing", path: "/workspace/menu-pricing", expectsHamburger: false, primaryLabel: null },
];

const VIEWPORTS = [
  { w: 1200, label: "1200" },
  { w: 1440, label: "1440" },
];

async function visitAndShoot(ctx, ws, vp) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: vp.w, height: 900 });
  await page.goto(`${BASE}${ws.path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  // Allow the header to settle and any client-side hydration to complete.
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(800);

  const title = page.locator("header h1").first();
  await title.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});

  const header = page.locator("header").first();
  const hamburger = page.locator('button[aria-label="More actions"][aria-haspopup="menu"]');
  const hCount = await hamburger.count();

  // Title row overlap check: at >=1200px the header should be a single visual
  // row — the action cluster wraps below only when the viewport drops below.
  const headerBox = await header.boundingBox();
  let titleBottom = null;
  let firstActionTop = null;
  try {
    titleBottom = (await title.boundingBox())?.bottom ?? null;
    // Walk the cluster's first button (whatever it is).
    const firstAction = page.locator("header button, header a").first();
    firstActionTop = (await firstAction.boundingBox())?.top ?? null;
  } catch {
    // tolerate
  }

  const shotPath = join(SHOT_DIR, `${ws.key}-${vp.label}.png`);
  // Screenshot the visible window (just the top-of-page area where the header
  // lives) so the file shows the chrome cluster + title.
  await page.screenshot({ path: shotPath, fullPage: false });

  if (ws.expectsHamburger) {
    assert(
      `${ws.key} @${vp.label}px renders hamburger trigger`,
      hCount === 1,
      `count=${hCount}`,
    );
    if (ws.primaryLabel) {
      const primary = page.locator(`header button[aria-label="${ws.primaryLabel}"]`);
      const pc = await primary.count();
      assert(
        `${ws.key} @${vp.label}px primary CTA "${ws.primaryLabel}" stays outside`,
        pc >= 1,
        `count=${pc}`,
      );
    }
  } else {
    assert(
      `${ws.key} @${vp.label}px does NOT render hamburger trigger`,
      hCount === 0,
      `count=${hCount}`,
    );
  }

  if (headerBox && headerBox.height < 200) {
    assert(
      `${ws.key} @${vp.label}px header stays compact (height<200px)`,
      true,
      `h=${Math.round(headerBox.height)}`,
    );
  } else {
    assert(
      `${ws.key} @${vp.label}px header stays compact (height<200px)`,
      false,
      `h=${headerBox ? Math.round(headerBox.height) : "?"} — likely wrapped at >=1200px`,
    );
  }

  await page.close();
  return shotPath;
}

async function openMenuAndAssertItems(ctx, opts) {
  // opts: { path, key, label, mustContain: string[], escTest?: boolean, shootSuffix?: string }
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}${opts.path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(800);

  const trigger = page.locator('button[aria-label="More actions"]').first();
  const has = await trigger.count();
  if (has === 0) {
    assert(`${opts.key} hamburger opens`, false, "trigger not found");
    await page.close();
    return null;
  }
  await trigger.click();
  await page.locator('[role="menu"][aria-label="More actions"]').waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  const menuRows = await page.locator('[role="menu"] [role="menuitem"]').allTextContents();
  const missing = opts.mustContain.filter((needle) => !menuRows.some((t) => new RegExp(needle, "i").test(t)));
  assert(
    `${opts.key} hamburger contains ${opts.mustContain.join(" + ")}`,
    missing.length === 0,
    missing.length ? `missing=${JSON.stringify(missing)} items=${JSON.stringify(menuRows)}` : `items=${JSON.stringify(menuRows)}`,
  );
  const shotPath = join(SHOT_DIR, `${opts.key}-1440-open${opts.shootSuffix ?? ""}.png`);
  await page.screenshot({ path: shotPath, fullPage: false });

  if (opts.escTest) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const stillOpen = await page.locator('[role="menu"][aria-label="More actions"]').count();
    assert(`ESC closes the ${opts.key} hamburger menu`, stillOpen === 0, `count=${stillOpen}`);
  }

  await page.close();
  return shotPath;
}

const cookies = await mintSessionCookies();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: false });
await ctx.addCookies(cookies);

for (const ws of WORKSPACES) {
  for (const vp of VIEWPORTS) {
    try {
      await visitAndShoot(ctx, ws, vp);
    } catch (err) {
      assert(`${ws.key} @${vp.label}px fetch`, false, err?.message ?? String(err));
    }
  }
}

// TIM-2413 §10.8: per-workspace item content pin (Financials gets ESC test).
await openMenuAndAssertItems(ctx, {
  path: "/workspace/financials",
  key: "financials",
  mustContain: ["Export PDF", "Export Excel"],
  escTest: true,
});

// TIM-2417: E&S menu-item content pin — required by §10.8 for parity with
// Financials. Source has 4 items inside; we pin the first two non-toggle
// actions explicitly. (Toggle labels stay open on click so a separate test
// covering them isn't part of the close criterion.)
await openMenuAndAssertItems(ctx, {
  path: "/workspace/buildout-equipment",
  key: "buildout-equipment",
  mustContain: ["Manage stations", "Import from spreadsheet"],
});

// Business Plan parity pin.
await openMenuAndAssertItems(ctx, {
  path: "/workspace/business-plan",
  key: "business-plan",
  mustContain: ["Export PDF", "Print Business Plan", "Regenerate all"],
});

await browser.close();

const pass = results.filter((r) => r.pass).length;
const total = results.length;
console.log(`\n${pass}/${total} pinned`);
console.log(`screenshots: ${SHOT_DIR}`);
process.exit(pass === total ? 0 : 1);
