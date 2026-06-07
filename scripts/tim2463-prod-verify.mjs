// TIM-2463 prod verify: currency localization fix — provision 6 QA personas
// and confirm that financial_models auto-create inherits users.currency_code,
// not hard-coded USD (fix landed in PR#185 / commit ee6d5cf).
//
// Two-layer verification per persona:
//   1. API layer: GET /api/workspaces/financials/model → check forecast_inputs.currency_code
//   2. Browser layer: screenshot Financials page + currency dropdown
//
// PASS condition: every non-USD persona's financial_models row carries its
// expected currency_code. USD personas must still show USD.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const BASE = "https://groundwork.cafe";
const HOST = "groundwork.cafe";

const envRaw = fs.readFileSync(".env.local", "utf8")
  .split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"));
const env = Object.fromEntries(
  envRaw.map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const shots = "scripts/shots/tim2463";
fs.mkdirSync(shots, { recursive: true });

let passed = 0;
let failed = 0;
function logPass(msg) { console.log("PASS:", msg); passed++; }
function logFail(msg) { console.error("FAIL:", msg); failed++; process.exitCode = 1; }

const TS = Date.now();

const PERSONAS = [
  { n: 1, slug: "p1-seattle", currency: "USD", shopName: "Pioneer Square Coffee Co." },
  { n: 2, slug: "p2-austin",  currency: "USD", shopName: "Lone Star Coffee Cart" },
  { n: 3, slug: "p3-calgary", currency: "CAD", shopName: "Foothills Drive-Thru Coffee" },
  { n: 4, slug: "p4-toronto", currency: "CAD", shopName: "Queen West Co-Brew" },
  { n: 5, slug: "p5-melbourne", currency: "AUD", shopName: "Fitzroy Single Origin" },
  { n: 6, slug: "p6-mexico",  currency: "MXN", shopName: "Roma Norte Tostaduría" },
];

// ──────────────────────────────────────────────────────────────────────────────
// provision helpers
// ──────────────────────────────────────────────────────────────────────────────

async function provision(persona) {
  const email = `qa-tim2463-${persona.slug}+${TS}@groundwork-test.com`;

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password: `TIM2463_${TS}!`,
    email_confirm: true,
  });
  if (cErr || !created?.user) throw new Error(`createUser: ${cErr?.message}`);
  const userId = created.user.id;

  // Wait briefly for handle_new_user trigger to create the users row.
  await new Promise((r) => setTimeout(r, 600));

  const { error: uErr } = await admin.from("users").update({
    currency_code: persona.currency,
    onboarding_completed: true,
    subscription_status: "active",
    subscription_tier: "starter",
    ai_credits_remaining: 100,
    trial_ends_at: null,
  }).eq("id", userId);
  if (uErr) throw new Error(`users.update: ${uErr.message}`);

  const { data: planRow, error: pErr } = await admin.from("coffee_shop_plans")
    .insert({ user_id: userId, plan_name: persona.shopName })
    .select("id")
    .single();
  if (pErr) throw new Error(`coffee_shop_plans.insert: ${pErr.message}`);
  const planId = planRow.id;

  return { userId, planId, email };
}

async function mintSession(email) {
  const { data: linkData, error: lErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (lErr || !linkData?.properties?.hashed_token)
    throw new Error(`generateLink: ${lErr?.message ?? "no hashed_token"}`);

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: otpData, error: oErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (oErr || !otpData?.session) throw new Error(`verifyOtp: ${oErr?.message ?? "no session"}`);
  return otpData.session;
}

function buildCookies(session) {
  const storageKey = `sb-${PROJECT_REF}-auth-token`;
  const payload = JSON.stringify(session);
  const b64 = Buffer.from(payload, "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fullValue = `base64-${b64}`;
  const MAX = 3180;
  const base = { domain: HOST, path: "/", httpOnly: false, sameSite: "Lax", secure: true };
  if (fullValue.length <= MAX) return [{ ...base, name: storageKey, value: fullValue }];
  const chunks = [];
  let pos = 0, i = 0;
  while (pos < fullValue.length) {
    chunks.push({ ...base, name: `${storageKey}.${i}`, value: fullValue.slice(pos, pos + MAX) });
    pos += MAX; i++;
  }
  return chunks;
}

// ──────────────────────────────────────────────────────────────────────────────
// seed + API verify phase
// ──────────────────────────────────────────────────────────────────────────────

console.log("\n=== SEED + API VERIFY PHASE ===");

const provisioned = [];
for (const p of PERSONAS) {
  console.log(`\n[P${p.n}] ${p.slug} (${p.currency})`);
  const { userId, planId, email } = await provision(p);
  const session = await mintSession(email);
  console.log(`  provisioned uid=${userId} planId=${planId} email=${email}`);

  // API check: call /api/workspaces/financials/model with the user's token.
  // This triggers auto-create if no financial_models row exists.
  const apiResp = await fetch(`${BASE}/api/workspaces/financials/model`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      Cookie: `sb-${PROJECT_REF}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`,
    },
  });

  if (!apiResp.ok) {
    logFail(`[P${p.n}] /api/workspaces/financials/model → ${apiResp.status} ${await apiResp.text().catch(() => "")}`);
    provisioned.push({ ...p, userId, planId, email, session, apiOk: false });
    continue;
  }

  const model = await apiResp.json();
  const actualCurrency = model?.forecast_inputs?.currency_code ?? "(missing)";
  if (actualCurrency === p.currency) {
    logPass(`[P${p.n}] ${p.slug}: API forecast_inputs.currency_code = ${actualCurrency} ✓`);
  } else {
    logFail(`[P${p.n}] ${p.slug}: expected ${p.currency}, API returned currency_code=${actualCurrency}`);
  }

  provisioned.push({ ...p, userId, planId, email, session, apiOk: true, actualCurrency });
}

// ──────────────────────────────────────────────────────────────────────────────
// browser screenshot phase
// ──────────────────────────────────────────────────────────────────────────────

console.log("\n=== BROWSER SCREENSHOT PHASE ===");

const browser = await chromium.launch();

for (const p of provisioned) {
  console.log(`\n[P${p.n}] ${p.slug} — browser verify (expected ${p.currency})`);
  const cookies = buildCookies(p.session);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([
    ...cookies,
    { name: "gw_consent", value: "all", domain: HOST, path: "/", secure: true, sameSite: "Lax" },
  ]);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log(`  PAGE ERR: ${m.text()}`); });

  await page.goto(`${BASE}/workspace/financials`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);

  // Dismiss cookie consent if present.
  const consent = page.locator('[role="dialog"]').filter({ hasText: /cookie|consent/i }).first();
  if (await consent.isVisible().catch(() => false)) {
    const btn = consent.getByRole("button").first();
    await btn.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  const shotBase = `${shots}/${p.slug}`;
  await page.screenshot({ path: `${shotBase}__01-financials-full.png`, fullPage: false });
  console.log(`  shot: ${shotBase}__01-financials-full.png`);

  // Try to open the currency dropdown.
  const currencyTrigger = page
    .locator("button, [role='button'], select")
    .filter({ hasText: new RegExp(p.currency.length === 3 ? p.currency : "USD|CAD|AUD|MXN") })
    .first();
  if (await currencyTrigger.count()) {
    await currencyTrigger.click().catch(() => {});
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: `${shotBase}__02-currency-dropdown.png`, fullPage: false });
  console.log(`  shot: ${shotBase}__02-currency-dropdown.png`);

  // Navigate to P&L tab.
  const pnlTab = page.getByRole("tab", { name: /p.?&.?l|profit|projection/i }).first()
    .or(page.getByRole("link", { name: /p.?&.?l|profit/i }).first());
  if (await pnlTab.count()) {
    await pnlTab.click().catch(() => {});
    await page.waitForTimeout(1500);
  } else {
    await page.goto(`${BASE}/workspace/financials?tab=pnl`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${shotBase}__03-financials-pnl.png`, fullPage: false });
  console.log(`  shot: ${shotBase}__03-financials-pnl.png`);

  // Text-level check on the rendered page.
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const hasCorrect = new RegExp(`\\b${p.currency}\\b`).test(bodyText);
  if (hasCorrect) {
    logPass(`[P${p.n}] ${p.slug}: ${p.currency} visible in browser Financials page`);
  } else {
    const found = ["USD", "CAD", "AUD", "MXN"].find((c) => c !== p.currency && new RegExp(`\\b${c}\\b`).test(bodyText));
    logFail(`[P${p.n}] ${p.slug}: ${p.currency} NOT visible in browser — ${found ? `shows ${found} instead` : "no known currency found (check screenshot)"}`);
  }

  await ctx.close();
}

await browser.close();

// ──────────────────────────────────────────────────────────────────────────────
// summary
// ──────────────────────────────────────────────────────────────────────────────

console.log(`\n=== TIM-2463 VERIFY RESULTS ===`);
console.log(`  Passed: ${passed} / Failed: ${failed}`);
if (failed === 0) {
  console.log(`  STATUS: PASS — currency localization fix verified on prod.`);
} else {
  console.log(`  STATUS: FAIL — ${failed} check(s) failed. See FAIL lines and screenshots above.`);
}
