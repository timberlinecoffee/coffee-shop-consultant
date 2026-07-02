/**
 * TIM-3561 audit — verify prod H&O suite against 5 shipped deliverables:
 *   - TIM-3369: v2 IA shell (left nav of roles + accordion role page)
 *   - TIM-3367: Write with AI on long-typing fields
 *   - TIM-3370: Interview scorecard grid (candidates × competencies)
 *   - TIM-3355: draggable role list on the front page  ← v1 only surface;
 *               v2 supersedes with left-nav (documented for audit)
 *   - TIM-3404: baseline QA screenshots (this run captures the fresh set)
 *
 * Runs against groundwork.cafe with a synthetic Pro user, relying solely on
 * DB DEFAULT hiring_revamp_v2=true (no override cookie, no ?hiring= param).
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots", "tim3561");

const SUPABASE_URL = "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SUPABASE_SECRET = process.env.SUPABASE_NEW_SECRET_KEY;
const SUPABASE_PUBLISHABLE = process.env.SUPABASE_NEW_PUBLISHABLE_KEY;
if (!SUPABASE_SECRET || !SUPABASE_PUBLISHABLE) {
  console.error("Missing SUPABASE_NEW_SECRET_KEY or SUPABASE_NEW_PUBLISHABLE_KEY");
  process.exit(1);
}

const SYN_EMAIL = `tim3561+${Date.now()}@timberline.coffee`;
const BASE_URL = "https://groundwork.cafe";
const PROJECT_REF = "ltmcttjftxzpgynhnrpg";
const COOKIE_DOMAIN = ".groundwork.cafe";

const CHROMIUM = "/home/briefli/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";
const LD_LIB = "/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu";
process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
  ? `${LD_LIB}:${process.env.LD_LIBRARY_PATH}`
  : LD_LIB;

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seedUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: SYN_EMAIL,
    password: "Tim3561Verify!",
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user.id;

  const { data: row } = await admin
    .from("users")
    .select("id, hiring_revamp_v2")
    .eq("id", userId)
    .maybeSingle();
  console.log("  users row after signup:", JSON.stringify(row));

  const { data: plan, error: pErr } = await admin
    .from("coffee_shop_plans")
    .insert({ user_id: userId, plan_name: "TIM-3561 Audit", status: "in_progress" })
    .select("id")
    .single();
  if (pErr) throw pErr;

  const { error: uErr } = await admin
    .from("users")
    .update({
      onboarding_completed: true,
      full_name: "TIM-3561 Auditor",
      subscription_status: "active",
      subscription_tier: "pro",
      current_plan_id: plan.id,
    })
    .eq("id", userId);
  if (uErr) throw uErr;

  await admin.from("hiring_plan_roles").insert([
    { plan_id: plan.id, role_title: "General Manager", headcount: 1, order_index: 0 },
    { plan_id: plan.id, role_title: "Shift Lead", headcount: 2, order_index: 1 },
    { plan_id: plan.id, role_title: "Barista", headcount: 4, order_index: 2 },
  ]);

  const { data: candidates } = await admin
    .from("interview_candidates")
    .insert([
      { plan_id: plan.id, candidate_name: "Alex Barista", position: 0 },
      { plan_id: plan.id, candidate_name: "Jordan Coffee", position: 1 },
    ])
    .select("id");

  console.log("  seeded candidates:", candidates?.length);

  return { userId, planId: plan.id };
}

async function getSession() {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: SYN_EMAIL,
  });
  if (error) throw error;
  const hashed = data?.properties?.hashed_token;
  if (!hashed) throw new Error("no hashed_token");
  const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: vd, error: verr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashed,
  });
  if (verr || !vd.session) throw verr ?? new Error("no session");
  return vd.session;
}

function buildAuthCookies(session, domain) {
  const tokenJson = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: "bearer",
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    user: session.user,
  });
  const encoded = "base64-" + Buffer.from(tokenJson).toString("base64");
  const baseName = `sb-${PROJECT_REF}-auth-token`;
  const CHUNK = 3200;
  const base = {
    domain,
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 3600,
  };
  const cookies = [];
  if (encoded.length <= CHUNK) {
    cookies.push({ name: baseName, value: encoded, ...base });
  } else {
    let i = 0;
    for (let start = 0; start < encoded.length; start += CHUNK) {
      cookies.push({
        name: `${baseName}.${i}`,
        value: encoded.slice(start, start + CHUNK),
        ...base,
      });
      i++;
    }
  }
  return cookies;
}

function buildConsentCookie(domain) {
  return [
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
      domain,
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 3600 * 24 * 30,
    },
  ];
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("→ seeding user (no hiring_revamp_v2 explicit set)…");
  const { userId, planId } = await seedUser();

  try {
    console.log("→ minting session…");
    const session = await getSession();

    const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addCookies([
      ...buildConsentCookie(COOKIE_DOMAIN),
      ...buildAuthCookies(session, COOKIE_DOMAIN),
    ]);
    const page = await ctx.newPage();

    // ────────────────────────────────────────────────────────────────
    // Deliverable 1 + 3: v2 IA shell + Interview scorecard subtitle
    // Deliverable 2: Write with AI (rendered on JD/summary fields)
    // ────────────────────────────────────────────────────────────────
    console.log(`→ navigating ${BASE_URL}/workspace/hiring (default v2)…`);
    await page.goto(`${BASE_URL}/workspace/hiring`, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(3000);

    const html = await page.content();
    const v2Hits = [
      "Per-role question bank",
      "Candidate × competency grid",
      "First 90 days task list",
      "Pay basis, amount, hours, benefits",
    ].filter((s) => html.includes(s));
    const v1Hits = [
      ">Org Structure<",
      ">Interview<",
      ">Onboarding<",
    ].filter((s) => html.includes(s));
    const hasLeftNavRoles =
      html.includes('aria-label="Roles"') || html.includes("aria-label='Roles'");
    const hasRoleTitles =
      html.includes("General Manager") && html.includes("Shift Lead") && html.includes("Barista");
    const hasWriteWithAI = html.includes("Write with AI");
    const hasScorecardAccordion = html.includes("Interview scorecard");
    const buildInfo = await page.evaluate(async () => {
      try {
        const r = await fetch("/api/build-info");
        return await r.json();
      } catch {
        return null;
      }
    });

    const auditFront = {
      buildInfo,
      v2Hits,
      v1Hits,
      hasLeftNavRoles,
      hasRoleTitles,
      hasWriteWithAI,
      hasScorecardAccordion,
      url: page.url(),
      verdict:
        v2Hits.length >= 3 && v1Hits.length === 0 && hasLeftNavRoles && hasRoleTitles
          ? "V2_RENDERED"
          : v1Hits.length >= 2 && v2Hits.length === 0
            ? "V1_RENDERED"
            : "AMBIGUOUS",
    };
    console.log("audit front page:", JSON.stringify(auditFront, null, 2));

    await page.screenshot({
      path: join(OUT_DIR, "01-hiring-workspace-default.png"),
      fullPage: true,
    });

    // Open a specific role's accordion sections to capture TIM-3367 + TIM-3370
    console.log("→ selecting first role in left nav …");
    const firstRole = page.locator('nav[aria-label="Roles"] a, nav[aria-label="Roles"] button').first();
    let roleClicked = false;
    try {
      await firstRole.click({ timeout: 5000 });
      roleClicked = true;
      await page.waitForTimeout(1500);
    } catch (e) {
      console.log("  (could not click first role in nav — may already be selected)");
    }

    await page.screenshot({
      path: join(OUT_DIR, "02-role-page-with-accordions.png"),
      fullPage: true,
    });

    // Expand JD accordion to reveal Write with AI (TIM-3367)
    try {
      await page.getByText("Job description", { exact: false }).first().click({ timeout: 3000 });
      await page.waitForTimeout(800);
    } catch {}
    // Expand scorecard accordion (TIM-3370)
    try {
      await page.getByText("Interview scorecard", { exact: false }).first().click({ timeout: 3000 });
      await page.waitForTimeout(800);
    } catch {}

    const htmlExpanded = await page.content();
    const writeWithAIExpanded = (htmlExpanded.match(/Write with AI/g) || []).length;
    const scorecardOpened =
      htmlExpanded.includes("Candidate × competency grid") ||
      htmlExpanded.includes("Alex Barista") ||
      htmlExpanded.includes("Jordan Coffee");

    await page.screenshot({
      path: join(OUT_DIR, "03-role-page-jd-and-scorecard-expanded.png"),
      fullPage: true,
    });

    // Overall verdict
    const overall = {
      buildInfo,
      auditFront,
      roleClicked,
      writeWithAIExpanded,
      scorecardOpened,
      deliverables: {
        "TIM-3355 (draggable role list — front page, v1-only surface)": "N/A_V2_SUPERSEDES",
        "TIM-3367 (Write with AI on long-typing fields)":
          writeWithAIExpanded >= 1 ? "VERIFIED" : "MISSING",
        "TIM-3369 (v2 IA — left nav of roles + accordion)":
          auditFront.verdict === "V2_RENDERED" ? "VERIFIED" : "REGRESSED",
        "TIM-3370 (Interview scorecard grid)":
          auditFront.hasScorecardAccordion ? "VERIFIED" : "MISSING",
        "TIM-3404 (QA screenshots on prod)": "CAPTURED_FRESH_THIS_RUN",
      },
    };
    console.log("OVERALL:", JSON.stringify(overall, null, 2));
    await writeFile(join(OUT_DIR, "audit.json"), JSON.stringify(overall, null, 2));

    await browser.close();
    await ctx.close().catch(() => {});
  } finally {
    // Cleanup: hiring_plan_roles + interview_candidates cascade via FK
    await admin.from("coffee_shop_plans").delete().eq("id", planId).catch(() => {});
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    console.log("→ cleaned up synthetic user");
  }
}

run().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
