#!/usr/bin/env node
// TIM-3404: Capture 5 prod evidence screenshots for TIM-3370 scorecard grid.
// Target: groundwork.cafe (production, commit 49286e46).
// Pattern: cookie-injection auth (TIM-2902), synth Pro user, service-role seed.
//
// Shots:
//   S1 — empty grid: 0 competencies, 0 candidates, Add CTAs visible
//   S2 — populated: 3 candidates × 4 competencies, scores + multipliers (≠1.0), totals + %
//   S3 — cell notes popover open over a scored cell
//   S4 — print-media emulation (blank circles for unscored cells)
//   S5 — mobile 375px: per-candidate vertical card layout, ≥2 candidates visible

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

// ── env ──────────────────────────────────────────────────────────────────────

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
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_URL = "https://groundwork.cafe";
const HOST = new URL(PROD_URL).host;
const REF = new URL(SUPABASE_URL).hostname.split(".")[0];

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const OUT = "scripts/screenshots/tim3370";
mkdirSync(OUT, { recursive: true });

function shot(name) {
  return `${OUT}/${name}.png`;
}

// ── Supabase clients ─────────────────────────────────────────────────────────

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── 1. Create synth user ─────────────────────────────────────────────────────

const stamp = "tim3370";
const password = "Test-Password-A1b2C3!";
const email = `${stamp}-${Math.random().toString(36).slice(2, 8)}@test.timberline.local`;

console.log(`[1/8] creating synth user ${email}`);
const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (userErr) throw userErr;
const uid = userRes.user.id;
console.log(`      user id = ${uid}`);

// ── 2. Seed plan ─────────────────────────────────────────────────────────────

console.log("[2/8] seeding coffee_shop_plan");
const { data: planRow, error: planErr } = await admin
  .from("coffee_shop_plans")
  .insert({ user_id: uid, plan_name: "Pinecone Espresso", status: "in_progress" })
  .select("id")
  .single();
if (planErr) throw planErr;
const planId = planRow.id;
console.log(`      plan id = ${planId}`);

await admin.from("users").upsert({
  id: uid,
  email,
  subscription_status: "active",
  subscription_tier: "pro",
  onboarding_completed: true,
  current_plan_id: planId,
});

// ── 3. Seed hiring role + scorecard ──────────────────────────────────────────

console.log("[3/8] seeding hiring role + scorecard");
const { data: roleRow, error: roleErr } = await admin
  .from("hiring_plan_roles")
  .insert({ plan_id: planId, role_title: "Barista", headcount: 3, order_index: 0 })
  .select("id")
  .single();
if (roleErr) throw roleErr;
const roleId = roleRow.id;

const { data: scRow, error: scErr } = await admin
  .from("interview_scorecards")
  .insert({
    plan_id: planId,
    role_id: roleId,
    name: "Barista Scorecard",
    is_default: true,
    order_index: 0,
  })
  .select("id")
  .single();
if (scErr) throw scErr;
const scorecardId = scRow.id;
console.log(`      role_id = ${roleId}, scorecard_id = ${scorecardId}`);

// ── 4. Auth: get session via signInWithPassword → cookie injection ────────────

console.log("[4/8] getting session via signInWithPassword");
const { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
if (signInErr) throw signInErr;
const session = signInData.session;
if (!session) throw new Error("no session after signInWithPassword");

const cookieValue = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  token_type: "bearer",
  user: session.user,
});

// ── 5. Launch Playwright, S1: empty grid ────────────────────────────────────

console.log("[5/8] launching browser for S1 (empty grid)");
const LD = "/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu";
const browser = await chromium.launch({
  env: { ...process.env, LD_LIBRARY_PATH: `${LD}:${process.env.LD_LIBRARY_PATH ?? ""}` },
});

async function makeSession(vpWidth, vpHeight, ua) {
  const ctx = await browser.newContext({
    viewport: { width: vpWidth, height: vpHeight },
    ...(ua ? { userAgent: ua } : {}),
  });
  // Suppress cookie-consent banner
  await ctx.addCookies([
    {
      name: "gw_consent",
      value: encodeURIComponent(JSON.stringify({
        version: 1, analytics: false, marketing: false,
        decidedAt: new Date(Date.now() - 1000).toISOString(),
      })),
      domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax",
    },
    {
      name: `sb-${REF}-auth-token`,
      value: cookieValue,
      domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax",
    },
  ]);
  const page = await ctx.newPage();
  // Suppress Next.js dev overlay (won't show in prod, but safety)
  await page.addInitScript(() => {
    if (typeof window !== "undefined") {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-overlay]{display:none!important}";
      document.head?.appendChild(s);
    }
  });
  return { ctx, page };
}

async function gotoInterview(page) {
  await page.goto(`${PROD_URL}/workspace/hiring`, { waitUntil: "networkidle", timeout: 30000 });
  // Click the "Interview" tab
  await page.getByRole("button", { name: "Interview" }).first().click();
  await page.waitForTimeout(1500); // Wait for scorecard load
}

const desktopUA = undefined; // default
const { ctx: desktopCtx, page } = await makeSession(1440, 900, desktopUA);

// Navigate to hiring → Interview tab (scorecard has no competencies/candidates yet)
await gotoInterview(page);

// Wait for the "Scorecard Grid" section to appear (scorecard_id is set)
await page.waitForSelector('text=Scorecard Grid', { timeout: 10000 });
// Wait for empty state
await page.waitForSelector('text=No competencies or candidates yet', { timeout: 8000 });
await page.waitForTimeout(500);

await page.screenshot({ path: shot("s1-empty-grid"), fullPage: false });
console.log("      [S1] empty grid captured ✓");

// ── 6. Seed competencies, candidates, scores ─────────────────────────────────

console.log("[6/8] seeding competencies, candidates, and scores");

const COMPETENCIES = [
  { label: "Customer Service", multiplier: 1.0, order_index: 0 },
  { label: "Speed", multiplier: 1.5, order_index: 1 },
  { label: "Reliability", multiplier: 1.5, order_index: 2 },
  { label: "Coffee Knowledge", multiplier: 1.0, order_index: 3 },
];

const { data: compRows, error: compErr } = await admin
  .from("scorecard_competencies")
  .insert(COMPETENCIES.map((c) => ({
    scorecard_id: scorecardId,
    plan_id: planId,
    label: c.label,
    multiplier: c.multiplier,
    linked_question_ids: [],
    order_index: c.order_index,
  })))
  .select("id, label, order_index");
if (compErr) throw compErr;
const comps = compRows.sort((a, b) => a.order_index - b.order_index);
console.log(`      ${comps.length} competencies seeded`);

const CANDIDATES = [
  { name: "Alice Johnson", order_index: 0 },
  { name: "Bob Martinez", order_index: 1 },
  { name: "Carol Kim", order_index: 2 },
];

const { data: candRows, error: candErr } = await admin
  .from("scorecard_grid_candidates")
  .insert(CANDIDATES.map((c) => ({
    scorecard_id: scorecardId,
    plan_id: planId,
    name: c.name,
    order_index: c.order_index,
  })))
  .select("id, name, order_index");
if (candErr) throw candErr;
const cands = candRows.sort((a, b) => a.order_index - b.order_index);
console.log(`      ${cands.length} candidates seeded`);

// Score matrix: [alice, bob, carol] × [customer-service, speed, reliability, coffee-knowledge]
// Alice: 5, 4, 4, 5  (weighted: 5+6+6+5 = 22 / 25 = 88%)
// Bob:   3, 5, 3, 4  (weighted: 3+7.5+4.5+4 = 19 / 25 = 76%)
// Carol: 4, 3, 5, 3  (weighted: 4+4.5+7.5+3 = 19 / 25 = 76%)
const SCORES = [
  // Alice
  { cand: 0, comp: 0, score: 5, notes: "Exceptional warmth with guests, always goes above and beyond." },
  { cand: 0, comp: 1, score: 4, notes: null },
  { cand: 0, comp: 2, score: 4, notes: null },
  { cand: 0, comp: 3, score: 5, notes: null },
  // Bob
  { cand: 1, comp: 0, score: 3, notes: null },
  { cand: 1, comp: 1, score: 5, notes: null },
  { cand: 1, comp: 2, score: 3, notes: null },
  { cand: 1, comp: 3, score: 4, notes: null },
  // Carol
  { cand: 2, comp: 0, score: 4, notes: null },
  { cand: 2, comp: 1, score: 3, notes: null },
  { cand: 2, comp: 2, score: 5, notes: null },
  { cand: 2, comp: 3, score: 3, notes: null },
];

const { error: scoreErr } = await admin.from("scorecard_cell_scores").insert(
  SCORES.map((s) => ({
    scorecard_id: scorecardId,
    plan_id: planId,
    candidate_id: cands[s.cand].id,
    competency_id: comps[s.comp].id,
    score: s.score,
    notes: s.notes,
  }))
);
if (scoreErr) throw scoreErr;
console.log(`      ${SCORES.length} scores seeded`);

// ── 7. S2: populated grid, S3: notes popover, S4: print mode ─────────────────

console.log("[7/8] capturing S2 (populated), S3 (notes popover), S4 (print)");

// Reload so new data is fetched from API
await page.reload({ waitUntil: "networkidle", timeout: 30000 });

// Click Interview tab again after reload
await page.getByRole("button", { name: "Interview" }).first().click();
await page.waitForTimeout(2000);

// Wait for the table to render (footer "Max possible" appears only when data is loaded)
await page.waitForSelector('text=Max possible', { timeout: 10000 });
// Also wait for the Score column header (confirms candidates + competencies both loaded)
await page.waitForSelector('th >> text=Score', { timeout: 5000 });
await page.waitForTimeout(600);

// S2: Populated grid
await page.screenshot({ path: shot("s2-populated-grid"), fullPage: false });
console.log("      [S2] populated grid captured ✓");

// S3: Click the Info (notes) button on Alice's first score cell (Customer Service).
// Alice has notes on that cell so the button title is "Notes".
// The grid tbody: first tr = Alice, second td = first comp cell (Customer Service).
// Use a CSS selector: tbody tr:first-child td:nth-child(2) button[title="Notes"]
const notesBtn = page.locator('table.scorecard-print-table tbody tr:first-child td:nth-child(2) button[title="Notes"]').first();
await notesBtn.waitFor({ state: "visible", timeout: 5000 });
await notesBtn.click();
await page.waitForTimeout(500); // popover mount

await page.screenshot({ path: shot("s3-cell-notes-popover"), fullPage: false });
console.log("      [S3] cell notes popover captured ✓");

// Close the popover (press Escape or click outside)
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// S4: Print media emulation
await page.emulateMedia({ media: "print" });
await page.waitForTimeout(400);
await page.screenshot({ path: shot("s4-print-preview"), fullPage: false });
console.log("      [S4] print preview captured ✓");
await page.emulateMedia({ media: "screen" });

await desktopCtx.close();

// ── 8. S5: Mobile 375px ──────────────────────────────────────────────────────

console.log("[8/8] capturing S5 (mobile 375px)");
const mobileUA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const { ctx: mobileCtx, page: mPage } = await makeSession(375, 812, mobileUA);

await gotoInterview(mPage);
await mPage.waitForSelector('text=Scorecard Grid', { timeout: 10000 });
// Wait for mobile cards — mobile layout shows candidate cards in .scorecard-mobile
// The mobile input inside a card is a sibling of the trash button; wait for 2 cards
await mPage.waitForSelector('.scorecard-mobile > div:nth-child(2)', { timeout: 10000 });
await mPage.waitForTimeout(600);

// Verify no horizontal overflow
const overflow = await mPage.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}));
console.log(`      overflow check: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`);

await mPage.screenshot({ path: shot("s5-mobile-375px"), fullPage: false });
console.log("      [S5] mobile 375px captured ✓");

await mobileCtx.close();
await browser.close();

console.log("\nAll 5 screenshots captured:");
["s1-empty-grid","s2-populated-grid","s3-cell-notes-popover","s4-print-preview","s5-mobile-375px"].forEach(
  (n) => console.log(`  ${OUT}/${n}.png`)
);
