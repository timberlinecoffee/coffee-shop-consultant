// TIM-2459 / QA-2457 per-persona walkthrough.
//
// Usage:  node --experimental-strip-types scripts/tim2459/walkthrough.mjs <slug>
// Output: verify-tim2459/<slug>/*.png plus <slug>.summary.json
//
// What it captures per persona:
//   - 02-pricing-page-currency.png        (currency on /pricing)
//   - 03-financials-pnl-currency.png      (P&L currency labels)
//   - 04-financials-startup-costs.png     (startup costs first-open state)
//   - 05-menu-target-gm-default.png       (menu pricing target margin default)
//   - 06-buildout-currency.png            (buildout & equipment currency)
//   - 07-hiring-country-requirements.png  (hiring workspace country-specific)
//   - 08-business-plan-currency.png       (BP currency)
//   - 09-location-lease.png
//   - 10-marketing.png
//   - 11-operations-playbook.png
//   - 12-cross-suite-resolver.png         (consistency engine result)
//   - 13-dashboard.png                    (dashboard for visual ref)
//
// Mobile personas (5, 6) get a 375x812 viewport. All other personas desktop 1440x900.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BASE,
  REPO_ROOT,
  provisionPersona,
  cleanupPersona,
  mintCookies,
  gotoPath,
  dismissConsent,
} from "./shared.mjs";
import { personaBySlug } from "./personas.mjs";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node walkthrough.mjs <persona-slug>");
  process.exit(2);
}
const persona = personaBySlug(slug);

const SHOT_DIR = join(REPO_ROOT, "verify-tim2459", slug);
mkdirSync(SHOT_DIR, { recursive: true });

const observations = [];
function note(name, detail = "") {
  observations.push({ name, detail });
  console.log(`[obs] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function shot(page, name) {
  const path = join(SHOT_DIR, name);
  await page.screenshot({ path, fullPage: true }).catch((e) => {
    console.warn(`[shot] ${name} failed: ${e.message}`);
  });
  return path;
}

async function captureCurrencyText(page, label) {
  const body = await page.locator("body").innerText().catch(() => "");
  // Look for any currency-like substring in first 4000 chars
  const snippet = body.slice(0, 4000);
  // Grab everything that looks like a currency symbol + digits
  const matches = snippet.match(/[A-Z]{0,3}[$€£¥₹₱₩₪R]\s?[\d,]+(?:\.\d+)?[KMB]?/g) || [];
  const unique = [...new Set(matches.slice(0, 20))];
  note(`currency-snippets:${label}`, unique.join(" | "));
  return unique;
}

async function main() {
  console.log(`[start] persona=${persona.slug} country=${persona.countryCode} currency=${persona.currencyCode} mobile=${persona.mobile}`);
  let userId;
  const browser = await chromium.launch({ headless: true });
  try {
    const prov = await provisionPersona(persona, { onboarded: true });
    userId = prov.userId;
    note("provisioned", `userId=${userId} email=${prov.email}`);

    const { cookies } = await mintCookies(prov.email);
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: false,
      viewport: persona.viewport,
      isMobile: persona.mobile,
      hasTouch: persona.mobile,
    });
    await ctx.addCookies(cookies);
    ctx.setDefaultTimeout(45_000);

    const page = await ctx.newPage();

    // Dashboard first — visual reference + sanity
    await gotoPath(page, "/dashboard");
    await dismissConsent(page);
    await shot(page, "13-dashboard.png");

    // Pricing page (currency check from persona's geography)
    await gotoPath(page, "/pricing");
    await dismissConsent(page);
    await shot(page, "02-pricing-page-currency.png");
    await captureCurrencyText(page, "pricing");

    // Concept workspace (header sanity)
    await gotoPath(page, "/workspace/concept");
    await dismissConsent(page);
    await shot(page, "01-concept.png");

    // Financials — full page (P&L + tabs)
    await gotoPath(page, "/workspace/financials");
    await dismissConsent(page);
    await page.waitForTimeout(1500);
    await shot(page, "03-financials-pnl-currency.png");
    await captureCurrencyText(page, "financials");

    // Try to click into Startup Costs tab
    const startupTab = page
      .getByRole("tab", { name: /Startup Costs|Start.?up/i })
      .first();
    if (await startupTab.isVisible().catch(() => false)) {
      await startupTab.click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(1200);
    } else {
      // Fallback — locate by link/button
      const startupBtn = page.getByText(/Startup Costs/i).first();
      if (await startupBtn.isVisible().catch(() => false)) {
        await startupBtn.click({ timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(1200);
      }
    }
    await shot(page, "04-financials-startup-costs.png");

    // Menu Pricing — target margin default
    await gotoPath(page, "/workspace/menu-pricing");
    await dismissConsent(page);
    await page.waitForTimeout(1200);
    await shot(page, "05-menu-target-gm-default.png");
    // Try to find a "target gross margin" field default
    const gmInput = page
      .locator('input[name*="target" i], input[aria-label*="target gross margin" i], input[placeholder*="target" i]')
      .first();
    if (await gmInput.isVisible().catch(() => false)) {
      const v = await gmInput.inputValue().catch(() => "");
      note("menu.targetGrossMargin.default", v);
    }

    // Buildout & Equipment — currency
    await gotoPath(page, "/workspace/buildout-equipment");
    await dismissConsent(page);
    await page.waitForTimeout(1500);
    await shot(page, "06-buildout-currency.png");
    await captureCurrencyText(page, "buildout");

    // Hiring — country requirements
    await gotoPath(page, "/workspace/hiring");
    await dismissConsent(page);
    await page.waitForTimeout(1500);
    await shot(page, "07-hiring-country-requirements.png");
    const hiringBody = await page.locator("body").innerText().catch(() => "");
    const countryHint = hiringBody.match(/(United States|Canada|Australia|United Kingdom|Mexico|US|CA|AU|GB|MX)\b/);
    note("hiring.countryDisplay", countryHint ? countryHint[0] : "(none detected)");

    // Business Plan
    await gotoPath(page, "/workspace/business-plan");
    await dismissConsent(page);
    await page.waitForTimeout(1500);
    await shot(page, "08-business-plan-currency.png");
    await captureCurrencyText(page, "business-plan");

    // Location & Lease
    await gotoPath(page, "/workspace/location-lease");
    await dismissConsent(page);
    await page.waitForTimeout(1200);
    await shot(page, "09-location-lease.png");

    // Marketing
    await gotoPath(page, "/workspace/marketing");
    await dismissConsent(page);
    await page.waitForTimeout(1000);
    await shot(page, "10-marketing.png");

    // Operations Playbook
    await gotoPath(page, "/workspace/operations-playbook");
    await dismissConsent(page);
    await page.waitForTimeout(1000);
    await shot(page, "11-operations-playbook.png");

    // Cross-suite consistency engine — GET enumerates conflicts (POST is for
    // applying confirmed changes per /api/copilot/cross-suite-resolver/route.ts).
    const resp = await page
      .request
      .get(`${BASE}/api/copilot/cross-suite-resolver`)
      .catch(() => null);
    if (resp) {
      const status = resp.status();
      const text = await resp.text().catch(() => "");
      note(`cross-suite-resolver.status`, String(status));
      writeFileSync(join(SHOT_DIR, "12-cross-suite-resolver-response.json"), text.slice(0, 8000));
    }

    // Optionally render the consistency engine UI on the financials page
    await gotoPath(page, "/workspace/financials");
    await page.waitForTimeout(1500);
    await shot(page, "12-cross-suite-resolver.png");
  } finally {
    await browser.close();
    if (userId) await cleanupPersona(userId);
  }

  const summary = {
    persona: persona.slug,
    label: persona.label,
    countryCode: persona.countryCode,
    currencyCode: persona.currencyCode,
    hiringCountry: persona.hiringCountry,
    viewport: persona.viewport,
    mobile: persona.mobile,
    observations,
    runAt: new Date().toISOString(),
  };
  writeFileSync(
    join(SHOT_DIR, `${persona.slug}.summary.json`),
    JSON.stringify(summary, null, 2),
  );
  console.log(`[done] persona=${persona.slug} observations=${observations.length}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("[fatal]", e);
    process.exit(1);
  },
);
