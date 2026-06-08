// TIM-2480: pin that LocationCard and TradeoffPanel render scorecard scores
// via the SAME shared formatter (`formatLocationScore` from @/lib/format),
// so identical underlying values cannot diverge on screen.
//
// Source pins:
//   - src/components/location-lease/LocationCard.tsx:~118 (scorecard average)
//   - src/components/location-lease/TradeoffPanel.tsx:~100 (bar-width pct)
//   - src/components/location-lease/TradeoffPanel.tsx:~135 (per-factor display)
//
// Originating bug (TIM-2454 F11): LocationCard rendered "3.4 / 5" while
// TradeoffPanel rendered "3" for the same underlying score.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCATION_CARD = await readFile(path.join(__dirname, "LocationCard.tsx"), "utf8");
const TRADEOFF_PANEL = await readFile(path.join(__dirname, "TradeoffPanel.tsx"), "utf8");

test("LocationCard imports formatLocationScore from @/lib/format", () => {
  assert.match(
    LOCATION_CARD,
    /import\s*\{\s*formatLocationScore\s*\}\s*from\s*['"]@\/lib\/format['"]/,
    "LocationCard must import the shared formatter",
  );
});

test("TradeoffPanel imports formatLocationScore from @/lib/format", () => {
  assert.match(
    TRADEOFF_PANEL,
    /import\s*\{\s*formatLocationScore\s*\}\s*from\s*['"]@\/lib\/format['"]/,
    "TradeoffPanel must import the shared formatter",
  );
});

test("LocationCard no longer renders the average via raw (sum/count).toFixed(1)", () => {
  // The lossy/divergent inline format was the bug. Guard against re-introduction.
  assert.doesNotMatch(
    LOCATION_CARD,
    /\(\s*sum\s*\/\s*count\s*\)\.toFixed\(/,
    "average must not be rendered via inline (sum/count).toFixed — use formatLocationScore",
  );
});

test("TradeoffPanel no longer hard-renders the score as bare `${score}` (integer drop)", () => {
  // The bare interpolation collapsed 3.0 → "3". Both AC#1 paths must go
  // through formatLocationScore now.
  assert.doesNotMatch(
    TRADEOFF_PANEL,
    /score\s*!=\s*null\s*\?\s*`\$\{\s*score\s*\}`/,
    "per-factor display must not render `${score}` — use formatLocationScore(score).display",
  );
});

test("TradeoffPanel no longer computes bar width via inline (score / 5) * 100", () => {
  assert.doesNotMatch(
    TRADEOFF_PANEL,
    /\(\s*score\s*\/\s*5\s*\)\s*\*\s*100/,
    "bar width must be derived from formatLocationScore(score).pct, not the inline math",
  );
});

test("Both surfaces call formatLocationScore at least once", () => {
  assert.ok(
    /formatLocationScore\(/.test(LOCATION_CARD),
    "LocationCard must call formatLocationScore",
  );
  assert.ok(
    /formatLocationScore\(/.test(TRADEOFF_PANEL),
    "TradeoffPanel must call formatLocationScore",
  );
  // TradeoffPanel needs BOTH the .display and .pct destructures, so the count
  // there should be ≥2 (one for width, one for label).
  const tradeoffMatches = TRADEOFF_PANEL.match(/formatLocationScore\(/g) ?? [];
  assert.ok(
    tradeoffMatches.length >= 2,
    `TradeoffPanel needs ≥2 formatLocationScore calls (.pct + .display), found ${tradeoffMatches.length}`,
  );
});
