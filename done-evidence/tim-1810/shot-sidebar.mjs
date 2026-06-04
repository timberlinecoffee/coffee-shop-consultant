import { chromium } from "playwright-core";

const tag = process.argv[2] || "after";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 560 } });

// expanded
await page.goto("http://localhost:3002/zz-logo-preview", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.screenshot({ path: `done-evidence/tim-1810/sidebar-expanded-${tag}.png`, clip: { x: 0, y: 0, width: 224, height: 110 } });

// collapsed
await page.goto("http://localhost:3002/zz-logo-preview?c=1", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.screenshot({ path: `done-evidence/tim-1810/sidebar-collapsed-${tag}.png`, clip: { x: 0, y: 0, width: 64, height: 110 } });

await browser.close();
console.log("sidebar " + tag);
