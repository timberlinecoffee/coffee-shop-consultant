// TIM-2865 live verify on groundwork.cafe — proves the double-submit
// guard + no-silent-switch fix shipped at commit 7738167.
//
// Scenario:
//   1. Log in as trent@simpler.coffee (board fixture). Active project after
//      the TIM-2865 recovery PATCH is Beaver & Beef.
//   2. Open the Add Project modal from the sidebar.
//   3. Fill in a unique throwaway name and location.
//   4. Fire two near-simultaneous form-submits (mimics the rage-click that
//      caused the duplicates on TIM-2854).
//   5. Assert:
//        - Modal switches to the "Project Created" success state.
//        - Exactly ONE new row was inserted (server-side dedup caught the
//          second POST, OR client ref guard blocked it).
//        - users.current_plan_id is still Beaver & Beef (no silent switch).
//   6. Click "Stay Here" — assert no navigation/switch.
//   7. Cleanup: delete the throwaway project.
//
// Run from project root: `node scripts/tim2865-double-submit-verify.mjs`

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";

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
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_URL = "https://groundwork.cafe";
const HOST = new URL(PROD_URL).host;
const TARGET_EMAIL = "trent@simpler.coffee";
const BEAVER_BEEF = "37f5d270-8c43-4ab2-b96c-e54ac504c893";
const TRENT_USER_ID = "a9d38122-7402-4490-b662-f05464134db8";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.error("missing supabase env");
  process.exit(2);
}

const REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const STAMP = Date.now().toString(36).slice(-6);
const TEST_NAME = `TIM-2865 Verify ${STAMP}`;
const TEST_LOC = `Verify ${STAMP}`;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function plansForTrent() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/coffee_shop_plans?user_id=eq.${TRENT_USER_ID}&select=id,plan_name,location_label,created_at&order=created_at.asc`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    },
  );
  return r.json();
}

async function activePlanId() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/users?id=eq.${TRENT_USER_ID}&select=current_plan_id`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    },
  );
  const d = await r.json();
  return d[0]?.current_plan_id ?? null;
}

console.log(`[1/9] baseline DB state for ${TARGET_EMAIL}`);
const baselinePlans = await plansForTrent();
const baselineActive = await activePlanId();
console.log(`     ${baselinePlans.length} plans; active=${baselineActive.slice(0, 8)}`);
if (baselineActive !== BEAVER_BEEF) {
  console.error(`     UNEXPECTED: active is not Beaver & Beef. abort.`);
  process.exit(3);
}

console.log(`[2/9] minting magiclink for ${TARGET_EMAIL}...`);
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: TARGET_EMAIL,
});
if (linkErr) throw linkErr;
const tokenHash = linkData?.properties?.hashed_token;
if (!tokenHash) throw new Error("no token_hash");

console.log("[3/9] exchanging for session...");
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { data: sessData, error: sessErr } = await anon.auth.verifyOtp({
  token_hash: tokenHash,
  type: "magiclink",
});
if (sessErr) throw sessErr;
const session = sessData.session;
if (!session) throw new Error("no session");

const cookieValue = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  token_type: "bearer",
  user: session.user,
});

console.log("[4/9] launching browser...");
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
await ctx.addCookies([
  {
    name: `sb-${REF}-auth-token`,
    value: cookieValue,
    domain: HOST,
    path: "/",
    expires: Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  },
]);

const page = await ctx.newPage();
mkdirSync("scripts/shots", { recursive: true });

console.log("[5/9] opening /dashboard...");
await page.goto(`${PROD_URL}/dashboard`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 30_000 });

console.log("[6/9] opening project switcher menu + Add Project modal...");
// Sidebar project switcher button: aria-haspopup="listbox", contains active project name
await page.locator('button[aria-haspopup="listbox"]').first().click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: /add project/i }).click();
await page.waitForSelector('#add-project-name', { timeout: 5_000 });

await page.fill('#add-project-name', TEST_NAME);
await page.fill('#add-project-location', TEST_LOC);
await page.screenshot({ path: 'scripts/shots/tim2865-modal-filled.png' });

console.log("[7/9] firing two synchronous submits in same JS turn (rage-click sim)...");
// Track every POST to /api/projects so we can prove the server received only
// one (or both, dedup wins) — the real test is the DB row count, but this
// is useful for diagnosis.
let postCount = 0;
page.on('request', (req) => {
  if (req.url().includes('/api/projects') && req.method() === 'POST') postCount++;
});

// Dispatch two click events on the submit button in the SAME JS event loop
// tick. This is exactly the rage-click pattern: React has not yet processed
// the first click's state update when the second click fires. The
// submittingRef synchronous guard MUST block the second handler before it
// reaches fetch().
await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button[type="submit"]'));
  const btn = buttons.find((b) => /create project/i.test(b.textContent || ''));
  if (!btn) throw new Error('Create Project button not found');
  btn.click();
  btn.click();
});

console.log("[8/9] waiting for success state...");
await page.waitForSelector('text=Project Created', { timeout: 15_000 });
await page.screenshot({ path: 'scripts/shots/tim2865-success-state.png' });

// Verify success-state buttons present
const stayBtn = page.getByRole('button', { name: /^stay here$/i });
const openBtn = page.getByRole('button', { name: /^open project$/i });
if (!(await stayBtn.isVisible())) throw new Error('Stay Here button missing');
if (!(await openBtn.isVisible())) throw new Error('Open Project button missing');

console.log("[9/9] verifying DB state...");
await page.waitForTimeout(1500); // give any second POST time to land (it shouldn't)
const afterPlans = await plansForTrent();
const afterActive = await activePlanId();
const newPlans = afterPlans.filter(
  (p) => p.plan_name === TEST_NAME && p.location_label === TEST_LOC,
);

console.log(`     plans before: ${baselinePlans.length}`);
console.log(`     plans after:  ${afterPlans.length}`);
console.log(`     new plans matching TEST_NAME: ${newPlans.length}`);
console.log(`     active before: ${baselineActive.slice(0, 8)}`);
console.log(`     active after:  ${afterActive.slice(0, 8)}`);
console.log(`     POST /api/projects requests observed: ${postCount}`);

const issues = [];
if (newPlans.length !== 1) {
  issues.push(`Expected exactly 1 new plan, got ${newPlans.length}`);
}
if (afterActive !== BEAVER_BEEF) {
  issues.push(`Active project silently changed: ${baselineActive.slice(0,8)} → ${afterActive.slice(0,8)}`);
}

// Click Stay Here, confirm modal closes and active unchanged
await stayBtn.click();
await page.waitForTimeout(800);
const finalActive = await activePlanId();
if (finalActive !== BEAVER_BEEF) {
  issues.push(`Active project changed after 'Stay Here': ${finalActive.slice(0,8)}`);
}

// Cleanup: delete the test project
for (const p of newPlans) {
  await fetch(`${SUPABASE_URL}/rest/v1/coffee_shop_plans?id=eq.${p.id}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
  });
}
console.log(`     cleaned up ${newPlans.length} test plan(s)`);

await browser.close();

if (issues.length) {
  console.error('\nFAIL:');
  for (const i of issues) console.error('  -', i);
  process.exit(1);
}
console.log('\nPASS — TIM-2865 fix verified live on groundwork.cafe @ 7738167');
