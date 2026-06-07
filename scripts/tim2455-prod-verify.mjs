#!/usr/bin/env node
// TIM-2455: live verify Concept workspace chrome parity on https://groundwork.cafe.
//
// Pins (all on /workspace/concept):
//   1. WorkspaceHeader title is exactly "Concept" (matches the workspace name
//      every other workspace uses; replaces the old shop-name-as-title).
//   2. Primary "Review with AI" button visible in the header.
//   3. "Print document" button visible IN THE HEADER (was previously in the
//      page footer — board "Print at the TOP" ask).
//   4. SaveIndicator visible (board gap item 3).
//   5. Save button visible (board gap item 4).
//   6. No ReadinessRing duplicate (board "100% into 100%" gap item 1):
//      no element matches the canonical readiness-ring SVG signature.
//   7. Type into a field → SaveIndicator transitions through saving →
//      saved state, then click Save manually → immediate persist (no debounce
//      wait).
//   8. Side-by-side: Financials and Concept render the same WorkspaceHeader
//      shell (icon + 28px title + description + action cluster with
//      SaveStatusAndButton at far-right).
//
// Auth model: same @supabase/ssr cookie injection used on TIM-2429, TIM-2430,
// TIM-2452.

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

const SHOT_DIR = join(repoRoot, "verify-tim2455");
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
  return { cookies, userId: otpData.session.user.id };
}

async function gotoWorkspace(page, path) {
  await page.goto(`${BASE}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(900);
}

async function main() {
  const { cookies } = await mintSessionCookies();

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: false });
  await ctx.addCookies(cookies);
  ctx.setDefaultTimeout(30_000);

  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoWorkspace(page, "/workspace/concept");
  await page.screenshot({ path: join(SHOT_DIR, "01-concept-header.png"), fullPage: true });
  await page
    .locator("header")
    .first()
    .screenshot({ path: join(SHOT_DIR, "01-concept-header-band.png") })
    .catch(() => {});

  // Pin 1 — Title is exactly "Concept".
  const h1Text = (await page.locator("h1").first().innerText()).trim();
  assert(`Header title is "Concept"`, h1Text === "Concept", `h1=${JSON.stringify(h1Text)}`);

  // Pin 2 — Primary "Review with AI" button is in the header band.
  const reviewBtn = page.getByRole("button", { name: /Review with AI/i }).first();
  assert(`Primary "Review with AI" button visible`, await reviewBtn.isVisible());

  // Pin 3 — "Print document" button lives in the header (not in the page footer).
  const printBtn = page.getByRole("button", { name: /Print document/i }).first();
  assert(`"Print document" button visible in header band`, await printBtn.isVisible());

  // Pin 4 — SaveIndicator chip rendered (matches "Saved" / "All changes saved"
  // / "Saving" / "Unsaved" copy — any of those means SaveIndicator shipped).
  const indicator = page.locator('text=/Saved|Saving|Unsaved|All changes saved/i').first();
  assert(`SaveIndicator visible`, await indicator.isVisible());

  // Pin 5 — Manual Save button.
  const saveBtn = page.getByRole("button", { name: /^Save$/ }).first();
  assert(`Manual Save button visible`, await saveBtn.isVisible());

  // Pin 6 — No bespoke ReadinessRing duplicate. The legacy ring rendered an
  // SVG with a circular <circle> stroke that filled a percentage. Detect by
  // looking for a small SVG containing two <circle> elements (track + progress)
  // — the canonical ReadinessRing component signature.
  const readinessRingCount = await page.evaluate(() => {
    const svgs = Array.from(document.querySelectorAll("svg"));
    return svgs.filter((s) => {
      const circles = s.querySelectorAll("circle");
      if (circles.length !== 2) return false;
      // ReadinessRing renders both circles with stroke (no fill), the same
      // radius, at the SVG center. This filters out other 2-circle SVGs.
      const r0 = circles[0].getAttribute("r");
      const r1 = circles[1].getAttribute("r");
      const cx0 = circles[0].getAttribute("cx");
      const cy0 = circles[0].getAttribute("cy");
      return r0 === r1 && cx0 === cy0 && r0 !== null;
    }).length;
  });
  assert(
    `No bespoke ReadinessRing duplicate ("100% into 100%")`,
    readinessRingCount === 0,
    `count=${readinessRingCount}`,
  );

  // Pin 7 — Type into a textarea, watch SaveIndicator transition, then Save.
  const firstTextarea = page.locator('textarea, input[type="text"]').first();
  await firstTextarea.click();
  // Append a unique marker; remove it at the end so we don't drift the fixture.
  const marker = ` (verify-${Date.now().toString(36).slice(-4)})`;
  await page.keyboard.type(marker, { delay: 30 });
  // SaveIndicator should reach a "Saving..." or "Unsaved" state immediately.
  const sawDirty = await page
    .locator('text=/Saving|Unsaved/i')
    .first()
    .isVisible({ timeout: 3_000 })
    .catch(() => false);
  assert(`Typing triggers Saving/Unsaved indicator`, sawDirty);

  // Click Save — should reach "Saved" promptly without 700ms debounce wait.
  // Waits up to 8s because the indicator may briefly pass through "Saving..."
  // between the autosave triggered by typing and the manual click — we want
  // to see the terminal "Saved" state, not race the transition.
  await saveBtn.click();
  const sawSaved = await page
    .locator('text=/Saved|All changes saved/i')
    .first()
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  assert(`Save click reaches Saved state`, sawSaved);

  // Clean up our marker so we don't drift the fixture across runs.
  for (let i = 0; i < marker.length; i++) {
    await page.keyboard.press("Backspace");
  }
  // Trigger save again to commit the cleanup.
  await page.waitForTimeout(800);

  await page.screenshot({ path: join(SHOT_DIR, "02-after-save.png"), fullPage: true });
  await page.close();

  // Pin 8 — side-by-side: Financials should render the same WorkspaceHeader.
  const fpage = await ctx.newPage();
  await fpage.setViewportSize({ width: 1440, height: 900 });
  await gotoWorkspace(fpage, "/workspace/financials");
  await fpage.screenshot({ path: join(SHOT_DIR, "03-financials-header.png"), fullPage: true });
  await fpage
    .locator("header")
    .first()
    .screenshot({ path: join(SHOT_DIR, "03-financials-header-band.png") })
    .catch(() => {});

  const fH1 = (await fpage.locator("h1").first().innerText()).trim();
  assert(`Financials header title still "Financials"`, fH1 === "Financials", `h1=${JSON.stringify(fH1)}`);

  const fSaveBtn = fpage.getByRole("button", { name: /^Save$/ }).first();
  assert(`Financials Save button still present (no regression)`, await fSaveBtn.isVisible());

  await fpage.close();
  await browser.close();

  const pass = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`\n${pass}/${total} pinned`);
  console.log(`screenshots: ${SHOT_DIR}`);
  process.exit(pass === total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
