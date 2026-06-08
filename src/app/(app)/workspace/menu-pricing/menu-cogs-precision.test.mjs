// TIM-2475: pin that the Menu-Pricing workspace badge and category card both
// render `agg.avgCogsPct` via the SAME shared formatter (fmtPct from
// @/lib/format), so identical underlying values cannot diverge on screen.
//
// Source pin: src/app/(app)/workspace/menu-pricing/menu-workspace.tsx
//   - line ~1993: workspace "Avg COGS" badge
//   - line ~2112: per-category metrics row
//
// Originating bug: founder saw "30.5%" badge alongside "31%" category card
// for the same `aggregateMargins(items).avgCogsPct` selector.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = await readFile(path.join(__dirname, "menu-workspace.tsx"), "utf8");

test("menu-workspace imports the shared fmtPct from @/lib/formatters", () => {
  // TIM-2478: fmtPct is re-exported through src/lib/formatters.ts as the
  // central entry point alongside fmtIntegerPct / formatMinor / formatMinorExact.
  // Same identity (`./format`'s fmtPct), single import site for the workspace.
  assert.match(
    SRC,
    /import\s*\{[^}]*\bfmtPct\b[^}]*\}\s*from\s*"@\/lib\/formatters"/,
    "fmtPct must be imported from @/lib/formatters",
  );
});

test("no surface uses .toFixed(0) on avgCogsPct or avgGpPct (the bug)", () => {
  // The category-card render was the lossy one. Guard against any future
  // regression that drops decimal precision on either selector.
  assert.doesNotMatch(
    SRC,
    /avgCogsPct\??\.toFixed\(0\)/,
    "avgCogsPct must not be rendered at 0-dp precision",
  );
  assert.doesNotMatch(
    SRC,
    /avgGpPct\??\.toFixed\(0\)/,
    "avgGpPct must not be rendered at 0-dp precision",
  );
});

test("avgCogsPct and avgGpPct are always rendered via fmtPct (single render path)", () => {
  // Either render goes through fmtPct (1 dp), or there is no other render
  // path at all. We assert: no surviving `.toFixed(` on either selector.
  assert.doesNotMatch(
    SRC,
    /avgCogsPct\??\.toFixed\(/,
    "avgCogsPct should be rendered via fmtPct, not .toFixed",
  );
  assert.doesNotMatch(
    SRC,
    /avgGpPct\??\.toFixed\(/,
    "avgGpPct should be rendered via fmtPct, not .toFixed",
  );
});

test("workspace badge and category card both call fmtPct with /100 conversion", () => {
  // aggregateMargins returns percentage (0-100); fmtPct expects ratio (0-1).
  // Both render sites must convert. Count the call sites — at least two
  // (badge: COGS + GP, category card: COGS + GP = four total).
  const matches = SRC.match(/fmtPct\(\s*\(\s*agg\.(avgCogsPct|avgGpPct)/g) ?? [];
  assert.ok(
    matches.length >= 4,
    `expected ≥4 fmtPct(...) call sites on avgCogsPct/avgGpPct, found ${matches.length}`,
  );
});
