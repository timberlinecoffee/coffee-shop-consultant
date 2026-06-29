// TIM-3414: Capture mobile evidence shots for the popover/modal edge-clamp fix.
// Loads the prod CSS bundle into a static demo and snapshots at 375 / 360 / 414 px.

import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const demoUrl = "file://" + resolve(__dirname, "demo.html");
const viewports = [
  { name: "375", width: 375, height: 1400 },
  { name: "360", width: 360, height: 1400 },
  { name: "414", width: 414, height: 1400 },
];

const executablePath = process.env.PLAYWRIGHT_CHROMIUM ||
  "/home/briefli/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";

const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox"],
});

for (const vp of viewports) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(demoUrl, { waitUntil: "load" });
  await page.waitForTimeout(800);
  const out = resolve(__dirname, `tim3414-${vp.name}px.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);
  await ctx.close();
}

await browser.close();
