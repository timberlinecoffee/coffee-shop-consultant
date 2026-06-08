import { chromium } from "playwright";

// TIM-1879: board-proof canonical-chrome screenshots on the live alias.
// Prod build target: commit 14cd32d8 (chrome fix 93aa079).
const BASE = "https://coffee-shop-consultant.vercel.app";
const HOST = "coffee-shop-consultant.vercel.app";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL env var required");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!ANON) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY env var required");
const EMAIL = "qa-agent@timberline.coffee";
const PASSWORD = "QATim1729Test!";

const CB = Date.now();
const ROUTES = [
  ["equipment-supplies", "/workspace/buildout-equipment"],
  ["menu-pricing", "/workspace/menu-pricing"],
  ["hiring", "/workspace/hiring"],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  bypassCSP: true,
  extraHTTPHeaders: { "Cache-Control": "no-cache", Pragma: "no-cache" },
});
const page = await ctx.newPage();

const authRes = await page.request.post(
  `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
  { headers: { apikey: ANON, "Content-Type": "application/json" }, data: { email: EMAIL, password: PASSWORD } }
);
if (!authRes.ok()) { console.error("AUTH FAIL", await authRes.text()); process.exit(1); }
const auth = await authRes.json();
await ctx.addCookies([{
  name: "sb-ltmcttjftxzpgynhnrpg-auth-token",
  value: JSON.stringify({
    access_token: auth.access_token, refresh_token: auth.refresh_token,
    expires_in: auth.expires_in, expires_at: auth.expires_at,
    token_type: auth.token_type, user: auth.user,
  }),
  domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax",
}]);

for (const [name, route] of ROUTES) {
  try {
    const resp = await page.goto(`${BASE}${route}?cb=${CB}`, { waitUntil: "commit", timeout: 45000 });
    // Hard reload to bust any edge/SW cache
    await page.reload({ waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(4500);
    const out = `scripts/shots/tim1879-${name}.png`;
    await page.screenshot({ path: out });
    const xVercel = resp?.headers()["x-vercel-id"] || "none";
    console.log(`${name}\thttp=${resp?.status()}\turl=${page.url()}\tx-vercel-id=${xVercel}\t-> ${out}`);
  } catch (e) {
    console.log(`${name}\tERR\t${String(e).slice(0, 120)}`);
  }
}
await browser.close();
