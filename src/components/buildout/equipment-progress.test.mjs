// TIM-4108 (UX Phase 3): Equipment states what is on the list, and never
// pretends to know how much gear a shop is supposed to end up with.

import { test } from "node:test";
import assert from "node:assert/strict";
import { equipmentProgress } from "./equipment-progress.ts";
import { progressView } from "../workspace/workspace-progress.ts";

const view = (counts) => progressView(equipmentProgress(counts));

test("an untouched list reads as not started", () => {
  const v = view({ items: 0, stations: 0 });
  assert.equal(v.label, "Nothing on the list yet");
  assert.equal(v.showBar, false);
  assert.equal(v.pct, null);
});

test("there is never a bar or a percentage, whatever the numbers", () => {
  // D-011. A bar cafe and a drive-through need different gear in different
  // amounts, so any denominator would be a guess wearing a measurement's face.
  for (const counts of [
    { items: 1, stations: 1 },
    { items: 14, stations: 4 },
    { items: 200, stations: 9 },
  ]) {
    const v = view(counts);
    assert.equal(v.showBar, false, `bar drawn for ${JSON.stringify(counts)}`);
    assert.equal(v.pct, null, `percentage shown for ${JSON.stringify(counts)}`);
  }
});

test("one of a thing is not '1 items' or '1 stations'", () => {
  assert.equal(view({ items: 1, stations: 1 }).label, "1 item · 1 station");
  assert.equal(view({ items: 2, stations: 2 }).label, "2 items · 2 stations");
});

test("items with no stations still state the items", () => {
  assert.equal(view({ items: 5, stations: 0 }).label, "5 items");
});

test("the line never uses the words steps, sections or workspaces", () => {
  // T1-D vocabulary: "steps" belongs to workspaces you walk, "sections" to
  // generated documents. This is a list, so it borrows neither.
  assert.doesNotMatch(view({ items: 9, stations: 3 }).label, /step|section|workspace/i);
});
