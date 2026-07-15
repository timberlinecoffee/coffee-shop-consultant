/**
 * TIM-3672 follow-up verify — "Seed from other sections" button in the BP
 * Write-with-AI modal.
 *
 * Board comment db265403 on 2026-07-08: "I would like there to be a button
 * in that window that seeds the field with the information taken from other
 * parts of the business plan."
 *
 * This script logs into trent@simpler.coffee (fully populated demo persona
 * where multiple BP sections carry content), opens the modal on Executive
 * Summary, and asserts:
 *   1. The seed button is present and labeled with a non-zero count.
 *   2. Clicking it appends a "Context from other business plan sections"
 *      block to the draft textarea (content length grows meaningfully).
 *   3. The button re-labels to "Context added" and disables (no dupe click).
 *
 * Also opens the modal on Financing Strategy (may be empty) and confirms the
 * button still surfaces when other sections have content — even if the
 * current section is empty.
 *
 * Env:
 *   BASE_URL           default https://groundwork.cafe
 *   LABEL              default "prod"
 *   VERCEL_SHARE       23h SSO bypass token for previews
 *   SUPABASE_NEW_SECRET_KEY, SUPABASE_NEW_PUBLISHABLE_KEY  auth
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots", "tim3672-seed");
const BASE_URL = process.env.BASE_URL ?? "https://groundwork.cafe";
const LABEL = process.env.LABEL ?? "prod";

const SUPABASE_URL = "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SUPABASE_SECRET = process.env.SUPABASE_NEW_SECRET_KEY;
const SUPABASE_PUBLISHABLE = process.env.SUPABASE_NEW_PUBLISHABLE_KEY;
if (!SUPABASE_SECRET || !SUPABASE_PUBLISHABLE) {
  console.error("Missing SUPABASE_NEW_SECRET_KEY or SUPABASE_NEW_PUBLISHABLE_KEY");
  process.exit(1);
}
const PROJECT_REF = "ltmcttjftxzpgynhnrpg";
const HOST = BASE_URL.replace(/^https?:\/\//, "").split("/")[0];
const COOKIE_DOMAIN = HOST.startsWith("localhost")
  ? "localhost"
  : HOST.endsWith(".vercel.app")
  ? HOST
  : ".groundwork.cafe";

const CHROMIUM = "/home/briefli/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";
const LD_LIB = "/home/briefli/playwright-libs/usr/lib/x86_64-linux-gnu";
process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
  ? `${LD_LIB}:${process.env.LD_LIBRARY_PATH}`
  : LD_LIB;

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function magiclinkFor(email) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw error;
  const token = data?.properties?.hashed_token;
  if (!token) throw new Error("no magiclink token");
  return token;
}

async function loginPlant(context, token) {
  const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.verifyOtp({ token_hash: token, type: "magiclink" });
  if (error) throw error;
  const { session } = data;
  if (!session) throw new Error("no session");
  const sessionData = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: session.token_type,
    user: session.user,
  };
  const raw = "base64-" + Buffer.from(JSON.stringify(sessionData)).toString("base64");
  const cookieName = `sb-${PROJECT_REF}-auth-token`;
  const encoded = encodeURIComponent(raw);
  const CHUNK = 3180;
  const chunks = [];
  for (let i = 0; i < encoded.length; i += CHUNK) chunks.push(encoded.slice(i, i + CHUNK));
  const cookies = chunks.map((v, idx) => ({
    name: `${cookieName}.${idx}`,
    value: v,
    domain: COOKIE_DOMAIN,
    path: "/",
    httpOnly: false,
    secure: !HOST.startsWith("localhost"),
    sameSite: "Lax",
  }));
  await context.addCookies(cookies);
}

async function shot(page, name) {
  const path = join(OUT_DIR, `${LABEL}-${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log("shot:", path);
}

async function openModalOn(page, buttonRegex) {
  const btn = page.getByRole("button", { name: buttonRegex }).first();
  const count = await btn.count();
  if (count === 0) return { opened: false, count };
  await btn.click();
  await page.waitForTimeout(1000);
  // TIM-3675 review-fix landed the colon separator, so header is
  // "Write with AI: {sectionTitle}".
  const opened = (await page.locator('h2:has-text("Write with AI:")').count()) > 0;
  return { opened, count };
}

async function closeModal(page) {
  const close = page.locator('button[aria-label="Close"]').first();
  if ((await close.count()) > 0) {
    await close.click();
    await page.waitForTimeout(400);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const token = await magiclinkFor("trent@simpler.coffee");
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await loginPlant(context, token);
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[browser-error]", msg.text());
  });

  const VERCEL_SHARE = process.env.VERCEL_SHARE ?? "";
  if (VERCEL_SHARE) {
    await page.goto(`${BASE_URL}/?_vercel_share=${VERCEL_SHARE}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
  }

  await page.goto(`${BASE_URL}/workspace/business-plan`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);

  const url = page.url();
  console.log("landed URL:", url);
  if (!url.includes("/business-plan")) {
    console.log("did not land on BP — bailing");
    await browser.close();
    return;
  }

  // ── T1: Open modal on Executive Summary and verify the seed button ──
  const t1 = await openModalOn(page, /Write Executive Summary with AI/i);
  console.log("T1 open:", t1);

  const contentTa = page.locator("#bp-wai-content");
  const beforeLen = (await contentTa.inputValue().catch(() => "")).length;
  console.log("T1 content length before seed:", beforeLen);

  // Seed button surfaces with a count in parens: "Seed from other sections (N)"
  const seedBtn = page.getByRole("button", { name: /Seed from other sections/i }).first();
  const seedBtnCount = await seedBtn.count();
  console.log("T1 seed button present:", seedBtnCount);
  await shot(page, "t1-before-seed");

  let afterLen = beforeLen;
  let contextBlockFound = false;
  let postClickButtonText = "";
  let postClickDisabled = null;
  if (seedBtnCount > 0) {
    await seedBtn.click();
    await page.waitForTimeout(400);
    afterLen = (await contentTa.inputValue().catch(() => "")).length;
    const val = await contentTa.inputValue().catch(() => "");
    contextBlockFound = val.includes("Context from other business plan sections");
    postClickButtonText = (await seedBtn.textContent())?.trim() ?? "";
    postClickDisabled = await seedBtn.isDisabled();
    await shot(page, "t1-after-seed");
  }

  await closeModal(page);

  // ── T2: Open modal on Financing Strategy (may be empty) ──
  // The button should still appear because OTHER sections have content.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(400);
  const t2 = await openModalOn(page, /Write Financing Strategy with AI/i);
  console.log("T2 open:", t2);
  const t2SeedCount = await page.getByRole("button", { name: /Seed from other sections/i }).count();
  console.log("T2 seed button present (Financing may be empty):", t2SeedCount);
  await shot(page, "t2-financing-modal");
  await closeModal(page);

  await browser.close();

  const summary = {
    execSummary: {
      modalOpened: t1.opened,
      beforeContentLen: beforeLen,
      afterContentLen: afterLen,
      seedButtonPresent: seedBtnCount > 0,
      contextBlockAppendedText: contextBlockFound,
      contextBlockAppendedLenDelta: afterLen - beforeLen,
      postClickButtonLabel: postClickButtonText,
      postClickDisabled,
    },
    financingStrategy: {
      modalOpened: t2.opened,
      seedButtonPresent: t2SeedCount > 0,
    },
    verdict: {
      seedButtonSurfacesOnPopulatedSection: seedBtnCount > 0,
      clickAppendsContext: contextBlockFound && afterLen > beforeLen,
      clickDisablesButton: postClickDisabled === true,
      buttonReLabelsToContextAdded: postClickButtonText.includes("Context added"),
    },
  };
  await writeFile(join(OUT_DIR, `${LABEL}-summary.json`), JSON.stringify(summary, null, 2), "utf8");
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
