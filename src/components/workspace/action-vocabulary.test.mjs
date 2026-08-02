// TIM-4106 (UX Phase 1): one action, one name, on every workspace.
//
// The audit behind this: eleven workspace headers looked like eleven separate
// naming decisions. Two of them were not decisions at all — they were single
// pieces of code producing different words in different states. These guards
// stop both from coming back.
//
// Source scans rather than render tests, because the failure mode is someone
// re-typing a label months from now. A grep is the right shape of guard.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (rel) =>
  readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

const SCOUT = "src/components/workspace/AskScoutButton.tsx";
const PRINT = "src/components/workspace/PrintDocumentButton.tsx";

test("the Scout button has exactly one name", () => {
  const src = read(SCOUT);
  assert.match(
    src,
    /export const ASK_SCOUT_LABEL = "Ask Scout"/,
    "the one name must stay declared in one place"
  );
  // The old bug: `hasContent ? "Improve with Scout" : "Ask Scout"`. Any
  // conditional producing a label is the thing to catch, so assert the
  // alternative wording is simply absent from the rendered path.
  const withoutComments = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  assert.doesNotMatch(
    withoutComments,
    /"Improve with Scout"/,
    "the Scout label must not vary — it renamed itself as the user typed"
  );
});

test("the Scout prompt still adapts even though the label does not", () => {
  // Fixing the label must not flatten the behaviour behind it. An empty
  // workspace should still seed a "help me" prompt rather than "improve my".
  const src = read(SCOUT);
  assert.match(src, /Help me with my \$\{subject\}/);
  assert.match(src, /Improve my \$\{subject\}/);
});

test("printing the page you are looking at is always 'Print document'", () => {
  assert.match(read(PRINT), />\s*Print document\s*</);
});

test("every print route uses the shared button, not its own copy", () => {
  // There were four byte-identical copies and they had already drifted —
  // three said "Print document", menu said "Print recipe cards". Copies of a
  // thing will always drift, so there must only be one.
  const base = new URL("../../app/(app)/workspace/", import.meta.url);
  const routes = readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let checked = 0;
  for (const route of routes) {
    let src;
    try {
      src = readFileSync(new URL(`${route}/print/print-button.tsx`, base), "utf8");
    } catch {
      continue; // not every workspace has a print route
    }
    checked += 1;
    assert.match(
      src,
      /from "@\/components\/workspace\/PrintDocumentButton"/,
      `${route} must re-export the shared print button rather than copy it`
    );
    assert.doesNotMatch(
      src,
      /Print recipe cards|Print all|Print view/,
      `${route} must not reintroduce its own print wording`
    );
  }
  assert.ok(checked >= 4, `expected several print routes, found ${checked}`);
});
