#!/usr/bin/env node
// TIM-3416 — /account legacy page mobile shots at 375/414/360.
// Usage:
//   PHASE=before SUPABASE_NEW_SECRET_KEY=... SUPABASE_NEW_PUBLISHABLE_KEY=... \
//     node scripts/tim3416-settings-account-shots.mjs
//   PHASE=after  SUPABASE_NEW_SECRET_KEY=... SUPABASE_NEW_PUBLISHABLE_KEY=... \
//     node scripts/tim3416-settings-account-shots.mjs
//
// Captures three viewports of /account: Profile/Subscription card stack
// + Preferences/Documents/Data cards below the fold.
// Output: scripts/screenshots/tim3416/{before,after}/{account-<W>.png,account-fold-<W>.png}
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

process.env.LD_LIBRARY_PATH =
  "/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHASE = process.env.PHASE === "after" ? "after" : "before";
const OUT = path.join(__dirname, "screenshots", "tim3416", PHASE);
fs.mkdirSync(OUT, { recursive: true });

const PROD_URL = "https://groundwork.cafe";
const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_NEW_SECRET_KEY;
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_NEW_PUBLISHABLE_KEY;
if (!SERVICE_KEY) {
  console.error("SUPABASE_NEW_SECRET_KEY required");
  process.exit(1);
}
if (!ANON_KEY) {
  console.error("SUPABASE_NEW_PUBLISHABLE_KEY required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Long email matches board's "trent@simpler..." overflow case.
const EMAIL = `tim3416-${PHASE}-${Date.now()}@simpler-test-shop-account-overflow.groundwork.cafe`;
const PASSWORD = "Test1234!";
const VIEWPORTS = [
  { width: 375, height: 812, name: "iphone-se" },
  { width: 414, height: 896, name: "iphone-plus" },
  { width: 360, height: 800, name: "android" },
];

async function getSessionCookies(email) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw error;
  const tokenHash = data.properties.hashed_token;
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const verify = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verify.error) throw verify.error;
  const session = verify.data.session;
  if (!session) throw new Error("no session from verifyOtp");
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
    domain: ".groundwork.cafe",
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
      password: PASSWORD,
      email_confirm: true,
    });
  if (authErr) throw authErr;
  const userId = authData.user.id;
  console.log("User created:", userId, EMAIL);

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
      plan_name: "TIM-3416 Test Shop",
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

  const browser = await chromium.launch({
    executablePath:
      "/home/briefli/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });

  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n=== Viewport ${vp.width}x${vp.height} (${vp.name}) ===`);
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      });
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
          domain: ".groundwork.cafe",
          path: "/",
          httpOnly: false,
          secure: true,
          sameSite: "Lax",
        },
      ]);
      const sessionCookies = await getSessionCookies(EMAIL);
      await ctx.addCookies(sessionCookies);

      const page = await ctx.newPage();
      page.on("pageerror", (e) => console.log("  [pageerr]", e.message));

      const resp = await page.goto(`${PROD_URL}/account`, {
        waitUntil: "load",
      });
      console.log("  GET /account →", resp?.status());
      await page.waitForTimeout(1500);

      // Top of page: Profile + Subscription (the board's proof case).
      const topShot = path.join(OUT, `account-${vp.width}.png`);
      await page.screenshot({ path: topShot, fullPage: false });
      console.log("  top shot:", topShot);

      // Full page for completeness — every card the board cares about.
      const fullShot = path.join(OUT, `account-full-${vp.width}.png`);
      await page.screenshot({ path: fullShot, fullPage: true });
      console.log("  full shot:", fullShot);

      // Document-level hscroll assertion.
      const hScroll = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      console.log("  hasDocHscroll =", hScroll);

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
