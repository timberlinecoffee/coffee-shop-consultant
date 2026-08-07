// TIM-3449: the distinction has to reach the screen.
//
// playbook-provenance.test.mjs proves the comparison is right. This proves the
// workspace actually uses it — that the seeded sections are computed against a
// recomputed seed, passed down, kept out of the "done" count, and explained on
// screen. Any one of those missing puts "9 of 9 · 100%" straight back on a
// playbook nobody has opened, with every unit test still passing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");

const PAGE = join(SRC, "app", "(app)", "workspace", "operations-playbook", "page.tsx");
const WORKSPACE = join(
  SRC, "app", "(app)", "workspace", "operations-playbook", "operations-playbook-workspace.tsx",
);
const ACCORDION = join(SRC, "components", "ui", "AccordionSection.tsx");

/** Source with comments stripped, so prose about the bug cannot trip a guard. */
function code(path) {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

test("the page compares the doc against a recomputed seed", () => {
  const src = code(PAGE);
  assert.match(
    src,
    /seededSections\(\s*initialDoc,\s*seededPlaybook\(shopType\)\s*\)/,
    "the page no longer works out which sections are still ours",
  );
  // Same shop type on both sides, or the comparison is meaningless.
  const calls = src.match(/seededPlaybook\((\w*)\)/g) ?? [];
  assert.ok(calls.length >= 2, `expected the seed twice, found ${calls.length}`);
  assert.ok(
    calls.every((c) => c === "seededPlaybook(shopType)"),
    `seed computed with mismatched arguments: ${calls.join(", ")}`,
  );
});

test("the seeded set reaches the workspace", () => {
  assert.match(code(PAGE), /initialSeededSections=\{/, "the page computes it and drops it");
  assert.match(code(WORKSPACE), /initialSeededSections/, "the workspace does not accept it");
});

test("a seeded section cannot be counted as done", () => {
  const src = code(WORKSPACE);
  // The status is overridden BEFORE the done-count reads it.
  assert.match(
    src,
    /seededKeys\.has\(key\)\s*\n?\s*\?\s*\("seeded" as const\)/,
    "seeded sections no longer override their status",
  );
  assert.match(
    src,
    /done:\s*statuses\[i\] === "complete"/,
    "the done-count no longer keys off `complete`, so `seeded` may slip back in",
  );
});

test("the badge clears as soon as the owner edits", () => {
  // Recomputed from the live doc, not read once at mount. If this becomes a
  // plain prop pass-through, the badge would persist until a page reload.
  assert.match(
    code(WORKSPACE),
    /isSectionSeeded\(key,\s*doc,\s*initialDoc\)/,
    "seeded state is no longer re-derived from the live document",
  );
});

test("the seeded section explains itself on screen", () => {
  const src = code(WORKSPACE);
  assert.match(src, /status === "seeded"/, "nothing renders differently for a seeded section");
  assert.match(src, /seededSectionNotice\(/, "the seeded section shows no explanation");
});

test("the shared accordion knows the seeded state", () => {
  const src = code(ACCORDION);
  assert.match(
    src,
    /export type SectionStatus = 'complete' \| 'in_progress' \| 'seeded' \| 'empty'/,
    "SectionStatus lost 'seeded'",
  );
  assert.match(src, /status === 'seeded'/, "no badge branch for the seeded state");
  // Additive only: the three pre-existing states must still render.
  for (const s of ["complete", "in_progress"]) {
    assert.match(src, new RegExp(`status === '${s}'`), `'${s}' badge branch disappeared`);
  }
});
