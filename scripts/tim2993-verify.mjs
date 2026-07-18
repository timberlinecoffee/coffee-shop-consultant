#!/usr/bin/env node
// TIM-2993 — live-verify v2 chrome on prod without any opt-in cookie/header.
//
// Mints magiclink cookies for trent@simpler.coffee, drops them into a fresh
// Chromium context (NO gw_ui_revamp_override, NO gw_ui_revamp_v2 mirror),
// loads /dashboard, /workspace/financials, /workspace/concept on desktop +
// mobile, asserts SidebarV2 (v2-only) markers render, captures screenshots,
// and dumps the resolved deployment header.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, "..");
const OUT_DIR = join(REPO_ROOT, "done-evidence", "tim2993");

function loadEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2$/);
      if (!m) continue;
      out[m[1]] = m[3].replace(/\\n$/, "").trim();
    }
  } catch {}
  return out;
}

const env = { ...process.env, ...loadEnv(join(REPO_ROOT, ".env.local")) };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.VERIFY_BASE_URL ?? "https://groundwork.cafe";
const FIXTURE_EMAIL = process.env.VERIFY_EMAIL ?? "trent@simpler.coffee";

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
  console.error("Missing Supabase env in .env.local");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const SURFACES = [
  { name: "home", path: "/dashboard" },
  { name: "financials", path: "/workspace/financials" },
  { name: "concept", path: "/workspace/concept" },
];

async function mintCookies(host) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: FIXTURE_EMAIL,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${linkErr?.message}`);
  }
  const anon = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: otp, error: otpErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (otpErr || !otp?.session) {
    throw new Error(`verifyOtp failed: ${otpErr?.message}`);
  }
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const payload = JSON.stringify(otp.session);
  const b64 = Buffer.from(payload, "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fullValue = `base64-${b64}`;
  const MAX = 3180;
  const base = { domain: host, path: "/", httpOnly: false, sameSite: "Lax", secure: true };
  const cookies = [];
  if (fullValue.length <= MAX) {
    cookies.push({ ...base, name: storageKey, value: fullValue });
  } else {
    let i = 0, pos = 0;
    while (pos < fullValue.length) {
      cookies.push({ ...base, name: `${storageKey}.${i}`, value: fullValue.slice(pos, pos + MAX) });
      pos += MAX;
      i += 1;
    }
  }
  return cookies;
}

async function dismissCookieBanner(page) {
  try {
    const necessary = page.getByRole("button", { name: /necessary only/i }).first();
    if (await necessary.isVisible({ timeout: 1500 }).catch(() => false)) {
      await necessary.click({ timeout: 1500 });
      await page.waitForTimeout(300);
    }
  } catch {}
}

async function flipUserToTrue(host) {
  // Pre-flight: confirm trent's row in users.ui_revamp_v2 is true (i.e. the
  // TIM-2993 backfill landed on this account). Defensive read only.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin
    .from("users")
    .select("id, ui_revamp_v2")
    .eq("email", FIXTURE_EMAIL)
    .single();
  if (error) throw new Error(`users read failed: ${error.message}`);
  return data;
}

async function captureAndAssert(context, host, spec, viewport) {
  const page = await context.newPage();
  await page.setViewportSize(VIEWPORTS[viewport]);
  // NO ?ui= param — proves the new default lands without opt-in.
  const url = `${BASE}${spec.path}`;
  const resp = await page.goto(url, { waitUntil: "commit", timeout: 30000 });
  await page.waitForTimeout(4500);
  await dismissCookieBanner(page);

  // Page-level cookie audit: no override/mirror should be present.
  const cookies = await context.cookies();
  const override = cookies.find((c) => c.name === "gw_ui_revamp_override");
  const mirror = cookies.find((c) => c.name === "gw_ui_revamp_v2");

  // v2-only DOM markers. SidebarV2 (desktop) and the bottom-tab-bar (mobile)
  // render only when uiRevamp is true. v1 renders AppSidebar / no tab bar.
  // v2-only DOM markers (selectors distinct from v1 AppSidebar):
  //   desktop: SidebarV2 renders `aria-label="Account menu"` + `aria-label="Main navigation"`
  //            (AppSidebar uses "Account" and "Workspace navigation" respectively).
  //   mobile:  bottom-tab-bar component returns null when !uiRevamp, so its
  //            presence at all is a v2-only signal — `aria-label="Main navigation"`
  //            covers both desktop SidebarV2 and the mobile tab bar.
  let v2Marker = null;
  if (viewport === "desktop") {
    v2Marker = await page.locator('[aria-label="Account menu"]').count();
  } else {
    // bottom-tab-bar uses aria-label="Main navigation" and only renders under v2.
    v2Marker = await page.locator('nav[aria-label="Main navigation"]').count();
  }

  const filename = `${spec.name}-${viewport}.png`;
  const out = join(OUT_DIR, filename);
  await page.screenshot({ path: out, fullPage: true });
  const deployHeader = resp?.headers()?.["x-vercel-id"] ?? null;
  const dplHeader = resp?.headers()?.["x-matched-path"] ?? null;
  await page.close();
  console.log(`  ${spec.name} ${viewport}: HTTP ${resp?.status()}, v2Marker=${v2Marker}, override=${override?.value ?? "(none)"}, mirror=${mirror?.value ?? "(none)"}, vercel=${deployHeader}`);
  return { surface: spec.name, viewport, status: resp?.status(), v2Marker, override: override?.value ?? null, mirror: mirror?.value ?? null, vercel: deployHeader, filename };
}

async function main() {
  const host = new URL(BASE).hostname;

  console.log(`→ Pre-flight: reading ${FIXTURE_EMAIL} ui_revamp_v2 from prod…`);
  const userRow = await flipUserToTrue(host);
  console.log(`   ${FIXTURE_EMAIL}: id=${userRow.id} ui_revamp_v2=${userRow.ui_revamp_v2}`);
  if (userRow.ui_revamp_v2 !== true) {
    throw new Error(`Backfill did not land on ${FIXTURE_EMAIL}: ui_revamp_v2=${userRow.ui_revamp_v2}`);
  }

  console.log(`→ Minting magiclink session for ${FIXTURE_EMAIL} on ${host}…`);
  const cookies = await mintCookies(host);

  console.log(`→ Launching headless chromium, base=${BASE}`);
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const viewport of Object.keys(VIEWPORTS)) {
    console.log(`→ ${viewport}`);
    const context = await browser.newContext();
    // NO gw_ui_revamp_override, NO gw_ui_revamp_v2 — only the auth cookies.
    await context.addCookies(cookies);
    for (const spec of SURFACES) {
      try {
        results.push(await captureAndAssert(context, host, spec, viewport));
      } catch (err) {
        console.error(`  ✗ ${spec.name}-${viewport}: ${err.message}`);
        results.push({ surface: spec.name, viewport, error: err.message });
      }
    }
    await context.close();
  }
  await browser.close();

  const ok = results.every((r) => r.status === 200 && r.v2Marker > 0 && !r.override && !r.mirror);
  const report = {
    issue: "TIM-2993",
    timestamp: new Date().toISOString(),
    base: BASE,
    fixtureEmail: FIXTURE_EMAIL,
    fixtureUserId: userRow.id,
    fixtureDbValue: userRow.ui_revamp_v2,
    results,
    pass: ok,
  };
  writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nReport: ${join(OUT_DIR, "report.json")}`);
  if (!ok) {
    console.error("FAIL — at least one surface did not render v2 chrome without opt-in cookies.");
    process.exit(2);
  }
  console.log("PASS — every surface rendered v2 chrome without ?ui= / mirror cookie.");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
