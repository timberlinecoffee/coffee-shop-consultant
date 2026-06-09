// TIM-2557: Pin shop-type × city-tier × currency funding-source calibration.
//
// Before this ticket, defaultFundingSources() returned a flat $10M loan +
// $15M founder equity for every persona, so Year-1 Interest amortized to
// the same $598,491 across all 6 BP personas in TIM-2556 verify. These
// pins assert that the new calibrator (a) sizes loan + founder against
// the calibrated startup-cost total, (b) FX-converts both amounts into
// the plan currency, and (c) the route + financials-page seed paths both
// invoke it so newly-created financial_models rows differ per persona.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  calibrateFundingSources,
  calibratedStartupTotalUsdCents,
  LOAN_SHARE_OF_STARTUP_TOTAL,
  DEFAULT_LOAN_TERM_MONTHS,
  DEFAULT_LOAN_ANNUAL_RATE_PCT,
} from "./funding-source-calibration.ts";
import { defaultFundingSources } from "../financial-projection.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");

function loanLine(sources) {
  return sources.find((s) => s.kind === "loan");
}
function founderLine(sources) {
  return sources.find((s) => s.kind === "founder_equity");
}

// ── Per-persona: realistic, not byte-identical ─────────────────────────────

test("TIM-2557: mobile_cart + Austin (P2) seeds ≤$50k loan, not $10M", () => {
  const sources = calibrateFundingSources({
    shopTypes: ["Mobile cart or pop-up"],
    city: "Austin",
    countryCode: "US",
    currencyCode: "USD",
  });
  const loan = loanLine(sources);
  assert.ok(loan, "loan line present");
  // mobile_cart $50k × tier2 1.0 × 0.65 = $32,500 → rounded to $33,000
  assert.equal(loan.amount_cents, 3_300_000, "P2 loan ≈ $33k");
  assert.notEqual(loan.amount_cents, 1_000_000_000, "P2 loan must not be flat $10M");
  assert.equal(loan.term_months, DEFAULT_LOAN_TERM_MONTHS);
  assert.equal(loan.annual_rate_pct, DEFAULT_LOAN_ANNUAL_RATE_PCT);
});

test("TIM-2557: full_cafe + Seattle (P1) seeds loan ≈ $319k USD", () => {
  const sources = calibrateFundingSources({
    shopTypes: ["Full cafe with food"],
    city: "Seattle",
    countryCode: "US",
    currencyCode: "USD",
  });
  const loan = loanLine(sources);
  // full_cafe $350k × tier1 1.4 = $490k × 0.65 = $318,500 → rounded $319k
  assert.equal(loan.amount_cents, 31_900_000, "P1 loan ≈ $319k");
});

test("TIM-2557: roastery_retail + Mexico City (P6) loan FX-converted to MXN", () => {
  const sources = calibrateFundingSources({
    shopTypes: ["Roastery cafe"],
    city: "Mexico City",
    countryCode: "MX",
    currencyCode: "MXN",
  });
  const loan = loanLine(sources);
  // roastery $400k × tier2 1.0 = $400k × 0.65 = $260k USD × 18 MXN/USD
  //   = MXN 4,680,000 → rounded to nearest $1,000 (100_000 cents).
  assert.equal(loan.amount_cents, 468_000_000, "P6 loan ≈ MXN 4.68M");
});

test("TIM-2557: CAD plan FX-converts loan principal (~×1.37)", () => {
  const sources = calibrateFundingSources({
    shopTypes: ["Full cafe with food"],
    city: "Toronto",
    countryCode: "CA",
    currencyCode: "CAD",
  });
  const loan = loanLine(sources);
  // full_cafe $350k × tier1 1.4 = $490k × 0.65 = $318,500 USD × 1.37
  //   = CAD 436,345 → rounded to nearest $1k = CAD 436,000.
  assert.equal(loan.amount_cents, 43_600_000, "Toronto CAD loan ≈ CAD 436k");
});

test("TIM-2557: AUD plan FX-converts loan principal (~×1.50)", () => {
  const sources = calibrateFundingSources({
    shopTypes: ["Full cafe with food"],
    city: "Melbourne",
    countryCode: "AU",
    currencyCode: "AUD",
  });
  const loan = loanLine(sources);
  // full_cafe $350k × tier1 1.4 = $490k × 0.65 = $318,500 USD × 1.50
  //   = AUD 477,750 → rounded to nearest $1k = AUD 478,000.
  assert.equal(loan.amount_cents, 47_800_000, "Melbourne AUD loan ≈ AUD 478k");
});

// ── Per-persona pairs DIFFER (no byte-identical leak) ──────────────────────

test("TIM-2557: 6 persona signals produce 6 distinct loan principals", () => {
  const personas = [
    { shopTypes: ["Full cafe with food"], city: "Seattle", countryCode: "US", currencyCode: "USD" },
    { shopTypes: ["Mobile cart or pop-up"], city: "Austin", countryCode: "US", currencyCode: "USD" },
    { shopTypes: ["Espresso bar (drinks only)"], city: "Toronto", countryCode: "CA", currencyCode: "CAD" },
    { shopTypes: ["Full cafe with food"], city: "Calgary", countryCode: "CA", currencyCode: "CAD" },
    { shopTypes: ["Drive-through"], city: "Melbourne", countryCode: "AU", currencyCode: "AUD" },
    { shopTypes: ["Roastery cafe"], city: "Mexico City", countryCode: "MX", currencyCode: "MXN" },
  ];
  const loanAmounts = personas.map((p) => loanLine(calibrateFundingSources(p)).amount_cents);
  const unique = new Set(loanAmounts);
  assert.equal(unique.size, personas.length,
    `6 distinct loan principals, got ${unique.size} unique: ${[...unique].join(", ")}`);
});

// ── Loan share + residual structure ────────────────────────────────────────

test("TIM-2557: LOAN_SHARE_OF_STARTUP_TOTAL is 0.65 (SBA 7(a) midpoint)", () => {
  assert.equal(LOAN_SHARE_OF_STARTUP_TOTAL, 0.65);
  assert.ok(LOAN_SHARE_OF_STARTUP_TOTAL >= 0.60 && LOAN_SHARE_OF_STARTUP_TOTAL <= 0.70,
    "loan share within SBA 7(a) 60-70% band");
});

test("TIM-2557: founder + loan ≈ calibrated startup total (USD persona)", () => {
  const signal = {
    shopTypes: ["Full cafe with food"],
    city: "Seattle",
    countryCode: "US",
    currencyCode: "USD",
  };
  const sources = calibrateFundingSources(signal);
  const total = calibratedStartupTotalUsdCents(signal);
  const sum = founderLine(sources).amount_cents + loanLine(sources).amount_cents;
  // Rounding to $1k can shift each leg by ≤ $500, so total can drift up to
  // ±$1,000 (100_000 cents) from the unrounded project total.
  assert.ok(Math.abs(sum - total) <= 100_000,
    `founder+loan (${sum}) ≈ startup total (${total}), drift ≤ $1k`);
});

// ── Backward compat: defaultFundingSources() unchanged ─────────────────────

test("TIM-2557: defaultFundingSources() backward-compat — flat values preserved", () => {
  const sources = defaultFundingSources();
  const loan = loanLine(sources);
  const founder = founderLine(sources);
  // Legacy migrateLegacyFundingSources fallback path still relies on these.
  assert.equal(loan.amount_cents, 1_000_000_000, "legacy default loan unchanged");
  assert.equal(founder.amount_cents, 1_500_000_000, "legacy default founder unchanged");
  assert.equal(loan.term_months, 60);
  assert.equal(loan.annual_rate_pct, 6.5);
});

// ── Drift guards: callers actually invoke calibrateFundingSources ──────────

test("TIM-2557 drift-guard: financials/model/route.ts imports + invokes calibrator", () => {
  const src = readFileSync(
    resolve(REPO, "src/app/api/workspaces/financials/model/route.ts"),
    "utf8",
  );
  assert.ok(
    src.includes('from "@/lib/financials/funding-source-calibration"'),
    "route imports funding-source-calibration",
  );
  assert.ok(
    /forecastInputs\.funding_sources\s*=\s*calibrateFundingSources\(/.test(src),
    "route assigns calibrated funding_sources",
  );
});

test("TIM-2557 drift-guard: financials/page.tsx imports + invokes calibrator", () => {
  const src = readFileSync(
    resolve(REPO, "src/app/(app)/workspace/financials/page.tsx"),
    "utf8",
  );
  assert.ok(
    src.includes('from "@/lib/financials/funding-source-calibration"'),
    "page imports funding-source-calibration",
  );
  assert.ok(
    /forecastInputs\.funding_sources\s*=\s*calibrateFundingSources\(/.test(src),
    "page assigns calibrated funding_sources",
  );
});
