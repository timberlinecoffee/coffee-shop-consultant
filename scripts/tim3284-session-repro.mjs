// TIM-3284 — session-not-persisting repro.
// 1. Create a synthetic user via admin API
// 2. Log in via /login form on $ORIGIN
// 3. Verify /dashboard accessible
// 4. Close browser (kill context)
// 5. Open new context (NO cookies imported — simulates browser restart with
//    only persistent cookies surviving — but we ALSO test the case where we
//    import only the persistent (maxAge>0) cookies to mimic real browser
//    behavior)
// 6. Visit /dashboard → must still be logged in.

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: process.env.ENV_FILE || ".env.local" });

const ORIGIN = process.env.ORIGIN || "http://localhost:3284";
const SHOT_DIR = "tim3284-session-screenshots";
mkdirSync(SHOT_DIR, { recursive: true });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const admin = createClient(URL, KEY, { auth: { persistSession: false } });

function relevantCookies(cookies) {
  return cookies
    .filter((c) => /gw_|sb-/i.test(c.name))
    .map((c) => ({
      name: c.name,
      domain: c.domain,
      path: c.path,
      sameSite: c.sameSite,
      secure: c.secure,
      httpOnly: c.httpOnly,
      expires: c.expires, // -1 = session cookie, >0 = persistent epoch
      isSession: c.expires === -1 || c.expires === undefined,
    }));
}

async function snapshot(label, ctx, page) {
  const cookies = await ctx.cookies();
  const ls = await page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage).map((k) => [k, (localStorage.getItem(k) || "").slice(0, 60)]),
    ),
  ).catch(() => ({}));
  const url = page.url();
  const ok = url.includes("/dashboard");
  console.log(`\n=== ${label} ===`);
  console.log("url:", url);
  console.log("/dashboard reached:", ok);
  console.log("relevant cookies:", JSON.stringify(relevantCookies(cookies), null, 2));
  console.log("localStorage keys:", Object.keys(ls));
  return { url, ok, cookies: relevantCookies(cookies), localStorage: ls };
}

const TEST_EMAIL = `tim3284-${Date.now()}@simpler.coffee`;
const TEST_PASSWORD = `TIM3284-test-${Date.now()}`;

console.log(`Creating synthetic user ${TEST_EMAIL}…`);
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
  email_confirm: true,
  user_metadata: { onboarding_completed: true, signup_source: "tim3284-repro" },
});
if (createErr) {
  console.error("createUser failed:", createErr);
  process.exit(1);
}
const userId = created.user.id;
console.log("created user:", userId);

// Mark onboarding complete on the users row so /dashboard renders without bounce
await admin.from("users").upsert({ id: userId, email: TEST_EMAIL, onboarding_completed: true });

try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // STEP 1: visit /login
  await page.goto(`${ORIGIN}/login`, { waitUntil: "networkidle" });

  // Dismiss cookie banner if shown so it doesn't intercept clicks
  const acceptBtn = page.getByRole("button", { name: /Accept All/i });
  if (await acceptBtn.isVisible().catch(() => false)) {
    await acceptBtn.click();
    await page.waitForTimeout(300);
  }

  // STEP 2: fill in email/password & submit
  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  // KEEP "remember me" checked (default)
  const remember = page.getByLabel(/Keep me signed in/i);
  if (await remember.isVisible().catch(() => false)) {
    if (!(await remember.isChecked())) await remember.check();
  }
  await page.getByRole("button", { name: /^Sign In$/i }).click();
  // Wait for either a navigation away from /login OR an error to appear
  try {
    await page.waitForFunction(
      () => !window.location.pathname.startsWith("/login") || !!document.querySelector('[role="alert"]'),
      { timeout: 20000 },
    );
  } catch {
    console.log("WARN: timed out waiting for nav-away-from-login or [role=alert]");
  }
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.screenshot({ path: `${SHOT_DIR}/01-post-login.png` });
  // Print any error visible on the page
  const alert = await page.locator('[role="alert"]').first().textContent().catch(() => null);
  if (alert) console.log("PAGE ALERT:", alert);
  const step1 = await snapshot("Step 1: post-login", ctx, page);

  // STEP 2: navigate to /dashboard explicitly (in case post-login routed elsewhere)
  await page.goto(`${ORIGIN}/dashboard`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${SHOT_DIR}/02-dashboard.png` });
  const step2 = await snapshot("Step 2: /dashboard from login", ctx, page);

  // STEP 3: snapshot cookies, kill the context, open a new one with ONLY
  // the persistent cookies (real-browser restart semantics: session cookies
  // are dropped).
  const allCookies = await ctx.cookies();
  const persistentCookies = allCookies.filter((c) => c.expires && c.expires > 0);
  console.log(
    `\nKept ${persistentCookies.length}/${allCookies.length} cookies after simulated browser close.`,
  );
  const droppedCookies = allCookies
    .filter((c) => !(c.expires && c.expires > 0))
    .map((c) => c.name);
  console.log("Dropped (session-scope):", droppedCookies);

  await ctx.close();

  // STEP 4: fresh context with only persistent cookies — like a browser restart
  const ctx2 = await browser.newContext();
  await ctx2.addCookies(persistentCookies);
  const page2 = await ctx2.newPage();
  await page2.goto(`${ORIGIN}/dashboard`, { waitUntil: "networkidle" });
  await page2.screenshot({ path: `${SHOT_DIR}/03-restart.png` });
  const step3 = await snapshot("Step 3: /dashboard after simulated browser restart", ctx2, page2);

  await browser.close();

  const report = { ORIGIN, TEST_EMAIL, userId, step1, step2, step3, persistentCookies: persistentCookies.map(c => c.name), droppedCookies };
  writeFileSync(`${SHOT_DIR}/report.json`, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${SHOT_DIR}/report.json`);

  const verdict = step3.ok ? "PASS" : "FAIL";
  console.log("\nVERDICT session persistence:", verdict);
} finally {
  console.log("Cleaning up synthetic user…");
  await admin.auth.admin.deleteUser(userId);
}
