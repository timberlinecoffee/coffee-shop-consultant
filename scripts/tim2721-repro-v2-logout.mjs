#!/usr/bin/env node
// TIM-2721: reproduce the board's "v2 URL logs me out + never loads" symptom.
//
// Strategy: mint a real board session via magiclink (no password reset), inject
// chunked @supabase/ssr cookies into Playwright (same pattern as TIM-2686), then
// visit each ?ui=v2 deep link. Capture for every page:
//   - the full request/response chain (status, location, set-cookie)
//   - whether the page lands on /login or on the workspace
//   - console errors / page errors
//   - cookies AFTER navigation (compared to BEFORE — did sb-* cookies survive?)
//   - the effective UI lane (does Sidebar v2 / Home v2 actually render?)
//
// Output: done-evidence/tim2721/diagnostics.json + per-URL screenshot + per-URL
// .har file. No code changes — diagnosis only per Rule #1 ("repro first, no
// ship-and-retest").

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, "..");
const OUT_DIR = join(REPO_ROOT, "done-evidence", "tim2721");

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

const URLS = [
  { name: "financials-v2", path: "/workspace/financials", ui: "v2" },
  { name: "equipment-v2",  path: "/workspace/buildout-equipment", ui: "v2" },
  { name: "launchplan-v2", path: "/workspace/launch-plan", ui: "v2" },
  { name: "home-v2",       path: "/dashboard", ui: "v2" },
  // control: same paths without ?ui=v2 — do they load fine?
  { name: "financials-noparam", path: "/workspace/financials", ui: null },
  { name: "home-noparam",       path: "/dashboard", ui: null },
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
  return { cookies, session: otp.session };
}

function summarizeCookies(cookies) {
  const sb = cookies.filter(c => c.name.startsWith("sb-")).map(c => ({
    name: c.name, len: c.value.length, sameSite: c.sameSite, secure: c.secure, httpOnly: c.httpOnly, expires: c.expires,
  }));
  const ui = cookies.filter(c => c.name.startsWith("gw_ui_revamp")).map(c => ({
    name: c.name, value: c.value, sameSite: c.sameSite, secure: c.secure, httpOnly: c.httpOnly, expires: c.expires,
  }));
  return { sbCount: sb.length, sbCookies: sb, uiCookies: ui };
}

async function probeUrl(context, spec) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const responseChain = [];
  const setCookieHeaders = [];

  page.on("console", msg => {
    if (msg.type() === "error" || msg.type() === "warning") {
      consoleErrors.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on("pageerror", err => pageErrors.push({ message: err.message, stack: err.stack?.slice(0, 800) }));
  page.on("response", async resp => {
    const req = resp.request();
    const u = new URL(resp.url());
    // capture only main-document and redirects on the target host
    if (u.hostname !== new URL(BASE).hostname) return;
    if (req.resourceType() !== "document") return;
    const setCookie = await resp.headerValue("set-cookie").catch(() => null);
    if (setCookie) {
      setCookieHeaders.push({ from: resp.url(), setCookie });
    }
    responseChain.push({
      url: resp.url(),
      status: resp.status(),
      location: await resp.headerValue("location").catch(() => null),
      xMatched: await resp.headerValue("x-matched-path").catch(() => null),
      vercelId: await resp.headerValue("x-vercel-id").catch(() => null),
    });
  });

  const cookiesBefore = await context.cookies();
  const beforeSummary = summarizeCookies(cookiesBefore);

  const target = spec.ui ? `${BASE}${spec.path}?ui=${spec.ui}` : `${BASE}${spec.path}`;
  let navError = null;
  try {
    await page.goto(target, { waitUntil: "commit", timeout: 30000 });
  } catch (err) {
    navError = err.message;
  }
  await page.waitForTimeout(4500);

  const finalUrl = page.url();
  const cookiesAfter = await context.cookies();
  const afterSummary = summarizeCookies(cookiesAfter);

  const renderedV2 = await page.evaluate(() => {
    // SidebarV2 has data-testid or class; the simplest signal is the bottom tab
    // bar, which only mounts under v2. Fallback: look for the v2 home readiness
    // ring (HomeV2).
    const btb = document.querySelector('[data-tim2591-bottom-tab-bar], nav[aria-label="Primary mobile"], [data-bottom-tab-bar]');
    const ring = document.querySelector('[data-tim2593-readiness-ring], [data-readiness-ring]');
    const sidebarV2 = document.querySelector('[data-tim2590-sidebar-v2], [data-sidebar-v2]');
    return {
      hasBottomTabBar: !!btb,
      hasReadinessRing: !!ring,
      hasSidebarV2: !!sidebarV2,
      title: document.title,
      bodyLen: document.body?.innerText?.length ?? 0,
      firstHeading: document.querySelector("h1, h2")?.textContent?.trim()?.slice(0, 200) ?? null,
    };
  }).catch(() => ({ error: "evaluate-failed" }));

  const screenshot = join(OUT_DIR, `${spec.name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  await page.close();

  return {
    spec,
    target,
    finalUrl,
    landedOnLogin: finalUrl.includes("/login"),
    navError,
    cookiesBefore: beforeSummary,
    cookiesAfter: afterSummary,
    sbCookieDelta: afterSummary.sbCount - beforeSummary.sbCount,
    responseChain,
    setCookieHeaders,
    consoleErrors: consoleErrors.slice(0, 30),
    pageErrors: pageErrors.slice(0, 10),
    renderedV2,
    screenshot,
  };
}

async function main() {
  const host = new URL(BASE).hostname;
  console.log(`→ Minting board session via magiclink for ${FIXTURE_EMAIL} on ${host}…`);
  const { cookies, session } = await mintCookiesFor(host);
  console.log(`→ Got session, expires_at=${new Date(session.expires_at * 1000).toISOString()}`);

  console.log(`→ Launching headless chromium, base=${BASE}`);
  const browser = await chromium.launch({ headless: true });

  // One context (shared cookies across URLs, simulating one browser tab)
  const context = await browser.newContext();
  await context.addCookies(cookies);

  const results = [];
  for (const spec of URLS) {
    console.log(`→ ${spec.name}: ${spec.path}${spec.ui ? `?ui=${spec.ui}` : ""}`);
    const r = await probeUrl(context, spec);
    console.log(`   final=${r.finalUrl} | login=${r.landedOnLogin} | sb-delta=${r.sbCookieDelta} | console-errors=${r.consoleErrors.length} | page-errors=${r.pageErrors.length}`);
    results.push(r);
  }

  await context.close();
  await browser.close();

  const report = {
    issue: "TIM-2721",
    fixtureEmail: FIXTURE_EMAIL,
    base: BASE,
    capturedAt: new Date().toISOString(),
    sessionExpiresAt: new Date(session.expires_at * 1000).toISOString(),
    results,
  };
  writeFileSync(join(OUT_DIR, "diagnostics.json"), JSON.stringify(report, null, 2));
  console.log(`\nWrote diagnostics.json + ${results.length} screenshots to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("Repro failed:", err);
  process.exit(1);
});
