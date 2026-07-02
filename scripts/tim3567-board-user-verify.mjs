/**
 * TIM-3567 — log in as the board's actual user (trentrollings@gmail.com,
 * user_id d30438c6-c9bd-4e9f-a6f4-8642038624b5, plan 79db2d55-...) on prod
 * and screenshot /workspace/hiring. Board rejected TIM-3558 saying v2 IA is
 * not rendering; TIM-3561 verified on a fresh synthetic which is not the same
 * code path. This confirms what the board actually sees.
 *
 * DB pre-check already run: their users.hiring_revamp_v2 = true, plan has
 * 0 roles / 0 candidates / 0 competencies / 0 onboarding. So even if v2 is
 * rendering, the RIGHT-side pane is the empty prompt "Pick a role on the
 * left". The v2 shell (left nav + Roles header) MUST still be visible.
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots", "tim3567");

const SUPABASE_URL = "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SUPABASE_SECRET = process.env.SUPABASE_NEW_SECRET_KEY;
const SUPABASE_PUBLISHABLE = process.env.SUPABASE_NEW_PUBLISHABLE_KEY;
if (!SUPABASE_SECRET || !SUPABASE_PUBLISHABLE) {
  console.error("Missing SUPABASE_NEW_SECRET_KEY or SUPABASE_NEW_PUBLISHABLE_KEY");
  process.exit(1);
}

const BOARD_EMAIL = "trentrollings@gmail.com";
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

async function getSession() {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: BOARD_EMAIL,
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

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  const session = await getSession();
  console.log("session for user:", session.user.id, session.user.email);

  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await ctx.addCookies(buildAuthCookies(session, COOKIE_DOMAIN));

  await ctx.addCookies([
    {
      name: "gw_consent",
      value: encodeURIComponent(
        JSON.stringify({ version: 1, analytics: false, marketing: false, decidedAt: new Date().toISOString() }),
      ),
      domain: COOKIE_DOMAIN,
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 3600 * 24 * 30,
    },
  ]);

  const page = await ctx.newPage();

  console.log("→ navigating /workspace/hiring");
  await page.goto(`${BASE_URL}/workspace/hiring`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(3500);

  const buildInfo = await page.evaluate(() => fetch("/api/build-info").then((r) => r.json()).catch(() => null));
  console.log("buildInfo:", buildInfo);

  const html = await page.content();

  const markers = {
    buildInfo,
    url: page.url(),
    // v2-only markers (from HiringWorkspaceV2 shell)
    hasRolesNavHeading: /<[^>]*>\s*Roles\s*</i.test(html),
    hasAddRoleButton: html.includes("Add role"),
    hasHiringLawsLink: html.includes("Hiring laws"),
    hasPickARolePrompt: html.includes("Pick a role on the left"),
    hasV2ShellClass: html.includes("lg:grid-cols-[260px"),
    // v1-only markers (from HiringWorkspace / v1 tabs)
    hasV1TabsRoles: html.includes(">Roles<") && html.includes(">Interviews<"),
    hasV1SuppliesLikeShell: html.includes("HiringWorkspace") && !html.includes("hiring-workspace-v2"),
    // Title
    hasTitleH1: html.includes("Hiring &amp; Onboarding") || html.includes("Hiring & Onboarding"),
    // Body length sanity
    bodyLen: html.length,
  };

  const verdict = markers.hasRolesNavHeading && markers.hasV2ShellClass ? "V2_RENDERED" : "NOT_V2";

  console.log("VERIFY:", JSON.stringify({ ...markers, verdict }, null, 2));

  await page.screenshot({
    path: join(OUT_DIR, "03-hiring-workspace-board-user-AFTER.png"),
    fullPage: true,
  });

  await writeFile(
    join(OUT_DIR, "board-user-verify-after.json"),
    JSON.stringify({ ...markers, verdict, userId: session.user.id, email: session.user.email }, null, 2),
  );

  await browser.close();
  await ctx.close().catch(() => {});

  process.exitCode = verdict === "V2_RENDERED" ? 0 : 1;
}

run().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
