// TIM-3454: the readiness ring's centre holds the percentage and nothing else.
//
// "ready to open" used to sit inside the ring, under the percentage, where it
// did not fit. A circle narrows as you move away from its centre: the ring's
// clear inner diameter is 65px, but at the height the label sat only 55px was
// actually available, and the label measures 70px at 10px type. It collided
// with the stroke on both sides at every percentage.
//
// This is the same shape as every other defect this month — a contract with
// two sides and no test comparing them. The two sides here are the ring's
// geometry and the text put inside it. So: compute the space the circle
// actually offers at the label's height, and fail if a second line of text is
// ever placed back inside the overlay.
//
// Shrinking the label to fit was the wrong direction anyway. The 5 August
// audit found 10px body text is already below the readable floor, and a
// translation longer than "ready to open" would reintroduce the collision at
// any size. Outside the ring it has the full card width.

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
    `"ready to open" was expected not to fit; the maths now says it does ` +
      `(${labelWidth}px label vs ${available.toFixed(1)}px available). ` +
      `If the ring genuinely grew, update this test — do not move the label back ` +
      `on the strength of a number nobody re-measured.`,
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

test("the label reads at the body size, outside the ring", () => {
  const src = code();
  assert.match(
    src,
    /<span className="text-xs text-\[var\(--muted-foreground\)\] leading-tight">\s*ready to open/,
    "the readiness label is no longer a 12px line under the ring",
  );
  assert.doesNotMatch(
    src,
    /text-\[10px\][^>]*>\s*\n?\s*ready to open/,
    "the label is back at 10px, below the readable floor the audit set",
  );
});

test("the spoken label still says what the percentage means", () => {
  // Moving the text out of the ring must not take it away from a screen
  // reader: the percentage on its own is the thing that prompted TIM-4104.
  assert.match(
    code(),
    /\$\{pct\}% ready to open\. 100% means all \$\{total\} workspaces are complete\./,
  );
});
