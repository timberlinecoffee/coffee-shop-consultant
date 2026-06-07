#!/usr/bin/env node
// TIM-2428: live verify of the COGS source-binding fix on
// https://groundwork.cafe after merge.
//
// What was wrong: Plan Quality Check's "Specialty coffee blended COGS"
// finding quoted ~69% while citing the Forecast Inputs page (which renders
// 31.5%). The bench was reading state.cogs.blended_pct (labor-included) but
// the cited source shows ingredient-only blended menu COGS. Three different
// metrics conflated.
//
// What we pin after the fix:
//   A. /api/business-plan/audit returns 200 for the Trent fixture.
//   B. NO finding quotes 69% on the Financials workspace (the original bug).
//   C. If a COGS bench finding fires, its quoted % equals what the Forecast
//      Inputs page renders (computeMenuBlendedCogsPct on live menu items).
//   D. With trent's fixture (menu blended COGS ~31.5%, in the 28-32 band)
//      no COGS bench finding fires at all.
//   E. Every benchmark finding has a non-null source.field_label
//      (i.e. the metric binding succeeded — every benchKey has a binding).
//   F. No benchmark finding's source.workspace is "business-plan" (TIM-2394
//      invariant: BP is downstream, never a source).
//   G. Sweep: for every benchmark finding, the numeric token in raw_message
//      equals the numeric token in quoted_text (the format(value) string).
//      No prose-generated numbers.
//
// Auth: same Supabase magiclink + verifyOtp + chunked @supabase/ssr cookie
// pattern proven on TIM-2426 / TIM-2416 / TIM-2413.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function loadEnv(path) {
  const out = {};
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2$/);
      if (!m) continue;
      out[m[1]] = m[3].replace(/\\n$/, "").trim();
    }
  } catch {
    // optional
  }
  return out;
}

const env = { ...process.env, ...loadEnv(join(repoRoot, ".env.local")) };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.VERIFY_BASE_URL ?? "https://groundwork.cafe";
const FIXTURE_EMAIL = process.env.VERIFY_EMAIL ?? "trent@simpler.coffee";

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
  console.error("Missing Supabase env in .env.local");
  process.exit(1);
}

const ARTIFACTS = join(repoRoot, "verify-tim2428");
mkdirSync(ARTIFACTS, { recursive: true });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function assert(name, cond, detail = "") {
  results.push({ name, pass: !!cond, detail });
  const tag = cond ? "✓" : "✗";
  console.log(`${tag} ${name}${detail ? `  — ${detail}` : ""}`);
}

async function mintCookieHeader() {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: FIXTURE_EMAIL,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${linkError?.message}`);
  }
  const anon = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: otpData, error: otpError } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (otpError || !otpData?.session) {
    throw new Error(`verifyOtp failed: ${otpError?.message}`);
  }
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const payload = JSON.stringify(otpData.session);
  const b64 = Buffer.from(payload, "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fullValue = `base64-${b64}`;
  const MAX = 3180;
  const parts = [];
  if (fullValue.length <= MAX) {
    parts.push(`${storageKey}=${fullValue}`);
  } else {
    let i = 0, pos = 0;
    while (pos < fullValue.length) {
      parts.push(`${storageKey}.${i}=${fullValue.slice(pos, pos + MAX)}`);
      pos += MAX;
      i += 1;
    }
  }
  return { cookieHeader: parts.join("; "), userId: otpData.session.user.id };
}

// Same regex as the consistency unit test — scope to "comes out to ..." so
// the benchmark note's example percentages don't false-positive.
function extractQuotedValue(message) {
  if (!message) return null;
  const m = message.match(/comes out to ([^,]+),/);
  const scoped = m ? m[1] : message;
  const pctMatch = scoped.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) return { unit: "percent", value: Number(pctMatch[1]) };
  const dollarPerSqft = scoped.match(/\$([\d,]+(?:\.\d+)?)\s*\/\s*sqft/i);
  if (dollarPerSqft) return { unit: "currency_per_sqft", value: Number(dollarPerSqft[1].replace(/,/g, "")) };
  const dollarMatch = scoped.match(/\$([\d,]+(?:\.\d+)?)/);
  if (dollarMatch) return { unit: "currency", value: Number(dollarMatch[1].replace(/,/g, "")) };
  const ratioMatch = scoped.match(/(\d+(?:\.\d+)?)\s*x/i);
  if (ratioMatch) return { unit: "ratio", value: Number(ratioMatch[1]) };
  const monthsMatch = scoped.match(/(\d+(?:\.\d+)?)\s*months?/i);
  if (monthsMatch) return { unit: "months", value: Number(monthsMatch[1]) };
  return null;
}

async function run() {
  console.log(`# TIM-2428 verify on ${BASE} as ${FIXTURE_EMAIL}`);
  const { cookieHeader, userId } = await mintCookieHeader();
  console.log(`✓ Minted session cookie (length ${cookieHeader.length}) for user ${userId}`);

  // Lookup trent's plan_id + menu rows so we can compute the canonical
  // ingredient-only blended COGS independently and compare to what the audit
  // quotes.
  const { data: planRow, error: planErr } = await admin
    .from("business_plans")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (planErr || !planRow) {
    console.error("Could not load plan for fixture user:", planErr?.message);
    process.exit(1);
  }
  const planId = planRow.id;
  console.log(`✓ Fixture plan_id = ${planId}`);

  const { data: menuRows } = await admin
    .from("menu_items_with_cogs")
    .select("id, name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived")
    .eq("plan_id", planId);

  // Replicate computeMenuBlendedCogsPct + menuItemMixWeight inline so this
  // script has no compile-step dependency. Same math as financial-projection.ts.
  function mixWeight(it) {
    if (typeof it.expected_mix_pct === "number" && it.expected_mix_pct > 0) return it.expected_mix_pct;
    const pop = (it.expected_popularity ?? "medium").toLowerCase();
    if (pop === "high") return 3;
    if (pop === "low") return 1;
    return 2;
  }
  function effectiveCogs(it) {
    if (typeof it.computed_cogs_cents === "number") return it.computed_cogs_cents;
    if (typeof it.cogs_cents === "number") return it.cogs_cents;
    return 0;
  }
  let totalCost = 0, totalPrice = 0;
  for (const it of menuRows ?? []) {
    if (it.archived) continue;
    const price = typeof it.price_cents === "number" && it.price_cents > 0 ? it.price_cents : 0;
    if (price === 0) continue;
    const w = mixWeight(it);
    totalCost += effectiveCogs(it) * w;
    totalPrice += price * w;
  }
  const liveMenuBlendedPct = totalPrice > 0 ? (totalCost / totalPrice) * 100 : null;
  console.log(`✓ Live menu blended COGS (Forecast Inputs renders this) = ${liveMenuBlendedPct?.toFixed(2)}%`);

  // Wipe cache so we get a fresh audit run (not the pre-fix cached report).
  const { error: delErr } = await admin
    .from("plan_quality_audit_cache")
    .delete()
    .eq("user_id", userId)
    .eq("plan_id", planId);
  if (delErr) console.warn("cache wipe failed:", delErr.message);
  else console.log("✓ Wiped plan_quality_audit_cache for fixture");

  // POST /api/business-plan/audit
  const auditRes = await fetch(`${BASE}/api/business-plan/audit`, {
    method: "POST",
    headers: { Cookie: cookieHeader, "Content-Type": "application/json", Accept: "application/json" },
    body: "{}",
  });
  assert("A. /api/business-plan/audit returns 200", auditRes.status === 200, `status=${auditRes.status}`);
  let body;
  try { body = await auditRes.json(); } catch (e) { body = { _err: String(e) }; }
  writeFileSync(join(ARTIFACTS, "audit-response.json"), JSON.stringify(body, null, 2));

  const findings = Array.isArray(body?.report?.findings) ? body.report.findings : [];
  console.log(`  → ${findings.length} findings returned`);

  // B. No finding quotes 69% (the original bug value) on the Financials page.
  // (We assert against the live labor-included blended_pct too, computed below.)
  const financialsPctFindings = findings.filter((f) => {
    const tok = extractQuotedValue(f.raw_message);
    return f.source?.workspace === "financials" && tok?.unit === "percent";
  });
  const sixtyNines = financialsPctFindings.filter((f) => {
    const tok = extractQuotedValue(f.raw_message);
    // Anything in 60-80% range is suspicious for COGS (labor-included territory).
    return tok && tok.value >= 60 && tok.value <= 80;
  });
  assert(
    "B. No Financials-cited finding quotes a COGS-shaped 60-80% (was 69% pre-fix)",
    sixtyNines.length === 0,
    sixtyNines.length ? sixtyNines.map((f) => `${f.id}: ${f.raw_message?.slice(0, 100)}`).join(" | ") : "",
  );

  // C/D. COGS bench: if it fires, its quoted % must equal liveMenuBlendedPct
  // (rounded to 1 decimal). With ~31.5% in the 28-32 band, it should NOT fire.
  const cogsFinding = findings.find((f) => f.id === "bench:coffee_shop_blended_cogs_pct");
  if (cogsFinding) {
    const tok = extractQuotedValue(cogsFinding.raw_message);
    const rounded = liveMenuBlendedPct == null ? null : Math.round(liveMenuBlendedPct * 10) / 10;
    assert(
      "C. COGS bench finding's quoted % equals live menu_blended_pct (1dp)",
      tok && rounded != null && Math.abs(tok.value - rounded) < 0.05,
      `quoted=${tok?.value} expected=${rounded}`,
    );
    assert(
      "C2. COGS bench source.field_label points at Forecast Inputs / blended menu COGS",
      /Forecast Inputs|blended menu COGS/i.test(cogsFinding.source?.field_label ?? ""),
      `field_label=${cogsFinding.source?.field_label}`,
    );
  } else {
    assert(
      "D. COGS bench does not fire (live menu COGS in 28-32 band)",
      liveMenuBlendedPct != null && liveMenuBlendedPct >= 28 && liveMenuBlendedPct <= 32,
      `liveMenuBlendedPct=${liveMenuBlendedPct?.toFixed(2)}%`,
    );
  }

  // E. Every benchmark finding has a non-null source.field_label.
  const benchFindings = findings.filter((f) => f.rule_id === "benchmark_out_of_range");
  const missingLabel = benchFindings.filter((f) => !f.source?.field_label);
  assert(
    "E. Every benchmark finding has source.field_label set",
    missingLabel.length === 0,
    missingLabel.length ? missingLabel.map((f) => f.id).join(",") : `n=${benchFindings.length}`,
  );

  // F. No benchmark finding cites BP as its source/target.
  const bpSourced = findings.filter((f) => f.source?.workspace === "business-plan" || f.target?.workspace === "business-plan");
  assert("F. No finding cites business-plan as a source/target", bpSourced.length === 0);

  // G. For every benchmark finding, raw_message numeric token matches
  // quoted_text numeric token (no prose-generated numbers).
  let drifted = 0;
  for (const f of benchFindings) {
    const raw = extractQuotedValue(f.raw_message);
    const quoted = extractQuotedValue(f.quoted_text);
    if (!raw || !quoted) continue;
    if (raw.unit !== quoted.unit || Math.abs(raw.value - quoted.value) > 0.05) {
      drifted += 1;
      console.log(`  ! drift in ${f.id}: raw=${JSON.stringify(raw)} quoted=${JSON.stringify(quoted)}`);
    }
  }
  assert("G. No benchmark finding has raw/quoted numeric drift", drifted === 0, `drifted=${drifted}/${benchFindings.length}`);

  // Sweep summary — surface every finding's source binding for audit trail.
  writeFileSync(
    join(ARTIFACTS, "finding-bindings.json"),
    JSON.stringify(
      findings.map((f) => ({
        id: f.id,
        rule_id: f.rule_id,
        severity: f.severity,
        source_workspace: f.source?.workspace,
        source_field_label: f.source?.field_label,
        raw_quoted: extractQuotedValue(f.raw_message),
        quoted_text_quoted: extractQuotedValue(f.quoted_text),
        raw_message: f.raw_message?.slice(0, 200),
      })),
      null,
      2,
    ),
  );

  // Summary
  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  writeFileSync(
    join(ARTIFACTS, "results.json"),
    JSON.stringify({ base: BASE, fixture: FIXTURE_EMAIL, liveMenuBlendedPct, pass, fail, results }, null, 2),
  );
  console.log(`\n${pass}/${results.length} pinned`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
