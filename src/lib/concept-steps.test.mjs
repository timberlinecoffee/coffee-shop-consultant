// TIM-4108 (UX Phase 3): Concept's emphasised button and its progress line are
// derived from one list, and that list skips the cards nobody has claimed.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getConceptV2Steps,
  getConceptV2Progress,
  CONCEPT_COMPONENTS_V2,
} from "./concept.ts";
import { nextStep, stepsProgress } from "../components/workspace/next-step.ts";

function docWith(filled = {}) {
  const components = {};
  for (const meta of CONCEPT_COMPONENTS_V2) {
    components[meta.id] = { content: filled[meta.id] ?? "", included: true };
  }
  return { components };
}

test("the step count and the progress count never disagree", () => {
  // The whole reason for one shared list. Before this the header counted one
  // set of things and nothing pointed at which to do next, so the two could
  // not be checked against each other at all.
  const doc = docWith({ shop_identity: "Timberline" });
  const steps = getConceptV2Steps(doc);
  const progress = getConceptV2Progress(doc);
  assert.equal(steps.length, progress.total);
  assert.equal(steps.filter((s) => s.done).length, progress.filled);
});

test("a card nobody has claimed is not offered as the next thing", () => {
  // Deferrable components that are still empty do not count toward progress,
  // so pointing the button at one would be asking the owner to do work the
  // progress line has already agreed they can skip.
  const deferrable = CONCEPT_COMPONENTS_V2.filter((m) => m.deferrable);
  assert.ok(deferrable.length > 0, "this test needs at least one deferrable card");
  const ids = new Set(getConceptV2Steps(docWith()).map((s) => s.id));
  for (const meta of deferrable) {
    assert.ok(!ids.has(meta.id), `${meta.id} is deferrable and empty — skip it`);
  }
});

test("filling a deferrable card brings it into the list", () => {
  // Once the owner writes something there, they have claimed it, and it counts
  // like anything else.
  const meta = CONCEPT_COMPONENTS_V2.find((m) => m.deferrable);
  const steps = getConceptV2Steps(docWith({ [meta.id]: "yes, we do this" }));
  const found = steps.find((s) => s.id === meta.id);
  assert.ok(found, "a filled deferrable card must appear");
  assert.equal(found.done, true);
});

test("an untouched Concept invites you into the first card", () => {
  const n = nextStep(getConceptV2Steps(docWith()));
  assert.ok(n, "a blank Concept must have a next step");
  assert.match(n.label, /^Start with /);
});

test("steps carry the label the card actually shows", () => {
  // The button says "Continue with Shop identity" — it has to be the same
  // words as the card heading or it points at nothing the owner can find.
  const steps = getConceptV2Steps(docWith());
  const labels = new Set(CONCEPT_COMPONENTS_V2.map((m) => m.label));
  for (const s of steps) {
    assert.ok(labels.has(s.label), `${s.label} is not a real card heading`);
  }
});

test("progress reads in the T1-D vocabulary, not 'components' or 'cards'", () => {
  const doc = docWith({ shop_identity: "Timberline" });
  const view = stepsProgress(getConceptV2Steps(doc));
  assert.equal(view.kind, "steps");
  assert.ok(view.total > 0);
});
