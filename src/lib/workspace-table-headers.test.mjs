// TIM-4114 (UX Phase 5): the table-header standard is a ratchet, not a coat of
// paint.
//
// Trent, 2026-08-03: "on the Equipment and Supplies page, the headers are a
// beige that's similar to the background, so it doesn't really separate it out.
// Maybe the headers should have the teal background with white letters for each
// of the category headers and the header rows... This should be applied across
// the entire platform."
//
// The audit found ~20 distinct header treatments across 34 files, sitting on
// seven different background values. That is the same drift the workspace
// headers had before Phases 1-3, one layer down, and it came back for the same
// reason: nothing stopped it. So the fix ships with the stop.
//
// MIGRATED below is the list of screens on the standard. A file on the list
// that hand-rolls its own header background fails the build. Files are ADDED to
// the list as they are converted and never removed.
//
// Run: node --experimental-strip-types --test src/lib/workspace-table-headers.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

// Strip comments before pattern-matching, so this file's own explanatory prose
// — and the migration notes left in the source — cannot satisfy or trip a
// guard. Learned the hard way three times during Phase 3.
const code = (rel) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

/**
 * Screens converted to the teal header standard.
 * Append as each is migrated. Never delete an entry.
 */
const MIGRATED = [
  { file: "src/components/equipment/EquipmentGrid.tsx", what: "Equipment table" },
  { file: "src/components/equipment/SuppliesDesktopTable.tsx", what: "Supplies table" },
];

/** Backgrounds a header row must no longer set for itself. */
const HAND_ROLLED_BG =
  /bg-\[var\(--(surface-warm-\d+|gray-\d+|muted|neutral-cool-\d+|background|warm-\d+|card)\)\]/;

test("the header tokens exist and are the only place the colour is chosen", () => {
  const css = read("src/app/globals.css");
  for (const token of [
    "--table-header-bg",
    "--table-header-fg",
    "--table-group-header-bg",
  ]) {
    assert.match(css, new RegExp(`${token}\\s*:`), `${token} is not defined`);
  }
});

test("white on the header teal clears WCAG AA for small text", () => {
  // Computed, not asserted from memory. If someone lightens --teal to make the
  // band prettier, this is the test that tells them the letters stopped being
  // readable — which is the entire point of the change.
  const css = read("src/app/globals.css");
  const teal = css.match(/--teal:\s*#([0-9a-f]{6})/i);
  assert.ok(teal, "--teal is not defined as a 6-digit hex");

  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex) => {
    const n = parseInt(hex, 16);
    return (
      0.2126 * channel((n >> 16) & 255) +
      0.7152 * channel((n >> 8) & 255) +
      0.0722 * channel(n & 255)
    );
  };

  const ratio = (1.0 + 0.05) / (luminance(teal[1]) + 0.05);
  assert.ok(
    ratio >= 4.5,
    `white on #${teal[1]} is ${ratio.toFixed(2)}:1 — below the 4.5:1 floor`
  );
});

test("the header type is large enough to survive being reversed out", () => {
  // 10px white uppercase on a saturated ground reads thin and smeared. 11px is
  // the smallest that stays crisp, so the standard restates its own type size
  // rather than composing TABLE_HEADER_TEXT.
  const src = code("src/lib/workspace-table.ts");
  const cell = src.match(/TABLE_HEADER_CELL_CLS[\s\S]*?;/);
  assert.ok(cell, "TABLE_HEADER_CELL_CLS is missing");
  assert.doesNotMatch(
    cell[0],
    /text-\[10px\]/,
    "the reversed-out header dropped back to 10px"
  );
  assert.match(cell[0], /text-\[1[1-9]px\]|text-xs|text-sm/);
});

test("the category band on Equipment and Supplies is teal, not beige", () => {
  // The exact thing Trent named. SectionHeaderRow is the "Espresso Machines"
  // row, shared by both screens.
  const src = code("src/lib/workspace-table-rows.tsx");
  // Bounded by the NEXT export, not by the first line-initial "}" — the props
  // destructuring closes with one of those, which silently truncated the slice
  // to the signature and made the guard pass on nothing.
  const header = src.match(
    /export function SectionHeaderRow[\s\S]*?(?=export function|$)/
  );
  assert.ok(header, "SectionHeaderRow is missing");
  assert.match(
    header[0],
    /TABLE_GROUP_HEADER_ROW_CLS/,
    "SectionHeaderRow no longer uses the shared group band"
  );
  assert.doesNotMatch(
    header[0],
    HAND_ROLLED_BG,
    "SectionHeaderRow went back to picking its own background"
  );
});

test("the subtotal row stays quiet", () => {
  // Deliberate: header band + data rows + teal subtotal turns a grouped table
  // into a barcode. The band marks where a group starts; the subtotal is a full
  // stop, not a second announcement.
  const src = code("src/lib/workspace-table-rows.tsx");
  const subtotal = src.match(
    /export function SectionSubtotalRow[\s\S]*?(?=export function|$)/
  );
  assert.ok(subtotal, "SectionSubtotalRow is missing");
  assert.doesNotMatch(
    subtotal[0],
    /--table-header-bg|--table-group-header-bg/,
    "the subtotal row became a third teal band"
  );
});

test("migrated screens use the shared header standard", () => {
  for (const { file, what } of MIGRATED) {
    const src = code(file);
    assert.match(
      src,
      /TABLE_HEADER_ROW_CLS/,
      `${what} (${file}) does not use the shared header row`
    );
    assert.match(
      src,
      /TABLE_HEADER_CELL_CLS/,
      `${what} (${file}) does not use the shared header cell`
    );
  }
});

test("migrated screens no longer hand-roll a header background", () => {
  // The failure this whole phase exists to prevent: a screen quietly choosing
  // its own header colour again, which is how twenty treatments happened.
  for (const { file, what } of MIGRATED) {
    const src = code(file);
    for (const m of src.matchAll(/<thead[\s\S]*?<tr\s+className=\{?([^\n>]*)/g)) {
      assert.doesNotMatch(
        m[1],
        HAND_ROLLED_BG,
        `${what} (${file}) sets its own header background: ${m[1].trim()}`
      );
    }
  }
});

test("the standard is defined in exactly one place", () => {
  // If a second file starts exporting a header-row class, the next person has
  // two sources of truth and picks the wrong one.
  const src = code("src/lib/workspace-table.ts");
  for (const name of [
    "TABLE_HEADER_ROW_CLS",
    "TABLE_HEADER_CELL_CLS",
    "TABLE_GROUP_HEADER_ROW_CLS",
    "TABLE_GROUP_HEADER_TEXT_CLS",
  ]) {
    assert.match(src, new RegExp(`export const ${name}\\b`), `${name} is missing`);
  }
});
