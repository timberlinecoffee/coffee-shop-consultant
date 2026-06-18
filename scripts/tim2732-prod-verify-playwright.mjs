// TIM-2732: capture banner-rendered (with ?expired=1) and banner-absent
// (without ?expired=1) frames on prod for both /login and /landing so the
// completion comment has visual evidence the AC2/AC3 banner matches the
// brand-aligned amber pattern and is gated on the URL flag.

import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://groundwork.cafe";
const OUT = "done-evidence/tim2732";
const CASES = [
  { name: "login-with-expired", path: "/login?expired=1" },
  { name: "login-no-expired", path: "/login" },
  { name: "landing-with-expired", path: "/landing?expired=1" },
  { name: "landing-no-expired", path: "/landing" },
];
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = [];
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    for (const c of CASES) {
      const url = `${BASE}${c.path}`;
      const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
      // Give the banner a beat to mount on /landing where the strip sits above HomeNav.
      await page.waitForTimeout(1000);
      const screenshot = join(OUT, `${c.name}-${vp.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      const bannerVisible = await page
        .getByText("Your session expired. Please sign in to continue.")
        .isVisible()
        .catch(() => false);
      report.push({
        case: c.name,
        viewport: vp.name,
        url,
        status: resp?.status() ?? null,
        bannerVisible,
        screenshot,
      });
      console.log(
        `${c.name.padEnd(22)} ${vp.name.padEnd(8)} status=${resp?.status() ?? "?"} bannerVisible=${bannerVisible}`,
      );
    }
    await ctx.close();
  }
  await browser.close();
  await writeFile(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  const expectedVisible = report.filter((r) => r.case.includes("with-expired"));
  const expectedAbsent = report.filter((r) => r.case.includes("no-expired"));
  const ok =
    expectedVisible.every((r) => r.bannerVisible === true) &&
    expectedAbsent.every((r) => r.bannerVisible === false);
  console.log(ok ? "OK" : "FAIL");
  process.exit(ok ? 0 : 1);
}

main();
