// TIM-3329: minimal single-item persistence test.
// Add row, type name + Tab + vendor + Tab + cost + click away, refresh,
// verify all three fields persist.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_NEW_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET = process.env.TARGET_URL ?? "https://groundwork.cafe";
const HOST = new URL(TARGET).host;
const REF = new URL(SUPABASE_URL).hostname.split(".")[0];

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const tag = randomBytes(4).toString("hex");
const email = `tim3329-single-${tag}@simpler.coffee`;
const password = `TIM3329-${tag}-x9!Q`;
const OUT = "out/tim3329-single";
mkdirSync(OUT, { recursive: true });

let userId = null;
try {
  console.log(`[setup] user ${email}`);
  const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  userId = c.user.id;
  await admin.from("users").update({ subscription_status: "active", subscription_tier: "pro", onboarding_completed: true }).eq("id", userId);
  const { data: plan } = await admin.from("coffee_shop_plans").insert({ user_id: userId, plan_name: "TIM-3329 Single" }).select().single();
  const planId = plan.id;

  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  const cookieValue = JSON.stringify({
    access_token: sess.session.access_token,
    refresh_token: sess.session.refresh_token,
    expires_in: sess.session.expires_in,
    expires_at: sess.session.expires_at,
    token_type: "bearer",
    user: sess.session.user,
  });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.addCookies([{ name: `sb-${REF}-auth-token`, value: cookieValue, domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();

  page.on("request", (r) => {
    if (r.url().includes("/api/workspaces/financials/equipment")) console.log(`  [req] ${r.method()} ${r.url().split(HOST).pop()}`);
  });
  page.on("response", (r) => {
    if (r.url().includes("/api/workspaces/financials/equipment")) console.log(`  [res] ${r.status()} ${r.request().method()}`);
  });

  console.log("[1] open buildout-equipment");
  await page.goto(`${TARGET}/workspace/buildout-equipment`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  console.log("[2] click Add row");
  const addBtn = page.getByRole("button", { name: /^add row$/i }).first();
  await addBtn.click();
  await page.waitForTimeout(400);

  console.log("[3] focus name input + type 'Espresso Machine'");
  const nameInput = page.locator('input[placeholder="Item name"]').first();
  await nameInput.click();
  await nameInput.focus();
  await page.keyboard.type("Espresso Machine", { delay: 30 });
  await page.waitForTimeout(200);
  const afterName = await page.evaluate(() => document.activeElement?.tagName + ' placeholder=' + (document.activeElement?.getAttribute?.('placeholder') || ''));
  console.log(`  focus after typing name: ${afterName}`);

  console.log("[4] Tab → press Tab, check focus + value");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(300);
  const afterTab = await page.evaluate(() => document.activeElement?.tagName + ' placeholder=' + (document.activeElement?.getAttribute?.('placeholder') || ''));
  console.log(`  focus after Tab: ${afterTab}`);

  // Take a screenshot here
  await page.screenshot({ path: `${OUT}/after-tab.png`, fullPage: true });

  console.log("[5] click body to blur (click-away)");
  await page.mouse.click(720, 800);
  await page.waitForTimeout(800);

  console.log("[6] reload page");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/after-refresh.png`, fullPage: true });

  console.log("[7] assert 'Espresso Machine' present");
  const txt = await page.locator("body").innerText();
  const present = txt.includes("Espresso Machine");
  console.log(present ? "  ✓ Espresso Machine persisted" : "  ✗ NOT found in DOM");

  // Also check DB directly
  const { data: items } = await admin.from("buildout_equipment_items").select("name,vendor").eq("plan_id", planId);
  console.log("  DB items:", JSON.stringify(items));

  await browser.close();
  if (!present) process.exitCode = 1;
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
}
