// TIM-2593 prod smoke: 4 unauthenticated paths × desktop+mobile via Playwright.
// Validates that the Home v2 ship to prod (a) keeps the landing page untouched,
// (b) leaves /login reachable, (c) preserves auth gates on /dashboard, and
// (d) preserves auth gates on /workspace/financials. Auth-gated visual capture
// of HomeV2 itself is deferred to a follow-up if board requests — same posture
// as TIM-2591 and TIM-2594 ship evidence.
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "https://groundwork.cafe";
const OUT  = process.env.OUT_DIR  ?? "done-evidence/tim2593";

// Playwright follows redirects transparently; .status() returns the FINAL
// response, not the 307 the proxy issues. For auth-gated paths we instead
// assert the final URL lands at /login — same behaviour the proxy is meant to
// produce, just verified through the redirect chain.
const PATHS = [
  { slug: "root",                    path: "/",                     expectStatus: [200], expectFinalEnds: "/" },
  { slug: "login",                   path: "/login",                expectStatus: [200], expectFinalEnds: "/login" },
  { slug: "workspace-financials",    path: "/workspace/financials", expectStatus: [200], expectFinalEnds: "/login" },
  { slug: "dashboard",               path: "/dashboard",            expectStatus: [200], expectFinalEnds: "/login" },
];

const VIEWPORTS = [
  { id: "desktop", w: 1280, h: 900 },
  { id: "mobile",  w: 375,  h: 812 },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const report = { base: BASE, ranAt: new Date().toISOString(), paths: [] };
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    for (const p of PATHS) {
      const page = await ctx.newPage();
      const url = BASE + p.path;
      const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
      const status = resp?.status() ?? 0;
      const finalUrl = page.url();
      const statusOk = p.expectStatus.includes(status);
      const finalOk = p.expectFinalEnds === "/"
        ? finalUrl === BASE + "/" || finalUrl === BASE
        : finalUrl.endsWith(p.expectFinalEnds);
      const ok = statusOk && finalOk;
      const screenshot = join(OUT, `${vp.id}-${p.slug}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      report.paths.push({ viewport: vp.id, path: p.path, url, status, finalUrl, ok, screenshot });
      console.log(`${ok ? "✓" : "✗"} ${vp.id} ${p.path} → ${status} (final: ${finalUrl})`);
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  report.allOk = report.paths.every((r) => r.ok);
  report.passedCount = report.paths.filter((r) => r.ok).length;
  report.totalCount = report.paths.length;
  await writeFile(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\n${report.passedCount}/${report.totalCount} paths OK — allOk=${report.allOk}`);
  if (!report.allOk) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(2); });
