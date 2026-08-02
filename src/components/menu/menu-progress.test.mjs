// TIM-4108 (UX Phase 3): the menu states its size and never implies a target.

import { test } from "node:test";
import assert from "node:assert/strict";
import { menuProgress } from "./menu-progress.ts";
import { progressView } from "../workspace/workspace-progress.ts";

const view = (counts) => progressView(menuProgress({ items: 0, categories: 0, ...counts }));

test("never a bar, because there is no correct size for a menu", () => {
  // A three-item cart and a forty-item cafe are both finished menus. Any
  // denominator would be a number we invented and then measured the owner
  // against.
  for (const counts of [
    { items: 3, categories: 1 },
    { items: 24, categories: 6 },
    { items: 120, categories: 12 },
  ]) {
    const v = view(counts);
    assert.equal(v.showBar, false);
    assert.equal(v.pct, null);
  }
});

test("an empty menu says so", () => {
  assert.equal(view({}).label, "No menu items yet");
  assert.equal(view({ categories: 5 }).label, "No menu items yet");
});

test("items lead, categories follow", () => {
  assert.equal(view({ items: 24, categories: 6 }).label, "24 items · 6 categories");
});

test("items without categories still read sensibly", () => {
  // This is what a half-built menu looks like, so it has to be a real case.
  assert.equal(view({ items: 4 }).label, "4 items");
});

test("singulars", () => {
  assert.equal(view({ items: 1, categories: 1 }).label, "1 item · 1 category");
});

test("the line never borrows the steps or sections vocabulary", () => {
  assert.doesNotMatch(view({ items: 9, categories: 3 }).label, /step|section|workspace/i);
});
