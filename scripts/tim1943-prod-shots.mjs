// TIM-1943 prod verification: shoot live pricing section at three breakpoints.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://coffee-shop-consultant.vercel.app";
const browser = await chromium.launch();
const VIEWPORTS = [
  ["mobile", 390, 1100],
  ["tablet", 820, 1100],
  ["desktop", 1440, 1100],
];

fs.mkdirSync("scripts/shots", { recursive: true });

for (const [label, w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies([{ name: "gw_consent", value: "all", url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#pricing`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(800);
  const section = page.locator('section#pricing');
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const file = `scripts/shots/tim1943-prod-${label}-${w}.png`;
  await section.screenshot({ path: file });
  console.log("WROTE", file);
  await ctx.close();
}

await browser.close();
console.log("DONE");
