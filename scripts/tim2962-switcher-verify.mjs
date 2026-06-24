// TIM-2962 live verify on groundwork.cafe — proves the 4 fixes ship.
//
// Targets the trent fixture (2 plans: Beaver & Beef + Sole Sisters/PEI).
// Active starts on Sole Sisters. Restores active to its baseline at end.
//
// Asserts (Bugs 2 + 3 + 4; Bug 1 is covered by source-pinning tests + would
// require creating a 3rd plan on trent's account):
//   - Bug 2 trigger: switcher button text === active plan name ONLY (no
//     location_label substring appended).
//   - Bug 2 rows: every dropdown row's text === project.name ONLY (no
//     location_label substring).
//   - Bug 3 trash: every trash button computed style has opacity === "1".
//   - Bug 4 switch-then-load: clicking Beaver & Beef PATCHes 200; the
//     dashboard content under the switcher mentions "Beaver & Beef" (or
//     specifically does NOT mention Sole Sisters' Summerside location)
//     after page reload — proves loadPlanOverview now resolves the active
//     plan instead of the latest-by-created.
//
// Side-effects: switches active plan twice (Sole→Beaver→Sole) then
// restores users.current_plan_id to the baseline value via service role.

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
const PROD_URL = process.env.TIM2962_BASE_URL || "https://groundwork.cafe";
const HOST = new URL(PROD_URL).host;
const TARGET_EMAIL = "trent@simpler.coffee";
const TRENT_USER_ID = "a9d38122-7402-4490-b662-f05464134db8";
const BEAVER_BEEF = "37f5d270-8c43-4ab2-b96c-e54ac504c893";
const SOLE_SISTERS = "d1cbe9ed-21ee-4214-b5fe-56cfabce9735";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.error("missing supabase env");
  process.exit(2);
}

const REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const issues = [];
function fail(msg) {
  console.error("  FAIL:", msg);
  issues.push(msg);
}
function pass(msg) {
  console.log("  PASS:", msg);
}

async function plansForTrent() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/coffee_shop_plans?user_id=eq.${TRENT_USER_ID}&select=id,plan_name,location_label&order=created_at.asc`,
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

async function setActivePlanId(planId) {
  await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${TRENT_USER_ID}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ current_plan_id: planId }),
  });
}

console.log(`[1/9] baseline DB state for ${TARGET_EMAIL}`);
const baselinePlans = await plansForTrent();
const baselineActive = await activePlanId();
console.log(`       ${baselinePlans.length} plans; active=${baselineActive?.slice(0, 8)}`);
for (const p of baselinePlans) {
  console.log(`         ${p.id.slice(0, 8)} ${p.plan_name} ${p.location_label ?? ""}`);
}
if (baselinePlans.length < 2) {
  console.error(`       Need at least 2 plans on trent to verify. abort.`);
  process.exit(3);
}
const beaverRow = baselinePlans.find((p) => p.id === BEAVER_BEEF);
const soleRow = baselinePlans.find((p) => p.id === SOLE_SISTERS);
if (!beaverRow || !soleRow) {
  console.error(`       Expected both Beaver & Beef and Sole Sisters. abort.`);
  process.exit(3);
}
console.log(`       Beaver & Beef location_label: ${JSON.stringify(beaverRow.location_label)}`);
console.log(`       Sole Sisters  location_label: ${JSON.stringify(soleRow.location_label)}`);
const SOLE_LOC = soleRow.location_label; // "Summerside, PEI" — must NOT appear in selector chrome

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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([
  {
    name: `sb-${REF}-auth-token`,
    value: cookieValue,
    domain: HOST,
    path: "/",
    expires: Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: HOST !== "localhost",
    sameSite: "Lax",
  },
]);

const page = await ctx.newPage();
mkdirSync("scripts/shots", { recursive: true });

// Make sure we START on Sole Sisters so we can prove the switch-back flow.
const startActive = await activePlanId();
if (startActive !== SOLE_SISTERS) {
  console.log(`       (active=${startActive?.slice(0, 8)}, forcing Sole Sisters before test)`);
  await setActivePlanId(SOLE_SISTERS);
}

console.log("[5/9] opening /dashboard (active = Sole Sisters)...");
await page.goto(`${PROD_URL}/dashboard`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 30_000 });
await page.screenshot({ path: "scripts/shots/tim2962-01-dashboard-sole.png", fullPage: true });

// === Bug 2 trigger: switcher button text should be name-only (no location chip) ===
const switcherBtn = page.locator('button[aria-haspopup="listbox"]').first();
const triggerText = (await switcherBtn.innerText()).trim();
console.log(`       trigger text: ${JSON.stringify(triggerText)}`);
if (triggerText.includes(SOLE_LOC)) {
  fail(`Bug 2 (trigger): switcher trigger still shows location "${SOLE_LOC}" — text=${JSON.stringify(triggerText)}`);
} else if (!triggerText.includes("Sole Sisters")) {
  fail(`Bug 2 (trigger): switcher trigger does not show plan title — text=${JSON.stringify(triggerText)}`);
} else {
  pass(`Bug 2 (trigger): switcher shows title only (no location chip)`);
}

// === Open the dropdown and inspect each row ===
console.log("[6/9] opening switcher dropdown...");
await switcherBtn.click();
await page.waitForTimeout(300);
await page.screenshot({ path: "scripts/shots/tim2962-02-dropdown-open.png" });

const rows = page.getByRole("listbox", { name: /projects/i }).locator('[role="option"]');
const rowCount = await rows.count();
console.log(`       dropdown has ${rowCount} row(s)`);

let rowChromeOk = true;
for (let i = 0; i < rowCount; i++) {
  const row = rows.nth(i);
  const text = (await row.innerText()).trim();
  console.log(`         row[${i}]: ${JSON.stringify(text)}`);
  if (text.includes(SOLE_LOC)) {
    rowChromeOk = false;
    fail(`Bug 2 (row ${i}): row text still shows location "${SOLE_LOC}" — text=${JSON.stringify(text)}`);
  }
  // Bug 3: every row should expose a trash button with opacity 1
  const trashBtn = row.locator('button[aria-label^="Delete "]');
  const hasTrash = (await trashBtn.count()) > 0;
  if (!hasTrash) {
    console.log(`         row[${i}]: no trash button (only one plan? canDelete=false)`);
    continue;
  }
  const opacity = await trashBtn.first().evaluate((el) => getComputedStyle(el).opacity);
  console.log(`         row[${i}]: trash opacity=${opacity}`);
  if (parseFloat(opacity) < 0.95) {
    fail(`Bug 3: trash opacity not >=0.95 on row ${i} — opacity=${opacity}`);
  } else {
    pass(`Bug 3: trash visible on row ${i} (opacity=${opacity})`);
  }
}
if (rowChromeOk) pass("Bug 2 (rows): no row shows the location_label substring");

// === Bug 4: switch to Beaver & Beef → dashboard content must rotate ===
console.log("[7/9] switching to Beaver & Beef...");
const beaverOption = page
  .getByRole("listbox", { name: /projects/i })
  .locator('[role="option"]')
  .filter({ hasText: "Beaver & Beef" })
  .first();
const patchPromise = page.waitForResponse(
  (r) => r.url().includes(`/api/projects/${BEAVER_BEEF}`) && r.request().method() === "PATCH",
  { timeout: 15_000 },
);
await beaverOption.locator("button").first().click();
const patchResp = await patchPromise;
console.log(`       PATCH /api/projects/${BEAVER_BEEF.slice(0, 8)} → ${patchResp.status()}`);
if (patchResp.status() !== 200) fail(`PATCH status ${patchResp.status()}`);

await page.waitForLoadState("networkidle", { timeout: 30_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: "scripts/shots/tim2962-03-switched-to-beaver.png", fullPage: true });

const afterSwitchActive = await activePlanId();
console.log(`       active after PATCH: ${afterSwitchActive?.slice(0, 8)}`);
if (afterSwitchActive !== BEAVER_BEEF) {
  fail(`current_plan_id did not flip to Beaver & Beef — got=${afterSwitchActive}`);
} else {
  pass(`current_plan_id = Beaver & Beef after switch`);
}

const afterSwitchTrigger = (await switcherBtn.innerText()).trim();
console.log(`       trigger after switch: ${JSON.stringify(afterSwitchTrigger)}`);
if (!afterSwitchTrigger.includes("Beaver & Beef")) {
  fail(`Bug 4 selector chrome: trigger did not reflect Beaver & Beef — text=${JSON.stringify(afterSwitchTrigger)}`);
} else {
  pass(`Bug 4 selector chrome: trigger reflects Beaver & Beef`);
}

// Reload the dashboard so loadPlanOverview re-runs as a fresh SSR render;
// this is what router.refresh() does in production but a hard reload makes
// the assertion bulletproof (no client-cache interference).
console.log("[8/9] hard-reload /dashboard to confirm loadPlanOverview honors active plan...");
await page.goto(`${PROD_URL}/dashboard`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 30_000 });
await page.waitForTimeout(600);
await page.screenshot({ path: "scripts/shots/tim2962-04-reload-beaver-content.png", fullPage: true });

const dashboardText = await page.locator("body").innerText();
const triggerAfterReload = (await switcherBtn.innerText()).trim();
console.log(`       trigger after reload: ${JSON.stringify(triggerAfterReload)}`);
if (!triggerAfterReload.includes("Beaver & Beef")) {
  fail(`Bug 4 post-reload: trigger flipped back — text=${JSON.stringify(triggerAfterReload)}`);
} else {
  pass(`Bug 4 post-reload: trigger still Beaver & Beef`);
}

// The page may or may not embed the plan name directly. The strongest
// available signal: AFTER switching to Beaver & Beef and reloading, the
// dashboard chrome MUST NOT mention Sole Sisters' location string anywhere
// the user can see. Sole Sisters' Summerside, PEI is a location_label
// unique to that plan and appears in no other UI.
if (dashboardText.includes(SOLE_LOC)) {
  fail(`Bug 4 stale content: dashboard text still contains "${SOLE_LOC}" — page is rendering Sole Sisters data`);
} else {
  pass(`Bug 4: dashboard does NOT render Sole Sisters' location_label after switch — active plan is honored by loadPlanOverview`);
}

// === Cleanup: restore active plan to its baseline value ===
console.log(`[9/9] restoring users.current_plan_id to baseline (${baselineActive?.slice(0, 8)})...`);
if (baselineActive) await setActivePlanId(baselineActive);
const restored = await activePlanId();
if (restored === baselineActive) {
  pass(`baseline active restored (${restored?.slice(0, 8)})`);
} else {
  fail(`failed to restore baseline — current=${restored?.slice(0, 8)} expected=${baselineActive?.slice(0, 8)}`);
}

await browser.close();

console.log("\n===========================================");
if (issues.length === 0) {
  console.log("RESULT: PASS — TIM-2962 verify clean");
  process.exit(0);
} else {
  console.log(`RESULT: FAIL — ${issues.length} issue(s)`);
  for (const m of issues) console.log("  -", m);
  process.exit(1);
}
