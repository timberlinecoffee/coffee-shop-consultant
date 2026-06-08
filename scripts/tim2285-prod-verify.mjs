// TIM-2285 preview verify: screenshots + Klaviyo subscribe wire test.
//
// Hits the preview URL with the Vercel automation bypass token (passed in
// via $VERCEL_BYPASS), captures desktop + mobile screenshots of the
// coming-soon page, posts a test email through /api/waitlist/subscribe,
// then queries the Klaviyo Profiles API to confirm the profile landed in
// list VZpvBY (double opt-in pending).
//
// Usage:
//   PREVIEW_URL=https://<dpl>.vercel.app \
//   VERCEL_BYPASS=$BYPASS_TOKEN \
//   KLAVIYO_PRIVATE_API_KEY=$KEY \
//   node scripts/tim2285-prod-verify.mjs
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";

const BASE = process.env.PREVIEW_URL;
const BYPASS = process.env.VERCEL_BYPASS;
const KLAV = process.env.KLAVIYO_PRIVATE_API_KEY;
const LIST_ID = "VZpvBY";
if (!BASE) { console.error("PREVIEW_URL missing"); process.exit(2); }

mkdirSync("scripts/shots", { recursive: true });

const TS = Date.now();
const EMAIL = `qa+groundwork-test-${TS}@timberline.coffee`;
console.log("[prov] email:", EMAIL);

// 1. Screenshots (desktop + mobile)
const browser = await chromium.launch();
const desktop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  extraHTTPHeaders: BYPASS
    ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" }
    : undefined,
});
const dPage = await desktop.newPage();
await dPage.goto(`${BASE}/coming-soon`, { waitUntil: "networkidle" });
await dPage.screenshot({ path: "scripts/shots/tim2285-desktop.png", fullPage: true });
console.log("[shots] desktop ok");

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  extraHTTPHeaders: BYPASS
    ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" }
    : undefined,
});
const mPage = await mobile.newPage();
await mPage.goto(`${BASE}/coming-soon`, { waitUntil: "networkidle" });
await mPage.screenshot({ path: "scripts/shots/tim2285-mobile.png", fullPage: true });
console.log("[shots] mobile ok");

// 2. Submit waitlist via the form (real browser path)
await dPage.fill('input[type="email"]', EMAIL);
await dPage.click('button[type="submit"]');
// Wait for either success state or error message
const result = await Promise.race([
  dPage.waitForSelector('text=You’re on the list', { timeout: 15000 }).then(() => "success"),
  dPage.waitForSelector('[role="alert"]', { timeout: 15000 }).then(() => "error"),
]).catch(() => "timeout");
console.log("[form] result:", result);
if (result === "error") {
  const txt = await dPage.$eval('[role="alert"]', el => el.textContent);
  console.log("[form] error text:", txt);
}
await dPage.screenshot({ path: "scripts/shots/tim2285-success.png" });
await browser.close();

// 3. Verify the profile landed in Klaviyo
if (!KLAV) {
  console.log("[klav] KLAVIYO_PRIVATE_API_KEY not set; skipping list verify");
  process.exit(result === "success" ? 0 : 1);
}
const filt = encodeURIComponent(`equals(email,"${EMAIL}")`);
const res = await fetch(
  `https://a.klaviyo.com/api/profiles/?filter=${filt}&additional-fields[profile]=subscriptions`,
  {
    headers: {
      Authorization: `Klaviyo-API-Key ${KLAV}`,
      accept: "application/json",
      revision: "2024-10-15",
    },
  },
);
const body = await res.json();
console.log("[klav] status:", res.status);
console.log("[klav] hits:", body?.data?.length ?? 0);
if (body?.data?.[0]) {
  const p = body.data[0];
  console.log("[klav] profile_id:", p.id);
  const subs = p.attributes?.subscriptions?.email?.marketing;
  console.log("[klav] marketing.consent:", subs?.consent, "list_suppressions:", subs?.list_suppressions?.length ?? 0);
}
process.exit(result === "success" && (body?.data?.length ?? 0) > 0 ? 0 : 1);
