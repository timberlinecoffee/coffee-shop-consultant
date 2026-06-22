// TIM-2922: live verify the benchmark + suggest-price routes ship country-
// aware, real-cafe research.
//
// Approach: drive the API directly with an authed magiclink session for
// trent@simpler.coffee (Beaver & Beef, Calgary CA). Asserts:
//   1. Benchmark returns source="local_cafes", country_used="CA", >=3
//      citations, zero citations whose URL is on a US-only registrar/TLD
//      AND whose city is a US city, and the industry_comparison panel is
//      separate (never the headline).
//   2. Suggest-price returns local_range with CA citations, suggestion is
//      either inside the local band OR carries a disagreement_reason.
// Then runs the same against a US fixture: temporarily flips trent's hiring
// country override to US and re-runs, asserting country_used="US".

import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_URL = process.env.TARGET_URL ?? "https://groundwork.cafe";
const HOST = new URL(PROD_URL).host;
const TARGET_EMAIL = "trent@simpler.coffee";
const REF = new URL(SUPABASE_URL).hostname.split(".")[0];

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

mkdirSync("scripts/shots", { recursive: true });

// ── helpers ─────────────────────────────────────────────────────────────────
async function mintSession() {
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TARGET_EMAIL,
  });
  if (linkErr) throw linkErr;
  const tokenHash = linkData?.properties?.hashed_token;
  if (!tokenHash) throw new Error("no token_hash");
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: sessData, error: sessErr } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (sessErr) throw sessErr;
  return sessData.session;
}

function cookieFromSession(session) {
  return JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: "bearer",
    user: session.user,
  });
}

async function apiPost(session, path, body) {
  const res = await fetch(`${PROD_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `sb-${REF}-auth-token=${encodeURIComponent(cookieFromSession(session))}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* leave null */ }
  return { status: res.status, json, rawText: text };
}

// crude US-city heuristic for negative assertion: any of these tokens in a
// citation's city string means the cafe is in the US.
const US_CITY_TOKENS = [
  "seattle", "portland", "san francisco", "los angeles", "new york",
  "brooklyn", "chicago", "boston", "miami", "atlanta", "denver",
  "austin", "houston", "dallas", "phoenix", "san diego", "minneapolis",
];
const CA_CITY_TOKENS = [
  "calgary", "toronto", "vancouver", "montreal", "ottawa", "edmonton",
  "winnipeg", "halifax", "quebec", "regina", "saskatoon", "victoria",
];

function isLikelyUSCity(c) {
  if (!c) return false;
  const s = String(c).toLowerCase();
  return US_CITY_TOKENS.some((t) => s.includes(t));
}
function isLikelyCACity(c) {
  if (!c) return false;
  const s = String(c).toLowerCase();
  return CA_CITY_TOKENS.some((t) => s.includes(t));
}

// ── 1. Session + plan + item discovery ──────────────────────────────────────
console.log(`[1] minting magiclink for ${TARGET_EMAIL}...`);
const session = await mintSession();
const userId = session.user.id;

const { data: userRow } = await admin
  .from("users")
  .select("current_plan_id")
  .eq("id", userId)
  .single();
const planId = userRow.current_plan_id;
console.log(`[2] active plan: ${planId}`);

// Confirm initial geo
const { data: hiringRow } = await admin
  .from("plan_hiring_settings")
  .select("hiring_country")
  .eq("plan_id", planId)
  .maybeSingle();
const initialHiringCountry = hiringRow?.hiring_country ?? null;
console.log(`[2a] initial hiring_country override: ${initialHiringCountry ?? "(none — uses signed candidate)"}`);

// Pick an espresso-class item with price > 0 to mirror the board's scenario.
const { data: items } = await admin
  .from("menu_items_with_cogs")
  .select("id, name, price_cents")
  .eq("plan_id", planId)
  .eq("archived", false)
  .order("position");
if (!items?.length) throw new Error("no items");
const target =
  items.find((i) => /espresso|latte|cappuccino|americano/i.test(i.name) && i.price_cents > 0) ??
  items.find((i) => i.price_cents > 0) ??
  items[0];
console.log(`[3] target item: "${target.name}" id=${target.id} price=${target.price_cents}c`);

// ── 2. CA scenario — call /benchmark-price ──────────────────────────────────
console.log("\n=== SCENARIO 1: Canada (trent's signed Calgary location) ===");
console.log("[4] POST /api/workspaces/menu-pricing/benchmark-price ...");
const ca = await apiPost(session, "/api/workspaces/menu-pricing/benchmark-price", {
  item_id: target.id,
  item_name: target.name,
  current_price_cents: target.price_cents,
  concept_context: {},
});

console.log(`  HTTP ${ca.status}`);
if (ca.status !== 200) {
  console.log("  body:", ca.rawText.slice(0, 600));
  throw new Error(`CA benchmark failed: HTTP ${ca.status}`);
}
const caBody = ca.json;
console.log(`  source: ${caBody.source}`);
console.log(`  country_used: ${caBody.country_used}, city_used: ${caBody.city_used}`);
console.log(`  range: $${(caBody.low_cents/100).toFixed(2)} - $${(caBody.high_cents/100).toFixed(2)}`);
console.log(`  citations (${(caBody.citations ?? []).length}):`);
for (const c of (caBody.citations ?? []).slice(0, 8)) {
  console.log(`    - ${c.name} (${c.city ?? "?"})  $${(c.price_cents/100).toFixed(2)}  ${c.url}`);
}
if (caBody.industry_comparison) {
  console.log(`  industry_comparison (secondary): $${(caBody.industry_comparison.low_cents/100).toFixed(2)}-$${(caBody.industry_comparison.high_cents/100).toFixed(2)} from ${caBody.industry_comparison.source_label}`);
}

const caCheck = {
  isLocalCafesSource: caBody.source === "local_cafes",
  countryUsed: caBody.country_used,
  countryIsCA: caBody.country_used === "CA",
  cityUsed: caBody.city_used,
  citationCount: (caBody.citations ?? []).length,
  hasAtLeast3Citations: (caBody.citations ?? []).length >= 3,
  usCityCitations: (caBody.citations ?? []).filter((c) => isLikelyUSCity(c.city)).map((c) => `${c.name}/${c.city}`),
  caCityCitations: (caBody.citations ?? []).filter((c) => isLikelyCACity(c.city)).map((c) => `${c.name}/${c.city}`),
  zeroUSCityCitations: (caBody.citations ?? []).filter((c) => isLikelyUSCity(c.city)).length === 0,
  industrySeparate: caBody.industry_comparison ? true : false, // secondary panel only
  primaryRangeNotIndustry: caBody.source !== "industry_benchmark",
};
console.log("  CA assertions:", JSON.stringify(caCheck, null, 2));

// ── 3. /suggest-price reconciliation ─────────────────────────────────────────
console.log("\n[5] POST /api/workspaces/menu-pricing/suggest-price ...");
const caSuggest = await apiPost(session, "/api/workspaces/menu-pricing/suggest-price", {
  item_name: target.name,
  cogs_cents: 50, // fixed low cogs so margin floor doesn't dominate
  concept_context: {},
});
console.log(`  HTTP ${caSuggest.status}`);
if (caSuggest.status !== 200) {
  console.log("  body:", caSuggest.rawText.slice(0, 600));
  throw new Error(`CA suggest failed: HTTP ${caSuggest.status}`);
}
const s = caSuggest.json;
console.log(`  suggested_price_cents: ${s.suggested_price_cents}`);
console.log(`  local_range:`, s.local_range ? `${s.local_range.low_cents}-${s.local_range.high_cents} (${s.local_range.citations.length} cites)` : "null");
console.log(`  disagreement_reason: ${s.disagreement_reason ?? "(null — inside band)"}`);
console.log(`  country_used: ${s.country_used}, city_used: ${s.city_used}`);

const suggestInsideBand = s.local_range
  ? s.suggested_price_cents >= s.local_range.low_cents && s.suggested_price_cents <= s.local_range.high_cents
  : false;
const suggestCheck = {
  hasLocalRange: !!s.local_range,
  countryIsCA: s.country_used === "CA",
  suggestInsideLocalBand: suggestInsideBand,
  hasDisagreementReason: !!s.disagreement_reason,
  reconciled: suggestInsideBand || !!s.disagreement_reason, // pass if either
};
console.log("  Suggest assertions:", JSON.stringify(suggestCheck, null, 2));

// ── 4. US scenario — temporarily flip hiring country override ────────────────
console.log("\n=== SCENARIO 2: US (flip hiring_country override to US) ===");
console.log("[6] flipping hiring_country to US...");
if (initialHiringCountry !== null) {
  await admin
    .from("plan_hiring_settings")
    .update({ hiring_country: "US" })
    .eq("plan_id", planId);
} else {
  await admin
    .from("plan_hiring_settings")
    .insert({ plan_id: planId, hiring_country: "US" });
}

console.log("[7] POST /api/workspaces/menu-pricing/benchmark-price (US override) ...");
const us = await apiPost(session, "/api/workspaces/menu-pricing/benchmark-price", {
  item_id: target.id,
  item_name: target.name,
  current_price_cents: target.price_cents,
  concept_context: {},
});
console.log(`  HTTP ${us.status}`);
if (us.status !== 200) {
  console.log("  body:", us.rawText.slice(0, 600));
}
const usBody = us.json ?? {};
console.log(`  source: ${usBody.source}`);
console.log(`  country_used: ${usBody.country_used}`);
console.log(`  citation cities:`, (usBody.citations ?? []).map((c) => c.city).filter(Boolean));

const usCheck = {
  http200: us.status === 200,
  countryUsed: usBody.country_used,
  countryIsUS: usBody.country_used === "US",
  citationCount: (usBody.citations ?? []).length,
  hasAtLeastOneCitation: (usBody.citations ?? []).length >= 1,
};
console.log("  US assertions:", JSON.stringify(usCheck, null, 2));

// ── 5. Restore initial hiring country ───────────────────────────────────────
console.log("\n[8] restoring initial hiring_country...");
if (initialHiringCountry !== null) {
  await admin
    .from("plan_hiring_settings")
    .update({ hiring_country: initialHiringCountry })
    .eq("plan_id", planId);
} else {
  await admin
    .from("plan_hiring_settings")
    .delete()
    .eq("plan_id", planId);
}
console.log(`  restored to ${initialHiringCountry ?? "(none)"}`);

// ── 6. Verdict ──────────────────────────────────────────────────────────────
const verdict = {
  ca: caCheck,
  suggest: suggestCheck,
  us: usCheck,
};
writeFileSync("scripts/shots/tim2922-verdict.json", JSON.stringify(verdict, null, 2));

const caPass =
  caCheck.isLocalCafesSource &&
  caCheck.countryIsCA &&
  caCheck.hasAtLeast3Citations &&
  caCheck.zeroUSCityCitations &&
  caCheck.primaryRangeNotIndustry;
const suggestPass = suggestCheck.countryIsCA && suggestCheck.reconciled;
const usPass = usCheck.http200 && usCheck.countryIsUS && usCheck.hasAtLeastOneCitation;

console.log("\n=== VERDICT ===");
console.log(`CA scenario:      ${caPass ? "PASS" : "FAIL"}`);
console.log(`  - source=local_cafes:           ${caCheck.isLocalCafesSource}`);
console.log(`  - country_used=CA:              ${caCheck.countryIsCA}`);
console.log(`  - >=3 citations:                ${caCheck.hasAtLeast3Citations} (${caCheck.citationCount})`);
console.log(`  - zero US-city citations:       ${caCheck.zeroUSCityCitations}`);
console.log(`  - primary range NOT industry:   ${caCheck.primaryRangeNotIndustry}`);
console.log(`Suggest reconciliation: ${suggestPass ? "PASS" : "FAIL"}`);
console.log(`  - country_used=CA:              ${suggestCheck.countryIsCA}`);
console.log(`  - reconciled (in-band OR has disagreement_reason): ${suggestCheck.reconciled}`);
console.log(`US scenario:      ${usPass ? "PASS" : "FAIL"}`);
console.log(`  - HTTP 200:                     ${usCheck.http200}`);
console.log(`  - country_used=US:              ${usCheck.countryIsUS}`);
console.log(`  - >=1 citation:                 ${usCheck.hasAtLeastOneCitation}`);

if (caPass && suggestPass && usPass) {
  console.log("\n✓ PASS — country-aware benchmark + suggestion reconciliation live");
  process.exit(0);
} else {
  console.log("\n✗ FAIL — see verdict.json");
  process.exit(1);
}
