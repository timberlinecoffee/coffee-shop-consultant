import { chromium } from "playwright";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL env var required");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!ANON) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY env var required");
const EMAIL = "qa-agent@timberline.coffee";
const PASSWORD = "QATim1729Test!";
const CB = process.argv[2] || "manual";

// Try the board's custom domain first, then fall back to the vercel alias.
const SURFACES = [
  ["groundwork", "groundwork.coffee"],
  ["vercel-alias", "coffee-shop-consultant.vercel.app"],
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
const sessionVal = JSON.stringify({
  access_token: auth.access_token, refresh_token: auth.refresh_token,
  expires_in: auth.expires_in, expires_at: auth.expires_at,
  token_type: auth.token_type, user: auth.user,
});

for (const [name, host] of SURFACES) {
  await ctx.clearCookies();
  await ctx.addCookies([{
    name: "sb-ltmcttjftxzpgynhnrpg-auth-token", value: sessionVal,
    domain: host, path: "/", httpOnly: false, secure: true, sameSite: "Lax",
  }]);
  const url = `https://${host}/workspace/buildout-equipment?cb=${CB}`;
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(4000);
    const out = `scripts/shots/tim1846-${name}-equipment-cb.png`;
    await page.screenshot({ path: out });
    const verts = await resp?.headersArray();
    const vid = (verts || []).find((h) => h.name.toLowerCase() === "x-vercel-id")?.value || "";
    const age = (verts || []).find((h) => h.name.toLowerCase() === "age")?.value || "";
    console.log(`${name}\thttp=${resp?.status()}\turl=${page.url()}\tx-vercel-id=${vid}\tage=${age}\t-> ${out}`);
  } catch (e) {
    console.log(`${name}\tUNREACHABLE\t${url}\t${String(e).slice(0, 80)}`);
  }
}
await browser.close();
