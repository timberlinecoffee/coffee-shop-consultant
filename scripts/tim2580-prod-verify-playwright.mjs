// TIM-2580 / TIM-2582 prod verify via Playwright. Drives 3 unauthenticated
// paths on groundwork.cafe production:
//   (1) /copilot-demo → 404 page (not /login redirect)
//   (2) /plan/1       → 200, Module 1 "Concept & Positioning" renders
//   (3) /plan/2       → 307 to /login (modules 2+ still gated)
// Captures full-page screenshots for the TIM-2580 closing comment.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PROD_URL || "https://groundwork.cafe";
const OUT = path.resolve("scripts/_verify-tim2580-out");
mkdirSync(OUT, { recursive: true });

async function run() {
  const browser = await chromium.launch();
  // No storageState — fresh anonymous context every run.
  const ctx = await browser.newContext();
  const report = { base: BASE, paths: [] };

  for (const [name, urlPath, expect] of [
    ["copilot-demo", "/copilot-demo", { status: 404 }],
    ["plan-1",       "/plan/1",       { status: 200, contains: ["Concept", "Shop Model"] }],
    ["plan-2",       "/plan/2",       { redirectsTo: "/login" }],
  ]) {
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
    // small settle for client hydration before screenshot
    await page.waitForTimeout(800);

    const finalUrl = page.url();
    const finalStatus = resp ? resp.status() : null;
    const body = await page.content();

    const result = {
      name,
      target,
      finalUrl,
      finalStatus,
      trail,
      expect,
    };

    if (expect.status === 404) {
      result.ok = finalStatus === 404;
    } else if (expect.redirectsTo) {
      result.ok = new URL(finalUrl).pathname === expect.redirectsTo;
    } else if (expect.status === 200) {
      const allContain = (expect.contains || []).every((s) => body.includes(s));
      result.ok = finalStatus === 200 && allContain;
      result.containsResult = (expect.contains || []).map((s) => ({ s, present: body.includes(s) }));
    }

    const shotPath = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
    result.screenshot = shotPath;
    report.paths.push(result);
    console.log(`[${name}] ok=${result.ok} status=${finalStatus} finalUrl=${finalUrl}`);
    await page.close();
  }

  await browser.close();

  const allOk = report.paths.every((p) => p.ok);
  report.allOk = allOk;
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\n→ wrote ${OUT}/report.json`);
  console.log(`→ allOk=${allOk}`);
  process.exit(allOk ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
