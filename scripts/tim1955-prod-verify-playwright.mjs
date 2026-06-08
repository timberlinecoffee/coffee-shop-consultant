// TIM-1955 prod verify via Playwright: provision a synthetic user, mint a
// session via service-role magiclink, set the @supabase/ssr cookie, then
// drive the gated routes from a real browser context. Validates that:
//   - Starter → 402 + code:pro_required on benchmark-price + platform-percentile
//   - Pro → 200 (or business-logic 4xx — anything except the Pro gate)
//   - /api/support submitted while signed in as Pro → support_messages.priority=true
//   - same while signed in as Starter → priority=false
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.PROD_URL || "https://coffee-shop-consultant.vercel.app";
const HOST = new URL(BASE).host;
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !ANON || !SERVICE) { console.error("env missing"); process.exit(2); }
const REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];

const svc = createClient(SUPABASE_URL, SERVICE);
const TS = Date.now();
const EMAIL = `tim1955+${TS}@verify.local`;
const PW = `t1m1955_${TS}`;
console.log("[prov] email:", EMAIL);
const { data: u, error: ue } = await svc.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true });
if (ue) { console.error("createUser failed", ue); process.exit(2); }
const uid = u.user.id;

// Provision a plan + a single menu item so we can pass a valid item_id to
// benchmark-price. The Pro gate fires BEFORE the menu_item lookup, so on the
// Starter check we never reach the DB — but on the Pro check we do.
await svc.from("users").update({
  subscription_status: "active",
  subscription_tier: "starter",
  trial_ends_at: null,
  beta_waiver_until: null,
  ai_credits_remaining: 50,
}).eq("id", uid);
const { data: plan } = await svc.from("coffee_shop_plans").insert({ user_id: uid }).select("id").single();
const { data: cat } = await svc.from("menu_categories").insert({ plan_id: plan.id, name: "Beverages" }).select("id").single();
const { data: mi } = await svc.from("menu_items").insert({ plan_id: plan.id, category_id: cat.id, name: "TIM-1955 Latte", price_cents: 500, expected_mix_pct: 0 }).select("id").single();

const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
});
const link = await linkRes.json();
const tokenHash = link.properties?.hashed_token ?? link.hashed_token;
const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
});
const auth = await verifyRes.json();
if (!auth.access_token) { console.error("verify failed", auth); process.exit(2); }
console.log("[auth] minted session for", auth.user.email);

const cookieValue = JSON.stringify({
  access_token: auth.access_token, refresh_token: auth.refresh_token,
  expires_in: auth.expires_in, expires_at: auth.expires_at,
  token_type: auth.token_type, user: auth.user,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
await ctx.addCookies([
  { name: `sb-${REF}-auth-token`, value: cookieValue, domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax" },
]);
const page = await ctx.newPage();

async function hit(method, path, body) {
  const r = await page.request.fetch(BASE + path, {
    method, headers: { "Content-Type": "application/json" }, data: body,
  });
  let parsed; const txt = await r.text();
  try { parsed = JSON.parse(txt); } catch { parsed = txt.slice(0, 200); }
  return { status: r.status(), body: parsed };
}

console.log("\n=== STARTER user — expect 402 + code:pro_required ===");
const r1 = await hit("POST", "/api/workspaces/menu-pricing/benchmark-price", { item_id: mi.id, item_name: "Latte" });
console.log("benchmark-price:", r1.status, JSON.stringify(r1.body));
const r2 = await hit("GET", "/api/workspaces/menu-pricing/platform-percentile?item_name=Latte");
console.log("platform-percentile:", r2.status, JSON.stringify(r2.body));

// Support submit as Starter
const supS = await hit("POST", "/api/support", { name: "TIM-1955 Starter", email: EMAIL, subject: "TIM-1955 Starter priority probe", message: "Verifying Starter priority=false on server side - safe to delete." });
console.log("support (Starter):", supS.status, JSON.stringify(supS.body));
let supSRow = null;
if (supS.body.id) {
  const { data } = await svc.from("support_messages").select("id,priority,user_id").eq("id", supS.body.id).single();
  supSRow = data;
  console.log("  → row:", supSRow);
}

console.log("\n=== Upgrade to PRO — expect 402 → gone (gate cleared) ===");
await svc.from("users").update({ subscription_tier: "pro" }).eq("id", uid);
const r3 = await hit("POST", "/api/workspaces/menu-pricing/benchmark-price", { item_id: mi.id, item_name: "Latte" });
console.log("benchmark-price (Pro):", r3.status, typeof r3.body === "object" ? JSON.stringify(r3.body).slice(0, 200) : r3.body);
const r4 = await hit("GET", "/api/workspaces/menu-pricing/platform-percentile?item_name=Latte");
console.log("platform-percentile (Pro):", r4.status, JSON.stringify(r4.body));

const supP = await hit("POST", "/api/support", { name: "TIM-1955 Pro", email: EMAIL, subject: "TIM-1955 Pro priority probe", message: "Verifying Pro priority=true on server side - safe to delete." });
console.log("support (Pro):", supP.status, JSON.stringify(supP.body));
let supPRow = null;
if (supP.body.id) {
  const { data } = await svc.from("support_messages").select("id,priority,user_id").eq("id", supP.body.id).single();
  supPRow = data;
  console.log("  → row:", supPRow);
}

await browser.close();

// Cleanup
console.log("\n=== Cleanup ===");
await svc.from("support_messages").delete().eq("user_id", uid);
await svc.from("menu_items").delete().eq("id", mi.id);
await svc.from("menu_categories").delete().eq("id", cat.id);
await svc.from("coffee_shop_plans").delete().eq("id", plan.id);
await svc.auth.admin.deleteUser(uid);
console.log("cleanup OK");

// Verdict — gates only. Downstream business-logic 4xx/5xx (e.g. percentile
// view returning no data) is not a Pro-gate failure and does not regress this.
const noProGate = (r) => r.status !== 402 || r.body?.code !== "pro_required";
const ok =
  r1.status === 402 && r1.body?.code === "pro_required" &&
  r2.status === 402 && r2.body?.code === "pro_required" &&
  supSRow?.priority === false && supSRow?.user_id !== null &&
  noProGate(r3) &&
  noProGate(r4) &&
  supPRow?.priority === true && supPRow?.user_id !== null;
console.log("\nVERDICT:", ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
