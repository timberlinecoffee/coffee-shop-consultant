// TIM-3454 / TIM-3455: the readiness ring holds the percentage and nothing else,
// and nothing on the card claims the shop is ready to open.
//
// Two defects, one card.
//
// TIM-3454 was geometry. "ready to open" sat inside the ring under the
// percentage, where it did not fit. A circle narrows as you move away from its
// centre: the clear inner diameter is 65px, but at the height the label sat
// only 55px was actually available and the label measures 70px at 10px type.
// It collided with the stroke on both sides at every percentage. Same shape as
// every other defect this month — a contract with two sides and no test
// comparing them. The two sides are the ring's geometry and the text put
// inside it, so this computes the space the circle actually offers.
//
// TIM-3455 was the claim. The percentage is `completedPct` in plan-overview.ts:
// the share of workspaces marked complete. That measures how much of the plan
// is filled in. It says nothing about whether the shop can open — no lease, no
// licence, no machine. A first-time owner told they are "100% ready to open"
// because eleven forms are finished is being misled by their own software.
//
// The fix for both was the same: take the label off the ring entirely and title
// the card instead. So this file guards the geometry AND the wording.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const RING = join(
  HERE,
  "..",
  "..",
  "app",
  "(app)",
  "dashboard",
  "_components",
  "HomeV2.tsx",
);

/** Source with comments stripped, so prose about the bug cannot trip a guard. */
function code() {
  return readFileSync(RING, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

/** The chord width the circle offers at `y` px from its centre. */
function widthAt(y, { radius, strokeWidth }) {
  const clear = radius - strokeWidth / 2;
  const half2 = clear * clear - y * y;
  return half2 <= 0 ? 0 : 2 * Math.sqrt(half2);
}

test("the ring's drawn geometry is what this test assumes", () => {
  const src = code();
  assert.match(src, /const r = 36;/, "ring radius changed — recheck the fit maths below");
  assert.match(src, /strokeWidth="7"/, "ring stroke changed — recheck the fit maths below");
  assert.match(src, /className="relative w-24 h-24"/, "ring box is no longer 96px square");
});

test("a second line of text does not fit inside the ring", () => {
  const geo = { radius: 36, strokeWidth: 7 };

  // A stacked 20px percentage plus a 10px second line puts that line's far
  // edge ~17px below centre. Measured in a headless browser at the system UI
  // font: the label rendered 69.8px wide with 55.1px available.
  const available = widthAt(17.2, geo);
  const labelWidth = 69.8;

  assert.ok(
    labelWidth > available,
    `a second line was expected not to fit; the maths now says it does ` +
      `(${labelWidth}px label vs ${available.toFixed(1)}px available). ` +
      `If the ring genuinely grew, update this test — do not move a label back ` +
      `inside on the strength of a number nobody re-measured.`,
  );
});

test("the ring's centre overlay holds the percentage alone", () => {
  const src = code();

  // The overlay is a single row, not a stack. `flex-col` here is how the
  // second line got in.
  assert.match(
    src,
    /className="absolute inset-0 flex items-center justify-center"/,
    "the ring overlay stacks again — something has been put back inside the circle",
  );
  assert.doesNotMatch(
    src,
    /absolute inset-0 flex flex-col/,
    "the ring overlay stacks again — a second line inside the circle will collide with the stroke",
  );
});

test("nothing on the card tells the owner they are ready to open", () => {
  const src = code();

  // The whole point of TIM-3455. `completedPct` counts finished workspaces;
  // readiness to trade is not something this product measures at all.
  assert.doesNotMatch(
    src,
    /ready to open/,
    'the card claims "ready to open" again — the percentage counts filled-in ' +
      "workspaces and cannot support that",
  );

  // Neither may the wording drift to a synonym that makes the same promise.
  assert.doesNotMatch(
    src,
    /\bready to (trade|launch|serve)\b/i,
    "the readiness claim is back under a different verb",
  );
});

test("the card is titled, which is what lets the ring drop its label", () => {
  const src = code();
  assert.match(
    src,
    /<h2 className="text-sm font-semibold text-\[var\(--foreground\)\]">\s*Plan Progress/,
    'the "Plan Progress" heading is gone — without it the ring is an unlabelled ' +
      "number, which is the state TIM-4104 fixed",
  );
  // TIM-1002: label-shaped text is Title Case.
  assert.doesNotMatch(src, /Plan progress/, "heading is not Title Case (TIM-1002)");
});

test("the count under the ring still names what is being counted", () => {
  // This line is now the only thing explaining the percentage on screen, so it
  // carries more weight than it did when a label sat above it.
  assert.match(
    code(),
    /\{counts\.completed\} of \{counts\.total\} workspaces complete/,
    "the workspace count is gone — the ring is now a bare percentage",
  );
});

test("the spoken label says what the percentage measures", () => {
  // A screen reader gets no heading-to-ring association for free, so the
  // overlay states the measure outright.
  const src = code();
  assert.match(
    src,
    /\$\{pct\}% of your plan is complete\. 100% means all \$\{total\} workspaces are filled in\./,
  );
  assert.doesNotMatch(
    src,
    /aria-label[\s\S]{0,200}ready to open/,
    "the spoken label still says ready to open",
  );
});
