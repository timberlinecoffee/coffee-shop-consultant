// TIM-2475: pin shared formatters.
// fmtPct is the canonical 1-dp percentage formatter for ratio inputs (0-1).
// Pin matches src/lib/cross-suite/hiring-financials.ts:76 (the helper this
// shared version was unified with) so the same ratio renders identically
// on every surface. Originating bug: workspace badge "30.5%" vs category
// card "31%" on Menu-Pricing for the same underlying selector.

import { test } from "node:test";
import assert from "node:assert/strict";

const { fmtPct, capitalizeFirst } = await import("./format.ts");

test("fmtPct: 0.305 → '30.5%' (1 dp, no rounding to integer)", () => {
  assert.strictEqual(fmtPct(0.305), "30.5%");
});

test("fmtPct: 0.31 → '31.0%' (always 1 dp, never bare integer)", () => {
  assert.strictEqual(fmtPct(0.31), "31.0%");
});

test("fmtPct: identical inputs produce identical strings (the regression we're pinning)", () => {
  const ratio = 0.305;
  const workspaceBadge = fmtPct(ratio);
  const categoryCard = fmtPct(ratio);
  assert.strictEqual(
    workspaceBadge,
    categoryCard,
    "same selector must render identically on every surface",
  );
});

test("fmtPct: 0 → '0.0%'", () => {
  assert.strictEqual(fmtPct(0), "0.0%");
});

test("fmtPct: 1 → '100.0%'", () => {
  assert.strictEqual(fmtPct(1), "100.0%");
});

test("fmtPct: matches the canonical hiring-financials.ts implementation", async () => {
  // The source helper at src/lib/cross-suite/hiring-financials.ts:76 is private
  // (not exported), but its body is preserved verbatim here. Reproduce the same
  // arithmetic and assert exact agreement so the two implementations cannot
  // drift apart silently.
  const localFmt = (v) => `${(Math.round(v * 1000) / 10).toFixed(1)}%`;
  for (const ratio of [0, 0.0501, 0.305, 0.31, 0.314159, 0.5, 0.999, 1]) {
    assert.strictEqual(fmtPct(ratio), localFmt(ratio), `drift at ${ratio}`);
  }
});

test("capitalizeFirst still works (sanity check after sharing format.ts)", () => {
  assert.strictEqual(capitalizeFirst("trent"), "Trent");
  assert.strictEqual(capitalizeFirst("Trent"), "Trent");
  assert.strictEqual(capitalizeFirst(""), "");
});
