// TIM-2450: live verification script for the Phase 3 benchmarking dashboard.
//
// Mints a Supabase magic-link session for trent@simpler.coffee, injects the
// Vercel protection-bypass cookie, navigates to Financials → How You Compare,
// asserts the engine-driven dashboard renders, then exercises drill-down +
// Ask Benchmark + Apply suggestion. Captures screenshots in verify-tim2450/.
//
// Usage:
//   VERIFY_BASE_URL=https://<preview>.vercel.app \
//   VERCEL_BYPASS=<token> \
//   node scripts/tim2450-preview-verify.mjs

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = dirname(dirname(__filename));

function loadEnv(p) {
  try {
    const lines = readFileSync(p, "utf8").split(/\r?\n/);
    const out = {};
    for (const l of lines) {
      const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...process.env, ...loadEnv(join(repoRoot, ".env.local")) };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.VERIFY_BASE_URL;
const BYPASS = process.env.VERCEL_BYPASS ?? "";
const FIXTURE_EMAIL = process.env.VERIFY_EMAIL ?? "trent@simpler.coffee";
const OUT_DIR = join(repoRoot, "verify-tim2450");
mkdirSync(OUT_DIR, { recursive: true });

if (!BASE) {
  console.error("missing VERIFY_BASE_URL");
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function mintSessionCookies() {
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({ type: "magiclink", email: FIXTURE_EMAIL });
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
  const cookies = [];
  const domain = new URL(BASE).hostname;
  const baseCookie = { domain, path: "/", httpOnly: false, secure: true, sameSite: "Lax" };
  if (fullValue.length <= MAX) {
    cookies.push({ ...baseCookie, name: storageKey, value: fullValue });
  } else {
    let i = 0, pos = 0;
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
  if (BYPASS) {
    cookies.push({
      ...baseCookie,
      name: "_vercel_jwt",
      value: "", // not needed; bypass cookie is what we want
    });
    cookies.push({
      ...baseCookie,
      name: "x-vercel-protection-bypass",
      value: BYPASS,
    });
  }
  return cookies;
}

async function main() {
  const results = [];
  const fail = (m) => { results.push(`FAIL ${m}`); console.error("FAIL", m); };
  const pass = (m) => { results.push(`PASS ${m}`); console.log("PASS", m); };

  const cookies = await mintSessionCookies();
  pass("session cookies minted");

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS } : undefined,
  });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();

  try {
    // Bypass via query-param sets the cookie too — belt + suspenders.
    const qp = BYPASS ? `?x-vercel-protection-bypass=${BYPASS}&x-vercel-set-bypass-cookie=true` : "";

    await page.goto(`${BASE}/workspace/financials${qp}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await page.screenshot({ path: join(OUT_DIR, "01-financials-default.png"), fullPage: true });
    pass("financials default tab loaded");

    // Click How You Compare
    const tab = page.getByRole("button", { name: /How You Compare/i }).first();
    await tab.waitFor({ state: "visible", timeout: 15_000 });
    await tab.click();
    await page.waitForTimeout(2500);
    pass("How You Compare tab clicked");

    // Cohort summary card
    const cohortCard = page.getByText(/Compared to .* similar shops|Adjust cohort/i).first();
    await cohortCard.waitFor({ state: "visible", timeout: 15_000 });
    await page.screenshot({ path: join(OUT_DIR, "02-how-you-compare.png"), fullPage: true });
    pass("cohort summary card visible");

    // Count chips
    const chipCount = await page.locator('[role="button"][aria-pressed]').count();
    if (chipCount === 0) fail("0 chips rendered — dashboard empty");
    else pass(`${chipCount} chips rendered`);

    // Drill-down on first clickable chip
    const firstChip = page.locator('[role="button"][aria-pressed="false"]').first();
    if (await firstChip.count()) {
      await firstChip.click();
      await page.waitForTimeout(1200);
      const drilldownViz = await page
        .getByText(/Cohort percentile|Best-practice target|Trend/i)
        .first()
        .isVisible()
        .catch(() => false);
      if (drilldownViz) {
        pass("drill-down opened with viz");
        await page.screenshot({ path: join(OUT_DIR, "03-drilldown.png"), fullPage: true });
      } else {
        fail("drill-down did not open with viz");
      }

      // Ask Benchmark exists
      const askBtn = page.getByRole("button", { name: /Ask Benchmark/i }).first();
      if (await askBtn.count()) pass("Ask Benchmark button present");
      else fail("Ask Benchmark button missing");

      // Apply suggestion → review modal
      const applyBtn = page.getByRole("button", { name: /Apply suggestion/i }).first();
      if (await applyBtn.count()) {
        await applyBtn.click();
        await page.waitForTimeout(1500);
        const modalCount = await page.locator('[role="dialog"]').count();
        if (modalCount > 0) {
          pass("Apply suggestion opened the unified review modal");
          await page.screenshot({ path: join(OUT_DIR, "04-apply-modal.png"), fullPage: true });
        } else fail("Apply did not open the review modal");
      } else fail("Apply suggestion button missing");
    } else {
      fail("no clickable chips found");
    }

    // Sub-nav badge — yellow chip count should be ≥ 0 (badge may or may not appear)
    const yellowBadge = await page.locator('text=/How You Compare/i').first().textContent();
    pass(`sub-nav label is "${yellowBadge}"`);
  } catch (err) {
    fail(`exception: ${err.message}`);
    await page.screenshot({ path: join(OUT_DIR, "fail.png"), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }

  const passes = results.filter((r) => r.startsWith("PASS")).length;
  const fails = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${passes} pass, ${fails} fail`);
  console.log(results.join("\n"));
  if (fails > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
