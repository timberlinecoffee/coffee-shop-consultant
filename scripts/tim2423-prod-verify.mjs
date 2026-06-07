#!/usr/bin/env node
// TIM-2423: live verify on https://groundwork.cafe after merge.
//
// Pins the full DismissibleCallout round-trip on the board-cited primary
// target — the Financials guided-setup callout from TIM-1244:
//
//   1. Pre-clean: drop any prior `platform.dismissed-callouts` pref row so
//      we start from "fresh login" (callout shown).
//   2. Financials loads: the "New here?" callout is rendered with an
//      accessible X close button.
//   3. Click X: callout disappears in the DOM immediately (optimistic hide).
//   4. Server-side: `user_ui_prefs` row for the test user now contains
//      `financials.guided-setup-intro` -> ISO timestamp.
//   5. Reload Financials: callout stays gone.
//   6. /account: Guided Notices card lists "Financial Planner walkthrough"
//      with a Show Again button.
//   7. Click Show Again: the entry disappears from the list.
//   8. Server-side: pref row no longer contains the key.
//   9. Reload Financials: callout is back.
//   10. CALLOUT_REGISTRY entry for the key is also reachable in the
//       client bundle (chunk grep) — proves the registry shipped.

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
const PREF_KEY = "platform.dismissed-callouts";
const PRIMARY_CALLOUT_KEY = "financials.guided-setup-intro";
const PRIMARY_CALLOUT_LABEL = "Financial Planner walkthrough";

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
  console.error("Missing Supabase env in .env.local");
  process.exit(1);
}

const SHOT_DIR = join(repoRoot, "verify-tim2423");
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
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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

async function gotoFinancials(page) {
  await page.goto(`${BASE}/workspace/financials`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function gotoAccount(page) {
  await page.goto(`${BASE}/account`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function calloutPresent(page) {
  return await page
    .locator('text="New here? Let us walk you through this page."')
    .first()
    .isVisible()
    .catch(() => false);
}

async function dismissButton(page) {
  // The X button has aria-label="Dismiss this notice" per the style guide.
  return page
    .locator('[aria-label="Dismiss this notice"]')
    .first();
}

async function fetchClientChunkRegistryHit(page) {
  // Confirm the central registry shipped in the client bundle. The page is
  // authenticated; grab the actually-loaded JS URLs from the browser's
  // resource timing API, then grep each one. (Beats `fetch(/account)` which
  // returns the /login redirect HTML and references no account chunks.)
  const loaded = await page.evaluate(() => {
    return performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((n) => /\.js(\?|$)/.test(n) && n.includes("/_next/"));
  });
  const seen = new Set();
  let labelHit = false;
  let keyHit = false;
  for (const url of loaded) {
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const body = await r.text();
      if (body.includes(PRIMARY_CALLOUT_LABEL)) labelHit = true;
      if (body.includes(PRIMARY_CALLOUT_KEY)) keyHit = true;
      if (labelHit && keyHit) break;
    } catch {
      // skip
    }
  }
  return { labelHit, keyHit, chunkCount: seen.size };
}

async function main() {
  console.log(`\n=== TIM-2423 live verify @ ${BASE} for ${FIXTURE_EMAIL} ===\n`);

  const { cookies, userId } = await mintSessionCookies();
  await clearPref(userId);
  assert("0. pre-clean: dismissed-callouts pref cleared", true);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();

  // 1. Callout renders on first load.
  await gotoFinancials(page);
  const visible1 = await calloutPresent(page);
  assert("1. Financials shows 'New here?' callout on fresh login", visible1);
  await page.screenshot({
    path: join(SHOT_DIR, "01-callout-visible.png"),
    fullPage: false,
  });

  // 2. X dismiss button is present and has the canonical aria-label.
  const xBtn = await dismissButton(page);
  const xCount = await xBtn.count();
  assert(
    "2. X close button exists with aria-label='Dismiss this notice'",
    xCount > 0,
    `${xCount} match(es) on page`,
  );

  // 3. Click X — callout disappears.
  await xBtn.click();
  await page.waitForTimeout(500);
  const visibleAfterDismiss = await calloutPresent(page);
  assert(
    "3. Callout disappears immediately after X click (optimistic hide)",
    !visibleAfterDismiss,
  );
  await page.screenshot({
    path: join(SHOT_DIR, "02-after-dismiss.png"),
    fullPage: false,
  });

  // Allow async PUT to land.
  await page.waitForTimeout(1500);

  // 4. Server-side: pref row contains the canonical key.
  const prefAfterDismiss = await readPref(userId);
  const hasKey =
    prefAfterDismiss &&
    typeof prefAfterDismiss === "object" &&
    PRIMARY_CALLOUT_KEY in prefAfterDismiss;
  assert(
    "4. user_ui_prefs holds 'platform.dismissed-callouts' with the registered key",
    hasKey,
    hasKey
      ? `value=${JSON.stringify(prefAfterDismiss[PRIMARY_CALLOUT_KEY])}`
      : `pref=${JSON.stringify(prefAfterDismiss)}`,
  );

  // 5. Reload — stays gone.
  await gotoFinancials(page);
  const visibleAfterReload = await calloutPresent(page);
  assert(
    "5. Reload: callout stays dismissed across page loads",
    !visibleAfterReload,
  );

  // 6. /account: Guided Notices card lists the dismissed callout.
  // The account page renders one of two shells depending on the
  // NEXT_PUBLIC_BILLING_TAB feature flag (TIM-1911). When the tabbed
  // SettingsShell is active, the Guided Notices card sits inside the
  // "Preferences" tab; in the legacy stacked-card page it renders inline.
  // Click "Preferences" if the tab nav is present.
  await gotoAccount(page);
  const prefTab = page.locator('button:has-text("Preferences")').first();
  if (await prefTab.isVisible().catch(() => false)) {
    await prefTab.click();
    await page.waitForTimeout(400);
  }
  const guidedHeading = await page
    .locator('h2:text-is("Guided Notices")')
    .first()
    .isVisible()
    .catch(() => false);
  assert(
    "6a. Account page renders the Guided Notices card",
    guidedHeading,
  );
  // useDismissedCallouts is async: the card renders "Loading..." first, then
  // the row list once the GET resolves. Wait for the Show Again button to
  // appear (canonical signal that entries hydrated) before asserting the
  // label is present.
  await page
    .locator('button:has-text("Show Again")')
    .first()
    .waitFor({ state: "visible", timeout: 5_000 })
    .catch(() => {});
  // Soft text match — the label sits inside a truncated <p>, so a strict
  // text-is() locator can miss when the parent has CSS overflow rules.
  const labelRow = await page
    .getByText(PRIMARY_CALLOUT_LABEL, { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  assert(
    "6b. Guided Notices lists 'Financial Planner walkthrough'",
    labelRow,
  );
  await page.screenshot({
    path: join(SHOT_DIR, "03-guided-notices.png"),
    fullPage: false,
  });

  // 7. Click Show Again — entry disappears.
  await page.locator('button:has-text("Show Again")').first().click();
  await page.waitForTimeout(1200);
  const labelStillThere = await page
    .locator(`text="${PRIMARY_CALLOUT_LABEL}"`)
    .first()
    .isVisible()
    .catch(() => false);
  assert(
    "7. Show Again removes the entry from Guided Notices",
    !labelStillThere,
  );

  // 8. Server-side: pref no longer contains the key.
  const prefAfterShowAgain = await readPref(userId);
  const stillHasKey =
    prefAfterShowAgain &&
    typeof prefAfterShowAgain === "object" &&
    PRIMARY_CALLOUT_KEY in prefAfterShowAgain;
  assert(
    "8. user_ui_prefs no longer has the dismissed key after Show Again",
    !stillHasKey,
    `pref=${JSON.stringify(prefAfterShowAgain)}`,
  );

  // 9. Reload Financials — callout reappears.
  await gotoFinancials(page);
  const visibleAgain = await calloutPresent(page);
  assert(
    "9. Reload Financials: callout reappears after Show Again",
    visibleAgain,
  );
  await page.screenshot({
    path: join(SHOT_DIR, "04-callout-resurfaced.png"),
    fullPage: false,
  });

  // 10. Central registry shipped in client bundles. Re-navigate to /account
  // first so the Preferences chunk shows up in the resource-timing list.
  await gotoAccount(page);
  const prefTab2 = page.locator('button:has-text("Preferences")').first();
  if (await prefTab2.isVisible().catch(() => false)) {
    await prefTab2.click();
    await page.waitForTimeout(800);
  }
  const chunkProbe = await fetchClientChunkRegistryHit(page);
  assert(
    "10a. CALLOUT_REGISTRY label found in a client chunk",
    chunkProbe.labelHit,
    `scanned ${chunkProbe.chunkCount} chunk(s)`,
  );
  assert(
    "10b. CALLOUT_REGISTRY key 'financials.guided-setup-intro' found in a client chunk",
    chunkProbe.keyHit,
  );

  await browser.close();

  console.log("\n--- Summary ---");
  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  console.log(`${pass}/${results.length} pinned (${fail} failing)`);
  if (fail > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("VERIFY ERROR:", err);
  process.exit(1);
});
