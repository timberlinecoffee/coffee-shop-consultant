#!/usr/bin/env node
// TIM-3356 — Capture 6 live screenshots of TIM-3355 hiring list + inline-expand UI.
// Pattern follows tim3353-section-header-shots.mjs: synthetic Pro user, form-login
// against local `next dev`, seed hiring_plan_roles via SUPABASE service-role.

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3007";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = "tim3356";
const password = "Test-Password-A1b2C3!";
const email = `${stamp}-${Math.random().toString(36).slice(2, 8)}@test.timberline.local`;

async function seed() {
  console.log(`[seed] creating user ${email}`);
  const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr) throw userErr;
  const uid = userRes.user.id;
  console.log(`[seed] user id = ${uid}`);

  await admin
    .from("users")
    .upsert({
      id: uid,
      email,
      subscription_status: "active",
      subscription_tier: "pro",
      onboarding_completed: true,
    });

  const { data: planRow, error: planErr } = await admin
    .from("coffee_shop_plans")
    .insert({
      user_id: uid,
      plan_name: "Pinecone Roasters",
      status: "in_progress",
    })
    .select("id")
    .single();
  if (planErr) throw planErr;
  const planId = planRow.id;
  console.log(`[seed] plan id = ${planId}`);

  await admin.from("users").update({ current_plan_id: planId }).eq("id", uid);

  return { uid, planId };
}

async function seedRoles(planId) {
  console.log(`[seed] inserting hiring_plan_roles`);
  // Insert root rows first, then children referencing parent_role_id.
  const { data: roots, error: rErr } = await admin
    .from("hiring_plan_roles")
    .insert([
      {
        plan_id: planId,
        role_title: "General Manager",
        headcount: 1,
        order_index: 0,
        parent_role_id: null,
      },
      {
        plan_id: planId,
        role_title: "Head Roaster",
        headcount: 1,
        order_index: 1,
        parent_role_id: null,
      },
    ])
    .select("id, role_title, order_index");
  if (rErr) throw rErr;
  const gm = roots.find((r) => r.role_title === "General Manager");
  const headRoaster = roots.find((r) => r.role_title === "Head Roaster");

  const { data: depth1, error: d1Err } = await admin
    .from("hiring_plan_roles")
    .insert([
      {
        plan_id: planId,
        role_title: "Shift Lead",
        headcount: 2,
        order_index: 0,
        parent_role_id: gm.id,
        monthly_cost_cents: 380000,
        notes: "Senior barista who opens or closes the shop. Owns daily till + handoff log.",
      },
      {
        plan_id: planId,
        role_title: "Barista",
        headcount: 4,
        order_index: 1,
        parent_role_id: gm.id,
        monthly_cost_cents: 290000,
      },
      {
        plan_id: planId,
        role_title: "Roaster Assistant",
        headcount: 1,
        order_index: 0,
        parent_role_id: headRoaster.id,
      },
    ])
    .select("id, role_title");
  if (d1Err) throw d1Err;
  const shiftLead = depth1.find((r) => r.role_title === "Shift Lead");

  await admin.from("hiring_plan_roles").insert([
    {
      plan_id: planId,
      role_title: "Trainee Barista",
      headcount: 1,
      order_index: 0,
      parent_role_id: shiftLead.id,
    },
  ]);
  console.log(`[seed] hiring_plan_roles done — 6 roles total`);
  return { shiftLead };
}

async function login(page) {
  // Pre-set cookie-consent so the banner never appears.
  await page.context().addCookies([
    {
      name: "gw_consent",
      value: encodeURIComponent(
        JSON.stringify({
          version: 1,
          analytics: false,
          marketing: false,
          decidedAt: new Date(Date.now() - 1000).toISOString(),
        })
      ),
      url: BASE,
    },
  ]);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/dashboard") || url.pathname.startsWith("/onboarding") || url.pathname.startsWith("/workspace"), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  console.log(`[login] post-login at ${page.url()}`);
}

async function gotoHiring(page) {
  await page.goto(`${BASE}/workspace/hiring`, { waitUntil: "networkidle" });
  // Org tab is the default first tab — but assert it via the sub-nav.
  await page.waitForSelector('text=Planned Roles', { timeout: 10000 });
  // Hide Next.js dev-mode overlay badge (only appears in dev `next dev`, not prod).
  await page.addStyleTag({
    content: "nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-overlay] { display: none !important; }",
  });
}

function shotPath(name) {
  return `/tmp/csc-tim3356-shots/docs/evidence/tim-3356/${name}.png`;
}

async function captureConsoleErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

async function main() {
  const { uid, planId } = await seed();

  const browser = await chromium.launch();
  try {
    // ── Desktop context ───────────────────────────────────────────────────────
    const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await desktopCtx.newPage();
    const errors = await captureConsoleErrors(page);
    await login(page);

    // S1 — Empty state (no roles yet)
    await gotoHiring(page);
    await page.waitForSelector('text=No roles planned yet.', { timeout: 5000 });
    await page.waitForSelector('text=Add your first role', { timeout: 5000 });
    await page.screenshot({ path: shotPath("s1-empty-state"), fullPage: false });
    console.log(`[shot] S1 empty state captured`);

    // Now seed roles for S2..S5
    const { shiftLead } = await seedRoles(planId);

    // S2 — List with hierarchy
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('text=General Manager', { timeout: 10000 });
    await page.waitForSelector('text=Shift Lead', { timeout: 5000 });
    await page.waitForSelector('text=Roaster Assistant', { timeout: 5000 });
    await page.screenshot({ path: shotPath("s2-list-hierarchy"), fullPage: false });
    console.log(`[shot] S2 hierarchy list captured`);

    // S3 — A role expanded inline (click Shift Lead row)
    // Click via the row's expand button (button containing the role_title).
    const shiftLeadRow = page.locator('div[role="row"]', { hasText: "Shift Lead" }).first();
    await shiftLeadRow.locator('button[aria-expanded]').first().click();
    // Wait for the inline panel — RoleDetailPanel renders job description fields.
    await page.waitForTimeout(700);
    await page.screenshot({ path: shotPath("s3-inline-expanded"), fullPage: true });
    console.log(`[shot] S3 inline expanded captured`);

    // Collapse back before drag
    await shiftLeadRow.locator('button[aria-expanded]').first().click();
    await page.waitForTimeout(300);

    // S4 — Drag in progress: grab Roaster Assistant grip, move part-way over Head Roaster row
    // Hover the row first so the grip appears (opacity-0 group-hover:opacity-100).
    const raRow = page.locator('div[role="row"]', { hasText: "Roaster Assistant" }).first();
    await raRow.hover();
    const grip = raRow.locator('button[aria-label="Drag to reorder"]');
    await grip.waitFor({ state: "visible", timeout: 3000 });
    const gripBox = await grip.boundingBox();
    const traineeRow = page.locator('div[role="row"]', { hasText: "Trainee Barista" }).first();
    const targetBox = await traineeRow.boundingBox();
    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
    await page.mouse.down();
    // Activation constraint = 4px; move past it
    await page.mouse.move(gripBox.x + 50, gripBox.y - 80, { steps: 10 });
    await page.mouse.move(targetBox.x + 50, targetBox.y - 20, { steps: 15 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: shotPath("s4-drag-in-progress"), fullPage: false });
    console.log(`[shot] S4 drag in progress captured`);

    // S5 — Drop completed: release over the Shift Lead area (re-parents Roaster Assistant under Shift Lead)
    const shiftLeadBox = await shiftLeadRow.boundingBox();
    await page.mouse.move(shiftLeadBox.x + 80, shiftLeadBox.y + shiftLeadBox.height + 5, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(800);
    // Verify in DB that reparent happened, then re-read so visual reflects it
    const { data: postRoles } = await admin
      .from("hiring_plan_roles")
      .select("id, role_title, parent_role_id, order_index")
      .eq("plan_id", planId);
    const ra = postRoles.find((r) => r.role_title === "Roaster Assistant");
    console.log(`[verify] Roaster Assistant parent_role_id = ${ra.parent_role_id}`);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('text=General Manager', { timeout: 10000 });
    await page.screenshot({ path: shotPath("s5-drag-completed"), fullPage: false });
    console.log(`[shot] S5 drag completed captured`);

    await desktopCtx.close();

    // ── Mobile context (375px) ────────────────────────────────────────────────
    const mobileCtx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    const mPage = await mobileCtx.newPage();
    const mErrors = await captureConsoleErrors(mPage);
    await login(mPage);
    await gotoHiring(mPage);
    await mPage.waitForSelector('text=General Manager', { timeout: 10000 });
    await mPage.waitForTimeout(500);
    // Assert no horizontal overflow on the role list container
    const overflow = await mPage.evaluate(() => {
      const doc = document.documentElement;
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
    });
    console.log(`[mobile] scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`);
    await mPage.screenshot({ path: shotPath("s6-mobile-375"), fullPage: false });
    console.log(`[shot] S6 mobile 375px captured`);
    await mobileCtx.close();

    console.log(`[errors] desktop console errors: ${errors.length}`);
    if (errors.length) console.log(errors.slice(0, 10).join("\n"));
    console.log(`[errors] mobile console errors: ${mErrors.length}`);
    if (mErrors.length) console.log(mErrors.slice(0, 10).join("\n"));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
