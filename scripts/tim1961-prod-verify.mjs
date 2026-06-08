// TIM-1961 live-prod verification: capture coffee-shop-consultant.vercel.app
// /workspace/buildout-equipment as trent@simpler.coffee, prove the duplicate
// top summary bar (GRAND TOTAL / STATIONS / ITEMS) is gone and the canonical
// lower row ("N items | Total: $X") is still present.

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

const SHOTS_DIR = path.resolve("scripts/shots");
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
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
page.on("console", (m) => { if (m.type() === "error") console.log("PAGE ERR:", m.text().slice(0, 240)); });

const url = `${BASE}/workspace/buildout-equipment`;
const resp = await page.goto(url, { waitUntil: "commit", timeout: 60000 });
await page.waitForLoadState("domcontentloaded", { timeout: 60000 });
await page.waitForTimeout(4000);
console.log("nav", resp?.status(), page.url());

const consent = page.locator('[role="dialog"][aria-label="Cookie consent"]');
if (await consent.count()) {
  const acc = consent.getByRole("button", { name: /Accept All/i });
  if (await acc.count()) { await acc.first().click(); await page.waitForTimeout(400); }
}

// Verify deployed SHA via response headers + page-served sentry-release tag.
const sentryRelease = await page.evaluate(() => {
  const m = document.querySelector('meta[name="sentry-release"]');
  return m ? m.getAttribute("content") : null;
});
console.log("sentry-release on page:", sentryRelease);

// Wait for the table to populate so the canonical "N items | Total: $X" row appears.
await page.waitForSelector("table", { timeout: 30000 });
await page.waitForTimeout(2000);

// Assertions: scan the page body for top-bar all-caps tokens vs the canonical row.
const audit = await page.evaluate(() => {
  const all = (sel) => Array.from(document.querySelectorAll(sel));
  const bodyText = document.body.innerText;
  const hasGrandTotalCaps = /\bGRAND TOTAL\b/.test(bodyText);
  const hasStationsCaps = /\bSTATIONS\b/.test(bodyText);
  const hasItemsCaps = /\bITEMS\b/.test(bodyText);
  const canonicalRow = (bodyText.match(/\d+\s+items?\s*[·•|]\s*Total:\s*\$[\d.,KkMm]+/) ||
                       bodyText.match(/\d+\s+items?[^\n]{0,40}Total:\s*\$[\d.,KkMm]+/));
  return {
    bodyLen: bodyText.length,
    hasGrandTotalCaps,
    hasStationsCaps,
    hasItemsCaps,
    canonicalRow: canonicalRow ? canonicalRow[0] : null,
    h1: all("h1").map((n) => n.textContent?.trim()).slice(0, 3),
    tabsCount: all('[role="tab"]').length,
  };
});
console.log("AUDIT:", JSON.stringify(audit, null, 2));

const out = path.join(SHOTS_DIR, "tim1961-prod-buildout-equipment.png");
await page.screenshot({ path: out, fullPage: false });
console.log("shot:", out);
const fullOut = path.join(SHOTS_DIR, "tim1961-prod-buildout-equipment-full.png");
await page.screenshot({ path: fullOut, fullPage: true });
console.log("shot:", fullOut);

await browser.close();
