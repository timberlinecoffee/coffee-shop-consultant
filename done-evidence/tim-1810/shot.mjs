import { chromium } from "playwright-core";

const tag = process.argv[2] || "after";
const base = "http://localhost:3002";
const dir = "done-evidence/tim-1810";

const exe = process.env.PW_CHROMIUM;
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// Landing header — transparent (top of page)
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: `${dir}/header-${tag}.png`, clip: { x: 0, y: 0, width: 1280, height: 80 } });

// Login page (logo above the card)
await page.goto(base + "/login", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: `${dir}/login-${tag}.png`, clip: { x: 0, y: 0, width: 1280, height: 360 } });

await browser.close();
console.log("done " + tag);
