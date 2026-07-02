#!/usr/bin/env node
// TIM-3413 — CoPilotDrawer mobile-floor before/after shots at 375/414/360.
// Usage:
//   PHASE=before SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_NEW_SECRET_KEY \
//     node scripts/tim3413-copilot-mobile-shots.mjs
//   PHASE=after  SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_NEW_SECRET_KEY \
//     node scripts/tim3413-copilot-mobile-shots.mjs
//
// Captures three viewports (375, 414, 360) of the dashboard with Scout drawer
// open. Output: scripts/screenshots/tim3413/{before,after}/scout-open-<W>.png
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

process.env.LD_LIBRARY_PATH =
  "/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHASE = process.env.PHASE === "after" ? "after" : "before";
const OUT = path.join(__dirname, "screenshots", "tim3413", PHASE);
fs.mkdirSync(OUT, { recursive: true });

const PROD_URL = "https://groundwork.cafe";
const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_NEW_SECRET_KEY;
if (!SERVICE_KEY) {
  console.error("SUPABASE_NEW_SECRET_KEY required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = `tim3413-${PHASE}-${Date.now()}@test.groundwork.cafe`;
const PASSWORD = "Test1234!";
const VIEWPORTS = [
  { width: 375, height: 812, name: "iphone-se" },
  { width: 414, height: 896, name: "iphone-plus" },
  { width: 360, height: 800, name: "android" },
];

async function getSessionCookies(email) {
  // Post-TIM-3409 captcha-free headless auth (memory: tim-3369-hiring-ia-v2-ship).
  // 1) admin.generateLink → hashed_token
  // 2) anon.verifyOtp(type=magiclink, token_hash) → session
  // 3) base64-prefix-encode session JSON into sb-<ref>-auth-token cookie chunks.
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw error;
  const tokenHash = data.properties.hashed_token;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_NEW_PUBLISHABLE_KEY;
  if (!anonKey) throw new Error("anon key missing");
  const anon = createClient(SUPABASE_URL, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const verify = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verify.error) throw verify.error;
  const session = verify.data.session;
  if (!session) throw new Error("no session from verifyOtp");
  // The project ref is the hostname's first label.
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
  console.log("User created:", userId);

  await supabase.from("users").upsert({
    id: userId,
    subscription_status: "active",
    subscription_tier: "pro",
    onboarding_completed: true,
  });
  const { data: plan, error: planErr } = await supabase
    .from("coffee_shop_plans")
    .insert({
      user_id: userId,
      plan_name: "TIM-3413 Test Shop",
      status: "in_progress",
    })
    .select()
    .single();
  if (planErr) throw planErr;
  const planId = plan.id;
  await supabase
    .from("users")
    .update({ current_plan_id: planId })
    .eq("id", userId);
  console.log("Plan seeded:", planId);

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

      // Captcha-free session cookies (verifyOtp pattern).
      const sessionCookies = await getSessionCookies(EMAIL);
      await ctx.addCookies(sessionCookies);

      const page = await ctx.newPage();
      page.on("pageerror", (e) => console.log("  [pageerr]", e.message));

      await page.goto(`${PROD_URL}/dashboard`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(1200);

      // Open Scout drawer via FAB.
      const fab = page.locator('button[aria-label^="Open Scout"]').first();
      const fabVisible = await fab.isVisible().catch(() => false);
      if (!fabVisible) {
        console.warn("  Scout FAB not visible; saving page state shot");
        await page.screenshot({
          path: path.join(OUT, `no-fab-${vp.width}.png`),
          fullPage: false,
        });
        await ctx.close();
        continue;
      }
      await fab.click({ force: true });
      await page.waitForSelector('aside[role="dialog"][aria-label^="Scout"]', {
        timeout: 5000,
      });
      await page.waitForTimeout(700);

      const shot = path.join(OUT, `scout-open-${vp.width}.png`);
      await page.screenshot({ path: shot, fullPage: false });
      console.log("  saved:", shot);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await supabase.from("coffee_shop_plans").delete().eq("id", planId);
    await supabase.auth.admin.deleteUser(userId);
  }
  console.log("\nDone. Output:", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
