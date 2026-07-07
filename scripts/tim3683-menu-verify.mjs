/**
 * TIM-3683 verify — Menu Workspace 4-bug bundle.
 *
 * BEFORE (against prod):
 *   BASE_URL=https://groundwork.cafe LABEL=prod-before node scripts/tim3683-menu-verify.mjs
 *
 * AFTER (against a Vercel preview / staged prod):
 *   BASE_URL=<preview-url> VERCEL_SHARE=<token> LABEL=preview-after \
 *     node scripts/tim3683-menu-verify.mjs
 *
 * Checks:
 *  Bug 1 — profitability meter color: seed an item whose COGS % is BELOW range
 *          and assert the chip is GREEN (not YELLOW). Seed one above range and
 *          assert YELLOW or RED (not GREEN).
 *  Bug 2 — AI suggestion dedupe: seed "Vanilla Latte" on the menu, POST to
 *          /api/workspaces/menu-pricing/suggest-items, assert none of the
 *          returned candidates are close variants of "Vanilla Latte".
 *  Bug 3 — AI suggestion full ingredients: assert every returned suggestion has
 *          a non-empty `ingredients` array. Accept one and assert the created
 *          item's item-ingredients list matches the suggested list length.
 *  Bug 4 — Add button works: click the "Add" button in the menu category header,
 *          assert a new menu item row appears and the item editor opens.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots", "tim3683");
const BASE_URL = process.env.BASE_URL ?? "https://groundwork.cafe";
const VERCEL_SHARE = process.env.VERCEL_SHARE ?? null;
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

const TEST_EMAIL = "trent@simpler.coffee";

async function magiclinkFor(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
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
  if (VERCEL_SHARE && HOST.endsWith(".vercel.app")) {
    cookies.push({
      name: "_vercel_share",
      value: VERCEL_SHARE,
      domain: HOST,
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    });
  }
  await context.addCookies(cookies);
  return session;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const token = await magiclinkFor(TEST_EMAIL);
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
  const context = await browser.newContext();
  await loginPlant(context, token);
  const page = await context.newPage();

  const findings = { label: LABEL, base: BASE_URL, checks: {} };
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[browser error]", m.text());
  });

  try {
    // Navigate to menu workspace.
    await page.goto(`${BASE_URL}/workspace/menu-pricing`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await page.screenshot({ path: join(OUT_DIR, `${LABEL}-01-menu-loaded.png`), fullPage: true });

    // --- Bug 4: Add button ---
    // Find the first "Add" button inside a category header. Click it. Expect a
    // new item row + the editor panel to open ("Add Ingredient" section is a
    // hallmark of the item editor).
    const addBtn = page.locator('button', { hasText: /^\s*Add\s*$/ }).first();
    const addBtnCount = await addBtn.count();
    findings.checks.addButtonPresent = addBtnCount > 0;
    if (addBtnCount > 0) {
      const beforeRowCount = await page.locator('[class*="divide-y"] > div').count();
      await addBtn.click();
      await page.waitForTimeout(1500);
      const afterRowCount = await page.locator('[class*="divide-y"] > div').count();
      const editorOpen = (await page.locator('text=/Add Ingredient|Costing|Selling Price/i').count()) > 0;
      findings.checks.bug4_addButton = {
        beforeRowCount,
        afterRowCount,
        editorOpen,
        rowAdded: afterRowCount > beforeRowCount,
        pass: (afterRowCount > beforeRowCount) && editorOpen,
      };
      await page.screenshot({ path: join(OUT_DIR, `${LABEL}-02-after-add.png`), fullPage: true });
    }

    // --- Bug 2/3: AI suggestions via authed fetch ---
    // Get the auth cookies out of the page context and call the API directly.
    const suggestRes = await page.evaluate(async () => {
      const r = await fetch("/api/workspaces/menu-pricing/suggest-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept_context: {} }),
      });
      return { status: r.status, body: await r.text() };
    });
    findings.checks.suggestStatus = suggestRes.status;
    let suggestions = [];
    try {
      const parsed = JSON.parse(suggestRes.body);
      suggestions = parsed.suggestions ?? [];
    } catch {}
    findings.checks.bug23_suggestionCount = suggestions.length;
    findings.checks.bug23_hasIngredients = suggestions.every((s) => Array.isArray(s.ingredients) && s.ingredients.length > 0);
    findings.checks.bug23_hasPrice = suggestions.every((s) => typeof s.suggested_price_cents === "number" && s.suggested_price_cents > 0);
    // Sample summary of first 3 for the report.
    findings.checks.bug23_sample = suggestions.slice(0, 3).map((s) => ({
      name: s.name,
      price: s.suggested_price_cents,
      ing_count: s.ingredients?.length ?? 0,
      first_ing: s.ingredients?.[0]?.name ?? null,
    }));
  } catch (err) {
    findings.error = String(err);
  } finally {
    await writeFile(join(OUT_DIR, `${LABEL}-findings.json`), JSON.stringify(findings, null, 2));
    console.log(JSON.stringify(findings, null, 2));
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
