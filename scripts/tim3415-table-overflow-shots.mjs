#!/usr/bin/env node
// TIM-3415 — proof shots: edge-fade affordance on DocsTable + Privacy dl-on-mobile.
// Unauthenticated pages only: /privacy, /help.
// Usage:
//   PREVIEW_URL=https://<preview>.vercel.app node scripts/tim3415-table-overflow-shots.mjs
// Outputs:
//   scripts/screenshots/tim3415/privacy-375.png    (mobile <dl>)
//   scripts/screenshots/tim3415/privacy-700.png    (desktop <table>)
//   scripts/screenshots/tim3415/help-375.png       (mobile edge-fade)
// Also writes scripts/screenshots/tim3415/scroll-check.json: per-page doc-level hscroll boolean.
import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

process.env.LD_LIBRARY_PATH =
  "/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "screenshots", "tim3415");
fs.mkdirSync(OUT, { recursive: true });

const BASE = process.env.PREVIEW_URL || "https://groundwork.cafe";
const SHARE_TOKEN = process.env.VERCEL_SHARE_TOKEN || "";

const SHOTS = [
  { name: "privacy-375", url: "/privacy", width: 375, height: 1200, anchor: "section:has(h2:has-text(\"Legal Basis\"))" },
  { name: "privacy-700", url: "/privacy", width: 700, height: 1200, anchor: "section:has(h2:has-text(\"Legal Basis\"))" },
  { name: "help-375", url: "/help", width: 375, height: 900, anchor: "table" },
];

const CHROMIUM_BIN =
  process.env.PLAYWRIGHT_CHROMIUM_BIN ||
  "/home/briefli/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";

async function run() {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_BIN,
    headless: true,
    args: ["--no-sandbox"],
  });
  const results = {};
  for (const shot of SHOTS) {
    const ctx = await browser.newContext({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 2,
      isMobile: shot.width <= 414,
      hasTouch: shot.width <= 414,
      userAgent:
        shot.width <= 414
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
          : undefined,
    });
    const page = await ctx.newPage();
    if (SHARE_TOKEN) {
      const shareUrl = `${BASE}/?_vercel_share=${SHARE_TOKEN}`;
      await page.goto(shareUrl, { waitUntil: "load", timeout: 60000 });
      await page.waitForTimeout(500);
    }
    const url = BASE + shot.url;
    console.log(`→ ${shot.name}: ${url} @ ${shot.width}x${shot.height}`);
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(800);
    if (shot.anchor) {
      const loc = page.locator(shot.anchor).first();
      try {
        await loc.scrollIntoViewIfNeeded({ timeout: 5000 });
      } catch {
        // anchor may not exist on every variant; ignore
      }
      await page.waitForTimeout(400);
    }
    const hscroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      hasDocHscroll:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    }));
    results[shot.name] = { url, viewport: { w: shot.width, h: shot.height }, ...hscroll };
    const outPath = path.join(OUT, `${shot.name}.png`);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(
      `   ${shot.name}: scrollWidth=${hscroll.scrollWidth} clientWidth=${hscroll.clientWidth} doc-hscroll=${hscroll.hasDocHscroll}`,
    );
    await ctx.close();
  }
  await browser.close();
  const summary = path.join(OUT, "scroll-check.json");
  fs.writeFileSync(summary, JSON.stringify(results, null, 2));
  console.log(`\n✓ Wrote ${summary}`);
  const anyFail = Object.values(results).some((r) => r.hasDocHscroll);
  if (anyFail) {
    console.error("✗ Document-level horizontal scroll detected on at least one shot");
    process.exit(2);
  }
  console.log("✓ All shots: no document-level horizontal scroll");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
