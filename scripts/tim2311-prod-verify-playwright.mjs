// TIM-2311 prod verify via Playwright: provision a synthetic Starter user with
// credits below the 20%-of-grant threshold, mint a session via service-role
// magiclink, then assert on the live surface that:
//   1. The Copilot drawer header surfaces both "Buy more credits" and "Upgrade
//      plan" CTAs next to the meter when remaining ≤ 20% × monthlyGrant.
//   2. Clicking "Buy more credits" opens the credit-pack modal with all three
//      packs and the "Best Balanced" / "Best Value" badges.
//   3. POST /api/stripe/create-credit-checkout-session with a valid packKey
//      returns a live stripe.com Checkout URL (proves the price IDs are wired
//      and the route auth + validation work end-to-end on prod).
//   4. The success-return toast renders when ?credits_added=1 is on the URL
//      and the param is stripped via history.replaceState.
//
// Pairs with src/app/api/stripe/credit-topup.test.mjs which covers the webhook
// ledger crediting branch.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.PROD_URL || "https://coffee-shop-consultant.vercel.app";
const HOST = new URL(BASE).host;
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !ANON || !SERVICE) {
  console.error("env missing: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
const REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];

const svc = createClient(SUPABASE_URL, SERVICE);
const TS = Date.now();
const EMAIL = `tim2311+${TS}@verify.local`;
const PW = `t2m2311_${TS}`;
console.log("[prov] email:", EMAIL);
const { data: u, error: ue } = await svc.auth.admin.createUser({
  email: EMAIL,
  password: PW,
  email_confirm: true,
});
if (ue) {
  console.error("createUser failed", ue);
  process.exit(2);
}
const uid = u.user.id;

// Starter active sub, 10 credits — well below 20% × 100 = 20, so the paired
// CTA pair must be visible.
await svc.from("users").update({
  subscription_status: "active",
  subscription_tier: "starter",
  trial_ends_at: null,
  beta_waiver_until: null,
  ai_credits_remaining: 10,
  onboarding_completed: true,
}).eq("id", uid);
// NB: don't seed `subscriptions` here. The checkout route reads
// stripe_customer_id off `subscriptions` and falls back to customer_email when
// missing; supplying a row without a real customer ID just adds noise without
// changing the response shape.
await svc.from("coffee_shop_plans").insert({ user_id: uid });

const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
});
const link = await linkRes.json();
const tokenHash = link.properties?.hashed_token ?? link.hashed_token;
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
console.log("[auth] minted session for", auth.user.email);

const cookieValue = JSON.stringify({
  access_token: auth.access_token,
  refresh_token: auth.refresh_token,
  expires_in: auth.expires_in,
  expires_at: auth.expires_at,
  token_type: auth.token_type,
  user: auth.user,
});

const browser = await chromium.launch();
// Force a wide viewport so the desktop CoPilotBeacon launcher
// (hidden lg:flex, breakpoint 1024px) is rendered.
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
await ctx.addCookies([
  {
    name: `sb-${REF}-auth-token`,
    value: cookieValue,
    domain: HOST,
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  },
]);
const page = await ctx.newPage();

let failures = 0;
function check(label, cond, detail = "") {
  const mark = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
}

// --- Check 3 (do this first so we can validate against prod even if UI shifts) ---
console.log("\n=== /api/stripe/create-credit-checkout-session ===");
for (const packKey of ["small", "medium", "large"]) {
  const r = await page.request.fetch(BASE + "/api/stripe/create-credit-checkout-session", {
    method: "POST",
    // Explicit Origin so the route's success_url/cancel_url are built from this
    // value instead of the NEXT_PUBLIC_URL env fallback (which on prod still
    // carries a trailing "\n" from the old TIM-2285-class env-var bug).
    headers: { "Content-Type": "application/json", Origin: BASE },
    data: { packKey, returnPath: "/dashboard" },
  });
  const txt = await r.text();
  let j = {};
  try { j = JSON.parse(txt); } catch {}
  check(
    `checkout session for pack="${packKey}" returns a live Stripe URL`,
    r.status() === 200 && typeof j.url === "string" && /^https:\/\/checkout\.stripe\.com\//.test(j.url),
    `status=${r.status()} url=${(j.url || "").slice(0, 60)}… body=${txt.slice(0,150)}`,
  );
}

// --- Check 1 + 2: open dashboard, expand drawer, assert paired CTAs + modal contents ---
console.log("\n=== Dashboard Copilot drawer UI ===");
await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });

// Dismiss the cookie-consent dialog so the FAB is clickable.
async function dismissConsent() {
  const consent = page.locator('[role="dialog"][aria-label="Cookie consent"]');
  if (!(await consent.isVisible().catch(() => false))) return;
  for (const label of [/accept/i, /agree/i, /reject/i, /dismiss/i, /close/i, /^ok$/i]) {
    const btn = consent.getByRole("button", { name: label }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      break;
    }
  }
}
await dismissConsent();

// Open the drawer by dispatching the CoPilotBeacon's custom event directly.
// The CoPilotDrawer listens for "workspace-copilot-open" globally, so this
// reliably opens the drawer regardless of FAB visibility / overlay siblings.
async function openDrawer() {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("workspace-copilot-open"));
  });
}
await openDrawer();

// The meter chip + paired CTAs render in the drawer header.
const buyMore = page.getByRole("button", { name: /Buy more credits/i }).first();
const upgrade = page.getByRole("link", { name: /Upgrade plan/i }).first();
await buyMore.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
check('"Buy more credits" CTA visible at 10/100 credits (≤ 20% × grant)', await buyMore.isVisible().catch(() => false));
check('"Upgrade plan" CTA visible alongside (paired)', await upgrade.isVisible().catch(() => false));

// Click Buy more credits → modal renders with all three packs + badges.
if (await buyMore.isVisible().catch(() => false)) {
  await buyMore.click();
  const dialog = page.locator('[role="dialog"][aria-labelledby="credit-packs-title"]');
  await dialog.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  check("credit packs modal opens", await dialog.isVisible().catch(() => false));
  check("modal lists 100-credit pack", await dialog.getByText(/100 credits/).first().isVisible().catch(() => false));
  check("modal lists 500-credit pack", await dialog.getByText(/500 credits/).first().isVisible().catch(() => false));
  check("modal lists 1500-credit pack", await dialog.getByText(/1500 credits/).first().isVisible().catch(() => false));
  check('modal flags 500-credit pack "Best Balanced"', await dialog.getByText(/Best Balanced/i).first().isVisible().catch(() => false));
  check('modal flags 1500-credit pack "Best Value"', await dialog.getByText(/Best Value/i).first().isVisible().catch(() => false));
}

// --- Check 4: success toast handler ---
console.log("\n=== ?credits_added=1 success toast ===");
await page.goto(BASE + "/dashboard?credits_added=1", { waitUntil: "domcontentloaded" });
await dismissConsent();
const toast = page.locator('[data-testid="credits-added-toast"]');
await toast.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
check("credits-added toast renders on return from Stripe", await toast.isVisible().catch(() => false));
// After mount, the URL should be cleaned.
const url = page.url();
check("query param ?credits_added=1 is stripped from URL", !url.includes("credits_added=1"), `url=${url}`);

// --- Cleanup ---
await browser.close();
await svc.from("subscriptions").delete().eq("user_id", uid);
await svc.from("coffee_shop_plans").delete().eq("user_id", uid);
await svc.from("users").delete().eq("id", uid);
await svc.auth.admin.deleteUser(uid).catch(() => {});

console.log(`\n${failures === 0 ? "✅ ALL CHECKS PASS" : `❌ ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
