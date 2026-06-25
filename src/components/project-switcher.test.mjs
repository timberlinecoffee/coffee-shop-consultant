// TIM-2962: source-pinning tests for the project switcher chrome + handler.
// Reads the .tsx source as text and asserts structural invariants without
// needing JSDOM. Tests:
//   - Bug 1: onCreated upserts by id (no unconditional prepend of the same id)
//   - Bug 2: selector trigger + dropdown rows do NOT render locationLabel
//   - Bug 3: trash button has opacity-100, no opacity-60 + group-hover gate

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, "project-switcher.tsx"), "utf8");

// Strip block comments (/* ... */) and line comments (// ...) so explanatory
// "TIM-XXXX: removed locationLabel chip" markers don't false-positive on
// assertions that the symbol is absent. Preserve `https://` inside strings by
// requiring a non-colon char before `//` (matches the TIM-2974 pattern).
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const CODE = stripComments(SRC);

test("Bug 1: onCreated filters out prior entry by id before prepending", () => {
  // The unconditional `...prev.map(...)` spread was the duplicate bug. The
  // fixed shape always filters out same-id rows before composing the next
  // state. Look for the `prev.filter((p) => p.id !== project.id)` pattern.
  assert.match(
    CODE,
    /prev\.filter\s*\(\s*\(\s*p\s*\)\s*=>\s*p\.id\s*!==\s*project\.id\s*\)/,
    "onCreated must dedup by id before prepending the new project",
  );
});

test("Bug 1: onCreated does NOT spread prev directly into the new array", () => {
  // Sanity check that we didn't leave the broken `...prev.map(...)` shape
  // in place. The fix must filter prev first, then map.
  assert.doesNotMatch(
    CODE,
    /\[\s*\{\s*\.\.\.project,\s*isActive:\s*activatedNow\s*\},\s*\.\.\.prev\.map/,
    "onCreated must not unconditionally prepend on top of all prev entries",
  );
});

test("Bug 2: selector trigger button does not render activeProject.locationLabel", () => {
  // The trigger button used to render a `<span>{activeProject.locationLabel}</span>`
  // chip next to the title. Title-only is the new contract.
  assert.doesNotMatch(
    CODE,
    /activeProject(\?\.|\.)locationLabel/,
    "selector trigger must not reference activeProject.locationLabel",
  );
});

test("Bug 2: dropdown row does not render project.locationLabel", () => {
  // The ProjectRow body used to render `<span>{project.locationLabel}</span>`
  // below the title. Title-only everywhere in the selector.
  assert.doesNotMatch(
    CODE,
    /\{\s*project\.locationLabel\s*\}/,
    "dropdown row must not render project.locationLabel",
  );
});

test("Bug 3: trash button has opacity-100 (always visible)", () => {
  // The trash button className contains `opacity-100`. The old hover-gate
  // string `opacity-60 group-hover:opacity-100 focus-visible:opacity-100`
  // must be gone.
  assert.match(
    CODE,
    /opacity-100/,
    "trash button must carry opacity-100",
  );
  assert.doesNotMatch(
    CODE,
    /opacity-60/,
    "trash button must not be gated to 60% by default",
  );
  assert.doesNotMatch(
    CODE,
    /group-hover:opacity-100/,
    "trash button must not require group-hover to be visible",
  );
});

test("Bug 3: trash button is still a button with Trash2 icon and confirm-delete onDelete", () => {
  // Don't accidentally delete the trash icon entirely while widening its
  // opacity. The Trash2 import and the onDelete callback must still wire up.
  assert.match(SRC, /import\s+\{[^}]*Trash2[^}]*\}\s+from\s+"lucide-react"/);
  assert.match(CODE, /<Trash2\s+size=\{14\}/);
  assert.match(CODE, /onClick=\{\(e\)\s*=>\s*\{\s*e\.stopPropagation\(\);\s*onDelete\(\);\s*\}\}/);
});
