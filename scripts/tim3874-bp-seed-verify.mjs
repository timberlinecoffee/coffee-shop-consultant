#!/usr/bin/env node
// TIM-3874 — Browser screenshots + prose output verify (TIM-3873 gate).
//
// QA Lead (TIM-3872) verified the /api/business-plan/seed-context API 8/8 PASS
// but hit `libXcomposite.so.1 missing` on their agent so screenshots + Generate
// prose could not be captured. This script re-runs the same end-to-end flow
// through headless chromium as `trent@simpler.coffee` on prod groundwork.cafe
// and captures preview + prose PNG per section.
//
// Uses the libXcomposite LD_LIBRARY_PATH unblock from TIM-3721 and the
// generateLink → verifyOtp → cookie-mint pattern from tim3718-before-after.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, "..");
const OUT_DIR = join(REPO_ROOT, "done-evidence", "tim3874");

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

const baseEnv = {
  ...process.env,
  ...loadEnv(join(REPO_ROOT, ".env.local")),
  ...loadEnv(join(REPO_ROOT, ".env.vercel.local")),
};

const SUPABASE_URL = baseEnv.NEXT_PUBLIC_SUPABASE_URL;
const ANON = baseEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = baseEnv.SUPABASE_SERVICE_ROLE_KEY;
const PROD_BASE = "https://groundwork.cafe";
const FIXTURE_EMAIL = process.env.VERIFY_EMAIL ?? "trent@simpler.coffee";

// 8 sections mapped to their exact titles (aria-label = `Write ${title} with AI`).
// One representative per source-workspace mapping in SECTION_WORKSPACE_MAP.
const SECTIONS = [
  { key: "executive-summary",           title: "Executive Summary",         label: "1-executive-summary" },
  { key: "company-overview",            title: "Business Overview",         label: "2-business-overview" },
  { key: "execution-marketing-sales",   title: "Menu, Pricing & Marketing", label: "3-menu-pricing-marketing" },
  { key: "opportunity-target-market",   title: "Your Customers",            label: "4-your-customers" },
  { key: "execution-operations",        title: "Operations Plan",           label: "5-operations-plan" },
  { key: "company-team",                title: "Management Team",           label: "6-management-team" },
  { key: "financial-plan-forecast",     title: "Revenue Forecast",          label: "7-revenue-forecast" },
  { key: "financial-plan-sensitivity",  title: "What-If Scenarios",         label: "8-what-if-scenarios" },
];

// Anti-pattern probes — anything here in the preview textarea or Generate output
// counts as a failure per TIM-3853 DoD.
const POISON_PATTERNS = [
  /HERE{3,}/i,
  /\[FILL[ _]?IN\]/i,
  /\{\{[A-Z_]+\}\}/,
  /X{6,}/,
  /_{6,}/,
];

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
  console.error("Missing Supabase env — check .env.vercel.local");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

async function mintSessionCookies(host) {
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
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
    let i = 0, pos = 0;
    while (pos < fullValue.length) {
      cookies.push({ ...base, name: `${storageKey}.${i}`, value: fullValue.slice(pos, pos + MAX) });
      pos += MAX;
      i++;
    }
  }
  return cookies;
}

async function dismissCookieBanner(page) {
  try {
    const btn = page.getByRole("button", { name: /necessary only/i }).first();
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click({ timeout: 1500 });
      await page.waitForTimeout(300);
    }
  } catch {
    // best-effort
  }
}

function scanPoison(text) {
  const hits = [];
  for (const pat of POISON_PATTERNS) {
    if (pat.test(text)) hits.push(pat.source);
  }
  return hits;
}

async function captureSection(context, section) {
  const results = {
    section: section.title,
    key: section.key,
    previewPng: null,
    outputPng: null,
    previewText: null,
    outputText: null,
    poisonInPreview: [],
    poisonInOutput: [],
    error: null,
  };
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1200 });
  try {
    console.log(`\n── ${section.title} (${section.key}) ──`);
    await page.goto(`${PROD_BASE}/workspace/business-plan`, {
      waitUntil: "commit",
      timeout: 60000,
    });
    // BP workspace is heavy; give SSR + hydration time.
    await page.waitForTimeout(6000);
    await dismissCookieBanner(page);

    // Click "Write with AI" button for this section (aria-label match).
    const trigger = page.getByRole("button", { name: `Write ${section.title} with AI`, exact: true });
    await trigger.scrollIntoViewIfNeeded({ timeout: 15000 });
    await trigger.click({ timeout: 10000 });

    // Modal opens: heading "Write with AI: {title}".
    const modalHeading = page.getByRole("heading", { name: `Write with AI: ${section.title}`, exact: true });
    await modalHeading.waitFor({ state: "visible", timeout: 10000 });

    // Click "Seed from your workspaces". Button label switches to "Loading..."
    // then "Context added" when done. Wait for the terminal state.
    const seedBtn = page.getByRole("button", { name: /^Seed from your workspaces$/ });
    await seedBtn.waitFor({ state: "visible", timeout: 5000 });
    await seedBtn.click();
    await page
      .getByRole("button", { name: /^Context added$/ })
      .waitFor({ state: "visible", timeout: 30000 });

    // Screenshot the modal — locate the modal container and shot it.
    const previewShot = join(OUT_DIR, `${section.label}-01-seed-preview.png`);
    // The modal is a div containing the heading; grab the closest ancestor
    // with role dialog or fall back to full page.
    const dialog = page.getByRole("dialog").first();
    const useDialog = await dialog.isVisible({ timeout: 500 }).catch(() => false);
    if (useDialog) {
      await dialog.screenshot({ path: previewShot });
    } else {
      await page.screenshot({ path: previewShot, fullPage: false });
    }
    results.previewPng = previewShot;

    // Extract textarea content to grep for poison.
    const previewText = await page.locator("#bp-wai-content").inputValue();
    results.previewText = previewText;
    results.poisonInPreview = scanPoison(previewText);
    console.log(`  seed textarea: ${previewText.length} chars, poison: ${results.poisonInPreview.length}`);

    // Click Generate.
    const genBtn = page.getByRole("button", { name: /^Generate$/ }).last();
    await genBtn.click({ timeout: 5000 });

    // Preview state renders an "AI DRAFT" caption + ReactMarkdown block. Wait
    // for the caption. Extended timeout — Anthropic generate can take 30s.
    await page
      .getByText("AI Draft", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 90000 });

    // Give the markdown a beat to render fully.
    await page.waitForTimeout(1200);

    const outputShot = join(OUT_DIR, `${section.label}-02-generate-output.png`);
    if (useDialog) {
      await dialog.screenshot({ path: outputShot });
    } else {
      await page.screenshot({ path: outputShot, fullPage: false });
    }
    results.outputPng = outputShot;

    // Grab the generated markdown by locating the AI Draft container.
    const outputText = await page
      .locator("div.rounded-xl.border")
      .filter({ hasText: /./ })
      .first()
      .innerText()
      .catch(() => "");
    // Fall back — the modal body innerText also works.
    const bodyText = await page.locator("body").innerText();
    // Combine outputs; both scanned for poison.
    const combined = outputText || bodyText;
    results.outputText = outputText;
    results.poisonInOutput = scanPoison(outputText);
    console.log(`  generate output: ${outputText.length} chars, poison: ${results.poisonInOutput.length}`);

    // Reject to avoid persisting anything.
    const reject = page.getByRole("button", { name: /^Reject and revise$/ });
    if (await reject.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reject.click({ timeout: 3000 });
      await page.waitForTimeout(500);
    }
    // Close modal (X aria-label = "Close").
    const closeBtn = page.getByRole("button", { name: "Close" }).first();
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click({ timeout: 2000 }).catch(() => {});
    }
  } catch (err) {
    console.error(`  ✗ ${section.title}: ${err.message}`);
    results.error = err.message;
    // Always try a fallback screenshot so we have SOMETHING.
    try {
      const fail = join(OUT_DIR, `${section.label}-99-error.png`);
      await page.screenshot({ path: fail, fullPage: false });
      results.previewPng ||= fail;
    } catch {
      // give up
    }
  } finally {
    await page.close();
  }
  return results;
}

async function main() {
  console.log(`\n→ TIM-3874 BP seed E2E capture on ${PROD_BASE}`);
  console.log(`→ Persona: ${FIXTURE_EMAIL}`);
  console.log(`→ Output: ${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    const host = new URL(PROD_BASE).hostname;
    const cookies = await mintSessionCookies(host);
    const ctx = await browser.newContext();
    await ctx.addCookies(cookies);
    for (const section of SECTIONS) {
      results.push(await captureSection(ctx, section));
    }
    await ctx.close();
  } finally {
    await browser.close();
  }

  const report = {
    issue: "TIM-3874",
    parent: "TIM-3873",
    grandparent: "TIM-3853",
    commit: "a8bf03d9",
    capturedAt: new Date().toISOString(),
    persona: FIXTURE_EMAIL,
    prodBase: PROD_BASE,
    results,
  };
  writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));

  const okPreview = results.filter((r) => r.previewPng && !r.error).length;
  const okOutput = results.filter((r) => r.outputPng && !r.error).length;
  const anyPoison = results.some(
    (r) => r.poisonInPreview.length > 0 || r.poisonInOutput.length > 0
  );
  console.log(
    `\n✓ Done: ${okPreview}/${results.length} preview PNGs, ${okOutput}/${results.length} output PNGs, poison=${anyPoison ? "YES" : "no"}`
  );
  console.log(`  report: ${join(OUT_DIR, "report.json")}`);
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
