// TIM-4108 (UX Phase 3): a ratchet.
//
// Phase 2 made the header standard structural but left `actions` in place as a
// deprecated escape hatch, because all eleven workspaces were still using it.
// Phase 3 moves them across one at a time. Every workspace that has moved gets
// added to MIGRATED below and can never silently slide back.
//
// When the list holds all eleven, `actions` gets deleted from WorkspaceHeader
// and this file becomes a check that it stayed deleted.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) =>
  readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

// These files explain in comments what wording they replaced, so a raw scan
// would flag the explanation itself. Strip comments and scan what renders.
const code = (rel) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const MIGRATED = [
  {
    name: "Marketing",
    file: "src/app/(app)/workspace/marketing/marketing-workspace.tsx",
  },
  {
    name: "Operations Playbook",
    file: "src/app/(app)/workspace/operations-playbook/operations-playbook-workspace.tsx",
  },
];

for (const ws of MIGRATED) {
  test(`${ws.name} uses the structural slots, not the free-form cluster`, () => {
    const src = code(ws.file);
    assert.ok(
      !/\bactions=\{/.test(src),
      "the deprecated escape hatch lets this screen choose its own order again"
    );
    for (const slot of ["scout=", "save=", "progress="]) {
      assert.ok(src.includes(slot), `${ws.name} must fill the ${slot} slot`);
    }
  });

  test(`${ws.name} states where the owner is up to`, () => {
    // Progress appeared on 4 of 11 screens before this batch. Every migrated
    // screen answers "how far along am I" or it is not migrated.
    const src = code(ws.file);
    assert.ok(
      /stepsProgress\(|progress=\{\{\s*kind:/.test(src),
      `${ws.name} must render a progress line`
    );
  });

  test(`${ws.name} does not reintroduce its own print wording`, () => {
    // "Print view" was this screen's private name for the shared action.
    const src = code(ws.file);
    for (const wording of ["Print view", "Print all", "Print recipe cards"]) {
      assert.ok(
        !src.includes(wording),
        `${ws.name} must say "Print document" like every other screen, not "${wording}"`
      );
    }
  });
}

test("the emphasised button and the section anchor build the same DOM id", () => {
  // Two files construct this id independently. If they drift, the button
  // silently does nothing — the worst kind of break, because it looks fine.
  assert.match(
    read("src/components/workspace/WorkspaceNextStepButton.tsx"),
    /getElementById\(`step-\$\{id\}`\)/
  );
  assert.match(
    read("src/components/ui/AccordionSection.tsx"),
    /`step-\$\{stepId\}`/
  );
});

test("opening a section from outside it did not break the plain accordion", () => {
  // The controlled props are additive. A caller that passes neither must keep
  // its own internal open state, or every un-migrated screen regresses at once.
  const src = read("src/components/ui/AccordionSection.tsx");
  assert.match(src, /const controlled = openProp !== undefined/);
  assert.match(src, /controlled \? openProp : openState/);
});
