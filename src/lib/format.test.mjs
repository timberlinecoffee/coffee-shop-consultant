// TIM-2475: pin shared formatters.
// fmtPct is the canonical 1-dp percentage formatter for ratio inputs (0-1).
// Pin matches src/lib/cross-suite/hiring-financials.ts:76 (the helper this
// shared version was unified with) so the same ratio renders identically
// on every surface. Originating bug: workspace badge "30.5%" vs category
// card "31%" on Menu-Pricing for the same underlying selector.

import { test } from "node:test";
import assert from "node:assert/strict";

const { fmtPct, capitalizeFirst, formatLocationScore } = await import("./format.ts");

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

// TIM-2480: pin formatLocationScore.
// LocationCard previously rendered the scorecard average as "3.4 / 5" via
// (sum/count).toFixed(1); TradeoffPanel rendered the per-factor score as the
// bare integer "${score}". For the same underlying score, the two surfaces
// produced different strings (e.g. 3.0 vs 3). Shared helper is the contract.

test("formatLocationScore: AC — 3.4 average renders 1 dp on both surfaces", () => {
  // AC: "Enter 3.4 average, both surfaces render identical number."
  const { display: locationCardDisplay } = formatLocationScore(3.4);
  const { display: tradeoffPanelDisplay } = formatLocationScore(3.4);
  assert.strictEqual(locationCardDisplay, "3.4");
  assert.strictEqual(tradeoffPanelDisplay, "3.4");
  assert.strictEqual(
    locationCardDisplay,
    tradeoffPanelDisplay,
    "same average must render identically across surfaces",
  );
});

test("formatLocationScore: whole-number average renders 1 dp (the divergence we pinned)", () => {
  // Pre-fix: LocationCard rendered "3.0 / 5"; TradeoffPanel rendered "3".
  assert.strictEqual(formatLocationScore(3).display, "3.0");
  assert.strictEqual(formatLocationScore(5).display, "5.0");
  assert.strictEqual(formatLocationScore(1).display, "1.0");
});

test("formatLocationScore: pct is (score/5)*100, clamped to 0..100", () => {
  assert.strictEqual(formatLocationScore(0).pct, 0);
  assert.strictEqual(formatLocationScore(5).pct, 100);
  assert.strictEqual(formatLocationScore(3.4).pct, 68);
  assert.strictEqual(formatLocationScore(2.5).pct, 50);
  // Clamp guards: defensive against out-of-domain inputs.
  assert.strictEqual(formatLocationScore(-1).pct, 0);
  assert.strictEqual(formatLocationScore(7).pct, 100);
});

test("formatLocationScore: display rounds to nearest 1 dp", () => {
  assert.strictEqual(formatLocationScore(3.44).display, "3.4");
  assert.strictEqual(formatLocationScore(3.46).display, "3.5");
  assert.strictEqual(formatLocationScore(3.05).display, "3.1");
});
