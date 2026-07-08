/**
 * TIM-3723 reproduction — real UI click on the Menu workspace Add + button,
 * across every category. NOT an API-only check.
 *
 * Board reports "When I press Add + nothing happens" on groundwork.cafe prod.
 * Prior tim3683-menu-verify.mjs hit the API directly and never clicked the
 * button, so it green-lit a shipped-but-broken button.
 *
 * This script:
 *   1. Logs in as trent@simpler.coffee via magic-link cookie plant.
 *   2. Navigates to /workspace/menu-pricing.
 *   3. For every category, counts item rows, clicks the visible "+ Add" button,
 *      waits ~1s, re-counts rows and checks whether the item editor panel opens.
 *   4. Captures browser console errors + network 4xx/5xx during each click.
 *   5. Emits screenshots + a findings JSON.
 *
 * Run: BASE_URL=https://groundwork.cafe LABEL=prod-before \
 *      SUPABASE_NEW_SECRET_KEY=... SUPABASE_NEW_PUBLISHABLE_KEY=... \
 *      node scripts/tim3723-add-button-repro.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots", "tim3723");
const BASE_URL = process.env.BASE_URL ?? "https://groundwork.cafe";
const LABEL = process.env.LABEL ?? "prod-before";

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

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
  await context.addCookies(cookies);
  return session.access_token;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const token = await magiclinkFor("trent@simpler.coffee");
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await loginPlant(context, token);
  const page = await context.newPage();

  const consoleErrors = [];
  const networkFailures = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({ text: msg.text() });
      console.log("[browser-error]", msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push({ text: `PAGE ERROR: ${err.message}`, stack: err.stack });
    console.log("[page-error]", err.message);
  });
  page.on("response", async (resp) => {
    const status = resp.status();
    if (status >= 400) {
      networkFailures.push({ url: resp.url(), status });
      console.log("[net-fail]", status, resp.url());
    }
  });

  const findings = { label: LABEL, base: BASE_URL, checks: {}, consoleErrors, networkFailures };

  await page.goto(`${BASE_URL}/workspace/menu-pricing`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(OUT_DIR, `${LABEL}-01-menu-loaded.png`), fullPage: true });

  // Find every category card, its name, its Add button, and click each.
  const results = [];
  // Category headers rendered by CategoryHeader: has a FolderOpen icon + the
  // rename button showing the category name, plus an "Add" button.
  // We'll iterate over each Add button on the page.
  const addButtons = await page.$$('button:has-text("Add")');
  console.log(`Found ${addButtons.length} "Add" buttons on the page`);

  // Filter to just category header Add buttons (Plus icon + short text "Add").
  // The QuickAddRow button is aria-label="Add ingredient" — exclude that.
  const categoryAddButtons = [];
  for (const btn of addButtons) {
    const aria = await btn.getAttribute("aria-label");
    const text = (await btn.textContent()) || "";
    const cls = (await btn.getAttribute("class")) || "";
    if (aria === "Add ingredient") continue;
    if (!text.trim().startsWith("Add")) continue;
    if (text.trim().length > 12) continue; // "Add Category" etc.
    categoryAddButtons.push({ btn, text: text.trim(), cls });
  }
  console.log(`Filtered to ${categoryAddButtons.length} category "+ Add" buttons`);

  for (let i = 0; i < categoryAddButtons.length; i++) {
    const { btn, text } = categoryAddButtons[i];
    // Read category name from the enclosing header — walk up to the nearest
    // rounded-xl border wrapper and find the first FolderOpen sibling text.
    const catName = await btn.evaluate((el) => {
      let node = el;
      for (let d = 0; d < 8; d++) {
        node = node.parentElement;
        if (!node) return null;
        const nameBtn = node.querySelector("button[title='Click to rename']");
        if (nameBtn) return nameBtn.textContent?.trim() || null;
      }
      return null;
    });
    // Count item rows in this category before clicking.
    const beforeState = await btn.evaluate((el) => {
      let card = el;
      for (let d = 0; d < 8; d++) {
        card = card.parentElement;
        if (!card) return { rows: 0, editorOpen: false };
        if (card.className && typeof card.className === "string" && card.className.includes("rounded-xl") && card.className.includes("border")) {
          break;
        }
      }
      if (!card) return { rows: 0, editorOpen: false };
      // Count SortableMenuItemRow-like children.
      const dnd = card.querySelectorAll('[data-sortable="true"], [data-item-row="true"]');
      const rows = dnd.length || card.querySelectorAll("li,tr,[role='row']").length;
      const editorOpen = !!card.querySelector('[data-item-editor="true"]') ||
        !!card.querySelector('input[placeholder*="name" i]');
      return { rows, editorOpen };
    });

    const preClickErrors = consoleErrors.length;
    const preClickFails = networkFailures.length;
    await btn.click({ timeout: 5000 }).catch((e) => {
      results.push({ index: i, catName, text, clickError: e.message, before: beforeState });
    });
    await page.waitForTimeout(1200);

    const afterState = await btn.evaluate((el) => {
      let card = el;
      for (let d = 0; d < 8; d++) {
        card = card.parentElement;
        if (!card) return { rows: 0, editorOpen: false };
        if (card.className && typeof card.className === "string" && card.className.includes("rounded-xl") && card.className.includes("border")) {
          break;
        }
      }
      if (!card) return { rows: 0, editorOpen: false };
      const dnd = card.querySelectorAll('[data-sortable="true"], [data-item-row="true"]');
      const rows = dnd.length || card.querySelectorAll("li,tr,[role='row']").length;
      const editorOpen = !!card.querySelector('[data-item-editor="true"]') ||
        !!card.querySelector('input[placeholder*="name" i]');
      return { rows, editorOpen };
    });

    const newErrors = consoleErrors.slice(preClickErrors);
    const newFails = networkFailures.slice(preClickFails);
    results.push({
      index: i,
      catName,
      buttonText: text,
      before: beforeState,
      after: afterState,
      newConsoleErrors: newErrors,
      newNetworkFailures: newFails,
      // Success indicator: item POST succeeded or editor opened or rows increased.
      addSucceeded:
        afterState.rows > beforeState.rows ||
        (afterState.editorOpen && !beforeState.editorOpen) ||
        newFails.some((f) => f.url.includes("/api/workspaces/menu-pricing/items") && f.status < 400),
    });

    await page.screenshot({
      path: join(OUT_DIR, `${LABEL}-cat${i + 1}-${(catName || "unknown").replace(/[^a-z0-9]/gi, "_").slice(0, 20)}.png`),
      fullPage: true,
    });
  }

  findings.checks.perCategory = results;
  findings.checks.summary = {
    categoriesFound: results.length,
    succeeded: results.filter((r) => r.addSucceeded).length,
    failed: results.filter((r) => !r.addSucceeded).length,
    anyConsoleErrors: consoleErrors.length,
    anyNetworkFailures: networkFailures.length,
  };
  findings.pass = results.length > 0 && results.every((r) => r.addSucceeded);

  await writeFile(
    join(OUT_DIR, `${LABEL}-findings.json`),
    JSON.stringify(findings, null, 2),
  );

  console.log("\n===== TIM-3723 Add-button UI repro summary =====");
  console.log(JSON.stringify(findings.checks.summary, null, 2));
  console.log("Full findings:", join(OUT_DIR, `${LABEL}-findings.json`));

  await browser.close();
  process.exit(findings.pass ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(2);
});
