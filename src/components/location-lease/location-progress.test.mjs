// TIM-4108 (UX Phase 3): the list-shaped workspace states what you have, and
// never pretends to measure how close you are to done.

import { test } from "node:test";
import assert from "node:assert/strict";
import { locationProgress } from "./location-progress.ts";
import { progressView } from "../workspace/workspace-progress.ts";

const view = (counts) => progressView(locationProgress(counts));

test("an empty workspace reads as not started, not as a measurement of nothing", () => {
  const v = view({ total: 0, shortlisted: 0, signed: 0 });
  assert.equal(v.label, "No locations yet");
  assert.equal(v.showBar, false);
  assert.equal(v.pct, null);
});

test("there is never a bar or a percentage, whatever the numbers", () => {
  // Trent's ruling D-011. This is the assertion the whole file exists for.
  for (const counts of [
    { total: 1, shortlisted: 0, signed: 0 },
    { total: 8, shortlisted: 3, signed: 0 },
    { total: 8, shortlisted: 3, signed: 1 },
  ]) {
    const v = view(counts);
    assert.equal(v.showBar, false, `bar drawn for ${JSON.stringify(counts)}`);
    assert.equal(v.pct, null, `percentage shown for ${JSON.stringify(counts)}`);
  }
});

test("one location is not '1 locations'", () => {
  assert.equal(view({ total: 1, shortlisted: 0, signed: 0 }).label, "1 location");
  assert.equal(view({ total: 2, shortlisted: 0, signed: 0 }).label, "2 locations");
});

test("the shortlist count appears once there is a shortlist", () => {
  assert.equal(
    view({ total: 5, shortlisted: 2, signed: 0 }).label,
    "5 locations · 2 shortlisted"
  );
  assert.equal(
    view({ total: 5, shortlisted: 0, signed: 0 }).label,
    "5 locations",
    "no shortlist means no trailing clause, not '0 shortlisted'"
  );
});

test("a signed lease outranks the shortlist count", () => {
  // Once you have signed, how many sites you were weighing up stopped being
  // the interesting number.
  assert.equal(
    view({ total: 5, shortlisted: 2, signed: 1 }).label,
    "5 locations · lease signed"
  );
});

test("the line never uses the words steps, sections or workspaces", () => {
  // T1-D vocabulary. "steps" belongs to workspaces you walk; this is a list.
  const v = view({ total: 4, shortlisted: 2, signed: 0 });
  assert.doesNotMatch(v.label, /step|section|workspace/i);
});
