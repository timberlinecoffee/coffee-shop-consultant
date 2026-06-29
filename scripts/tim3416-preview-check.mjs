#!/usr/bin/env node
// TIM-3416 — preview-deploy sanity check at 375 / 360 / 414 px.
// Output: scripts/screenshots/tim3416/preview/account-<W>.png
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

process.env.LD_LIBRARY_PATH =
  "/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "screenshots", "tim3416", "preview");
fs.mkdirSync(OUT, { recursive: true });

const PREVIEW =
  "https://coffee-shop-consultant-3hau244pq-timberlinecoffees-projects.vercel.app";
const SHARE_TOKEN = "IT3aTnqxets58E6wu2VI8JktcCGwLMla";

const SUPABASE_URL = "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_NEW_SECRET_KEY;
const ANON_KEY = process.env.SUPABASE_NEW_PUBLISHABLE_KEY;
if (!SERVICE_KEY || !ANON_KEY) {
  console.error("SUPABASE_NEW_SECRET_KEY + SUPABASE_NEW_PUBLISHABLE_KEY required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = `tim3416-preview-${Date.now()}@simpler-test-shop-account-overflow.groundwork.cafe`;

async function sessionCookiesFor(domain) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
  });
  if (error) throw error;
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const verify = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (verify.error) throw verify.error;
  const session = verify.data.session;
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const cookieName = `sb-${ref}-auth-token`;
  const payload = JSON.stringify(session);
  const b64 = "base64-" + Buffer.from(payload, "utf8").toString("base64");
  const chunkSize = 3200;
  const chunks = [];
  for (let i = 0; i < b64.length; i += chunkSize) {
    chunks.push(b64.slice(i, i + chunkSize));
  }
  return chunks.map((value, idx) => ({
    name: chunks.length === 1 ? cookieName : `${cookieName}.${idx}`,
    value,
    domain,
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  }));
}

async function main() {
  const { data: authData, error: authErr } =
    await supabase.auth.admin.createUser({
      email: EMAIL,
      password: "Test1234!",
      email_confirm: true,
    });
  if (authErr) throw authErr;
  const userId = authData.user.id;

  await supabase.from("users").upsert({
    id: userId,
    email: EMAIL,
    full_name: "Trent Rollings",
    subscription_status: "active",
    subscription_tier: "pro",
    onboarding_completed: true,
    ai_credits_remaining: 344,
  });
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .insert({
      user_id: userId,
      plan_name: "TIM-3416 Preview",
      status: "in_progress",
    })
    .select()
    .single();
  if (plan) {
    await supabase
      .from("users")
      .update({ current_plan_id: plan.id })
      .eq("id", userId);
  }

  const previewHost = new URL(PREVIEW).hostname;

  const browser = await chromium.launch({
    executablePath:
      "/home/briefli/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });

  try {
    for (const vp of [
      { width: 375, height: 812, name: "iphone-se" },
      { width: 414, height: 896, name: "iphone-plus" },
      { width: 360, height: 800, name: "android" },
    ]) {
      console.log(`\n=== Viewport ${vp.width}x${vp.height} ===`);
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => console.log("  [pageerr]", e.message));

      // 1. Acquire SSO bypass cookie via share token.
      await page.goto(`${PREVIEW}/?_vercel_share=${SHARE_TOKEN}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(800);

      // 2. Add Supabase session cookies on preview host.
      const cookies = await sessionCookiesFor(previewHost);
      await ctx.addCookies(cookies);
      // 3. consent
      await ctx.addCookies([
        {
          name: "gw_consent",
          value: encodeURIComponent(
            JSON.stringify({
              version: 1,
              analytics: false,
              marketing: false,
              decidedAt: new Date().toISOString(),
            }),
          ),
          domain: previewHost,
          path: "/",
          httpOnly: false,
          secure: true,
          sameSite: "Lax",
        },
      ]);

      const resp = await page.goto(`${PREVIEW}/account`, {
        waitUntil: "load",
      });
      console.log("  GET /account →", resp?.status());
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: path.join(OUT, `account-${vp.width}.png`),
        fullPage: false,
      });
      await page.screenshot({
        path: path.join(OUT, `account-full-${vp.width}.png`),
        fullPage: true,
      });
      const h = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      console.log("  hasDocHscroll =", h);

      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
