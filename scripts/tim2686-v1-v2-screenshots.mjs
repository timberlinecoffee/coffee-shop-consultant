#!/usr/bin/env node
// TIM-2686 / TIM-2575 — capture v1↔v2 side-by-side proof on prod (groundwork.cafe).
//
// Auth: mint magiclink via service role → exchange via anon for a session →
// inject @supabase/ssr chunked base64 cookie. Same pattern as TIM-2416 /
// TIM-1838. NO password reset for trent@simpler.coffee.
//
// Surfaces × viewports (16 PNGs, 8 surface-pairs):
//   Desktop 1440×900: home, equipment, financials, build
//   Mobile  390×844:  home, nav, equipment, scout
// Each pair captured under ?ui=v1 and ?ui=v2 (proxy.ts sets a 365d override
// cookie when it sees the param so subsequent navigations stay on that lane).

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, "..");
const OUT_DIR = join(REPO_ROOT, "done-evidence", "tim2575");

function loadEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2$/);
      if (!m) continue;
      out[m[1]] = m[3].replace(/\\n$/, "").trim();
    }
  } catch {
    // optional
  }
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

// Note: task body said "Build landing /build" but /workspace/build 404s on prod
// (sidebar NAV_ITEMS href is a placeholder; real sub-routes are buildout-equipment,
// launch-plan, location-lease, etc.). Capturing /workspace/launch-plan as the
// representative Build-stage landing — Gantt is the most distinctive Build surface.
const SURFACES = [
  // desktop
  { surface: "home",        viewport: "desktop", path: "/dashboard" },
  { surface: "equipment",   viewport: "desktop", path: "/workspace/buildout-equipment" },
  { surface: "financials",  viewport: "desktop", path: "/workspace/financials" },
  { surface: "launch-plan", viewport: "desktop", path: "/workspace/launch-plan" },
  // mobile
  { surface: "home",        viewport: "mobile",  path: "/dashboard" },
  { surface: "nav",         viewport: "mobile",  path: "/dashboard", openNav: true },
  { surface: "equipment",   viewport: "mobile",  path: "/workspace/buildout-equipment" },
  // Scout (CoPilotDrawer) is only mounted on /workspace/* pages, not /dashboard.
  // Use /workspace/financials so the drawer listener is attached on both lanes.
  { surface: "scout",       viewport: "mobile",  path: "/workspace/financials", openScout: true },
];

async function mintCookiesFor(host) {
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
  const base = {
    domain: host,
    path: "/",
    httpOnly: false,
    sameSite: "Lax",
    secure: true,
  };
  const cookies = [];
  if (fullValue.length <= MAX) {
    cookies.push({ ...base, name: storageKey, value: fullValue });
  } else {
    let i = 0;
    let pos = 0;
    while (pos < fullValue.length) {
      cookies.push({ ...base, name: `${storageKey}.${i}`, value: fullValue.slice(pos, pos + MAX) });
      pos += MAX;
      i += 1;
    }
  }
  return cookies;
}

async function dismissCookieBanner(page) {
  // Cookie banner shows on first visit; "Necessary Only" sets a localStorage
  // flag so it stays dismissed for the context. Best-effort; ignore if absent.
  try {
    const necessary = page.getByRole("button", { name: /necessary only/i }).first();
    if (await necessary.isVisible({ timeout: 1500 }).catch(() => false)) {
      await necessary.click({ timeout: 1500 });
      await page.waitForTimeout(300);
    }
  } catch {
    // best-effort
  }
}

async function captureOne(context, host, spec, lane) {
  const page = await context.newPage();
  await page.setViewportSize(VIEWPORTS[spec.viewport]);

  // First navigation includes ?ui=<lane> so proxy.ts sets the override cookie
  // before SSR resolves the user. After this, the cookie persists for the page
  // lifetime in this context.
  const url = `${BASE}${spec.path}?ui=${lane}`;
  await page.goto(url, { waitUntil: "commit", timeout: 30000 });

  // Authed workspace pages hold the Scout SSE stream open; "networkidle" hangs.
  // commit + a fixed settle is the proven pattern (see [[tim-1846]]).
  await page.waitForTimeout(4500);

  await dismissCookieBanner(page);

  // Open hamburger (v1) on the nav-mobile capture. Under v2 mobile, the bottom
  // tab bar is already visible on every page, so no action needed.
  // AppSidebar (v1) and SidebarV2 (v2) both listen to `workspace-sidebar-open`
  // — dispatch directly, more reliable than clicking the custom-SVG hamburger.
  if (spec.openNav && lane === "v1") {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("workspace-sidebar-open"));
    }).catch(() => {});
    await page.waitForTimeout(900);
  }

  if (spec.openScout) {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("workspace-copilot-open"));
    }).catch(() => {});
    await page.waitForTimeout(1200);
  }

  const filename = `${spec.surface}-${spec.viewport}-${lane}.png`;
  const out = join(OUT_DIR, filename);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  console.log(`  ✓ ${filename}`);
  return { filename, path: out, surface: spec.surface, viewport: spec.viewport, lane };
}

async function main() {
  const host = new URL(BASE).hostname;
  console.log(`→ Minting session for ${FIXTURE_EMAIL} on ${host} (magiclink, no password reset)…`);
  const cookies = await mintCookiesFor(host);

  console.log(`→ Launching headless chromium, base=${BASE}`);
  const browser = await chromium.launch({ headless: true });
  // One context per lane to keep override cookies isolated.
  const captured = [];

  for (const lane of ["v1", "v2"]) {
    console.log(`→ Lane ${lane}`);
    const context = await browser.newContext();
    await context.addCookies(cookies);
    for (const spec of SURFACES) {
      try {
        const r = await captureOne(context, host, spec, lane);
        captured.push(r);
      } catch (err) {
        console.error(`  ✗ ${spec.surface}-${spec.viewport}-${lane}: ${err.message}`);
        captured.push({
          filename: `${spec.surface}-${spec.viewport}-${lane}.png`,
          surface: spec.surface,
          viewport: spec.viewport,
          lane,
          error: err.message,
        });
      }
    }
    await context.close();
  }

  await browser.close();

  const report = {
    issue: "TIM-2686",
    parentIssue: "TIM-2575",
    fixtureEmail: FIXTURE_EMAIL,
    base: BASE,
    capturedAt: new Date().toISOString(),
    surfaces: SURFACES.length,
    lanes: ["v1", "v2"],
    captured,
  };
  writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nWrote ${captured.length} screenshots + report.json to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
