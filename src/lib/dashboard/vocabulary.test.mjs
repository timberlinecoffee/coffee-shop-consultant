// TIM-4104 (T1-D): one word, one meaning.
//
// The bug this guards: four screens each counted progress in "sections", and
// each meant something different. Home meant whole workspaces (2 of 11).
// Financials meant the steps inside itself (4 of 4). Operations Playbook meant
// its own steps (9 of 9). Concept meant its own (7 of 7). Every counter was
// locally correct, so nobody ever noticed — but an owner reading two screens
// could not possibly work out what a "section" was.
//
// The settled vocabulary:
//
//   workspaces  the eleven areas of the plan. Home counts these, and the
//               left-hand nav has always called them workspaces.
//   steps       the units of progress INSIDE one workspace.
//   sections    parts of a generated document (the business plan, print
//               views). This is the ordinary English sense and a lender
//               expects it — renaming these to "steps" would be worse than
//               the ambiguity.
//
// These are source scans rather than render tests because the failure mode is
// someone re-typing the wrong noun into a template string months from now.
// A grep is exactly the right shape of guard for that.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) =>
  readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

const HOME_V2 = "src/app/(app)/dashboard/_components/HomeV2.tsx";
const HOME_V1 = "src/app/(app)/dashboard/page.tsx";
const FINANCIALS = "src/app/(app)/workspace/financials/financials-v2.tsx";
const PLAYBOOK =
  "src/app/(app)/workspace/operations-playbook/operations-playbook-workspace.tsx";
const CONCEPT = "src/app/(app)/workspace/concept/concept-editor.tsx";
const BUSINESS_PLAN =
  "src/app/(app)/workspace/business-plan/business-plan-workspace.tsx";

// Matches a rendered progress counter like "{a} of {b} sections complete".
// Deliberately loose on the surrounding words so a reworded variant is still
// caught.
const SECTION_COUNTER = /of \{[^}]+\}\s*(plan\s+)?sections\b/;

test("Home counts workspaces, not sections", () => {
  for (const file of [HOME_V2, HOME_V1]) {
    const src = read(file);
    assert.doesNotMatch(
      src,
      SECTION_COUNTER,
      `${file} still counts in "sections" — Home counts whole workspaces`
    );
    assert.match(
      src,
      /of \{[^}]+\}\s*(plan\s+)?workspaces\b/,
      `${file} should count in "workspaces"`
    );
  }
});

test("a workspace counts its own progress in steps", () => {
  for (const file of [FINANCIALS, PLAYBOOK, CONCEPT]) {
    const src = read(file);
    assert.doesNotMatch(
      src,
      SECTION_COUNTER,
      `${file} still counts in "sections" — inside a workspace the unit is "steps"`
    );
    assert.match(
      src,
      /of \{[^}]+\}\s*steps\b/,
      `${file} should count in "steps"`
    );
  }
});

test("the business plan keeps real sections", () => {
  // The counterpart guard. Someone applying the rename mechanically would
  // turn a lender-facing document's chapters into "steps", which is worse
  // than the problem T1-D fixes. This fails if that happens.
  const src = read(BUSINESS_PLAN);
  assert.match(
    src,
    /of \{sections\.length\} sections reviewed/,
    "the business plan is a document; its parts stay 'sections'"
  );
});

test("the readiness ring says what it is measuring", () => {
  // "18% ready" never said ready for what. A bare percentage always invites
  // the question, and the answer to "what does 100% mean?" must be reachable.
  const src = read(HOME_V2);
  assert.match(src, /ready to open/, "the ring must say ready to open");
  assert.match(
    src,
    /100% means all \$\{total\} workspaces are complete/,
    "hovering the ring must explain what 100% means"
  );
});

test("Home does not reuse 'steps' for whole workspaces", () => {
  // The nudge cards link to entire workspaces. Heading them "Suggested next
  // steps" would recreate the exact ambiguity this change removes, one word
  // over.
  const src = read(HOME_V2);
  assert.doesNotMatch(
    src,
    /Suggested next steps/,
    "Home's nudge cards point at workspaces, so they must not be called steps"
  );
});
