#!/usr/bin/env node
// TIM-2429: live verify on https://groundwork.cafe after merge.
//
// Pins:
//   1. Pre-clean: delete any stored pref so we start from "fresh login".
//   2. Forecast Inputs: zero "Advanced" badge text on the page.
//   3. All known sections render in the OPEN state on a clean load
//      (chevron rotated 180°, content visible).
//   4. Collapsing two sections (Operating Schedule, Ramp Period) updates
//      the UI immediately AND persists to the server.
//   5. Reload — those two are still collapsed; the others stay open.
//   6. Fresh context (mints a new session, mimics sign-out/sign-in) —
//      the two are STILL collapsed for the same user.
//
// Auth model: same @supabase/ssr cookie injection used on TIM-2352,
// TIM-2385, TIM-2394, TIM-2413, TIM-2416, TIM-2426.

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
const PREF_KEY = "financials.forecastInputs.sections";

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
  console.error("Missing Supabase env in .env.local");
  process.exit(1);
}

const SHOT_DIR = join(repoRoot, "verify-tim2429");
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

async function clearPref(userId) {
  // Pre-clean: drop any prior pref blob for this user so the test starts
  // from "fresh login" (all sections default open).
  const { error } = await admin
    .from("user_ui_prefs")
    .delete()
    .eq("user_id", userId)
    .eq("pref_key", PREF_KEY);
  if (error) throw new Error(`clearPref failed: ${error.message}`);
}

async function readPref(userId) {
  const { data, error } = await admin
    .from("user_ui_prefs")
    .select("pref_data")
    .eq("user_id", userId)
    .eq("pref_key", PREF_KEY)
    .maybeSingle();
  if (error) throw new Error(`readPref failed: ${error.message}`);
  return data?.pref_data ?? null;
}

// Section title text → expected to be present on the page (board-canonical
// labels). The accordion content is gated behind `open` — when a section is
// open, the chevron has `rotate-180` and its sibling content is rendered.
const SECTIONS = [
  { slug: "customer-flow", title: "Customer Flow by Day" },
  { slug: "operating-schedule", title: "Operating Schedule" },
  { slug: "primary-revenue", title: "Primary Revenue Streams" },
  { slug: "additional-revenue", title: "Additional Revenue Streams" },
  { slug: "costs", title: "Costs & Expenses" },
  { slug: "other-operating-costs", title: "Other Operating Costs" },
  { slug: "owner-activity", title: "Owner Activity" },
  { slug: "startup", title: "Startup & Opening Costs" },
  { slug: "taxes", title: "Taxes" },
  { slug: "fiscal-year-currency", title: "Fiscal Year & Currency" },
  { slug: "ramp-period", title: "Ramp Period" },
  { slug: "monthly-growth", title: "Monthly Growth Rate" },
];

async function gotoForecast(page) {
  await page.goto(`${BASE}/workspace/financials`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(900);
}

async function sectionButton(page, title) {
  // The section trigger button contains the title span. We match the button
  // by the span's text. There's one such button per section.
  return page.locator(`button:has(span:text-is("${title}"))`).first();
}

async function isOpen(page, title) {
  const btn = await sectionButton(page, title);
  const expanded = await btn.getAttribute("aria-expanded");
  return expanded === "true";
}

async function dumpAdvancedCount(page) {
  // Count exact-match "Advanced" text occurrences anywhere on the page.
  // The old badge rendered the literal string "Advanced". Any match is a
  // regression.
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n = 0;
    let node;
    while ((node = walker.nextNode())) {
      if (/\bAdvanced\b/.test(node.nodeValue || "")) n += 1;
    }
    return n;
  });
}

async function main() {
  const { cookies, userId } = await mintSessionCookies();
  await clearPref(userId);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: false });
  await ctx.addCookies(cookies);
  ctx.setDefaultTimeout(30_000);

  // 1) Fresh load: all sections open, no "Advanced" badge.
  let page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoForecast(page);
  await page.screenshot({ path: join(SHOT_DIR, "01-fresh-all-open.png"), fullPage: true });

  const advCount = await dumpAdvancedCount(page);
  assert(`No "Advanced" badge text on Forecast Inputs`, advCount === 0, `count=${advCount}`);

  for (const s of SECTIONS) {
    const open = await isOpen(page, s.title);
    assert(`"${s.title}" starts OPEN on fresh load`, open === true, `aria-expanded=${open}`);
  }

  // 2) Collapse Operating Schedule + Ramp Period.
  for (const title of ["Operating Schedule", "Ramp Period"]) {
    const btn = await sectionButton(page, title);
    await btn.click();
    await page.waitForTimeout(150);
    const open = await isOpen(page, title);
    assert(`"${title}" collapses on click`, open === false, `aria-expanded=${open}`);
  }
  await page.screenshot({ path: join(SHOT_DIR, "02-two-collapsed.png"), fullPage: true });

  // 3) Server persistence: the pref row exists with the right slugs flipped.
  // Allow a moment for the fire-and-forget PUT.
  await page.waitForTimeout(1500);
  const stored = await readPref(userId);
  assert(
    `Pref row persisted on server`,
    stored && stored["operating-schedule"] === false && stored["ramp-period"] === false,
    `stored=${JSON.stringify(stored)}`,
  );

  // 4) Reload — collapses survive.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOT_DIR, "03-after-reload.png"), fullPage: true });

  const opsAfterReload = await isOpen(page, "Operating Schedule");
  assert(`"Operating Schedule" stays collapsed after reload`, opsAfterReload === false, `aria-expanded=${opsAfterReload}`);
  const rampAfterReload = await isOpen(page, "Ramp Period");
  assert(`"Ramp Period" stays collapsed after reload`, rampAfterReload === false, `aria-expanded=${rampAfterReload}`);

  // Sanity: the others stayed open.
  for (const s of SECTIONS) {
    if (s.title === "Operating Schedule" || s.title === "Ramp Period") continue;
    const open = await isOpen(page, s.title);
    assert(`"${s.title}" stays OPEN after reload`, open === true, `aria-expanded=${open}`);
  }

  await page.close();

  // 5) New session (mimics sign-out + sign-in) — same user, same pref.
  const { cookies: cookies2 } = await mintSessionCookies();
  const ctx2 = await browser.newContext({ ignoreHTTPSErrors: false });
  await ctx2.addCookies(cookies2);
  ctx2.setDefaultTimeout(30_000);
  page = await ctx2.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoForecast(page);
  await page.screenshot({ path: join(SHOT_DIR, "04-new-session.png"), fullPage: true });

  const opsNewSession = await isOpen(page, "Operating Schedule");
  assert(`"Operating Schedule" still collapsed in new session`, opsNewSession === false, `aria-expanded=${opsNewSession}`);
  const rampNewSession = await isOpen(page, "Ramp Period");
  assert(`"Ramp Period" still collapsed in new session`, rampNewSession === false, `aria-expanded=${rampNewSession}`);

  await page.close();
  await browser.close();

  // Leave the pref in a known state for the next run (clean it).
  await clearPref(userId);

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
