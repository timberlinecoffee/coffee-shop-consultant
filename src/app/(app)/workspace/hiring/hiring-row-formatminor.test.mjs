// TIM-2476 / TIM-2454 F4: pin that the hiring role-row monthly payroll
// summary renders through the active-currency `formatMinor()` selector
// (from CurrencyProvider) and never re-introduces the hard-coded `$` +
// integer-rounded inline math that ignored locale + cents.
//
// Source pin: src/app/(app)/workspace/hiring/hiring-workspace.tsx
//   - role header row (RoleRow) — the `${headcount} headcount · …/mo` line
//
// Originating bug: AUD-locale account (TIM-2459 Melbourne persona) rendered
// `$2500/mo` instead of `A$2,500.00/mo`, directly contradicting the
// TIM-2463 currency-init fix.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = await readFile(path.join(__dirname, "hiring-workspace.tsx"), "utf8");

test("hiring-workspace pulls formatMinor from useCurrency()", () => {
  assert.match(
    SRC,
    /useCurrency\s*\(\s*\)/,
    "RoleRow must read formatMinor from useCurrency()",
  );
  assert.match(
    SRC,
    /\{\s*formatMinor\s*\}\s*=\s*useCurrency\s*\(\s*\)/,
    "formatMinor must be destructured from useCurrency()",
  );
});

test("role header row renders monthly payroll via formatMinor() (AC)", () => {
  // Both AUD (A$2,500.00) and USD ($2,500.00) outputs come from formatMinor
  // honoring the active CurrencyProvider — the only render path that
  // satisfies the AC.
  assert.match(
    SRC,
    /formatMinor\(\s*role\.monthly_cost_cents\s*\)\s*\}\/mo/,
    "role.monthly_cost_cents must render through formatMinor(...) /mo",
  );
});

test("no role-row surface re-introduces the inline `$` + Math.round antipattern (drift-guard)", () => {
  // This is exactly the bug pattern. If a future edit re-adds it, fail.
  assert.doesNotMatch(
    SRC,
    /\$\$\{\s*Math\.round\(\s*role\.monthly_cost_cents\s*\/\s*100\s*\)\s*\}/,
    "role.monthly_cost_cents must NOT be rendered via inline `$${Math.round(... / 100)}`",
  );
  // Also forbid the looser variants — toFixed and bare division — on the
  // same selector. The currency formatter is the single render path.
  assert.doesNotMatch(
    SRC,
    /role\.monthly_cost_cents\s*\/\s*100\s*\)\s*\.toFixed\(/,
    "role.monthly_cost_cents must not be rendered via .toFixed()",
  );
});
