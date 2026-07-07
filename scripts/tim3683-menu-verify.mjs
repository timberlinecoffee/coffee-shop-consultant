/**
 * TIM-3683 verify — post-deploy end-to-end for all four Menu Workspace bugs.
 *
 * BUG 1: profitability meter — sub-range COGS is green, not yellow.
 * BUG 2: AI menu suggestions never include an item already on the menu (or a
 *        close variant like "Classic Vanilla Latte" when "Vanilla Latte" is
 *        on it).
 * BUG 3: AI-accepted items land with a complete ingredient list (Maple Syrup
 *        Latte includes maple syrup + milk, not just the espresso base).
 * BUG 4: Add button creates a row for every category (beverages, food,
 *        retail, seasonal), not only beverages.
 *
 * Login flow mirrors scripts/tim3676-scout-button-verify.mjs.
 * Run: BASE_URL=https://groundwork.cafe LABEL=prod-after \
 *      SUPABASE_NEW_SECRET_KEY=... SUPABASE_NEW_PUBLISHABLE_KEY=... \
 *      node scripts/tim3683-menu-verify.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots", "tim3683");
const BASE_URL = process.env.BASE_URL ?? "https://groundwork.cafe";
const LABEL = process.env.LABEL ?? "prod-after";

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

async function apiFetch(page, url, opts = {}) {
  return page.evaluate(
    async ({ url, opts }) => {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
        body: opts.body ?? undefined,
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
      return { status: res.status, ok: res.ok, json, text: json ? null : text.slice(0, 200) };
    },
    { url, opts },
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const token = await magiclinkFor("trent@simpler.coffee");
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await loginPlant(context, token);
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[browser-error]", msg.text());
  });

  const findings = { label: LABEL, base: BASE_URL, checks: {} };

  // ─── Load the workspace ────────────────────────────────────────────────
  await page.goto(`${BASE_URL}/workspace/menu-pricing`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(OUT_DIR, `${LABEL}-01-menu-loaded.png`), fullPage: true });

  // Fetch categories + items via API for programmatic checks.
  const catsRes = await apiFetch(page, "/api/workspaces/menu-pricing/categories");
  const cats = Array.isArray(catsRes.json) ? catsRes.json : [];
  const itemsRes = await apiFetch(page, "/api/workspaces/menu-pricing/items");
  const items = Array.isArray(itemsRes.json) ? itemsRes.json : [];
  findings.checks.categories = cats.map((c) => ({
    id: c.id,
    name: c.name,
    low: c.target_cogs_low_pct,
    high: c.target_cogs_high_pct,
  }));
  findings.checks.itemCountBefore = items.length;

  // ─── BUG 4: Add across every category ─────────────────────────────────
  const addResults = [];
  const createdIds = [];
  for (const cat of cats) {
    const position = items.filter((i) => i.category_id === cat.id).length;
    const res = await apiFetch(page, "/api/workspaces/menu-pricing/items", {
      method: "POST",
      body: JSON.stringify({
        name: `TIM-3683 Verify ${cat.name}`,
        category_id: cat.id,
        position,
        price_cents: 0,
      }),
    });
    const pass = res.status === 201 && res.json && res.json.id;
    addResults.push({
      category: cat.name,
      status: res.status,
      pass,
      itemId: pass ? res.json.id : null,
    });
    if (pass) createdIds.push(res.json.id);
  }
  findings.checks.bug4_addAcrossCategories = {
    total: addResults.length,
    passing: addResults.filter((r) => r.pass).length,
    perCategory: addResults,
    pass: addResults.length > 0 && addResults.every((r) => r.pass),
  };

  // ─── BUG 2 + 3: AI suggest respects dedupe and returns full recipes ────
  const suggestRes = await apiFetch(page, "/api/workspaces/menu-pricing/suggest-items", {
    method: "POST",
    body: JSON.stringify({
      concept_context: {
        shop_identity: "Simpler Coffee",
        location: "Calgary, AB",
        target_customer: "morning commuters and remote workers",
        vision: "A neighborhood third place with clean, honest coffee.",
      },
    }),
  });
  const suggestions = Array.isArray(suggestRes.json?.suggestions)
    ? suggestRes.json.suggestions
    : [];
  const existingNames = items.map((i) => (i.name || "").trim()).filter(Boolean);

  // Dedupe check — no suggestion should exactly match or close-variant any
  // existing item name. Uses the same normalization as the server.
  const norm = (raw) =>
    raw
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((t) => t && !new Set(["cafe","café","coffee","house","classic","our","the","a","an","of","style","drink","signature","special"]).has(t))
      .join(" ");
  const existingNorm = existingNames.map(norm).filter(Boolean);
  const dupes = suggestions.filter((s) => {
    const sn = norm(s.name);
    return existingNorm.some((en) => sn === en || sn.includes(en) || en.includes(sn));
  });
  findings.checks.bug2_dedupe = {
    suggestionCount: suggestions.length,
    existingCount: existingNames.length,
    dupeCount: dupes.length,
    dupeSamples: dupes.slice(0, 5).map((d) => d.name),
    pass: suggestions.length > 0 && dupes.length === 0,
  };

  // Ingredient completeness check — every suggestion must have an ingredients
  // array with ≥2 entries (a plain espresso only has 1, so pass if ≥2 for
  // most; require ≥1 as a hard floor).
  const withIngredients = suggestions.filter(
    (s) => Array.isArray(s.ingredients) && s.ingredients.length >= 1,
  );
  const withMultipleIngredients = suggestions.filter(
    (s) => Array.isArray(s.ingredients) && s.ingredients.length >= 2,
  );
  const withPrice = suggestions.filter((s) => typeof s.estimated_price_cents === "number" && s.estimated_price_cents > 0);
  findings.checks.bug3_ingredients = {
    suggestionCount: suggestions.length,
    withIngredients: withIngredients.length,
    withMultipleIngredients: withMultipleIngredients.length,
    withPrice: withPrice.length,
    sample: suggestions.slice(0, 3).map((s) => ({
      name: s.name,
      price_cents: s.estimated_price_cents,
      cogs_cents: s.estimated_cogs_cents,
      ingredient_count: (s.ingredients ?? []).length,
      ingredients: (s.ingredients ?? []).slice(0, 6),
    })),
    // Pass if suggestions came back AND every one has ingredients AND at
    // least 70% have multiple ingredients (single-ingredient items like
    // "Espresso" are OK).
    pass:
      suggestions.length > 0 &&
      withIngredients.length === suggestions.length &&
      withPrice.length === suggestions.length &&
      withMultipleIngredients.length / suggestions.length >= 0.7,
  };

  // End-to-end: accept the first non-trivial suggestion and confirm it lands
  // with ingredients hydrated.
  const target = suggestions.find((s) => (s.ingredients ?? []).length >= 2);
  if (target) {
    const position = items.length + createdIds.length + 1;
    const acceptRes = await apiFetch(page, "/api/workspaces/menu-pricing/items", {
      method: "POST",
      body: JSON.stringify({
        name: target.name,
        category_id: target.category_id,
        position,
        price_cents: target.estimated_price_cents ?? 0,
        ingredients: target.ingredients,
        skip_category_defaults: true,
      }),
    });
    const acceptedId = acceptRes.json?.id ?? null;
    if (acceptedId) createdIds.push(acceptedId);
    const ingRes = acceptedId
      ? await apiFetch(page, `/api/workspaces/menu-pricing/item-ingredients?item_id=${acceptedId}`)
      : { status: 0, json: [] };
    const ingRows = Array.isArray(ingRes.json) ? ingRes.json : [];
    findings.checks.bug3_e2e_accept = {
      suggestion: target.name,
      suggestedIngredientCount: (target.ingredients ?? []).length,
      itemCreatedStatus: acceptRes.status,
      itemHasIngredients: ingRows.length,
      pass: acceptRes.status === 201 && ingRows.length >= (target.ingredients ?? []).length,
    };
  } else {
    findings.checks.bug3_e2e_accept = { pass: false, reason: "no suggestion had ≥2 ingredients" };
  }

  // ─── BUG 1: profitability meter — sub-range COGS should be green ──────
  // Reads the code-under-test directly by importing the pure helper.
  const { cogsChipStatusFor } = await import("../src/lib/menu.ts");
  const scenarios = [
    { cogsPct: 15, catLow: 22, catHigh: 28, expected: "green", label: "under range = green (Bug 1 core)" },
    { cogsPct: 22, catLow: 22, catHigh: 28, expected: "green", label: "at low end = green" },
    { cogsPct: 28, catLow: 22, catHigh: 28, expected: "green", label: "at high end = green" },
    { cogsPct: 30, catLow: 22, catHigh: 28, expected: "yellow", label: "slightly over = yellow" },
    { cogsPct: 40, catLow: 22, catHigh: 28, expected: "red", label: "significantly over = red" },
  ];
  const meterResults = scenarios.map((s) => {
    const chip = cogsChipStatusFor(s.cogsPct, s.catLow, s.catHigh);
    return { ...s, got: chip.status, chipLabel: chip.label, pass: chip.status === s.expected };
  });
  findings.checks.bug1_meter = {
    scenarios: meterResults,
    pass: meterResults.every((r) => r.pass),
  };

  // ─── Cleanup: delete anything we created ───────────────────────────────
  for (const id of createdIds) {
    await apiFetch(page, `/api/workspaces/menu-pricing/items?id=${id}`, { method: "DELETE" });
  }
  findings.checks.cleanup = { deletedCount: createdIds.length };

  // ─── Overall pass ──────────────────────────────────────────────────────
  findings.pass =
    findings.checks.bug1_meter.pass &&
    findings.checks.bug2_dedupe.pass &&
    findings.checks.bug3_ingredients.pass &&
    findings.checks.bug3_e2e_accept.pass &&
    findings.checks.bug4_addAcrossCategories.pass;

  await writeFile(
    join(OUT_DIR, `${LABEL}-findings.json`),
    JSON.stringify(findings, null, 2),
  );

  console.log("\n===== TIM-3683 verify summary =====");
  console.log(JSON.stringify(findings, null, 2));

  await browser.close();
  process.exit(findings.pass ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(2);
});
