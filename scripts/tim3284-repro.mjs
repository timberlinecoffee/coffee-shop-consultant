// TIM-3284 — local repro of cookie-banner re-popup + session non-persistence.
// Drives a real Chromium against http://localhost:3284 (next dev) and dumps
// the Application > Cookies state at each step so the root cause is visible
// in the log.

import { chromium, webkit, firefox } from "playwright";
const ENGINE = process.env.ENGINE || "chromium";
const BROWSER_MAP = { chromium, webkit, firefox };
import { writeFileSync, mkdirSync } from "node:fs";

const ORIGIN = process.env.ORIGIN || "http://localhost:3284";
const SHOT_DIR = "tim3284-repro-screenshots";
mkdirSync(SHOT_DIR, { recursive: true });

function relevant(cookies) {
  return cookies
    .filter((c) => /gw_|sb-/i.test(c.name))
    .map((c) => ({
      name: c.name,
      value: c.value.slice(0, 40) + (c.value.length > 40 ? "…" : ""),
      domain: c.domain,
      path: c.path,
      sameSite: c.sameSite,
      secure: c.secure,
      httpOnly: c.httpOnly,
      expires: c.expires,
    }));
}

async function snapshot(label, ctx, page) {
  const cookies = await ctx.cookies();
  const ls = await page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage).map((k) => [k, (localStorage.getItem(k) || "").slice(0, 60)]),
    ),
  );
  const banner = await page
    .locator('[role="dialog"][aria-label="Cookie consent"]')
    .isVisible()
    .catch(() => false);
  console.log(`\n=== ${label} ===`);
  console.log("banner visible:", banner);
  console.log("relevant cookies:", JSON.stringify(relevant(cookies), null, 2));
  console.log("localStorage keys:", Object.keys(ls));
  return { banner, cookies: relevant(cookies), localStorage: ls };
}

(async () => {
  const browser = await BROWSER_MAP[ENGINE].launch();
  console.log(`\nENGINE: ${ENGINE}  ORIGIN: ${ORIGIN}`);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // STEP 1: fresh visit, no consent cookie → banner must be visible.
  await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${SHOT_DIR}/01-fresh-visit.png`, fullPage: false });
  const step1 = await snapshot("Step 1: fresh visit", ctx, page);

  // STEP 2: click Accept All.
  const acceptBtn = page.getByRole("button", { name: /Accept All/i });
  await acceptBtn.click();
  await page.waitForTimeout(500); // let the cookie write + re-render settle
  await page.screenshot({ path: `${SHOT_DIR}/02-after-accept.png`, fullPage: false });
  const step2 = await snapshot("Step 2: after Accept All", ctx, page);

  // STEP 3: reload same tab → banner must STAY hidden.
  await page.reload({ waitUntil: "networkidle" });
  await page.screenshot({ path: `${SHOT_DIR}/03-after-reload.png`, fullPage: false });
  const step3 = await snapshot("Step 3: after reload (same tab)", ctx, page);

  // STEP 4: close browser, open fresh context preserving cookies → banner must STAY hidden.
  // We simulate "closing the browser" by exporting cookies, opening a NEW context,
  // re-adding them, then navigating. (A persistent-context test would also work.)
  const exported = await ctx.cookies();
  await ctx.close();
  const ctx2 = await browser.newContext();
  await ctx2.addCookies(exported);
  const page2 = await ctx2.newPage();
  await page2.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
  await page2.screenshot({ path: `${SHOT_DIR}/04-fresh-context.png`, fullPage: false });
  const step4 = await snapshot("Step 4: fresh context, cookies re-imported", ctx2, page2);

  // STEP 5: simulate "session-cookie-only" (no maxAge) by closing context WITHOUT
  // preserving cookies → banner SHOULD be visible (this is the expected "no cookie" case
  // and confirms our repro is sound, not the bug).
  await ctx2.close();
  const ctx3 = await browser.newContext();
  const page3 = await ctx3.newPage();
  await page3.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
  const step5 = await snapshot("Step 5: fresh context, no cookies (sanity)", ctx3, page3);

  await browser.close();

  const report = { ORIGIN, step1, step2, step3, step4, step5 };
  writeFileSync(`${SHOT_DIR}/report.json`, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${SHOT_DIR}/report.json`);

  // Surface verdict
  const cookieBannerOK =
    step2.banner === false && step3.banner === false && step4.banner === false;
  console.log("\nVERDICT cookie banner:", cookieBannerOK ? "PASS" : "FAIL");
})();
