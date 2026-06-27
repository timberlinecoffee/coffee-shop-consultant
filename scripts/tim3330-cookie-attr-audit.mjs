// TIM-3330 — capture the exact cookie attributes the prod server hands a
// fresh logged-in user, plus simulate the close-tab-open-tab + cold-restart
// scenarios the board described in the directive.
//
// What this gives the board (without needing a Mac):
//   * cookies-on-login.json — every cookie set during the signin POST, with
//     Domain / Path / SameSite / Secure / HttpOnly / Expires.
//   * cookies-after-newtab.json — same context, second tab, navigated to
//     /dashboard. Did the cookies survive a same-context tab open?
//   * cookies-after-restart.json — fresh context with ONLY persistent
//     cookies imported (real-browser cold-restart semantics).
//   * a verdict for each step.
//
// What this CANNOT tell the board:
//   * how real macOS Chrome's storage partitioning / third-party cookie
//     defaults / background eviction behave. Per the directive, real-Chrome
//     verification is still a board / human task.
//
// Run:
//   ENV_FILE=.env.local TARGET_URL=https://groundwork.cafe \
//     npx tsx scripts/tim3330-cookie-attr-audit.mjs
//
// Cleanup is best-effort (try/finally on the synthetic user delete).

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(process.env.ENV_FILE || ".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      const k = l.slice(0, idx).trim();
      let v = l.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return [k, v];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_NEW_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET = process.env.TARGET_URL ?? "https://groundwork.cafe";
const HOST = new URL(TARGET).host;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.error("missing supabase env (need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_NEW_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(2);
}

const REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const tag = randomBytes(4).toString("hex");
const email = `tim3330-${tag}@simpler.coffee`;
const password = `TIM3330-${tag}-x9!Q`;
const OUT_DIR = "out/tim3330";
mkdirSync(OUT_DIR, { recursive: true });

function isAuthCookie(name) {
  return /^(sb-|gw_)/i.test(name);
}

function relevant(cookies) {
  return cookies
    .filter((c) => isAuthCookie(c.name))
    .map((c) => ({
      name: c.name,
      domain: c.domain,
      path: c.path,
      sameSite: c.sameSite,
      secure: c.secure,
      httpOnly: c.httpOnly,
      expires: c.expires,          // -1 = session cookie
      expiresHuman:
        c.expires === -1 || c.expires === undefined
          ? "<session>"
          : new Date(c.expires * 1000).toISOString(),
      isSession: c.expires === -1 || c.expires === undefined,
      valueLength: c.value?.length ?? 0,
    }));
}

// Synthetic user with Pro subscription so /dashboard renders normally.
console.log(`[setup] creating ${email}…`);
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { onboarding_completed: true, signup_source: "tim3330-audit" },
});
if (createErr) {
  console.error("createUser failed:", createErr);
  process.exit(1);
}
const userId = created.user.id;
console.log("[setup] user id:", userId);

// upsert the public users row + flag subscription active so the dashboard isn't gated
await admin.from("users").upsert({
  id: userId,
  email,
  onboarding_completed: true,
  subscription_status: "active",
  subscription_tier: "pro",
});

const report = { TARGET, email, userId, steps: [] };

try {
  const browser = await chromium.launch();

  // ── STEP 1 ─ login on a fresh context, capture Set-Cookie attrs ─────────
  const ctx1 = await browser.newContext();
  const page1 = await ctx1.newPage();

  // collect every Set-Cookie header on every response (raw, server-truth)
  const setCookieLog = [];
  page1.on("response", async (resp) => {
    if (!resp.url().includes(HOST)) return;
    try {
      const sc = await resp.headersArray();
      for (const h of sc) {
        if (h.name.toLowerCase() === "set-cookie") {
          setCookieLog.push({
            url: resp.url(),
            status: resp.status(),
            header: h.value,
          });
        }
      }
    } catch {}
  });

  await page1.goto(`${TARGET}/login`, { waitUntil: "domcontentloaded" });
  // accept the cookie banner if present so it doesn't intercept clicks
  const accept = page1.getByRole("button", { name: /Accept All/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await page1.waitForTimeout(200);
  }
  await page1.locator('input[type="email"]').fill(email);
  await page1.locator('input[type="password"]').fill(password);
  await page1.getByRole("button", { name: /^Sign In$/i }).click();
  // wait for nav off /login OR an error alert
  await page1
    .waitForFunction(
      () =>
        !window.location.pathname.startsWith("/login") ||
        !!document.querySelector('[role="alert"]'),
      { timeout: 20000 },
    )
    .catch(() => {});
  await page1.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page1.screenshot({ path: `${OUT_DIR}/01-post-login.png`, fullPage: false });
  const alert1 = await page1.locator('[role="alert"]').first().textContent().catch(() => null);
  if (alert1) console.log("[step 1] page alert:", alert1);
  const step1Cookies = relevant(await ctx1.cookies());
  const step1Url = page1.url();
  report.steps.push({
    step: 1,
    label: "Initial signin",
    url: step1Url,
    reachedDashboard: step1Url.includes("/dashboard"),
    error: alert1 ?? null,
    cookies: step1Cookies,
    setCookieHeaders: setCookieLog
      .filter((e) => /\/login|\/dashboard|\/auth|\/api/.test(new URL(e.url).pathname))
      .slice(0, 20),
  });
  writeFileSync(`${OUT_DIR}/cookies-on-login.json`, JSON.stringify(step1Cookies, null, 2));

  // ── STEP 2 ─ same context, NEW tab, navigate to /dashboard ──────────────
  // This is what real Chrome does on "close one tab, open another" — the
  // browser process keeps the cookie jar, only the page DOM is torn down.
  const page2 = await ctx1.newPage();
  await page2.goto(`${TARGET}/dashboard`, { waitUntil: "domcontentloaded" });
  await page2.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page2.screenshot({ path: `${OUT_DIR}/02-newtab-dashboard.png` });
  const step2Url = page2.url();
  const step2Cookies = relevant(await ctx1.cookies());
  report.steps.push({
    step: 2,
    label: "Same context, new tab → /dashboard",
    url: step2Url,
    reachedDashboard: step2Url.includes("/dashboard"),
    bouncedToLogin: step2Url.includes("/login"),
    cookies: step2Cookies,
  });

  // ── STEP 3 ─ snapshot cookies, close context, re-open with ONLY
  //              persistent cookies (real cold-restart semantics) ──────────
  const allCookies = await ctx1.cookies();
  const persistent = allCookies.filter((c) => c.expires && c.expires > 0);
  const sessionScope = allCookies
    .filter((c) => !(c.expires && c.expires > 0))
    .map((c) => ({ name: c.name, domain: c.domain }));
  console.log(
    `[step 3] persistent=${persistent.length}/${allCookies.length}, session-scope dropped:`,
    sessionScope.map((c) => c.name),
  );
  await ctx1.close();

  const ctx2 = await browser.newContext();
  await ctx2.addCookies(persistent);
  const page3 = await ctx2.newPage();
  await page3.goto(`${TARGET}/dashboard`, { waitUntil: "domcontentloaded" });
  await page3.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page3.screenshot({ path: `${OUT_DIR}/03-cold-restart-dashboard.png` });
  const step3Url = page3.url();
  const step3Cookies = relevant(await ctx2.cookies());
  report.steps.push({
    step: 3,
    label: "Cold restart (only persistent cookies imported) → /dashboard",
    url: step3Url,
    reachedDashboard: step3Url.includes("/dashboard"),
    bouncedToLogin: step3Url.includes("/login"),
    cookies: step3Cookies,
    persistentCookieCount: persistent.length,
    sessionScopedDropped: sessionScope,
  });

  await browser.close();

  writeFileSync(`${OUT_DIR}/report.json`, JSON.stringify(report, null, 2));
  console.log(`\n[done] report: ${OUT_DIR}/report.json`);
  console.log(`[done] screenshots: ${OUT_DIR}/01-post-login.png, 02-newtab-dashboard.png, 03-cold-restart-dashboard.png`);

  // human-readable verdict line
  const v = report.steps.map((s) => `step${s.step}=${s.reachedDashboard ? "DASH" : "BOUNCED"}`).join(" ");
  console.log(`\nVERDICT: ${v}`);
} finally {
  console.log("[cleanup] removing synthetic user…");
  await admin.auth.admin.deleteUser(userId).catch((e) =>
    console.warn("delete user failed:", e?.message ?? e),
  );
}
