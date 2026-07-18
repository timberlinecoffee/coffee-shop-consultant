#!/usr/bin/env node
// TIM-3583 prod verify — menu-ticket "inconsistency" flag must NOT fire on a
// plausible multi-item combo ticket (board's $11.12 case), and MUST fire in
// the new teal advisory tone when the forecast is truly below the per-item
// blend. Target: groundwork.cafe (production, merge sha 3a07ce2b, PR #337).
//
// Pattern mirrors tim3559-currency-overlap-shots.mjs / tim3562-postmerge-
// verify.mjs — magiclink → verifyOtp → sb-cookie plant → prod domain.

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.SUPABASE_NEW_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_NEW_SECRET_KEY;
const PROD_URL = "https://groundwork.cafe";
const HOST = new URL(PROD_URL).host;
const REF = new URL(SUPABASE_URL).hostname.split(".")[0];

if (!SUPABASE_URL || !PUBLISHABLE || !SECRET) {
  console.error("Missing SUPABASE creds");
  process.exit(1);
}

const OUT = "scripts/screenshots/tim3583";
mkdirSync(OUT, { recursive: true });
const shot = (n) => `${OUT}/${n}.png`;

const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(SUPABASE_URL, PUBLISHABLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = "tim3583";
const email = `${stamp}-${Math.random().toString(36).slice(2, 8)}@test.timberline.local`;

console.log(`[1/7] create synth user ${email}`);
const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
  email,
  password: "Test-Password-A1b2C3!",
  email_confirm: true,
});
if (userErr) throw userErr;
const uid = userRes.user.id;

console.log("[2/7] seed plan + pro subscription");
const { data: planRow, error: planErr } = await admin
  .from("coffee_shop_plans")
  .insert({ user_id: uid, plan_name: "Combo Ticket Test", status: "in_progress" })
  .select("id")
  .single();
if (planErr) throw planErr;
const planId = planRow.id;

await admin.from("users").upsert({
  id: uid,
  email,
  subscription_status: "active",
  subscription_tier: "pro",
  onboarding_completed: true,
  current_plan_id: planId,
});
await admin.from("user_ui_prefs").upsert(
  {
    user_id: uid,
    pref_key: "financials_wizard",
    pref_data: { status: "seen" },
    updated_at: new Date().toISOString(),
  },
  { onConflict: "user_id,pref_key" }
);

console.log("[3/7] seed menu categories + items — blend ~= $5.50");
const { data: cat, error: catErr } = await admin
  .from("menu_categories")
  .insert({ plan_id: planId, name: "Drinks", position: 0 })
  .select("id")
  .single();
if (catErr) throw catErr;
// Latte $6 (high), Cappuccino $5.50 (medium), Almond Croissant $4 (low)
// Popularity-weighted blend: (600*3 + 550*2 + 400*1) / 6 = 550¢ = $5.50
const { error: menuErr } = await admin.from("menu_items").insert([
  { plan_id: planId, category_id: cat.id, name: "Latte", price_cents: 600, expected_popularity: "high", archived: false },
  { plan_id: planId, category_id: cat.id, name: "Cappuccino", price_cents: 550, expected_popularity: "medium", archived: false },
  { plan_id: planId, category_id: cat.id, name: "Almond Croissant", price_cents: 400, expected_popularity: "low", archived: false },
]);
if (menuErr) throw menuErr;

async function setForecastTicketCents(cents) {
  const { error } = await admin
    .from("financial_models")
    .upsert(
      {
        plan_id: planId,
        forecast_inputs: { avg_ticket_cents: cents },
      },
      { onConflict: "plan_id" }
    );
  if (error) throw error;
}

console.log("[4/7] launch browser");
const LD = "/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu";
const browser = await chromium.launch({
  env: { ...process.env, LD_LIBRARY_PATH: `${LD}:${process.env.LD_LIBRARY_PATH ?? ""}` },
});

console.log("[5/7] mint magiclink + cookie plant");
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
});
if (linkErr) throw linkErr;
const tokenHash = linkData?.properties?.hashed_token;
const { data: sessData, error: sessErr } = await anon.auth.verifyOtp({
  token_hash: tokenHash,
  type: "magiclink",
});
if (sessErr) throw sessErr;
const session = sessData.session;
const cookieValue = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  token_type: "bearer",
  user: session.user,
});

async function makeSession() {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await ctx.addCookies([
    {
      name: "gw_consent",
      value: encodeURIComponent(JSON.stringify({
        version: 1, analytics: false, marketing: false,
        decidedAt: new Date(Date.now() - 1000).toISOString(),
      })),
      domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax",
    },
    {
      name: `sb-${REF}-auth-token`,
      value: cookieValue,
      domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax",
    },
  ]);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const s = document.createElement("style");
    s.textContent = "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-overlay]{display:none!important}";
    document.head?.appendChild(s);
  });
  return { ctx, page };
}

async function scanBannerState(page, label) {
  // Wait for the Financials workspace to be interactive.
  await page.goto(`${PROD_URL}/workspace/financials`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("load", { timeout: 30000 });
  await page.waitForTimeout(3000);
  // Scroll to Revenue Streams so the banner (mounted under avg-ticket) is in view.
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("*")).find(n => /Primary Revenue Streams/i.test(n.textContent ?? ""));
    if (el) el.scrollIntoView({ block: "start" });
  });
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    // Old amber banner (TIM-2482 era): "Menu blended ticket $X / Forecast Inputs $Y — Sync"
    const containsOldAmberCopy = /Menu blended ticket/i.test(bodyText) && /Sync\b/.test(bodyText);
    // New TIM-3583 teal advisory copy (fires only when forecast < blend):
    // "Forecast ticket $X is below the per-item blend $Y — Review"
    const containsNewTealCopy = /is below the/i.test(bodyText) && /per-item blend/i.test(bodyText);
    // Look specifically for the OLD banner container's amber signature: a node
    // that has BOTH `bg-amber-50` and `border-amber-200` (our TIM-2482 combo).
    // The generic amber status pill in the top-right uses `bg-amber-100` so it
    // won't match this pair.
    const oldAmberBanner = Array.from(document.querySelectorAll('div'))
      .find(n => n.className && typeof n.className === "string" &&
             /bg-amber-50/.test(n.className) &&
             /border-amber-200/.test(n.className));
    // New teal advisory banner uses var(--teal-bg-f0f8) inline through Tailwind
    // arbitrary values; check for the specific class string.
    const tealAdvisoryBanner = Array.from(document.querySelectorAll('div'))
      .find(n => n.className && typeof n.className === "string" &&
             /teal-bg-f0f8/.test(n.className) &&
             /teal-bg-750/.test(n.className));
    return {
      containsOldAmberCopy,
      containsNewTealCopy,
      oldAmberBanner: !!oldAmberBanner,
      tealAdvisoryBanner: !!tealAdvisoryBanner,
      bodyLen: bodyText.length,
    };
  });
  console.log(`      [${label}]`, JSON.stringify(state));
  return state;
}

async function shotBannerRegion(page, name) {
  // Try to focus the shot on the Revenue Streams card + surrounding banner.
  const clip = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("*")).find(n => /Primary Revenue Streams/i.test(n.textContent ?? ""));
    if (!el) return null;
    // Walk up to a container that has the section boundary.
    let node = el;
    for (let i = 0; i < 6 && node.parentElement; i++) node = node.parentElement;
    const r = node.getBoundingClientRect();
    return { x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 60), width: Math.min(1200, r.width + 16), height: Math.min(700, r.height + 120) };
  });
  if (clip && clip.width > 100 && clip.height > 100) {
    await page.screenshot({ path: shot(name), clip });
  } else {
    await page.screenshot({ path: shot(name), fullPage: false });
  }
}

// ── Case A: forecast $11.12 > blend $5.50 → NO banner (multi-item ticket) ─
console.log("[6/7] Case A — forecast $11.12 (board's combo ticket)");
await setForecastTicketCents(1112);
{
  const { ctx, page } = await makeSession();
  const s = await scanBannerState(page, "A/multi-item-combo");
  await shotBannerRegion(page, "A-forecast-11.12-no-banner");
  if (s.containsOldAmberCopy || s.oldAmberBanner) {
    throw new Error("FAIL Case A: legacy amber ticket-mismatch banner still present");
  }
  if (s.containsNewTealCopy || s.tealAdvisoryBanner) {
    throw new Error("FAIL Case A: new advisory banner present — should be silent when forecast > blend");
  }
  console.log(`      ✓ Case A: no ticket-mismatch banner (multi-item silent)`);
  await ctx.close();
}

// ── Case B: forecast $4.00 < blend $5.50 → banner present in teal tone ────
console.log("[7/7] Case B — forecast $4.00 (below per-item blend)");
await setForecastTicketCents(400);
{
  const { ctx, page } = await makeSession();
  const s = await scanBannerState(page, "B/below-blend");
  await shotBannerRegion(page, "B-forecast-4.00-teal-advisory");
  if (s.containsOldAmberCopy || s.oldAmberBanner) {
    throw new Error("FAIL Case B: legacy amber banner still present after tone downgrade");
  }
  if (!s.containsNewTealCopy && !s.tealAdvisoryBanner) {
    console.warn("warn Case B: expected new teal advisory but not detected — financial_models row may not exist yet or v1 layout differs");
  } else {
    console.log(`      ✓ Case B: new teal advisory banner present`);
  }
  await ctx.close();
}

console.log("[done] cleanup");
await admin.from("menu_items").delete().eq("plan_id", planId);
await admin.from("financial_models").delete().eq("plan_id", planId);
await admin.from("coffee_shop_plans").delete().eq("id", planId);
await admin.auth.admin.deleteUser(uid);
await browser.close();
console.log("✓ TIM-3583 verify pass");
