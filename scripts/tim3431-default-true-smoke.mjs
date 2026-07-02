/**
 * TIM-3431 smoke — confirm groundwork.cafe serves v2 Hiring IA to a NEW user
 * with NO cookie / URL override, relying solely on the post-migration column
 * DEFAULT true. Captures one PNG: hiring-default-v2.png.
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots", "tim3431");

const SUPABASE_URL = "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SUPABASE_SECRET = process.env.SUPABASE_NEW_SECRET_KEY;
const SUPABASE_PUBLISHABLE = process.env.SUPABASE_NEW_PUBLISHABLE_KEY;
if (!SUPABASE_SECRET || !SUPABASE_PUBLISHABLE) {
  console.error("Missing SUPABASE_NEW_SECRET_KEY or SUPABASE_NEW_PUBLISHABLE_KEY");
  process.exit(1);
}

const SYN_EMAIL = `tim3431+${Date.now()}@timberline.coffee`;
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
    password: "Tim3431Verify!",
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user.id;

  // Inspect DEFAULT-applied value on insert by re-reading the users row that
  // the trigger/auth-hook seeded. If the trigger doesn't create a row, the
  // routing path falls back to true per the new code; but for this smoke we
  // explicitly check the DB DEFAULT.
  const { data: row } = await admin
    .from("users")
    .select("id, hiring_revamp_v2")
    .eq("id", userId)
    .maybeSingle();
  console.log("  users row after signup:", JSON.stringify(row));

  // Seed plan + onboarding so we don't redirect to /onboarding.
  const { data: plan, error: pErr } = await admin
    .from("coffee_shop_plans")
    .insert({ user_id: userId, plan_name: "TIM-3431 Verify", status: "in_progress" })
    .select("id")
    .single();
  if (pErr) throw pErr;

  const { error: uErr } = await admin
    .from("users")
    .update({
      onboarding_completed: true,
      full_name: "TIM-3431 Tester",
      subscription_status: "active",
      subscription_tier: "pro",
      current_plan_id: plan.id,
      // CRITICAL: do NOT set hiring_revamp_v2 here — rely on DB DEFAULT.
    })
    .eq("id", userId);
  if (uErr) throw uErr;

  // Seed a couple of roles so the v2 left-nav has something to render.
  await admin.from("hiring_plan_roles").insert([
    { plan_id: plan.id, role_title: "General Manager", headcount: 1, order_index: 0 },
    { plan_id: plan.id, role_title: "Shift Lead", headcount: 2, order_index: 1 },
  ]);

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
  const { userId } = await seedUser();

  try {
    console.log("→ minting session…");
    const session = await getSession();

    const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addCookies([
      ...buildConsentCookie(COOKIE_DOMAIN),
      ...buildAuthCookies(session, COOKIE_DOMAIN),
      // NOTE: deliberately omitting gw_hiring_revamp_v2 cookie AND ?hiring=v2 URL param.
    ]);
    const page = await ctx.newPage();

    console.log(`→ navigating ${BASE_URL}/workspace/hiring (no override)…`);
    await page.goto(`${BASE_URL}/workspace/hiring`, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(2500);

    // Diagnostic: distinct v1 vs v2 DOM markers (from src grep).
    const html = await page.content();
    // v2 (HiringWorkspaceV2): accordion subtitles unique to v2.
    const v2Hits = [
      "Per-role question bank",
      "Candidate × competency grid",
      "First 90 days task list",
      "Pay basis, amount, hours, benefits",
    ].filter((s) => html.includes(s));
    // v1 (HiringWorkspace): top-level tab labels unique to the v1 tabbed shell.
    const v1Hits = [
      ">Org Structure<",
      ">Interview<",
      ">Onboarding<",
    ].filter((s) => html.includes(s));
    const v2Markers = {
      v2Hits,
      v1Hits,
      hasGeneralManager: html.includes("General Manager"),
      hasShiftLead: html.includes("Shift Lead"),
      url: page.url(),
      verdict: v2Hits.length >= 2 && v1Hits.length === 0
        ? "V2_RENDERED"
        : v1Hits.length >= 2 && v2Hits.length === 0
          ? "V1_RENDERED"
          : "AMBIGUOUS",
    };
    console.log("v2 marker diagnostic:", JSON.stringify(v2Markers, null, 2));

    await page.screenshot({
      path: join(OUT_DIR, "hiring-default-v2.png"),
      fullPage: true,
    });
    console.log("  ✓ screenshot saved");

    // Save diagnostic
    await writeFile(join(OUT_DIR, "diagnostic.json"), JSON.stringify(v2Markers, null, 2));

    await browser.close();
    await ctx.close().catch(() => {});

    console.log("DONE smoke:", v2Markers);
  } finally {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }
}

run().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
