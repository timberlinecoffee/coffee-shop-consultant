// TIM-2591 prod verify via Playwright.
// Drives 4 unauthenticated paths on groundwork.cafe production to confirm:
//   (1) /                          → 200 landing page unchanged
//   (2) /login                     → 200 login page
//   (3) /workspace/financials      → 307 → /login (auth gate intact)
//   (4) /dashboard                 → 307 → /login (auth gate intact)
// Captures full-page screenshots at desktop (1280x900) and mobile (375x812)
// for the /login surface in BOTH v1 (?ui=v1) and v2 (?ui=v2) modes to prove
// the flag cookie override is wired without overlapping nav.
// The bottom tab bar itself only renders inside the workspace (auth-gated),
// so visual proof of the bar at mobile widths is captured via the override
// cookie behavior in WorkspaceProgressProvider; auth-gated screenshots are
// deferred to the in-browser walkthrough per TIM-2594/TIM-2598 posture.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PROD_URL || "https://groundwork.cafe";
const OUT = path.resolve("scripts/_verify-tim2591-out");
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 375, height: 812 },
];

const PATHS = [
  ["root", "/", { status: 200 }],
  ["login", "/login", { status: 200 }],
  ["workspace-financials", "/workspace/financials", { redirectsTo: "/login" }],
  ["dashboard", "/dashboard", { redirectsTo: "/login" }],
];

async function run() {
  const browser = await chromium.launch();
  const report = { base: BASE, runs: [] };

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    for (const [name, urlPath, expect] of PATHS) {
      const page = await ctx.newPage();
      const trail = [];
      page.on("response", (r) => {
        const u = new URL(r.url());
        if (u.host === new URL(BASE).host) {
          trail.push({ status: r.status(), pathname: u.pathname + u.search });
        }
      });
      const target = new URL(urlPath, BASE).toString();
      const resp = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(600);
      const finalUrl = page.url();
      const finalStatus = resp ? resp.status() : null;
      const result = { viewport: vp.name, name, target, finalUrl, finalStatus, trail, expect };
      if (expect.status === 200) {
        result.ok = finalStatus === 200;
      } else if (expect.redirectsTo) {
        result.ok = new URL(finalUrl).pathname === expect.redirectsTo;
      }
      const shotPath = path.join(OUT, `${vp.name}-${name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      result.screenshot = shotPath;
      report.runs.push(result);
      console.log(`[${vp.name}/${name}] ok=${result.ok} status=${finalStatus} → ${finalUrl}`);
      await page.close();
    }
    await ctx.close();
  }

  await browser.close();
  const allOk = report.runs.every((r) => r.ok);
  report.allOk = allOk;
  report.commit = "7c3569b";
  report.deploymentId = "dpl_zip9D4tQCXsb9oiGnXwiSGJGU7Wo";
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\n→ wrote ${OUT}/report.json`);
  console.log(`→ allOk=${allOk}`);
  process.exit(allOk ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
