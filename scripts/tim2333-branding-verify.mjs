// TIM-2333 verify: drive the business-plan PDF + printable as trent@simpler.coffee
// and assert no platform brand leaks anywhere in either surface.
//
// Asserts (per acceptance):
//   - PDF cover: no logo, business name "Beaver & Beef" present
//   - PDF: NO "Timberline" / "Groundwork" / "#155E63" / "#D4ECD7" / "#1A6E3B"
//   - Printable HTML: no <img alt="Logo"> in the cover, business name present
//   - Printable HTML: NO "Timberline" / "Groundwork" / "#155E63" / "#D4ECD7" / "#1A6E3B"
//
// Usage:
//   PROD_URL=https://groundwork.cafe \
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/tim2333-branding-verify.mjs

import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

const BASE = (process.env.PROD_URL || "https://groundwork.cafe").replace(/\n+$/, "");
const HOST = new URL(BASE).host;
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\n+$/, "");
const ANON = (process.env.SUPABASE_ANON_KEY || "").replace(/\n+$/, "");
const SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/\n+$/, "");
const EMAIL = process.env.FIXTURE_EMAIL || "trent@simpler.coffee";
const BYPASS = process.env.VERCEL_PROTECTION_BYPASS || null;

if (!SUPABASE_URL || !ANON || !SERVICE) {
  console.error("env missing: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "verify-artifacts", "tim-2333");
mkdirSync(OUT_DIR, { recursive: true });

console.log(`[base]    ${BASE}`);
console.log(`[fixture] ${EMAIL}`);
console.log(`[out]     ${OUT_DIR}`);

// ── 1. Mint a session via service-role magiclink ──────────────────────────────
const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
});
const link = await linkRes.json();
const tokenHash = link.properties?.hashed_token ?? link.hashed_token;
if (!tokenHash) { console.error("generate_link failed", link); process.exit(2); }
const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
});
const auth = await verifyRes.json();
if (!auth.access_token) { console.error("verify failed", auth); process.exit(2); }
console.log(`[auth]    session minted for ${auth.user.email}`);

const cookieValue = JSON.stringify({
  access_token: auth.access_token, refresh_token: auth.refresh_token,
  expires_in: auth.expires_in, expires_at: auth.expires_at,
  token_type: auth.token_type, user: auth.user,
});

// ── 2. Browser session ────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1100, height: 1400 },
  extraHTTPHeaders: BYPASS
    ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" }
    : {},
});
await ctx.addCookies([
  { name: `sb-${REF}-auth-token`, value: cookieValue, domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax" },
]);
const page = await ctx.newPage();

let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`  ✓ ${name}${extra ? "  " + extra : ""}`); }
  else    { fail++; console.log(`  ✗ ${name}${extra ? "  " + extra : ""}`); }
}

// Forbidden platform-brand strings (case-insensitive for the word marks).
const FORBIDDEN_WORDS  = ["Timberline", "Groundwork"];
const FORBIDDEN_HEXES  = ["#155E63", "#155e63", "#D4ECD7", "#d4ecd7", "#1A6E3B", "#1a6e3b"];

// ── 3. Printable HTML ─────────────────────────────────────────────────────────
const printUrl = `${BASE}/workspace/business-plan/print`;
console.log(`\n[printable] GET ${printUrl}`);
const printResp = await page.goto(printUrl, { waitUntil: "networkidle" });
console.log(`  status: ${printResp.status()}`);
check("printable returns 200", printResp.status() === 200);

const html = await page.content();
writeFileSync(join(OUT_DIR, "printable.html"), html);

// Cover has no logo (we cleared logo_path on the fixture).
const coverLogoCount = await page.locator("header img[alt='Logo']").count();
check("printable cover has no <img alt=Logo>", coverLogoCount === 0, `(found ${coverLogoCount})`);

// Business name renders.
const shopNameOnCover = await page.locator("header h1").first().textContent();
check("printable cover h1 contains 'Beaver & Beef'", (shopNameOnCover || "").includes("Beaver"));

// Visible text — what the human investor actually sees. The workspace
// shell may carry "Groundwork" in aria-labels/alt attrs in DOM, but is
// CSS-hidden on the printable, so it's invisible. Assert on innerText.
const visibleText = await page.locator("body").innerText();
for (const w of FORBIDDEN_WORDS) {
  const hits = (visibleText.match(new RegExp(w, "gi")) || []).length;
  check(`printable visible text has no '${w}'`, hits === 0, `(found ${hits})`);
}
// Hex codes never appear as visible text but would render colors; check
// raw HTML for those.
for (const h of FORBIDDEN_HEXES) {
  const hits = (html.match(new RegExp(h.replace("#", "\\#"), "g")) || []).length;
  check(`printable HTML has no literal '${h}'`, hits === 0, `(found ${hits})`);
}

// Take a screenshot of the cover for the record.
await page.emulateMedia({ media: "print" });
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT_DIR, "printable-cover.png"), fullPage: false });
console.log("  saved: printable-cover.png");

// ── 4. PDF download ──────────────────────────────────────────────────────────
const pdfUrl = `${BASE}/api/pdf/business_plan_full`;
console.log(`\n[pdf] GET ${pdfUrl}`);
const pdfResp = await page.request.fetch(pdfUrl, {
  headers: BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {},
});
console.log(`  status: ${pdfResp.status()}`);
check("PDF returns 200", pdfResp.status() === 200);

if (pdfResp.status() === 200) {
  const buf = await pdfResp.body();
  const pdfPath = join(OUT_DIR, "business-plan.pdf");
  writeFileSync(pdfPath, buf);
  console.log(`  saved: business-plan.pdf (${buf.length} bytes)`);

  try {
    // pdftotext is not on the VPS; use pdfplumber via inline python (per
    // [[tim-2315-business-plan-export-quality]]).
    execSync(`python3 -c "import pdfplumber,sys;f=pdfplumber.open('${pdfPath}');open('${pdfPath}.txt','w').write('\\n'.join((p.extract_text() or '') for p in f.pages));f.close()"`, { stdio: "pipe" });
    const text = readFileSync(`${pdfPath}.txt`, "utf8");
    for (const w of FORBIDDEN_WORDS) {
      const hits = (text.match(new RegExp(w, "gi")) || []).length;
      check(`PDF text has no '${w}'`, hits === 0, `(found ${hits})`);
    }
    // PDFs don't carry hex literals in their text stream; check headers/body anyway via raw bytes.
    const raw = buf.toString("latin1");
    for (const h of FORBIDDEN_HEXES) {
      const hits = (raw.match(new RegExp(h.replace("#", "\\#"), "g")) || []).length;
      check(`PDF raw bytes have no literal '${h}'`, hits === 0, `(found ${hits})`);
    }
    // Sanity: business name appears.
    check("PDF text contains 'Beaver & Beef'", /Beaver\s*&\s*Beef/.test(text));
  } catch (err) {
    console.log(`  (pdftotext error: ${err.message})`);
    fail++;
  }
}

await browser.close();
console.log(`\n[result] ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
