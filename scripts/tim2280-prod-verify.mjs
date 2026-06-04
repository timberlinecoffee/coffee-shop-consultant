// TIM-2280 prod verification — annual default + toggle + CTA forward
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = "https://coffee-shop-consultant.vercel.app";
const SHOTS = "scripts/shots";
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const fails = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    console.log(`  FAIL  ${name}: ${e.message}`);
    fails.push(name);
  }
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
]) {
  console.log(`\n== ${viewport.name} ==`);
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();

  // --- Landing page ---
  await page.goto(`${BASE}/?cb=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.locator("#pricing").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);

  await check("landing: toggle present", async () => {
    const toggle = page.locator('[role="radiogroup"][aria-label="Billing cadence"]');
    if (!(await toggle.isVisible())) throw new Error("toggle not visible");
  });

  await check("landing: Annual radio aria-checked=true by default", async () => {
    const annual = page.locator('button[role="radio"]', { hasText: /^Annual/ });
    const checked = await annual.getAttribute("aria-checked");
    if (checked !== "true") throw new Error(`aria-checked=${checked}`);
  });

  await check("landing: default cards show annual price ($33 / $83)", async () => {
    const html = await page.locator("#pricing").innerText();
    if (!html.includes("$33")) throw new Error("Starter $33 not visible");
    if (!html.includes("$83")) throw new Error("Pro $83 not visible");
    // Match $39 or $99 only when NOT followed by another digit, so $399 / $999 don't false-positive.
    if (/\$39(?!\d)/.test(html) || /\$99(?!\d)/.test(html))
      throw new Error("monthly price leaked into annual view");
  });

  await check("landing: Save 15% pill present on toggle and cards", async () => {
    const txt = await page.locator("#pricing").innerText();
    const occurrences = (txt.match(/Save 15%/g) || []).length;
    if (occurrences < 1) throw new Error("Save 15% missing");
  });

  await page.screenshot({ path: `${SHOTS}/tim2280-landing-annual-${viewport.name}.png`, fullPage: false });

  // Toggle to monthly
  await page.locator('button[role="radio"]', { hasText: /^Monthly$/ }).click();
  await page.waitForTimeout(500);

  await check("landing: toggle → monthly swaps both cards to $39 / $99", async () => {
    const txt = await page.locator("#pricing").innerText();
    if (!/\$39(?!\d)/.test(txt)) throw new Error("Starter $39 missing");
    if (!/\$99(?!\d)/.test(txt)) throw new Error("Pro $99 missing");
    if (txt.includes("$33") || txt.includes("$83")) throw new Error("annual price leaked into monthly view");
  });

  await page.screenshot({ path: `${SHOTS}/tim2280-landing-monthly-${viewport.name}.png`, fullPage: false });

  // CTA forwarding (monthly state)
  await check("landing: monthly CTA forwards ?interval=monthly to /pricing", async () => {
    const starterCta = page.locator("#pricing a", { hasText: /Start 7-Day Free Trial/ }).first();
    const href = await starterCta.getAttribute("href");
    if (!href || !href.includes("interval=monthly")) throw new Error(`href=${href}`);
  });

  // Switch back to annual and check CTA href
  await page.locator('button[role="radio"]', { hasText: /^Annual/ }).click();
  await page.waitForTimeout(300);
  await check("landing: annual CTA forwards ?interval=annual to /pricing", async () => {
    const starterCta = page.locator("#pricing a", { hasText: /Start 7-Day Free Trial/ }).first();
    const href = await starterCta.getAttribute("href");
    if (!href || !href.includes("interval=annual")) throw new Error(`href=${href}`);
  });

  // --- /pricing page (default landing — no query param) ---
  await page.goto(`${BASE}/pricing?cb=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  await check("/pricing: Annual button has teal background by default", async () => {
    const annualBtn = page.locator('button', { hasText: /^Annual/ });
    const cls = (await annualBtn.first().getAttribute("class")) || "";
    if (!cls.includes("bg-[var(--teal)]")) throw new Error(`class=${cls}`);
  });

  await check("/pricing: cards default to annual ($33 + $83 + $399 + $999)", async () => {
    const txt = await page.locator("body").innerText();
    if (!txt.includes("$33")) throw new Error("Starter $33 missing");
    if (!txt.includes("$83")) throw new Error("Pro $83 missing");
    if (!txt.includes("$399/year")) throw new Error("$399/year missing");
    if (!txt.includes("$999/year")) throw new Error("$999/year missing");
  });

  await page.screenshot({ path: `${SHOTS}/tim2280-pricing-default-${viewport.name}.png`, fullPage: false });

  // /pricing?interval=monthly handoff
  await page.goto(`${BASE}/pricing?interval=monthly&cb=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  await check("/pricing?interval=monthly: cards show monthly ($39 + $99)", async () => {
    const txt = await page.locator("body").innerText();
    if (!/\$39(?!\d)/.test(txt)) throw new Error("Starter $39 missing");
    if (!/\$99(?!\d)/.test(txt)) throw new Error("Pro $99 missing");
  });

  await page.screenshot({ path: `${SHOTS}/tim2280-pricing-monthly-handoff-${viewport.name}.png`, fullPage: false });

  await ctx.close();
}

await browser.close();
console.log(`\n${fails.length === 0 ? "ALL PASS" : `FAIL: ${fails.join(", ")}`}`);
process.exit(fails.length === 0 ? 0 : 1);
