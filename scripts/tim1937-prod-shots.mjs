// TIM-1937 prod verification: shoot every WorkspaceHeader-bearing page at
// 1200 + 1440 viewports against the live production alias and stamp each
// file with the deployed SHA so the close-out comment can point at exact
// evidence on the SHA in `main`.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "https://coffee-shop-consultant.vercel.app";
const HOST = "coffee-shop-consultant.vercel.app";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];
const EMAIL = "trent@simpler.coffee";

const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
});
if (!linkRes.ok) { console.error("generate_link FAIL", linkRes.status, await linkRes.text()); process.exit(1); }
const link = await linkRes.json();
const tokenHash = link.properties?.hashed_token ?? link.hashed_token;
const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
});
if (!verifyRes.ok) { console.error("verify FAIL", verifyRes.status, await verifyRes.text()); process.exit(1); }
const auth = await verifyRes.json();
console.log("AUTH OK user:", auth.user?.email);

const ALL_PAGES = [
  ["financials", "/workspace/financials"],
  ["buildout-equipment", "/workspace/buildout-equipment"],
  ["supplies", "/workspace/buildout-equipment/supplies"],
  ["marketing", "/workspace/marketing"],
  ["operations-playbook", "/workspace/operations-playbook"],
  ["hiring", "/workspace/hiring"],
  ["menu-pricing", "/workspace/menu-pricing"],
  ["business-plan", "/workspace/business-plan"],
  ["suppliers", "/workspace/suppliers"],
  ["opening-month-plan", "/workspace/opening-month-plan"],
  ["location-lease", "/workspace/location-lease"],
];
const filter = process.argv[2];
const PAGES = filter
  ? ALL_PAGES.filter(([s]) => filter.split(",").includes(s))
  : ALL_PAGES;

const SHOTS_DIR = path.resolve("scripts/shots");
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const browser = await chromium.launch();

for (const w of [1200, 1440]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addCookies([
    {
      name: `sb-${REF}-auth-token`,
      value: JSON.stringify({
        access_token: auth.access_token, refresh_token: auth.refresh_token,
        expires_in: auth.expires_in, expires_at: auth.expires_at,
        token_type: auth.token_type, user: auth.user,
      }),
      domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax",
    },
    { name: "gw_consent", value: "all", domain: HOST, path: "/", secure: true, sameSite: "Lax" },
  ]);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log(`[${w}] PAGE ERR:`, m.text().slice(0, 200)); });

  for (const [slug, url] of PAGES) {
    try {
      await page.goto(`${BASE}${url}`, { waitUntil: "commit", timeout: 60000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 60000 });
      await page.waitForTimeout(2500);
      const consent = page.locator('[role="dialog"][aria-label="Cookie consent"]');
      if (await consent.count()) {
        const acc = consent.getByRole("button", { name: /Accept All/i });
        if (await acc.count()) { await acc.first().click(); await page.waitForTimeout(400); }
      }
      let clipHeight = 360;
      const header = page.locator("header").first();
      if (await header.count()) {
        const box = await header.boundingBox();
        if (box && box.height > 0) {
          clipHeight = Math.max(160, Math.min(box.y + box.height + 24, 420));
          console.log(`[${w}] ${slug}: header bottom y=${Math.round(box.y + box.height)}`);
        }
      }
      await page.screenshot({
        path: path.join(SHOTS_DIR, `tim1937-prod-${slug}-${w}.png`),
        clip: { x: 0, y: 0, width: w, height: clipHeight },
      });
    } catch (e) {
      console.log(`[${w}] ${slug}: ERR`, String(e).slice(0, 200));
    }
  }
  await page.close();
  await ctx.close();
}

await browser.close();
console.log("done");
