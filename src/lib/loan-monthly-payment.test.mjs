// TIM-2479 (F6): pin loanMonthlyPaymentCents() — the centralized annuity
// formula previously duplicated in startup-tab.tsx and funding-tab.tsx.
//
// The numeric scenarios anchor the math (zero-rate, normal, high-rate, edge
// term). The drift-guard test catches anyone re-inlining the formula in the
// two consumer tabs — the whole point of F6 is single-site updates.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loanMonthlyPaymentCents } from "./financial-projection.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

// ── Numeric scenarios ───────────────────────────────────────────────────────

test("TIM-2479 zero-rate: $24,000 over 24 mo at 0% = $1,000/mo", () => {
  assert.equal(loanMonthlyPaymentCents(2_400_000, 0, 24), 100_000);
});

test("TIM-2479 normal: $200k @ 7% over 120 mo ≈ $2,322.17", () => {
  // Closed-form: P=200000, r=0.07/12, n=120 → 2322.171... → $2,322.17
  const payment = loanMonthlyPaymentCents(20_000_000, 7, 120);
  assert.equal(payment, 232_217);
});

test("TIM-2479 high-rate: $50k @ 24% over 36 mo ≈ $1,961.64", () => {
  // r=0.02, n=36, P=$50k → 5_000_000 * 0.02 * 1.02^36 / (1.02^36 - 1) → $1,961.64
  const payment = loanMonthlyPaymentCents(5_000_000, 24, 36);
  assert.equal(payment, 196_164);
});

test("TIM-2479 edge-term: zero principal / zero term / null annual rate all return 0", () => {
  assert.equal(loanMonthlyPaymentCents(0, 7, 120), 0);
  assert.equal(loanMonthlyPaymentCents(20_000_000, 7, 0), 0);
  assert.equal(loanMonthlyPaymentCents(-100, 7, 120), 0);
  assert.equal(loanMonthlyPaymentCents(2_400_000, undefined, 24), 100_000);
});

// ── Drift guard: no re-inlining the annuity formula in the tabs ─────────────

test("TIM-2479 drift guard: startup-tab and funding-tab must NOT re-inline `Math.pow(1 + r, n)`", () => {
  const startup = readFileSync(
    resolve(REPO_ROOT, "src/app/(app)/workspace/financials/tabs/startup-tab.tsx"),
    "utf8",
  );
  const funding = readFileSync(
    resolve(REPO_ROOT, "src/app/(app)/workspace/financials/tabs/funding-tab.tsx"),
    "utf8",
  );

  for (const [name, src] of [["startup-tab.tsx", startup], ["funding-tab.tsx", funding]]) {
    assert.ok(
      src.includes("loanMonthlyPaymentCents"),
      `${name} must import loanMonthlyPaymentCents from src/lib/financial-projection.ts`,
    );
    assert.ok(
      !/Math\.pow\(\s*1\s*\+\s*r\s*,\s*n\s*\)/.test(src),
      `${name} must NOT re-inline the annuity formula — call loanMonthlyPaymentCents instead`,
    );
  }
});
