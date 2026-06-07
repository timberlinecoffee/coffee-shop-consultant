// TIM-2459 / QA-2457 M-01: capture Step 10 (Shop Type) of cold onboarding.
//
// The STEPS array in src/app/onboarding/onboarding-flow.tsx hard-codes the
// shop_type options globally with no geography branch — one screenshot covers
// all 6 personas for the M-01 finding (and is the smoking gun for M-04 /
// persona 4's missing "co-working" option).
//
// Strategy: provision a fresh user with onboarding_completed=false, mint a
// session, visit /onboarding, fill enough answers to advance through Steps
// 1..9, then screenshot Step 10 (shop_type multiselect).

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
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

const SHOT_DIR = join(REPO_ROOT, "verify-tim2459", "step10-shop-type");
mkdirSync(SHOT_DIR, { recursive: true });

// Use persona 1 just as a base for the cold account.
const persona = {
  slug: "step10-cold",
  email: "qa-step10@groundwork-test.com",
  countryCode: "US",
  currencyCode: "USD",
  hiringCountry: "US",
  shopName: "QA Step 10 Probe",
};

async function clickNext(page) {
  const btn = page.getByRole("button", { name: /^Next$|^Continue$/i }).first();
  await btn.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  if (await btn.isEnabled().catch(() => false)) {
    await btn.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(500);
    return true;
  }
  return false;
}

async function fillTextStep(page, value) {
  const input = page.locator('input[type="text"], textarea').first();
  if (await input.isVisible().catch(() => false)) {
    await input.fill(value).catch(() => {});
  }
}

async function pickFirstCard(page) {
  const card = page.locator('button[role="radio"], button[data-card], button[aria-pressed]').first();
  if (await card.isVisible().catch(() => false)) {
    await card.click().catch(() => {});
    await page.waitForTimeout(200);
  } else {
    // Fallback: any clickable card-like element
    const fallback = page.locator('div[role="button"], button:has-text("Just")').first();
    await fallback.click().catch(() => {});
  }
}

async function main() {
  let userId;
  const browser = await chromium.launch({ headless: true });
  try {
    const prov = await provisionPersona(persona, { onboarded: false });
    userId = prov.userId;
    const { cookies } = await mintCookies(prov.email);

    const ctx = await browser.newContext({ ignoreHTTPSErrors: false });
    await ctx.addCookies(cookies);
    ctx.setDefaultTimeout(30_000);

    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    await gotoPath(page, "/onboarding");
    await dismissConsent(page);
    await page.waitForTimeout(800);

    // Step 0: welcome — click "Get started" / first CTA
    const welcomeBtn = page.getByRole("button", { name: /Get started|Begin|Continue|Next/i }).first();
    await welcomeBtn.click().catch(() => {});
    await page.waitForTimeout(500);

    // We need to navigate STEPS in order:
    //   0 welcome | 1 shop_name | 2 motivation | 3 shop_vision | 4 target_customer
    //   5 differentiation | 6 brand_pillars | 7 stage | 8 location | 9 shop_type | 10 review
    // Step 10 per task spec = shop_type (1-indexed step 10 in the wizard).
    //
    // Drive steps generically: fill text fields if present, pick first radio
    // option if present, click Next. Stop when "What kind of shop" appears.

    for (let i = 0; i < 14; i++) {
      const stepCopy = await page.locator("body").innerText().catch(() => "");

      // Detect the target step. The shop_type multiselect copy is
      // "What kind of shop are you imagining?" (STEPS[9].question) — the
      // guided shop_vision step uses "...building?" instead, so we must
      // match the literal option labels to disambiguate.
      if (/imagining/i.test(stepCopy) && /Mobile cart or pop-up/i.test(stepCopy)) {
        console.log(`[step10] reached at iteration ${i}`);
        break;
      }

      // Fill all visible textareas + text inputs with a generic answer.
      const inputs = await page.locator('input[type="text"], textarea').all();
      for (const inp of inputs) {
        if (await inp.isVisible().catch(() => false)) {
          const val = await inp.inputValue().catch(() => "");
          if (!val) await inp.fill("Test value for QA-2457").catch(() => {});
        }
      }

      // Pick first radio / card option (motivation, stage)
      const radios = await page.locator('[role="radio"]:not([aria-checked="true"]), button[data-card]:not([aria-pressed="true"])').all();
      if (radios.length) {
        await radios[0].click({ timeout: 2000 }).catch(() => {});
      }

      // Pick at least one multiselect option (brand_pillars)
      const multi = await page.locator('button[aria-pressed="false"]').first();
      if (await multi.isVisible().catch(() => false)) {
        await multi.click({ timeout: 2000 }).catch(() => {});
      }

      // City autocomplete: type Seattle, wait, pick first suggestion if it appears
      const cityInput = page.locator('input[placeholder*="city" i], input[aria-label*="city" i]').first();
      if (await cityInput.isVisible().catch(() => false)) {
        const val = await cityInput.inputValue().catch(() => "");
        if (!val) {
          await cityInput.fill("Seattle").catch(() => {});
          await page.waitForTimeout(1500);
          const suggest = page.locator('[role="option"], li[role="option"]').first();
          if (await suggest.isVisible().catch(() => false)) {
            await suggest.click().catch(() => {});
          } else {
            // Last-ditch — press Enter to accept typed value
            await cityInput.press("Enter").catch(() => {});
          }
        }
      }

      // Click Next
      const advanced = await clickNext(page);
      if (!advanced) {
        console.log(`[step] iter ${i}: Next disabled — capturing for debug`);
        await page.screenshot({ path: join(SHOT_DIR, `debug-step-${i}.png`), fullPage: true });
        // try clicking any visible CTA
        const anyBtn = page.locator("button:visible").nth(1);
        await anyBtn.click({ timeout: 2000 }).catch(() => {});
      }
      await page.waitForTimeout(400);
    }

    // Final capture: STEP 10 SHOP_TYPE
    await page.waitForTimeout(800);
    await page.screenshot({
      path: join(SHOT_DIR, "M-01-step10-shop-type-options.png"),
      fullPage: true,
    });

    // Inner crop of the question + options grid
    const main = page.locator("main, [role=main], form").first();
    if (await main.isVisible().catch(() => false)) {
      await main
        .screenshot({ path: join(SHOT_DIR, "M-01-step10-shop-type-band.png") })
        .catch(() => {});
    }

    // Capture all visible option labels for the comment summary
    const options = await page.locator('button[aria-pressed], button[role="checkbox"], [role="checkbox"]')
      .allInnerTexts()
      .catch(() => []);
    console.log(`[step10] visible toggle-buttons: ${JSON.stringify(options)}`);
  } finally {
    await browser.close();
    if (userId) await cleanupPersona(userId);
  }
}

main().then(
  () => {
    console.log("[done] step10 capture complete");
    process.exit(0);
  },
  (e) => {
    console.error("[fatal]", e);
    process.exit(1);
  },
);
