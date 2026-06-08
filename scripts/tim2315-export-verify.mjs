// TIM-2315 verify: drive the business-plan PDF + printable as trent@simpler.coffee
// against a chosen base URL (preview or prod). Captures cover + first-content-page
// screenshots and downloads the PDF so we can grep for raw `##` markdown.
//
// Usage:
//   PROD_URL=https://groundwork.cafe \
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//   VERCEL_PROTECTION_BYPASS=... \                # only for preview deploys
//   LABEL=before \                                # filename prefix
//   node scripts/tim2315-export-verify.mjs

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.PROD_URL || "https://groundwork.cafe";
const HOST = new URL(BASE).host;
const LABEL = process.env.LABEL || "verify";
const BYPASS = process.env.VERCEL_PROTECTION_BYPASS || null;
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.FIXTURE_EMAIL || "trent@simpler.coffee";

if (!SUPABASE_URL || !ANON || !SERVICE) {
  console.error("env missing: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "verify-artifacts", "tim-2315");
mkdirSync(OUT_DIR, { recursive: true });

console.log(`[base] ${BASE}`);
console.log(`[fixture] ${EMAIL}`);
console.log(`[label] ${LABEL}`);
console.log(`[out] ${OUT_DIR}`);

// Mint a session for the fixture user via service-role magiclink
const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
});
const link = await linkRes.json();
const tokenHash = link.properties?.hashed_token ?? link.hashed_token;
if (!tokenHash) {
  console.error("generate_link failed", link);
  process.exit(2);
}
const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
});
const auth = await verifyRes.json();
if (!auth.access_token) {
  console.error("verify failed", auth);
  process.exit(2);
}
console.log(`[auth] minted session for ${auth.user.email}`);

const cookieValue = JSON.stringify({
  access_token: auth.access_token,
  refresh_token: auth.refresh_token,
  expires_in: auth.expires_in,
  expires_at: auth.expires_at,
  token_type: auth.token_type,
  user: auth.user,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 900, height: 1300 },
  extraHTTPHeaders: BYPASS
    ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" }
    : {},
});
await ctx.addCookies([
  { name: `sb-${REF}-auth-token`, value: cookieValue, domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax" },
]);
const page = await ctx.newPage();

// ── 1. Printable view ────────────────────────────────────────────────────────
const printUrl = `${BASE}/workspace/business-plan/print`;
console.log(`\n[printable] GET ${printUrl}`);
const printResp = await page.goto(printUrl, { waitUntil: "networkidle" });
console.log(`  status: ${printResp.status()}`);
await page.emulateMedia({ media: "print" });
await page.waitForTimeout(1000);

// Scroll-then-capture so framer-motion whileInView blocks render
await page.evaluate(() => {
  return new Promise((resolve) => {
    let y = 0;
    const step = () => {
      window.scrollTo(0, y);
      y += 600;
      if (y > document.body.scrollHeight) {
        window.scrollTo(0, 0);
        setTimeout(resolve, 400);
      } else {
        setTimeout(step, 80);
      }
    };
    step();
  });
});
await page.waitForTimeout(800);

// Full-page screenshot (long scroll)
await page.screenshot({ path: join(OUT_DIR, `${LABEL}-printable-full.png`), fullPage: true });
// Cover-only screenshot (viewport)
await page.screenshot({ path: join(OUT_DIR, `${LABEL}-printable-cover.png`), fullPage: false });
console.log(`  saved: ${LABEL}-printable-full.png, ${LABEL}-printable-cover.png`);

// Capture first body section
const firstSection = await page.locator("section").nth(1).boundingBox();
if (firstSection) {
  await page.screenshot({
    path: join(OUT_DIR, `${LABEL}-printable-first-section.png`),
    clip: firstSection,
  });
  console.log(`  saved: ${LABEL}-printable-first-section.png`);
}

// ── 2. PDF download ─────────────────────────────────────────────────────────
const pdfUrl = `${BASE}/api/pdf/business_plan_full`;
console.log(`\n[pdf] GET ${pdfUrl}`);
const pdfResp = await page.request.fetch(pdfUrl, {
  headers: BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {},
});
console.log(`  status: ${pdfResp.status()}`);
console.log(`  content-type: ${pdfResp.headers()["content-type"]}`);
if (pdfResp.status() === 200) {
  const buf = await pdfResp.body();
  const pdfPath = join(OUT_DIR, `${LABEL}-business-plan.pdf`);
  writeFileSync(pdfPath, buf);
  console.log(`  saved: ${LABEL}-business-plan.pdf (${buf.length} bytes)`);

  // Grep the PDF stream for raw markdown markers. PDF text streams are zlib-
  // compressed inside `stream...endstream` blocks, so a literal `## ` won't
  // show up via naive scan after our fix — but it WILL on the broken cut.
  // Use pdftotext if available, else flag the test as inconclusive.
  try {
    const { execSync } = await import("node:child_process");
    execSync(`pdftotext "${pdfPath}" "${pdfPath}.txt"`, { stdio: "pipe" });
    const text = (await import("node:fs")).readFileSync(`${pdfPath}.txt`, "utf8");
    const rawHashCount = (text.match(/^##\s/gm) || []).length;
    const rawBoldCount = (text.match(/\*\*[^*]+\*\*/g) || []).length;
    console.log(`  pdftotext: raw '## ' line count = ${rawHashCount}, '**bold**' count = ${rawBoldCount}`);
    if (rawHashCount > 0 || rawBoldCount > 0) {
      console.log(`  ⚠ raw markdown still visible in PDF text stream`);
    } else {
      console.log(`  ✓ no raw markdown in PDF text stream`);
    }
  } catch {
    console.log(`  (pdftotext unavailable, skipping markdown scan)`);
  }
} else {
  console.log(`  body: ${(await pdfResp.text()).slice(0, 300)}`);
}

await browser.close();
console.log("\n[done]");
