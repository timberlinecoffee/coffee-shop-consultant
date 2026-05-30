// TIM-1416: pinning tests for the V1 Operations Playbook document shape.
// Covers the drink_recipes drop, the new planning sections, and the
// normalizer's tolerance for older stored documents.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SOP_CATEGORY_KEYS,
  OPERATIONS_SECTION_KEYS,
  RECIPES_SECTION_KEY,
  normalizeOperationsPlaybook,
  seededPlaybook,
  isPlaybookEmpty,
  EMPTY_OPERATIONS_PLAYBOOK,
} from "./operations-playbook.ts";

test("SOP_CATEGORY_KEYS no longer includes drink_recipes", () => {
  assert.equal(SOP_CATEGORY_KEYS.includes("drink_recipes"), false);
  assert.equal(SOP_CATEGORY_KEYS.length, 5);
  assert.deepEqual(SOP_CATEGORY_KEYS, [
    "opening",
    "closing",
    "cleaning",
    "cash_handling",
    "food_safety",
  ]);
});

test("OPERATIONS_SECTION_KEYS includes the recipes panel and the three planning sections", () => {
  assert.equal(OPERATIONS_SECTION_KEYS.includes(RECIPES_SECTION_KEY), true);
  assert.equal(OPERATIONS_SECTION_KEYS.includes("roles"), true);
  assert.equal(OPERATIONS_SECTION_KEYS.includes("vendor_contacts"), true);
  assert.equal(OPERATIONS_SECTION_KEYS.includes("training"), true);
  // SOPs (5) + recipes (1) + planning (3) = 9
  assert.equal(OPERATIONS_SECTION_KEYS.length, 9);
});

test("normalize ignores legacy drink_recipes data without erroring", () => {
  const legacy = {
    drink_recipes: {
      intro: "Old recipes intro",
      items: [{ id: "x", text: "Espresso 18g in / 36g out" }],
      last_generated_at: "2026-05-26T00:00:00.000Z",
    },
    opening: { intro: "Open", items: [], last_generated_at: null },
  };
  const result = normalizeOperationsPlaybook(legacy);
  assert.equal("drink_recipes" in result, false);
  assert.equal(result.opening.intro, "Open");
});

test("normalize fills in defaults for missing planning sections", () => {
  const minimal = { opening: { intro: "Open", items: [], last_generated_at: null } };
  const result = normalizeOperationsPlaybook(minimal);
  assert.equal(result.roles.items.length, 0);
  assert.equal(result.vendor_contacts.items.length, 0);
  assert.equal(result.training.items.length, 0);
  assert.equal(result.roles.intro, EMPTY_OPERATIONS_PLAYBOOK.roles.intro);
});

test("normalize accepts populated planning sections", () => {
  const populated = {
    roles: {
      intro: "Roles intro",
      items: [
        { id: "r1", role: "Bar", responsibilities: "Pulls shots, steams milk." },
        { id: "r2", role: "", responsibilities: "" }, // dropped (both empty)
      ],
      last_generated_at: null,
    },
    vendor_contacts: {
      intro: "Contacts intro",
      items: [
        { id: "v1", label: "Plumber", contact_name: "Acme", phone: "555-0000", email: "", notes: "Drain" },
        { id: "v2", label: "", contact_name: "skip me" }, // dropped (no label)
      ],
      last_generated_at: null,
    },
    training: {
      intro: "Training intro",
      items: [
        { id: "t1", phase: "day_1", text: "Tour the shop" },
        { id: "t2", phase: "bogus", text: "Bad phase falls through to day_1" },
        { id: "t3", phase: "week_1", text: "" }, // dropped (empty text)
      ],
      last_generated_at: null,
    },
  };
  const result = normalizeOperationsPlaybook(populated);
  assert.equal(result.roles.items.length, 1);
  assert.equal(result.roles.items[0].role, "Bar");
  assert.equal(result.vendor_contacts.items.length, 1);
  assert.equal(result.vendor_contacts.items[0].label, "Plumber");
  assert.equal(result.training.items.length, 2);
  assert.equal(result.training.items[1].phase, "day_1");
});

test("seededPlaybook fills every section", () => {
  const seeded = seededPlaybook();
  for (const key of SOP_CATEGORY_KEYS) {
    assert.ok(seeded[key].items.length > 0, `expected items in ${key}`);
  }
  assert.ok(seeded.roles.items.length > 0);
  assert.ok(seeded.vendor_contacts.items.length > 0);
  assert.ok(seeded.training.items.length > 0);
});

test("isPlaybookEmpty considers planning sections", () => {
  assert.equal(isPlaybookEmpty(EMPTY_OPERATIONS_PLAYBOOK), true);
  const seeded = seededPlaybook();
  assert.equal(isPlaybookEmpty(seeded), false);
});
