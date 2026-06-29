/**
 * TIM-3273 — Live verification on groundwork.cafe (production).
 *
 * Captures 4 PNGs in scripts/screenshots/tim3273/:
 *   1. equipment-hero-cta.png     — Equipment & Supplies workspace: Write with AI CTA visible, Sparkles icon, no "Describe your setup".
 *   2. modal-source-a.png         — Modal open in Source A path (rich concept → spinner "Reading your Concept Suite outputs...").
 *   3. modal-source-b.png         — Modal open in Source B short form (sparse concept → 4-field prompt).
 *   4. modal-overwrite.png        — Overwrite confirmation card visible on an existing list (Add vs Replace radios).
 *
 * Auth: synthetic Pro user via SUPABASE_NEW_SECRET_KEY (post-TIM-2414 cutover).
 * Run:  node scripts/tim3273-write-with-ai-prod-shots.mjs
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "screenshots", "tim3273");

const SUPABASE_URL = "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SUPABASE_SECRET = process.env.SUPABASE_NEW_SECRET_KEY;
const SUPABASE_PUBLISHABLE = process.env.SUPABASE_NEW_PUBLISHABLE_KEY;

if (!SUPABASE_SECRET || !SUPABASE_PUBLISHABLE) {
  console.error("Missing SUPABASE_NEW_SECRET_KEY or SUPABASE_NEW_PUBLISHABLE_KEY env vars.");
  process.exit(1);
}

const SYN_EMAIL = `tim3273+${Date.now()}@timberline.coffee`;
const SYN_PASSWORD = "Tim3273Verify!";

const BASE_URL = "https://groundwork.cafe";
const PROJECT_REF = "ltmcttjftxzpgynhnrpg";
const COOKIE_DOMAIN = ".groundwork.cafe";

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Long content so isConceptRich returns true (≥2 fields ≥60 chars).
const RICH_CONCEPT = {
  version: 2,
  components: {
    shop_identity: {
      content:
        "Pinewood Coffee Bar — a small specialty espresso bar focused on single-origin filter coffee and well-trained baristas.",
      included: true,
    },
    vision: {
      content:
        "A welcoming neighborhood third place where regulars learn to taste the difference between processing methods over a steady morning cadence.",
      included: true,
    },
    target_customer: { content: "", included: true },
    differentiation: { content: "", included: true },
    brand_voice: { content: "", included: true },
    location: {
      content:
        "1,000 sq ft corner-unit storefront on a walkable street with foot traffic, in a residential district near a commuter rail station.",
      included: true,
    },
    offering: {
      content:
        "Espresso program with one La Marzocco Linea Mini-class machine, pour-over bar with three drippers, drip batch brew, and a small selection of pastries from a wholesale baker.",
      included: true,
    },
  },
};

const SPARSE_CONCEPT = {
  version: 2,
  components: {
    shop_identity: { content: "", included: true },
    vision: { content: "", included: true },
    target_customer: { content: "", included: true },
    differentiation: { content: "", included: true },
    brand_voice: { content: "", included: true },
    location: { content: "", included: true },
    offering: { content: "", included: true },
  },
};

async function setConceptDoc(planId, content) {
  // upsert by (plan_id, workspace_key)
  const { error } = await admin
    .from("workspace_documents")
    .upsert(
      { plan_id: planId, workspace_key: "concept", content },
      { onConflict: "plan_id,workspace_key" },
    );
  if (error) throw error;
}

async function createSyntheticUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: SYN_EMAIL,
    password: SYN_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  console.log(`  ✓ Created synthetic user ${SYN_EMAIL} (id=${data.user.id})`);

  const { data: plan, error: planErr } = await admin
    .from("coffee_shop_plans")
    .insert({ user_id: data.user.id, plan_name: "TIM-3273 Verify" })
    .select("id")
    .single();
  if (planErr) throw planErr;
  console.log(`  ✓ Seeded plan ${plan.id}`);

  const { error: userErr } = await admin
    .from("users")
    .update({
      onboarding_completed: true,
      full_name: "TIM-3273 Tester",
      subscription_status: "active",
      subscription_tier: "pro",
    })
    .eq("id", data.user.id);
  if (userErr) throw userErr;
  console.log(`  ✓ Marked user active/pro/onboarded`);

  // Existing items so the overwrite branch fires later.
  const { error: eqErr } = await admin.from("buildout_equipment_items").insert([
    {
      plan_id: plan.id,
      position: 0,
      name: "La Marzocco Linea Mini",
      category: "espresso",
      vendor: "La Marzocco",
      quantity: 1,
      unit_cost_cents: 600000,
    },
    {
      plan_id: plan.id,
      position: 1,
      name: "Mahlkönig E65S GbW",
      category: "grinder",
      vendor: "Mahlkönig",
      quantity: 1,
      unit_cost_cents: 350000,
    },
  ]);
  if (eqErr) throw eqErr;
  console.log(`  ✓ Seeded 2 existing equipment items (for overwrite branch)`);

  return { user: data.user, planId: plan.id };
}

async function deleteSyntheticUser(userId) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) console.warn(`  ! Cleanup failed for ${userId}: ${error.message}`);
  else console.log(`  ✓ Deleted synthetic user ${userId}`);
}

async function getSession() {
  const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email: SYN_EMAIL,
    password: SYN_PASSWORD,
  });
  if (error || !data.session) throw error ?? new Error("No session returned");
  return data.session;
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
  const baseName = `sb-${PROJECT_REF}-auth-token`;
  const CHUNK = 4096;
  const base = {
    domain,
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 3600,
  };
  const cookies = [];
  if (tokenJson.length <= CHUNK) {
    cookies.push({ name: baseName, value: tokenJson, ...base });
  } else {
    let i = 0;
    for (let start = 0; start < tokenJson.length; start += CHUNK) {
      cookies.push({
        name: `${baseName}.${i}`,
        value: tokenJson.slice(start, start + CHUNK),
        ...base,
      });
      i++;
    }
  }
  return cookies;
}

async function dismissCookieBanner(page) {
  const accept = page.locator("text=/Accept|Allow all|Got it/i").first();
  try {
    if (await accept.isVisible({ timeout: 1500 })) {
      await accept.click({ timeout: 1500 });
      await page.waitForTimeout(300);
    }
  } catch {}
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("→ Creating synthetic user…");
  const { user, planId } = await createSyntheticUser();

  // Seed RICH concept first — used for shots 1 + 2 + 4.
  console.log("→ Seeding rich concept doc…");
  await setConceptDoc(planId, RICH_CONCEPT);

  try {
    console.log("→ Signing in…");
    const session = await getSession();

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies(buildAuthCookies(session, COOKIE_DOMAIN));
    const page = await context.newPage();

    // ───────────────────────────────────────────────────────────────────────────
    // 1) Equipment page hero — CTA visible, Sparkles icon, no DescribeSetup
    // ───────────────────────────────────────────────────────────────────────────
    console.log("→ /workspace/buildout-equipment…");
    await page.goto(`${BASE_URL}/workspace/buildout-equipment`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    await dismissCookieBanner(page);
    console.log(`  url=${page.url()}`);
    await page.waitForTimeout(800);

    // Sanity assertion — Write with AI button present.
    const cta = page.getByRole("button", { name: /^Write with AI$/ });
    await cta.first().waitFor({ state: "visible", timeout: 15000 });
    const ctaCount = await cta.count();
    console.log(`  Write with AI button count: ${ctaCount}`);

    // Negative assertion — "Describe your setup" must NOT appear.
    const legacyCount = await page.getByText(/Describe your setup/i).count();
    console.log(`  legacy "Describe your setup" count: ${legacyCount}  (must be 0)`);

    await page.screenshot({ path: join(OUT_DIR, "equipment-hero-cta.png"), fullPage: false });
    console.log("  ✓ equipment-hero-cta.png");

    // ───────────────────────────────────────────────────────────────────────────
    // 2) Open modal → Source A spinner (rich concept → /ai-write auto-POST)
    // ───────────────────────────────────────────────────────────────────────────
    console.log("→ open modal (Source A)…");
    await cta.first().click();
    // Wait for the modal header to render then short delay so step transitions
    // from "checking" → "source-a" (post-GET).
    await page.getByRole("heading", { name: /^Write with AI$/ }).first().waitFor({
      state: "visible",
      timeout: 8000,
    });
    // Give time for GET /ai-write to land and step to flip to source-a (spinner with concept caption).
    let sourceASeen = false;
    for (let i = 0; i < 30; i++) {
      const caption = await page.getByText(/Reading your Concept Suite outputs/i).count();
      if (caption > 0) {
        sourceASeen = true;
        break;
      }
      await page.waitForTimeout(250);
    }
    console.log(`  Source A spinner caption visible: ${sourceASeen}`);
    await page.screenshot({ path: join(OUT_DIR, "modal-source-a.png"), fullPage: false });
    console.log("  ✓ modal-source-a.png");

    // Close modal before re-routing concept doc.
    await page.getByRole("button", { name: /^Close$/ }).first().click().catch(async () => {
      await page.keyboard.press("Escape");
    });
    await page.waitForTimeout(300);

    // ───────────────────────────────────────────────────────────────────────────
    // 3) Switch to SPARSE concept → reopen modal → Source B form
    // ───────────────────────────────────────────────────────────────────────────
    console.log("→ Swapping concept doc to sparse…");
    await setConceptDoc(planId, SPARSE_CONCEPT);

    // Hard reload so the modal's on-mount fetch reads the new value.
    await page.reload({ waitUntil: "networkidle" });
    await dismissCookieBanner(page);
    await page.waitForTimeout(500);

    console.log("→ open modal (Source B)…");
    await page.getByRole("button", { name: /^Write with AI$/ }).first().click();
    // Wait for the source-b form (Floor area input) to render.
    await page.locator("#wai-floor-area").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, "modal-source-b.png"), fullPage: false });
    console.log("  ✓ modal-source-b.png");

    // ───────────────────────────────────────────────────────────────────────────
    // 4) Overwrite confirmation
    //     Intercept the /ai-write POST so we don't burn Anthropic spend AND
    //     get a deterministic preview to proceed from.
    // ───────────────────────────────────────────────────────────────────────────
    console.log("→ intercepting /api/workspaces/buildout/ai-write POST and proceeding to overwrite…");
    const fakeRows = [
      {
        _id: "1",
        name: "Espresso Machine",
        section_name: "Espresso Bar",
        vendor: "La Marzocco",
        model: "Linea Mini",
        supplier: "",
        quantity: 1,
        unit_cost_cents: 600000,
        notes: "",
        category: "espresso_station",
        skip: false,
      },
      {
        _id: "2",
        name: "Grinder",
        section_name: "Espresso Bar",
        vendor: "Mahlkönig",
        model: "E65S GbW",
        supplier: "",
        quantity: 1,
        unit_cost_cents: 350000,
        notes: "",
        category: "espresso_station",
        skip: false,
      },
      {
        _id: "3",
        name: "Knock Box",
        section_name: "Espresso Bar",
        vendor: "",
        model: "",
        supplier: "",
        quantity: 1,
        unit_cost_cents: 6500,
        notes: "",
        category: "smallwares",
        skip: false,
      },
    ];

    await page.route("**/api/workspaces/buildout/ai-write", async (route) => {
      const req = route.request();
      console.log(`    [intercept] ${req.method()} ${req.url()}`);
      if (req.method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ rows: fakeRows }),
        });
      } else {
        await route.continue();
      }
    });
    page.on("response", (resp) => {
      if (resp.url().includes("ai-write")) {
        console.log(`    [response] ${resp.status()} ${resp.url()}`);
      }
    });

    // Fill at least one field. Use Playwright's locator.fill — which triggers
    // React's onChange — so the disabled guard on Generate list clears.
    await page.locator("#wai-floor-area").fill("1,000 sq ft");

    // Scope to the modal overlay — the page also has an in-banner "Generate
    // list" CTA that would otherwise match first().
    const modal = page.locator("div.fixed.inset-0.z-50").last();
    const genLoc = modal.getByRole("button", { name: /^Generate list$/i });
    console.log(`    [generate (in modal) count] ${await genLoc.count()}`);
    await genLoc.click({ force: true });
    // Wait for the preview footer "Add N items" button (scoped to modal).
    const addBtn = modal.getByRole("button", { name: /^Add \d+ items?$/ });
    try {
      await addBtn.first().waitFor({ state: "visible", timeout: 20000 });
    } catch (e) {
      console.error("  preview-step timeout — capturing debug screenshot");
      await page.screenshot({ path: join(OUT_DIR, "_debug-preview-timeout.png"), fullPage: true });
      throw e;
    }
    await addBtn.first().click({ force: true });
    // Wait for the overwrite caption.
    await page
      .getByText(/Your equipment list already has items\. How should these/i)
      .first()
      .waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, "modal-overwrite.png"), fullPage: false });
    console.log("  ✓ modal-overwrite.png");

    await browser.close();
  } finally {
    console.log("→ Cleanup…");
    await deleteSyntheticUser(user.id);
  }

  console.log(`\nAll screenshots saved to ${OUT_DIR}`);
}

run().catch((err) => {
  console.error("Verification script failed:", err);
  process.exit(1);
});
