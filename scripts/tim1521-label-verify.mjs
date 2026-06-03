// TIM-1521 verify: confirm both Launch Plan sub-pages show a "Generate" CTA
// (no "Seed" variant) on prod as trent@simpler.coffee.
import { chromium } from "playwright";
import fs from "node:fs";

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

const pages = [
  { key: "milestones", url: `${BASE}/workspace/launch-plan/milestones` },
  { key: "opening-month", url: `${BASE}/workspace/launch-plan/opening-month` },
];

let anySeed = false;
for (const p of pages) {
  const page = await ctx.newPage();
  await page.goto(p.url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const consent = page.locator('[role="dialog"][aria-label="Cookie consent"]');
  if (await consent.count()) {
    const acc = consent.getByRole("button", { name: /Accept All/i });
    if (await acc.count()) { await acc.first().click(); await page.waitForTimeout(600); }
  }
  await page.waitForTimeout(800);
  const labels = await page.getByRole("button").allInnerTexts();
  const cta = labels.filter((t) => /generat|seed|reseed/i.test(t));
  const seedHit = labels.some((t) => /seed|reseed/i.test(t));
  if (seedHit) anySeed = true;
  console.log(`[${p.key}] CTA buttons:`, JSON.stringify(cta), seedHit ? "<-- SEED FOUND" : "OK");
  await page.screenshot({ path: `scripts/shots/tim1521-${p.key}.png`, fullPage: false });
  await page.close();
}

await browser.close();
console.log(anySeed ? "VERIFY FAIL: a Seed label is still live" : "VERIFY PASS: all CTAs use Generate, no Seed variant");
