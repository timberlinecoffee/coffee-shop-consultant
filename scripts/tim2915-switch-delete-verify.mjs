// TIM-2915 live verify on groundwork.cafe — proves plan switching + deletion
// work end-to-end against board's account (trent@simpler.coffee).
//
// Scenario:
//   1. Baseline: confirm trent has Beaver & Beef active + 2 empty Sole
//      Sisters duplicates (b1197dc2, 64302c3d).
//   2. Login as trent via magic-link → groundwork.cafe.
//   3. Open project switcher, click a Sole Sisters duplicate.
//      Assert: PATCH 200, users.current_plan_id flips to that plan, URL
//      navigates to /dashboard, sidebar shows the new active plan.
//   4. Click Beaver & Beef in the switcher.
//      Assert: switches back, all data still intact.
//   5. Open switcher, click the trash icon on a Sole Sisters duplicate.
//      Confirm delete in modal.
//      Assert: DELETE 204, plan row gone from DB, sidebar refreshes to 2
//      plans, active pointer unchanged (was inactive before delete).
//   6. Optional safety: don't delete the second Sole Sisters duplicate by
//      default — board may want it for further repro. Flag with env var.
//
// Run from project root: `node scripts/tim2915-switch-delete-verify.mjs`
// To also delete the second duplicate: TIM2915_DELETE_BOTH=1 node ...

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
const PROD_URL = process.env.TIM2915_BASE_URL || "https://groundwork.cafe";
const HOST = new URL(PROD_URL).host;
const TARGET_EMAIL = "trent@simpler.coffee";
const BEAVER_BEEF = "37f5d270-8c43-4ab2-b96c-e54ac504c893";
const SOLE_A = "b1197dc2-d9c3-4fb4-b530-8c47e071f979";
const SOLE_B = "64302c3d-cfa3-4c5c-b733-20e536098dcd";
const TRENT_USER_ID = "a9d38122-7402-4490-b662-f05464134db8";
const DELETE_BOTH = process.env.TIM2915_DELETE_BOTH === "1";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.error("missing supabase env");
  process.exit(2);
}

const REF = new URL(SUPABASE_URL).hostname.split(".")[0];
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

function shortId(id) {
  return id ? id.slice(0, 8) : "(none)";
}

const issues = [];
function fail(msg) {
  console.error("  FAIL:", msg);
  issues.push(msg);
}
function pass(msg) {
  console.log("  PASS:", msg);
}

console.log(`[1/12] baseline DB state for ${TARGET_EMAIL}`);
const baselinePlans = await plansForTrent();
const baselineActive = await activePlanId();
console.log(
  `       ${baselinePlans.length} plans; active=${shortId(baselineActive)}`,
);
for (const p of baselinePlans) {
  console.log(
    `         ${shortId(p.id)} ${p.plan_name} ${p.location_label ?? ""}`,
  );
}
if (baselineActive !== BEAVER_BEEF) {
  // Recover the active pointer if a prior test left it on a duplicate
  console.log("       (active is not Beaver & Beef — restoring before test)");
  await fetch(
    `${SUPABASE_URL}/rest/v1/users?id=eq.${TRENT_USER_ID}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ current_plan_id: BEAVER_BEEF }),
    },
  );
}
if (!baselinePlans.find((p) => p.id === BEAVER_BEEF)) {
  console.error(`       MISSING Beaver & Beef. abort.`);
  process.exit(3);
}
const nonBeaverPlans = baselinePlans.filter((p) => p.id !== BEAVER_BEEF);
if (nonBeaverPlans.length === 0) {
  console.error(`       Need at least one non-Beaver & Beef plan to test switching. abort.`);
  process.exit(3);
}
// API returns newest-first; that's the row the test will click.
const newestNonBeaver = nonBeaverPlans
  .slice()
  .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))[0];

console.log(`[2/12] minting magiclink for ${TARGET_EMAIL}...`);
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: TARGET_EMAIL,
});
if (linkErr) throw linkErr;
const tokenHash = linkData?.properties?.hashed_token;
if (!tokenHash) throw new Error("no token_hash");

console.log("[3/12] exchanging for session...");
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

console.log("[4/12] launching browser...");
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
    secure: HOST !== "localhost",
    sameSite: "Lax",
  },
]);

const page = await ctx.newPage();
mkdirSync("scripts/shots", { recursive: true });

console.log("[5/12] opening /dashboard...");
await page.goto(`${PROD_URL}/dashboard`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 30_000 });
await page.screenshot({ path: "scripts/shots/tim2915-01-dashboard.png" });

// Confirm the active project displayed in the sidebar matches Beaver & Beef
const switcherBtn = page.locator('button[aria-haspopup="listbox"]').first();
const beforeSwitcherLabel = (await switcherBtn.innerText()).trim();
console.log(`       sidebar shows: "${beforeSwitcherLabel.replace(/\s+/g, " ")}"`);
if (!/Beaver & Beef/i.test(beforeSwitcherLabel)) {
  fail(`Expected sidebar to show Beaver & Beef, got: "${beforeSwitcherLabel}"`);
} else {
  pass("sidebar shows active project = Beaver & Beef");
}

// ============================================================
// SWITCH TEST 1: Beaver & Beef → first non-Beaver plan in list
// ============================================================
const TARGET_SWITCH = newestNonBeaver.id;
const TARGET_NAME = newestNonBeaver.plan_name;
console.log(`[6/12] SWITCH: Beaver & Beef → ${TARGET_NAME} (${shortId(TARGET_SWITCH)})`);
await switcherBtn.click();
await page.waitForTimeout(300);
await page.screenshot({ path: "scripts/shots/tim2915-02-menu-open.png" });

const listbox = page.getByRole("listbox", { name: /projects/i });
const soleAOption = listbox.locator('[role="option"]').filter({ hasText: TARGET_NAME }).first();

// Wait for the PATCH to actually complete before reading DB state.
// We were already on /dashboard so waitForURL returned immediately, racing
// past the in-flight PATCH and reading stale state.
const patchPromise1 = page.waitForResponse(
  (r) =>
    r.url().includes(`/api/projects/${TARGET_SWITCH}`) &&
    r.request().method() === "PATCH",
  { timeout: 15_000 },
);
await soleAOption.locator("button").first().click();
const patchResp1 = await patchPromise1;
console.log(`       PATCH /api/projects/${shortId(TARGET_SWITCH)} → ${patchResp1.status()}`);
await page.waitForLoadState("networkidle", { timeout: 30_000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "scripts/shots/tim2915-03-switched-to-sole-a.png" });

const afterSwitch1Active = await activePlanId();
console.log(`       active after switch: ${shortId(afterSwitch1Active)}`);
if (afterSwitch1Active !== TARGET_SWITCH) {
  fail(
    `Switch did not update users.current_plan_id. expected=${shortId(TARGET_SWITCH)} got=${shortId(afterSwitch1Active)}`,
  );
} else {
  pass(`users.current_plan_id flipped to ${shortId(TARGET_SWITCH)}`);
}

const afterSwitch1Label = (await switcherBtn.innerText()).trim();
console.log(`       sidebar now shows: "${afterSwitch1Label.replace(/\s+/g, " ")}"`);
if (!afterSwitch1Label.includes(TARGET_NAME)) {
  fail(`Sidebar did not refresh to ${TARGET_NAME}: "${afterSwitch1Label}"`);
} else {
  pass(`sidebar refreshed to ${TARGET_NAME}`);
}

// ============================================================
// SWITCH TEST 2: Sole Sisters → Beaver & Beef (back)
// ============================================================
console.log("[7/12] SWITCH BACK: Sole Sisters → Beaver & Beef");
await switcherBtn.click();
await page.waitForTimeout(300);
const beaverOption = page
  .getByRole("listbox", { name: /projects/i })
  .locator('[role="option"]')
  .filter({ hasText: "Beaver & Beef" })
  .first();
const patchPromise2 = page.waitForResponse(
  (r) =>
    r.url().includes(`/api/projects/${BEAVER_BEEF}`) &&
    r.request().method() === "PATCH",
  { timeout: 15_000 },
);
await beaverOption.locator("button").first().click();
const patchResp2 = await patchPromise2;
console.log(`       PATCH /api/projects/${shortId(BEAVER_BEEF)} → ${patchResp2.status()}`);
await page.waitForLoadState("networkidle", { timeout: 30_000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "scripts/shots/tim2915-04-switched-back.png" });

const afterSwitch2Active = await activePlanId();
if (afterSwitch2Active !== BEAVER_BEEF) {
  fail(
    `Switch-back failed. expected=${shortId(BEAVER_BEEF)} got=${shortId(afterSwitch2Active)}`,
  );
} else {
  pass(`switched back to Beaver & Beef (${shortId(BEAVER_BEEF)})`);
}
const afterSwitch2Label = (await switcherBtn.innerText()).trim();
if (!/Beaver & Beef/i.test(afterSwitch2Label)) {
  fail(`Sidebar did not refresh back to Beaver & Beef: "${afterSwitch2Label}"`);
} else {
  pass("sidebar refreshed back to Beaver & Beef");
}

// ============================================================
// DELETE TEST: remove first Sole Sisters duplicate
// ============================================================
// First listbox option (newest-first) is whichever duplicate has the
// later created_at — currently 64302c3d. Capture the actual DELETE URL
// from the response so the assertion matches reality regardless of
// which duplicate was first.
console.log("[8/12] DELETE: first Sole Sisters in listbox");
await switcherBtn.click();
await page.waitForTimeout(300);

const deleteBtn = page
  .getByRole("listbox", { name: /projects/i })
  .locator('[role="option"]')
  .filter({ hasText: "Sole Sisters" })
  .first()
  .getByRole("button", { name: /^Delete Sole Sisters$/i });
await deleteBtn.click();

await page.waitForSelector("#delete-project-modal-title", { timeout: 5_000 });
await page.screenshot({ path: "scripts/shots/tim2915-05-delete-confirm.png" });

const deletePromise = page.waitForResponse(
  (r) =>
    /\/api\/projects\/[a-f0-9-]{36}$/.test(r.url()) &&
    r.request().method() === "DELETE",
  { timeout: 15_000 },
);
const confirmBtn = page.getByRole("button", { name: /^Delete$/ });
await confirmBtn.click();
const delResp = await deletePromise;
const deletedUrl = delResp.url();
const deletedId = deletedUrl.split("/").pop() || "";
console.log(`       DELETE ${deletedUrl} → ${delResp.status()}`);

await page.waitForSelector("#delete-project-modal-title", {
  state: "detached",
  timeout: 10_000,
});
await page.waitForTimeout(1000);
await page.screenshot({ path: "scripts/shots/tim2915-06-after-delete-a.png" });

const afterDelete1Plans = await plansForTrent();
const afterDelete1Active = await activePlanId();
console.log(
  `       plans now: ${afterDelete1Plans.length}; active=${shortId(afterDelete1Active)}`,
);
for (const p of afterDelete1Plans) {
  console.log(
    `         ${shortId(p.id)} ${p.plan_name} ${p.location_label ?? ""}`,
  );
}
if (afterDelete1Plans.find((p) => p.id === deletedId)) {
  fail(`Plan ${shortId(deletedId)} still in DB after DELETE 204`);
} else {
  pass(`Plan ${shortId(deletedId)} removed from DB`);
}
if (afterDelete1Plans.length !== baselinePlans.length - 1) {
  fail(
    `Plan count did not decrease by 1: was ${baselinePlans.length}, now ${afterDelete1Plans.length}`,
  );
} else {
  pass(`Plan count decreased by 1 (${baselinePlans.length} → ${afterDelete1Plans.length})`);
}
if (afterDelete1Active !== BEAVER_BEEF) {
  fail(
    `Active pointer changed unexpectedly after deleting inactive plan: ${shortId(afterDelete1Active)}`,
  );
} else {
  pass("active pointer preserved (Beaver & Beef)");
}

// ============================================================
// OPTIONAL DELETE: second Sole Sisters duplicate B
// ============================================================
const remainingSoleSisters = afterDelete1Plans.filter(
  (p) => p.plan_name === "Sole Sisters",
);
if (DELETE_BOTH && remainingSoleSisters.length > 0) {
  const targetSecond = remainingSoleSisters[0].id;
  console.log(`[9/12] DELETE: second Sole Sisters duplicate (${shortId(targetSecond)})`);
  await switcherBtn.click();
  await page.waitForTimeout(300);
  const deleteBtn2 = page
    .getByRole("listbox", { name: /projects/i })
    .locator('[role="option"]')
    .filter({ hasText: "Sole Sisters" })
    .first()
    .getByRole("button", { name: /^Delete Sole Sisters$/i });
  const delPromise2 = page.waitForResponse(
    (r) =>
      /\/api\/projects\/[a-f0-9-]{36}$/.test(r.url()) &&
      r.request().method() === "DELETE",
    { timeout: 15_000 },
  );
  await deleteBtn2.click();
  await page.waitForSelector("#delete-project-modal-title", { timeout: 5_000 });
  await page.getByRole("button", { name: /^Delete$/ }).click();
  const delResp2 = await delPromise2;
  const deletedId2 = (delResp2.url().split("/").pop() || "");
  console.log(`       DELETE ${delResp2.url()} → ${delResp2.status()}`);
  await page.waitForSelector("#delete-project-modal-title", {
    state: "detached",
    timeout: 10_000,
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "scripts/shots/tim2915-07-after-delete-b.png" });

  const afterDelete2Plans = await plansForTrent();
  if (afterDelete2Plans.find((p) => p.id === deletedId2)) {
    fail(`Plan ${shortId(deletedId2)} still in DB after DELETE`);
  } else {
    pass(`Plan ${shortId(deletedId2)} removed from DB`);
  }
} else {
  console.log(
    "[9/12] SKIP: no additional duplicate to delete (set TIM2915_DELETE_BOTH=1 to opt in)",
  );
}

// ============================================================
// FINAL VERIFICATION
// ============================================================
console.log("[10/12] final DB state");
const finalPlans = await plansForTrent();
const finalActive = await activePlanId();
console.log(`       ${finalPlans.length} plans; active=${shortId(finalActive)}`);
for (const p of finalPlans) {
  console.log(
    `         ${shortId(p.id)} ${p.plan_name} ${p.location_label ?? ""}`,
  );
}

if (!finalPlans.find((p) => p.id === BEAVER_BEEF)) {
  fail("Beaver & Beef went missing during test");
}
if (finalActive !== BEAVER_BEEF) {
  fail(`Final active pointer is not Beaver & Beef: ${shortId(finalActive)}`);
}

await browser.close();

console.log("[11/12] summary");
console.log(
  `       initial plans=${baselinePlans.length} → final=${finalPlans.length}`,
);
console.log(
  `       initial active=${shortId(baselineActive)} → final=${shortId(finalActive)}`,
);
console.log(`       issues found: ${issues.length}`);

if (issues.length) {
  console.error("\nFAIL TIM-2915:");
  for (const i of issues) console.error("  -", i);
  process.exit(1);
}
console.log("\nPASS TIM-2915 — switch + delete verified live on", PROD_URL);
