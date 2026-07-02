// TIM-3490: pinning tests for resolveSectionOrder.
//
// AI-consumption DoD: swap two sections in the persisted order, assert
// downstream order reflects the swap. The AI assemblers iterate over the
// result of resolveSectionOrder(), so a test that proves the swap
// propagates is the canonical proof point.
//
// Hand-rolled key fixtures so this test has no transitive @/ imports
// (node:test --experimental-strip-types doesn't resolve the alias).

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveSectionOrder,
  isValidSectionOrderEntry,
  isPlausibleSectionOrderEntry,
  MAX_SECTION_ORDER_ENTRIES,
} from "./default-section-order.ts";

const DEFAULT_KEYS = [
  "executive-summary",
  "company-overview",
  "company-team",
  "opportunity-problem-solution",
  "opportunity-target-market",
  "opportunity-competition",
  "opportunity-risks",
  "execution-marketing-sales",
  "execution-operations",
  "execution-milestones-metrics",
];

test("empty persisted -> default + custom UUIDs appended", () => {
  const custom = ["11111111-1111-1111-1111-111111111111"];
  const ordered = resolveSectionOrder([], DEFAULT_KEYS, custom);
  assert.deepEqual(ordered, [...DEFAULT_KEYS, ...custom]);
});

test("null persisted -> default order", () => {
  assert.deepEqual(resolveSectionOrder(null, DEFAULT_KEYS), [...DEFAULT_KEYS]);
});

test("undefined persisted -> default order", () => {
  assert.deepEqual(
    resolveSectionOrder(undefined, DEFAULT_KEYS),
    [...DEFAULT_KEYS],
  );
});

test("DoD: swapping two sections in persisted order reflects in output", () => {
  const swapped = [...DEFAULT_KEYS];
  const tmp = swapped[3];
  swapped[3] = swapped[4];
  swapped[4] = tmp;

  const ordered = resolveSectionOrder(swapped, DEFAULT_KEYS, []);
  assert.deepEqual(ordered, swapped);
  assert.notEqual(ordered[3], DEFAULT_KEYS[3]);
  assert.notEqual(ordered[4], DEFAULT_KEYS[4]);
});

test("DoD: AI-context preview when the user swaps Executive Summary down by one", () => {
  // Simulates the AI prompt assembler iterating resolveSectionOrder() to
  // build "Section 1: …\n\nSection 2: …" prose. If reorder works, Section 1
  // is no longer "executive-summary".
  const persisted = [
    "company-overview",
    "executive-summary",
    ...DEFAULT_KEYS.filter(
      (k) => k !== "company-overview" && k !== "executive-summary",
    ),
  ];
  const ordered = resolveSectionOrder(persisted, DEFAULT_KEYS);
  assert.equal(ordered[0], "company-overview");
  assert.equal(ordered[1], "executive-summary");
});

test("new key added to default after persistence -> appended at tail", () => {
  const oldPersisted = DEFAULT_KEYS.slice(0, 3);
  const ordered = resolveSectionOrder(oldPersisted, DEFAULT_KEYS);
  assert.deepEqual(ordered.slice(0, 3), oldPersisted);
  const missing = DEFAULT_KEYS.filter((k) => !oldPersisted.includes(k));
  assert.deepEqual(ordered.slice(3), missing);
});

test("unknown keys in persisted are filtered out", () => {
  const persisted = [
    "executive-summary",
    "definitely-not-a-real-section-key",
    "company-overview",
  ];
  const ordered = resolveSectionOrder(persisted, DEFAULT_KEYS);
  assert.ok(!ordered.includes("definitely-not-a-real-section-key"));
  assert.equal(ordered[0], "executive-summary");
  assert.equal(ordered[1], "company-overview");
});

test("duplicate entries in persisted are de-duped (first wins)", () => {
  const persisted = [
    "executive-summary",
    "company-overview",
    "executive-summary",
  ];
  const ordered = resolveSectionOrder(persisted, DEFAULT_KEYS);
  const firstIdx = ordered.indexOf("executive-summary");
  const lastIdx = ordered.lastIndexOf("executive-summary");
  assert.equal(firstIdx, lastIdx);
});

test("custom UUID-looking ids are honored", () => {
  const customId = "abcdef12-3456-7890-abcd-ef1234567890";
  const persisted = ["executive-summary", customId, "company-overview"];
  const ordered = resolveSectionOrder(persisted, DEFAULT_KEYS, [customId]);
  assert.equal(ordered[0], "executive-summary");
  assert.equal(ordered[1], customId);
  assert.equal(ordered[2], "company-overview");
});

test("custom id missing from customSectionIds is dropped", () => {
  // Defensive: a user can't pin a custom UUID that the server can't prove
  // belongs to their plan. (Server-side validation: API route re-checks
  // ownership before persisting; this test pins the client-side filter.)
  const orphanId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
  const persisted = ["executive-summary", orphanId];
  const ordered = resolveSectionOrder(persisted, DEFAULT_KEYS, []);
  assert.ok(!ordered.includes(orphanId));
});

test("isValidSectionOrderEntry accepts known keys + UUIDs, rejects garbage", () => {
  assert.ok(isValidSectionOrderEntry("executive-summary", DEFAULT_KEYS));
  assert.ok(
    isValidSectionOrderEntry(
      "abcdef12-3456-7890-abcd-ef1234567890",
      DEFAULT_KEYS,
    ),
  );
  assert.ok(!isValidSectionOrderEntry("foo", DEFAULT_KEYS));
  assert.ok(!isValidSectionOrderEntry("", DEFAULT_KEYS));
  assert.ok(!isValidSectionOrderEntry(123, DEFAULT_KEYS));
  assert.ok(!isValidSectionOrderEntry(null, DEFAULT_KEYS));
});

test("isPlausibleSectionOrderEntry accepts kebab strings + UUIDs", () => {
  assert.ok(isPlausibleSectionOrderEntry("executive-summary"));
  assert.ok(
    isPlausibleSectionOrderEntry("abcdef12-3456-7890-abcd-ef1234567890"),
  );
  assert.ok(!isPlausibleSectionOrderEntry("FOO BAR"));
  assert.ok(!isPlausibleSectionOrderEntry("UPPERCASE"));
  assert.ok(!isPlausibleSectionOrderEntry(""));
  assert.ok(!isPlausibleSectionOrderEntry(123));
});

test("MAX_SECTION_ORDER_ENTRIES is finite and > default keys count", () => {
  assert.ok(MAX_SECTION_ORDER_ENTRIES > DEFAULT_KEYS.length);
  assert.ok(MAX_SECTION_ORDER_ENTRIES <= 1000);
});

// TIM-3575: pinning tests for the archive/optional-section feature.
test("archivedIds filter drops standard keys from result", () => {
  const persisted = ["executive-summary", "company-overview", "company-team"];
  const ordered = resolveSectionOrder(
    persisted,
    DEFAULT_KEYS,
    [],
    ["company-overview"],
  );
  assert.ok(!ordered.includes("company-overview"));
  assert.ok(ordered.includes("executive-summary"));
  assert.ok(ordered.includes("company-team"));
});

test("archivedIds filter drops custom UUIDs from result", () => {
  const customId = "abcdef12-3456-7890-abcd-ef1234567890";
  const persisted = ["executive-summary", customId];
  const ordered = resolveSectionOrder(
    persisted,
    DEFAULT_KEYS,
    [customId],
    [customId],
  );
  assert.ok(!ordered.includes(customId));
  assert.ok(ordered.includes("executive-summary"));
});

test("allowedStandardKeys keeps optional keys that persisted contains but seed excludes", () => {
  // Regression test: DEFAULT_BUSINESS_PLAN_SECTION_ORDER excludes optional
  // sections (they only get added via Add-to-Plan), but persisted may
  // contain them once added. Without the allowlist arg, the seed-only
  // membership check silently dropped them from effectiveOrder — Add-to-Plan
  // sections stopped rendering on the next parent re-render.
  const OPTIONAL = "sustainability-practices";
  const persisted = ["executive-summary", "company-overview", OPTIONAL];
  const allowed = [...DEFAULT_KEYS, OPTIONAL];

  const droppedByOldBehavior = resolveSectionOrder(persisted, DEFAULT_KEYS, []);
  assert.ok(
    !droppedByOldBehavior.includes(OPTIONAL),
    "seed-only membership drops optional (documents the pre-fix bug)",
  );

  const preservedByAllowlist = resolveSectionOrder(
    persisted,
    DEFAULT_KEYS,
    [],
    [],
    allowed,
  );
  assert.ok(preservedByAllowlist.includes(OPTIONAL));
  assert.equal(
    preservedByAllowlist.indexOf(OPTIONAL),
    2,
    "preserves the persisted position, not appended to tail",
  );
});

test("allowedStandardKeys default is defaultStandardKeys (back-compat)", () => {
  const persisted = ["executive-summary", "company-overview"];
  const withDefault = resolveSectionOrder(persisted, DEFAULT_KEYS);
  const withExplicit = resolveSectionOrder(
    persisted,
    DEFAULT_KEYS,
    [],
    [],
    DEFAULT_KEYS,
  );
  assert.deepEqual(withDefault, withExplicit);
});
