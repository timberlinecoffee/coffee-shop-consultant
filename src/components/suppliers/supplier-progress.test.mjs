// TIM-4108 (UX Phase 3): Suppliers states what has been decided without
// implying there is a finish line every shop is supposed to reach.

import { test } from "node:test";
import assert from "node:assert/strict";
import { supplierProgress } from "./supplier-progress.ts";
import { progressView } from "../workspace/workspace-progress.ts";

const view = (counts) => progressView(supplierProgress(counts));

test("no bar and no percentage, even though a denominator exists", () => {
  // The interesting case in this batch. Suppliers COULD draw an honest bar —
  // the categories are seeded, so the fraction is real. It does not, because
  // plenty of shops never source a pastry vendor, and a bar stuck at 60% would
  // nag them about a decision they already made correctly.
  for (const counts of [
    { chosen: 0, categories: 9 },
    { chosen: 3, categories: 9 },
    { chosen: 9, categories: 9 },
  ]) {
    const v = view(counts);
    assert.equal(v.showBar, false, `bar drawn for ${JSON.stringify(counts)}`);
    assert.equal(v.pct, null, `percentage shown for ${JSON.stringify(counts)}`);
  }
});

test("nothing decided yet leads with the work, not with a zero", () => {
  assert.equal(view({ chosen: 0, categories: 9 }).label, "9 categories to source");
});

test("once something is decided it says how much", () => {
  assert.equal(view({ chosen: 3, categories: 9 }).label, "3 of 9 categories chosen");
  assert.equal(view({ chosen: 9, categories: 9 }).label, "9 of 9 categories chosen");
});

test("one category is not '1 categories'", () => {
  assert.equal(view({ chosen: 0, categories: 1 }).label, "1 category to source");
  assert.equal(view({ chosen: 1, categories: 1 }).label, "1 of 1 category chosen");
});

test("an empty workspace says so rather than counting nothing", () => {
  assert.equal(view({ chosen: 0, categories: 0 }).label, "No categories yet");
});

test("a bad count cannot claim more chosen than exist", () => {
  assert.equal(view({ chosen: 12, categories: 9 }).label, "9 of 9 categories chosen");
  assert.equal(view({ chosen: -2, categories: 9 }).label, "9 categories to source");
});
