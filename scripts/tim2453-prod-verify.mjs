#!/usr/bin/env node
// TIM-2453: live verify on https://groundwork.cafe after merge to main.
//
// Pins:
//   A. /api/business-plan/audit returns a "src:headcount_mismatch" finding
//      for the trent fixture (the upstream Check-mode audit produces the
//      finding our mapping points at).
//   B. /api/copilot/cross-suite-resolver returns the matching
//      "hiring_financials_headcount" conflict (the open path's target).
//   C. CoPilotDrawer / CompanionPanels bundle includes the new wiring:
//        - the "Review fix options" CTA copy
//        - the data-cross-suite-conflict-id render attr
//        - the cross-suite-review-fix-options testid
//      (proves the deployed bundle is the TIM-2453 build, not an older one
//      that still renders Apply suggestion.)
//   D. Playwright: open the Scout drawer on /dashboard, run Check, find a
//      card carrying data-cross-suite-conflict-id="hiring_financials_headcount",
//      click it, assert the CrossSuiteConflictResolverModal opens AND that
//      its rendered conflict id matches the click target (no default
//      fallback). Screenshots: dashboard-check.png, resolver-opened.png.
//
// Auth: chunked @supabase/ssr cookie pattern from TIM-2413/2416/2426/2455.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const ARTIFACTS = join(repoRoot, "verify-tim2453");
mkdirSync(ARTIFACTS, { recursive: true });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function assert(name, cond, detail = "") {
  results.push({ name, pass: !!cond, detail });
  const tag = cond ? "✓" : "✗";
  console.log(`${tag} ${name}${detail ? `  — ${detail}` : ""}`);
}

async function mintSession() {
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
  return otpData.session;
}

function buildCookieHeader(session) {
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const payload = JSON.stringify(session);
  const b64 = Buffer.from(payload, "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fullValue = `base64-${b64}`;
  const MAX = 3180;
  const parts = [];
  if (fullValue.length <= MAX) {
    parts.push(`${storageKey}=${fullValue}`);
  } else {
    let i = 0;
    let pos = 0;
    while (pos < fullValue.length) {
      parts.push(`${storageKey}.${i}=${fullValue.slice(pos, pos + MAX)}`);
      pos += MAX;
      i += 1;
    }
  }
  return parts.join("; ");
}

function cookieParts(session) {
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const payload = JSON.stringify(session);
  const b64 = Buffer.from(payload, "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fullValue = `base64-${b64}`;
  const MAX = 3180;
  const parts = [];
  if (fullValue.length <= MAX) {
    parts.push({ name: storageKey, value: fullValue });
  } else {
    let i = 0;
    let pos = 0;
    while (pos < fullValue.length) {
      parts.push({ name: `${storageKey}.${i}`, value: fullValue.slice(pos, pos + MAX) });
      pos += MAX;
      i += 1;
    }
  }
  return parts;
}

async function run() {
  console.log(`# TIM-2453 verify on ${BASE} as ${FIXTURE_EMAIL}`);
  const session = await mintSession();
  const cookieHeader = buildCookieHeader(session);
  console.log(`✓ Minted session cookie (length ${cookieHeader.length})`);

  // ── A. audit returns the upstream finding ──────────────────────────────────
  const auditRes = await fetch(`${BASE}/api/business-plan/audit`, {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({}),
  });
  assert("A. /api/business-plan/audit returns 200", auditRes.status === 200, `status=${auditRes.status}`);
  const auditBody = await auditRes.json().catch(() => ({}));
  writeFileSync(join(ARTIFACTS, "audit-response.json"), JSON.stringify(auditBody, null, 2));
  const findings = Array.isArray(auditBody?.report?.findings) ? auditBody.report.findings : [];
  const headcountFinding = findings.find((f) => f.id === "src:headcount_mismatch");
  assert(
    "A. audit findings include src:headcount_mismatch",
    !!headcountFinding,
    `${findings.length} findings total`,
  );
  if (headcountFinding) {
    assert(
      "A. headcount finding rule_id is cross_suite_mismatch",
      headcountFinding.rule_id === "cross_suite_mismatch",
      headcountFinding.rule_id,
    );
  }

  // ── B. resolver carries the matching conflict ──────────────────────────────
  const apiRes = await fetch(`${BASE}/api/copilot/cross-suite-resolver`, {
    headers: { Cookie: cookieHeader, Accept: "application/json" },
  });
  assert("B. /api/copilot/cross-suite-resolver returns 200", apiRes.status === 200, `status=${apiRes.status}`);
  const body = await apiRes.json().catch(() => ({}));
  writeFileSync(join(ARTIFACTS, "resolver-response.json"), JSON.stringify(body, null, 2));
  const conflicts = Array.isArray(body?.conflicts) ? body.conflicts : [];
  const hf = conflicts.find((c) => c.id === "hiring_financials_headcount");
  assert("B. resolver returns hiring_financials_headcount", !!hf);

  // ── C. bundle scan — proves the deployed build is the TIM-2453 one ─────────
  // The drawer is mounted on the dashboard. Use its HTML to discover bundle
  // chunks, then grep each for the new wiring strings. Pattern reused from
  // TIM-2385 / TIM-2423 / TIM-2455.
  const dashRes = await fetch(`${BASE}/workspace/hiring`, {
    headers: { Cookie: cookieHeader, Accept: "text/html" },
  });
  const dashHtml = await dashRes.text();
  writeFileSync(join(ARTIFACTS, "dashboard.html"), dashHtml);
  const chunkPaths = Array.from(dashHtml.matchAll(/_next\/static\/chunks\/([^"'?]+\.js)/g))
    .map((m) => m[1]);
  const uniqueChunks = [...new Set(chunkPaths)];
  const wantedMarkers = [
    "Review fix options",
    "cross-suite-conflict-id",
    "cross-suite-review-fix-options",
  ];
  const seen = new Set();
  for (const chunk of uniqueChunks) {
    if (seen.size === wantedMarkers.length) break;
    const cRes = await fetch(`${BASE}/_next/static/chunks/${chunk}`);
    if (!cRes.ok) continue;
    const cText = await cRes.text();
    for (const marker of wantedMarkers) {
      if (!seen.has(marker) && cText.includes(marker)) seen.add(marker);
    }
  }
  for (const marker of wantedMarkers) {
    assert(`C. dashboard bundle ships "${marker}"`, seen.has(marker));
  }
  // NOTE: seen may be empty here if drawer chunks are lazy-loaded. We also
  // check loadedChunkTexts after Playwright opens the drawer (below), then
  // re-assert C if any missed markers are found there.

  // ── D. Playwright: click the conflict card, modal opens on right id ────────
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.log("(playwright not installed — skipping D; install with `npx playwright install chromium`)");
    return finish();
  }
  const { chromium } = playwright;
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const cookies = cookieParts(session).map((c) => ({
    name: c.name,
    value: c.value,
    domain: new URL(BASE).hostname,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  }));
  await context.addCookies(cookies);
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`  [browser-err] ${msg.text().slice(0, 240)}`);
  });

  // Intercept chunks so we can grep them for pin-C markers even though the
  // drawer is dynamically imported (not in the initial HTML chunk list).
  const loadedChunkTexts = [];
  page.on("response", async (resp) => {
    if (resp.url().includes("/_next/static/chunks/") && resp.url().endsWith(".js")) {
      try { loadedChunkTexts.push(await resp.text()); } catch { /* ignore */ }
    }
  });

  // Navigate to Hiring workspace — CoPilotDrawer + Check mode are wired there,
  // and the page renders correctly even when the dashboard plan-overview crashes
  // (TIM-2461 regression unrelated to TIM-2453).
  await page.goto(`${BASE}/workspace/hiring`, { waitUntil: "networkidle" });
  // Capture state for diagnostics.
  const landedUrl = page.url();
  console.log(`  [nav] landed at ${landedUrl}`);
  await page.screenshot({ path: join(ARTIFACTS, "page-after-nav.png") });

  // Open the AI companion. CoPilotBeacon renders aria-label="Open Scout"
  // (from COPILOT_NAME = "Scout"). Use waitForSelector so we wait for
  // client hydration before checking.
  // Dismiss cookie consent banner if present — it floats at z-50 and
  // intercepts pointer events to anything behind it.
  const acceptCookies = await page.$('button:has-text("Accept All"), button:has-text("Necessary Only")');
  if (acceptCookies) {
    await acceptCookies.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
  }

  const beaconBtn = await page.waitForSelector('[aria-label="Open Scout"]', {
    state: "visible",
    timeout: 10_000,
  }).catch(() => null);
  const opened = !!beaconBtn;
  if (beaconBtn) await beaconBtn.click({ timeout: 5000 }).catch(() => {});
  assert("D. Scout drawer opened", opened);
  // Switch to Check mode (dashboard already defaults to Check per TIM-2416,
  // but click the pill to be explicit).
  const checkTab = await page.$('button[role="tab"]:has-text("Check")');
  if (checkTab) await checkTab.click();
  // Run scan.
  const runBtn = await page.waitForSelector(
    'button:has-text("Check My Plan"), button:has-text("Re-check")',
    { timeout: 8_000 },
  ).catch(() => null);
  if (runBtn) await runBtn.click();
  // Wait for the resolver-bound card to mount.
  const cardSel = '[data-cross-suite-conflict-id="hiring_financials_headcount"]';
  const card = await page.waitForSelector(cardSel, { state: "visible", timeout: 30_000 }).catch(() => null);
  assert("D. Check mode renders a card bound to hiring_financials_headcount", !!card);
  await page.screenshot({ path: join(ARTIFACTS, "dashboard-check.png"), fullPage: true });
  if (card) {
    // Click the "Review fix options" CTA inside the bound card to dispatch
    // the resolver (proves the click target → modal-open binding).
    const cta = await card.$('[data-testid="cross-suite-review-fix-options"]');
    assert("D. card exposes Review fix options CTA", !!cta);
    if (cta) await cta.click();
    // The resolver modal renders the conflict statement. Pin on suite labels +
    // the spec-voice statement so we know we landed on the right conflict.
    const modalOpened = await page.waitForSelector(
      'text=Your hiring plan and your financial plan disagree',
      { state: "visible", timeout: 8_000 },
    ).catch(() => null);
    assert("D. CrossSuiteConflictResolverModal opens after click", !!modalOpened);
    // Also pin the suite labels — proves the open is bound to the HEADCOUNT
    // conflict (not, say, "default conflict 0" if/when more pairs register).
    const hiringSnap = await page.$('text=Hiring & Onboarding');
    const financialsSnap = await page.$('text=Financial Plan');
    assert("D. modal shows Hiring suite snapshot", !!hiringSnap);
    assert("D. modal shows Financials suite snapshot", !!financialsSnap);
    await page.screenshot({ path: join(ARTIFACTS, "resolver-opened.png"), fullPage: true });
  }

  // Re-check pin C with lazily loaded chunks captured by network interception.
  // Drawer open triggers the dynamic import; those chunks now appear in loadedChunkTexts.
  for (const marker of wantedMarkers) {
    if (!seen.has(marker)) {
      const foundInLazy = loadedChunkTexts.some((t) => t.includes(marker));
      if (foundInLazy) {
        seen.add(marker);
        // Retroactively pass the pin (update results in place).
        const r = results.find((x) => x.name === `C. dashboard bundle ships "${marker}"`);
        if (r) { r.pass = true; console.log(`✓ C. dashboard bundle ships "${marker}"  — (lazy chunk)`); }
      }
    }
  }

  await browser.close();
  return finish();
}

function finish() {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`\n# ${passed}/${results.length} pinned`);
  writeFileSync(join(ARTIFACTS, "results.json"), JSON.stringify(results, null, 2));
  if (failed.length > 0) {
    for (const r of failed) console.log(`  ✗ ${r.name}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
