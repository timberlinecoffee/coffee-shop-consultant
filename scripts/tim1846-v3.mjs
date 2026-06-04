import { chromium } from "playwright";

const BASE = "https://coffee-shop-consultant.vercel.app";
const HOST = "coffee-shop-consultant.vercel.app";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL env var required");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!ANON) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY env var required");
const EMAIL = "qa-agent@timberline.coffee";
const PASSWORD = "QATim1729Test!";

const ROUTES = [
  ["hiring", "/workspace/hiring"],
  ["menu-pricing", "/workspace/menu-pricing"],
  ["equipment-supplies", "/workspace/buildout-equipment"],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
    const resp = await page.goto(`${BASE}${route}`, { waitUntil: "commit", timeout: 45000 });
    await page.waitForTimeout(4500);
    const out = `scripts/shots/tim1846-v3-${name}.png`;
    await page.screenshot({ path: out });
    console.log(`${name}\thttp=${resp?.status()}\turl=${page.url()}\t-> ${out}`);
  } catch (e) {
    console.log(`${name}\tERR\t${String(e).slice(0, 100)}`);
  }
}
await browser.close();
