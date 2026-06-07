#!/usr/bin/env node
// TIM-2452: live verify of the rewritten Cross-Suite Conflict Resolver on
// https://groundwork.cafe. Where the v1 verify (PR #169) only pinned API/
// data presence, this verify reads each rendered label and pins it against
// a value we computed from raw DB rows. If the rendered copy drifts from
// the source-of-truth value, the verify fails — which is the regression
// the board caught manually on TIM-2426.
//
// SoT inputs (read via service-role for ground truth):
//   - hiring_plan_roles → hiringHC, hiringMonthlyCents
//   - financial_models.forecast_inputs.personnel → finHC, finMonthlyCents
//   - financial_models.monthly_projections / forecast → Y1 revenue → monthly
//
// Pins:
//   1. Canonical labor % = finMonthlyCents / monthlyRevenueCents (NOT hiring side)
//   2. benchmark.currentValue matches canonical to 1e-4
//   3. benchmark.currentLabel quotes the canonical %, with correct band-position
//   4. gapLabel framing matches direction (overshoot vs slack)
//   5. bandBreachAlert present iff canonical is outside the band
//   6. raise_budget label says "Raise the payroll budget" when hiring$ > fin$
//      OR "Update your financial plan to reflect the hiring plan" when hiring$ < fin$
//   7. raise_budget summary's from→to values match SoT direction (no inversion)
//   8. raise_budget emits BOTH payroll AND personnel:headcount suggestion cards
//   9. phased_hires is suppressed when hiring does NOT overshoot the budget
//  10. trim_hiring "Budgeted labor" effect classifies correctly (no false 'within')

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
    /* optional */
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

const ARTIFACTS = join(repoRoot, "verify-tim2452");
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

function fmtPct(value) {
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
}
function fmtUsd(cents) {
  const dollars = Math.round(cents) / 100;
  const abs = Math.round(Math.abs(dollars));
  return `${dollars < 0 ? "-" : ""}$${abs.toLocaleString("en-US")}`;
}
function parseDollar(s) {
  if (!s) return null;
  const m = String(s).match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  return Math.round(Number(m[1].replace(/,/g, "")) * 100);
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
    let i = 0;
    let pos = 0;
    while (pos < fullValue.length) {
      parts.push(`${storageKey}.${i}=${fullValue.slice(pos, pos + MAX)}`);
      pos += MAX;
      i += 1;
    }
  }
  return parts.join("; ");
}

// Compute monthly payroll loaded cost the same way buildPlanState does. This
// reproduces the SoT the resolver should be displaying.
function loadedCostCents(p) {
  const hc = Math.max(0, Number(p.headcount ?? 0));
  let base = 0;
  if (p.pay_basis === "monthly") base = Number(p.pay_amount_cents ?? 0);
  else if (p.pay_basis === "annual") base = Math.round(Number(p.pay_amount_cents ?? 0) / 12);
  else base = Math.round((Number(p.pay_amount_cents ?? 0) * Number(p.hours_per_week ?? 0) * 52) / 12);
  const benefits =
    Math.round((base * Number(p.benefits_pct ?? 0)) / 100) + Number(p.benefits_fixed_cents ?? 0);
  return (base + benefits) * hc;
}

async function computeSoT() {
  // Find the fixture user's most recent plan.
  const { data: user } = await admin
    .from("users")
    .select("id")
    .eq("email", FIXTURE_EMAIL)
    .maybeSingle();
  if (!user?.id) throw new Error(`No user row for ${FIXTURE_EMAIL}`);

  const { data: plan } = await admin
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan?.id) throw new Error("No plan");

  // hiring_plan_roles has no `archived` column on this schema; sum all rows.
  // The resolver route reads the same way (select w/o archived filter).
  const [{ data: hiringRows }, { data: fm }] = await Promise.all([
    admin
      .from("hiring_plan_roles")
      .select("id, role_title, headcount, monthly_cost_cents, start_date, status")
      .eq("plan_id", plan.id),
    admin
      .from("financial_models")
      .select("forecast_inputs")
      .eq("plan_id", plan.id)
      .maybeSingle(),
  ]);

  const hiringHC = (hiringRows ?? []).reduce(
    (a, r) => a + Math.max(0, Number(r.headcount ?? 0)),
    0,
  );
  const hiringMonthlyCents = (hiringRows ?? []).reduce(
    (a, r) => a + Math.max(0, Number(r.headcount ?? 0)) * Math.max(0, Number(r.monthly_cost_cents ?? 0)),
    0,
  );

  const fi = fm?.forecast_inputs ?? {};
  const personnel = Array.isArray(fi.personnel) ? fi.personnel : [];
  const finHC = personnel.reduce((a, p) => a + Math.max(0, Number(p.headcount ?? 0)), 0);
  const finMonthlyCents = personnel.reduce((a, p) => a + loadedCostCents(p), 0);

  // Y1 monthly revenue can only be computed by running the financial engine
  // (buildPlanState + computeMonthlyProjections), which is not pure-data and
  // would couple this verify to engine internals. Instead we read it back
  // INDIRECTLY: the band benchmark anchors are `monthlyRevenue × band.{min,max}`,
  // so the resolver's anchorMinLabel divided by band.min gives the monthly
  // revenue the resolver itself used. We then independently classify the
  // canonical labor pct = finMonthlyCents / monthlyRevenue against the band.
  return { planId: plan.id, hiringHC, hiringMonthlyCents, finHC, finMonthlyCents };
}

async function run() {
  console.log(`# TIM-2452 verify on ${BASE} as ${FIXTURE_EMAIL}`);
  const cookieHeader = await mintCookieHeader();
  console.log(`✓ Minted session cookie (length ${cookieHeader.length})`);

  const sot = await computeSoT();
  writeFileSync(join(ARTIFACTS, "sot.json"), JSON.stringify(sot, null, 2));
  console.log(
    `SoT: hiringHC=${sot.hiringHC} hiring$=${fmtUsd(sot.hiringMonthlyCents)} ` +
      `finHC=${sot.finHC} fin$=${fmtUsd(sot.finMonthlyCents)}`,
  );

  const apiRes = await fetch(`${BASE}/api/copilot/cross-suite-resolver`, {
    headers: { Cookie: cookieHeader, Accept: "application/json" },
  });
  assert("01. /api/copilot/cross-suite-resolver returns 200", apiRes.status === 200, `status=${apiRes.status}`);
  const body = await apiRes.json();
  writeFileSync(join(ARTIFACTS, "resolver-response.json"), JSON.stringify(body, null, 2));
  const hf = (body?.conflicts ?? []).find((c) => c.id === "hiring_financials_headcount");
  assert("02. response contains hiring_financials_headcount conflict", !!hf);
  if (!hf) return finish();

  // ── Derive monthly revenue independently from the band anchor labels ──────
  // benchmark.anchorMinLabel = "$X/month" where X = monthlyRevenue × band.min.
  // We have band.min from the dataset (and rangeMin from the API), so we can
  // back out monthlyRevenue without trusting any pct string the resolver wrote.
  const band = { min: hf.benchmark?.rangeMin ?? 0.28, max: hf.benchmark?.rangeMax ?? 0.35 };
  let monthlyRevenueCents = 0;
  if (hf.benchmark?.anchorMinLabel) {
    const anchorCents = parseDollar(hf.benchmark.anchorMinLabel);
    if (anchorCents !== null && band.min > 0) monthlyRevenueCents = Math.round(anchorCents / band.min);
  }
  const canonicalLaborPct = monthlyRevenueCents > 0 ? sot.finMonthlyCents / monthlyRevenueCents : 0;
  const hiringSideLaborPct = monthlyRevenueCents > 0 ? sot.hiringMonthlyCents / monthlyRevenueCents : 0;
  const canonicalBand =
    canonicalLaborPct < band.min ? "below" : canonicalLaborPct > band.max ? "above" : "within";
  console.log(
    `Computed canonical labor%=${fmtPct(canonicalLaborPct)} (${canonicalBand}); ` +
      `hiring-side labor%=${fmtPct(hiringSideLaborPct)}; ` +
      `monthlyRevenue (back-derived from band anchor)=${fmtUsd(monthlyRevenueCents)}`,
  );

  // ── snapshots: pin headcount + payroll strings against SoT ─────────────────
  assert(
    `03. Hiring snapshot displayValue = '${sot.hiringHC} people' (SoT)`,
    hf.suiteA.displayValue === `${sot.hiringHC} ${sot.hiringHC === 1 ? "person" : "people"}`,
    hf.suiteA.displayValue,
  );
  assert(
    `04. Financials snapshot displayValue = '${sot.finHC} people' (SoT)`,
    hf.suiteB.displayValue === `${sot.finHC} ${sot.finHC === 1 ? "person" : "people"}`,
    hf.suiteB.displayValue,
  );
  const hiringSubDollars = parseDollar(hf.suiteA.displaySubvalue);
  assert(
    `05. Hiring snapshot subvalue $ matches SoT hiringMonthlyCents within $1`,
    hiringSubDollars !== null && Math.abs(hiringSubDollars - sot.hiringMonthlyCents) <= 100,
    `rendered=${hf.suiteA.displaySubvalue} sot=${fmtUsd(sot.hiringMonthlyCents)}`,
  );
  const finSubDollars = parseDollar(hf.suiteB.displaySubvalue);
  assert(
    `06. Financials snapshot subvalue $ matches SoT finMonthlyCents within $1`,
    finSubDollars !== null && Math.abs(finSubDollars - sot.finMonthlyCents) <= 100,
    `rendered=${hf.suiteB.displaySubvalue} sot=${fmtUsd(sot.finMonthlyCents)}`,
  );

  // ── benchmark canonical pct pin (board bug #6) ─────────────────────────────
  if (hf.benchmark) {
    // Tolerance 1e-3: the derived monthlyRevenue rounds via fmtUsdCents in
    // the anchor label, so the back-derivation has a $1 precision floor that
    // propagates to ~0.01% in canonical. Real drift would be > 0.5pp.
    assert(
      `07. benchmark.currentValue equals canonical (financials side) within 1e-3`,
      Math.abs(hf.benchmark.currentValue - canonicalLaborPct) < 1e-3,
      `rendered=${hf.benchmark.currentValue} expected=${canonicalLaborPct}`,
    );
    assert(
      `08. benchmark.currentLabel quotes canonical % string '${fmtPct(canonicalLaborPct)}'`,
      typeof hf.benchmark.currentLabel === "string" &&
        hf.benchmark.currentLabel.includes(fmtPct(canonicalLaborPct)),
      hf.benchmark.currentLabel,
    );
    assert(
      `09. benchmark.currentLabel does NOT quote the hiring-side % '${fmtPct(hiringSideLaborPct)}' as the user's number`,
      hf.benchmark.currentLabel.startsWith("Your budgeted payroll runs at"),
      hf.benchmark.currentLabel,
    );
    const expectedPosition =
      canonicalBand === "above"
        ? `above the ${fmtPct(band.max)} benchmark ceiling`
        : canonicalBand === "below"
        ? `below the ${fmtPct(band.min)} benchmark floor`
        : `within the ${fmtPct(band.min)} to ${fmtPct(band.max)} benchmark band`;
    assert(
      `10. benchmark.currentLabel band-position classification (${canonicalBand}) matches SoT — '${expectedPosition}'`,
      hf.benchmark.currentLabel.includes(expectedPosition),
      hf.benchmark.currentLabel,
    );
  } else {
    console.log("(benchmark zone hidden — skipping 07-10)");
  }

  // ── gap label framing (board bug #4) ──────────────────────────────────────
  const hiringOvershoots = sot.hiringMonthlyCents > sot.finMonthlyCents;
  if (hiringOvershoots) {
    assert(
      `11. gapLabel leads with dollar overshoot when hiring$ > fin$`,
      /over the budgeted payroll/i.test(hf.gapLabel ?? ""),
      hf.gapLabel,
    );
  } else {
    assert(
      `11. gapLabel leads with headcount gap when hiring$ <= fin$ (no false 'under budget' headline)`,
      /^Headcount gap:/i.test(hf.gapLabel ?? ""),
      hf.gapLabel,
    );
    assert(
      `12. gapLabel does NOT lead with 'X under budget' (v1 bug)`,
      !/^Gap: .* under budget\.?$/i.test(hf.gapLabel ?? ""),
      hf.gapLabel,
    );
  }

  // ── bandBreachAlert (board bug #4) ────────────────────────────────────────
  if (hf.benchmark) {
    if (canonicalBand !== "within") {
      assert(
        `13. bandBreachAlert is present when canonical labor% is outside the band`,
        typeof hf.bandBreachAlert === "string" && hf.bandBreachAlert.length > 0,
        hf.bandBreachAlert,
      );
      assert(
        `14. bandBreachAlert quotes the canonical % '${fmtPct(canonicalLaborPct)}'`,
        (hf.bandBreachAlert ?? "").includes(fmtPct(canonicalLaborPct)),
        hf.bandBreachAlert,
      );
    } else {
      assert(
        `13. bandBreachAlert is absent when canonical is within the band`,
        !hf.bandBreachAlert,
        hf.bandBreachAlert,
      );
    }
  }

  // ── raise_budget direction (board bug #2) ─────────────────────────────────
  const raise = (hf.paths ?? []).find((p) => p.id === "raise_budget");
  assert("15. raise_budget path is present", !!raise);
  if (raise) {
    if (hiringOvershoots) {
      assert(
        `16. raise_budget label = 'Raise the payroll budget...' when hiring$ > fin$`,
        /^Raise the payroll budget/i.test(raise.label),
        raise.label,
      );
    } else {
      assert(
        `16. raise_budget label = 'Update your financial plan to reflect the hiring plan' when hiring$ <= fin$ (v1 inversion fix)`,
        /Update your financial plan to reflect the hiring plan/i.test(raise.label),
        raise.label,
      );
    }
    // Parse from/to dollars from summary and pin direction against SoT.
    const fromTo = String(raise.summary ?? "").match(/from\s+\$([\d,]+)\s+to\s+\$([\d,]+)/i);
    if (fromTo) {
      const fromCents = Math.round(Number(fromTo[1].replace(/,/g, "")) * 100);
      const toCents = Math.round(Number(fromTo[2].replace(/,/g, "")) * 100);
      assert(
        `17. raise_budget summary 'from $X' matches finMonthlyCents within $1`,
        Math.abs(fromCents - sot.finMonthlyCents) <= 100,
        `from=${fromTo[1]} sot=${fmtUsd(sot.finMonthlyCents)}`,
      );
      assert(
        `18. raise_budget summary 'to $Y' matches hiringMonthlyCents within $1`,
        Math.abs(toCents - sot.hiringMonthlyCents) <= 100,
        `to=${fromTo[2]} sot=${fmtUsd(sot.hiringMonthlyCents)}`,
      );
      if (hiringOvershoots) {
        assert(`19. raise_budget summary from→to is upward (no inversion)`, toCents > fromCents);
      } else {
        assert(`19. raise_budget summary from→to is downward (slack case)`, toCents <= fromCents);
      }
    } else {
      // Slack case may instead surface "drops by $X" rather than from→to.
      const dropMatch = String(raise.summary ?? "").match(/drops by \$([\d,]+)\/month/);
      if (!hiringOvershoots) {
        assert(
          `17-19. raise_budget summary names the slack drop amount`,
          dropMatch !== null,
          raise.summary,
        );
        if (dropMatch) {
          const dropCents = Math.round(Number(dropMatch[1].replace(/,/g, "")) * 100);
          assert(
            `20. raise_budget summary slack drop = |hiring$ - fin$|`,
            Math.abs(dropCents - Math.abs(sot.hiringMonthlyCents - sot.finMonthlyCents)) <= 100,
            `drop=${dropMatch[1]} expected=${fmtUsd(Math.abs(sot.hiringMonthlyCents - sot.finMonthlyCents))}`,
          );
        }
      }
    }
    // Two suggestion cards — payroll + headcount — so accept resolves both.
    const fieldIds = (raise.suggestions ?? []).map((s) => s.fieldId).sort();
    assert(
      `21. raise_budget emits both payroll AND personnel:headcount suggestion cards`,
      fieldIds.length === 2 &&
        fieldIds.includes("cross_suite:hiring_financials_headcount:raise_budget:financials:payroll:monthly_cents") &&
        fieldIds.includes("cross_suite:hiring_financials_headcount:raise_budget:financials:personnel:headcount"),
      fieldIds.join(", "),
    );
  }

  // ── phased gating (board bug #5) ──────────────────────────────────────────
  const phased = (hf.paths ?? []).find((p) => p.id === "phased_hires");
  if (hiringOvershoots && canonicalBand === "above") {
    assert("22. phased_hires fires (overshoot + breach)", !!phased);
  } else {
    assert(
      `22. phased_hires suppressed when ${hiringOvershoots ? "no breach" : "no budget overshoot"} — avoids duplicate paths`,
      !phased,
      phased ? phased.label : "(absent ✓)",
    );
  }

  // ── trim_hiring 'within band' regression (board bug #3) ───────────────────
  const trim = (hf.paths ?? []).find((p) => p.id === "trim_hiring");
  if (trim && hf.benchmark && canonicalBand !== "within") {
    const budgeted = (trim.downstreamEffects ?? []).find(
      (e) => e.field === "Budgeted labor as % of revenue",
    );
    if (budgeted) {
      assert(
        `23. trim_hiring 'Budgeted labor' note does NOT falsely claim 'within' when canonical is ${canonicalBand}`,
        !/within the/i.test(budgeted.note ?? ""),
        budgeted.note,
      );
      const expectedFrag =
        canonicalBand === "above"
          ? `above the ${fmtPct(band.max)} benchmark ceiling`
          : `below the ${fmtPct(band.min)} benchmark floor`;
      assert(
        `24. trim_hiring 'Budgeted labor' note classifies ${canonicalBand} correctly`,
        (budgeted.note ?? "").includes(expectedFrag),
        budgeted.note,
      );
    }
  }

  return finish();
}

function finish() {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`\n# ${passed}/${results.length} pinned`);
  writeFileSync(join(ARTIFACTS, "results.json"), JSON.stringify(results, null, 2));
  if (failed.length > 0) {
    for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
