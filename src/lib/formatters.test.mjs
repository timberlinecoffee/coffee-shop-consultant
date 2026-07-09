// TIM-2478 (F3 + F7): pin formatters.ts behavior and drift-guard the named
// workspace surfaces from regression. The ESLint rule is the live gate; these
// tests are the secondary safety net that runs in `npm test`.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  fmtPct,
  fmtIntegerPct,
  formatMinor,
  formatMinorExact,
  formatRatioToOne,
  progressPct,
} from "./formatters.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(rel) {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

// ── unit ─────────────────────────────────────────────────────────────────────

test("fmtPct(ratio) is 1dp from a 0..1 ratio", () => {
  assert.equal(fmtPct(0), "0.0%");
  assert.equal(fmtPct(0.345), "34.5%");
  assert.equal(fmtPct(1), "100.0%");
  assert.equal(fmtPct(0.65), "65.0%");
});

test("fmtIntegerPct(ratio) is 0dp from a 0..1 ratio, rounds at .5", () => {
  assert.equal(fmtIntegerPct(0), "0%");
  assert.equal(fmtIntegerPct(0.65), "65%");
  assert.equal(fmtIntegerPct(0.345), "35%");
  assert.equal(fmtIntegerPct(1), "100%");
});

// TIM-3734 (board directive TIM-3732): formatMinor renders full precision
// with the currency's native fraction digits. Compact K/M shorthand ripped
// out — a coffee-shop operator budgeting a buildout needs to see the cents.
test("formatMinor renders full precision — no K/M shorthand", () => {
  assert.equal(formatMinor(4600, "USD"), "$46.00");
  assert.equal(formatMinor(460000, "USD"), "$4,600.00");
  assert.equal(formatMinor(3770000, "USD"), "$37,700.00");
  assert.equal(formatMinor(124995, "USD"), "$1,249.95");
  // JPY has 0 fraction digits — passthrough (locale-specific ¥/￥ tolerated)
  assert.match(formatMinor(550, "JPY"), /^[¥￥]550$/);
});

test("formatMinorExact preserves the currency's natural fraction digits and never compacts", () => {
  assert.equal(formatMinorExact(550, "USD"), "$5.50");
  assert.equal(formatMinorExact(123456, "USD"), "$1,234.56");
  // JPY has 0 fraction digits — passthrough (locale-specific ¥/￥ tolerated)
  assert.match(formatMinorExact(550, "JPY"), /^[¥￥]550$/);
});

test("formatRatioToOne emits 'N.N:1'", () => {
  assert.equal(formatRatioToOne(2.5), "2.5:1");
  assert.equal(formatRatioToOne(2.46), "2.5:1");
  assert.equal(formatRatioToOne(0.7), "0.7:1");
});

test("progressPct is integer 0..100 with zero-total guarded", () => {
  assert.equal(progressPct(0, 0), 0);
  assert.equal(progressPct(0, 5), 0);
  assert.equal(progressPct(3, 5), 60);
  assert.equal(progressPct(5, 5), 100);
  // floating-point edges + over-100 clamped
  assert.equal(progressPct(11, 10), 100);
  assert.equal(progressPct(-1, 10), 0);
});

// ── drift-guard: the 7 surfaces named in TIM-2478 must not regress to inline
//    .toFixed(…). The ESLint rule is the primary gate; this is a backup that
//    catches the regression even if the lint step is skipped.

const NAMED_SURFACES = [
  "src/app/(app)/workspace/financials/tabs/break-even-tab.tsx",
  "src/app/(app)/workspace/financials/tabs/balance-sheet-tab.tsx",
  "src/app/(app)/workspace/financials/tabs/funding-tab.tsx",
  "src/app/(app)/workspace/menu-pricing/menu-workspace.tsx",
  "src/app/(app)/workspace/hiring/hiring-workspace.tsx",
  "src/app/(app)/workspace/opening-month-plan/opening-month-plan-workspace.tsx",
];

test("named surfaces import from @/lib/formatters", () => {
  // break-even-tab uses fmtPct + formatMinor
  assert.match(read(NAMED_SURFACES[0]), /from\s+"@\/lib\/formatters"/);
  // balance-sheet uses formatRatioToOne
  assert.match(read(NAMED_SURFACES[1]), /from\s+"@\/lib\/formatters"/);
  // funding-tab uses fmtPct
  assert.match(read(NAMED_SURFACES[2]), /from\s+"@\/lib\/formatters"/);
  // menu-workspace uses fmtPct + fmtIntegerPct + formatMinor + formatMinorExact
  assert.match(read(NAMED_SURFACES[3]), /from\s+"@\/lib\/formatters"/);
  // hiring uses progressPct
  assert.match(read(NAMED_SURFACES[4]), /from\s+"@\/lib\/formatters"/);
  // opening-month-plan uses progressPct
  assert.match(read(NAMED_SURFACES[5]), /from\s+"@\/lib\/formatters"/);
});

test("named surfaces do not re-introduce the original inline .toFixed lines", () => {
  // Anti-patterns from the issue body, by file. If any of these resurface, the
  // helper was bypassed and consistency drifted.
  const anti = [
    [NAMED_SURFACES[0], /\(contributionMarginPct\s*\*\s*100\)\.toFixed\(1\)/],
    [NAMED_SURFACES[0], /avgTicket\.toFixed\(2\)/],
    [NAMED_SURFACES[1], /debtToEquity\.toFixed\(1\)\}:1/],
    [NAMED_SURFACES[2], /investorOwnership\.toFixed\(1\)/],
    [NAMED_SURFACES[3], /\(\(\(item\.price_cents\s*-\s*effectiveCogs\)\s*\/\s*item\.price_cents\)\s*\*\s*100\)\.toFixed\(\s*1\s*\)/],
    [NAMED_SURFACES[4], /Math\.round\(\(completed\s*\/\s*total\)\s*\*\s*100\)/],
    [NAMED_SURFACES[5], /\(doneCount\s*\/\s*milestones\.length\)\s*\*\s*100/],
  ];
  for (const [path, pattern] of anti) {
    assert.ok(
      !pattern.test(read(path)),
      `${path} re-introduced the pre-TIM-2478 anti-pattern ${pattern}`,
    );
  }
});

test("eslint.config.mjs wires the no-restricted-syntax guard for workspace/**", () => {
  const cfg = read("eslint.config.mjs");
  assert.match(cfg, /src\/app\/\(app\)\/workspace\/\*\*/);
  assert.match(cfg, /callee\.property\.name='toFixed'/);
  assert.match(cfg, /JSXElement CallExpression/);
});
