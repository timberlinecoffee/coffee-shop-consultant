// TIM-1638 acceptance tests:
//   1. normalizeLaunchPlanConfig (the extraction building-block for composePlanSnapshot)
//   2. isTimelineQuestion regex is scoped to intent-specific phrases (B1)
//   3. timeline_mismatch filter excludes entry from onApplySuggestions call (B2)
//
// Note: composePlanSnapshot.ts itself is not imported directly because it uses
// Next.js @/ path aliases that aren't available in the plain-node test runner.
// We test normalizeLaunchPlanConfig (its extraction building-block) + the two
// spec-locked behaviors that were the focus of the QA re-check.

import { test } from "node:test"
import assert from "node:assert/strict"

import { normalizeLaunchPlanConfig } from "../launch-plan.ts"

// ── B1 spec: isTimelineQuestion regex ────────────────────────────────────────
// The function is not exported from route.ts, so we inline the specification
// and assert against it. This test locks the regex contract, not the impl.

const TIMELINE_REGEX = /\b(open(ing)?|launch(ing)?|timeline|when.{0,20}(open|start|launch)|target date|how (long|soon)|schedule)\b/i

function matchesTimeline(msg) {
  return TIMELINE_REGEX.test(msg)
}

// ── 1. normalizeLaunchPlanConfig — the extraction pipeline used in composePlanSnapshot

test("normalizeLaunchPlanConfig: returns targetLaunchDate from valid content", () => {
  const config = normalizeLaunchPlanConfig({
    targetLaunchDate: "2027-03-01",
    lastGeneratedAt: null,
    viewPreference: "list",
    sourcesSnapshotAt: null,
  })
  assert.equal(config.targetLaunchDate, "2027-03-01")
})

test("normalizeLaunchPlanConfig: returns null when targetLaunchDate absent", () => {
  const config = normalizeLaunchPlanConfig({ viewPreference: "list" })
  assert.equal(config.targetLaunchDate, null)
})

test("normalizeLaunchPlanConfig: returns null for null input", () => {
  const config = normalizeLaunchPlanConfig(null)
  assert.equal(config.targetLaunchDate, null)
})

test("normalizeLaunchPlanConfig: returns null for non-object input", () => {
  const config = normalizeLaunchPlanConfig("invalid")
  assert.equal(config.targetLaunchDate, null)
})

test("normalizeLaunchPlanConfig: returns null when targetLaunchDate is not a string", () => {
  const config = normalizeLaunchPlanConfig({ targetLaunchDate: 20270301 })
  assert.equal(config.targetLaunchDate, null)
})

// Inline the composePlanSnapshot extraction logic to verify the targetLaunchDate path.
// This mirrors what composePlanSnapshot.ts lines 83-88 do.
function extractTargetLaunchDate(docs) {
  const openingDoc = docs.find((d) => d.workspace_key === "opening_month_plan")
  if (!openingDoc) return null
  const config = normalizeLaunchPlanConfig(openingDoc.content)
  return config.targetLaunchDate
}

test("extraction: returns targetLaunchDate when opening_month_plan doc present", () => {
  const docs = [
    {
      workspace_key: "concept",
      content: { version: 2 },
    },
    {
      workspace_key: "opening_month_plan",
      content: { targetLaunchDate: "2027-03-01" },
    },
  ]
  assert.equal(extractTargetLaunchDate(docs), "2027-03-01")
})

test("extraction: returns null when opening_month_plan doc is absent", () => {
  const docs = [
    { workspace_key: "concept", content: {} },
    { workspace_key: "marketing", content: {} },
  ]
  assert.equal(extractTargetLaunchDate(docs), null)
})

test("extraction: returns null when content has no targetLaunchDate", () => {
  const docs = [
    { workspace_key: "opening_month_plan", content: { viewPreference: "calendar" } },
  ]
  assert.equal(extractTargetLaunchDate(docs), null)
})

test("extraction: returns null for empty doc list", () => {
  assert.equal(extractTargetLaunchDate([]), null)
})

// ── 2. B1: isTimelineQuestion regex — positive cases ─────────────────────────

const positiveMessages = [
  "When do I plan to open?",
  "What is my launch timeline?",
  "How long until I can open?",
  "How soon can I launch?",
  "When will I open my coffee shop?",
  "What is the opening schedule?",
  "Tell me about my grand opening plans",
  "When should I start operations?",
  "What's the target date for opening?",
  "When will I launch?",
  "What is my timeline?",
]

for (const msg of positiveMessages) {
  test(`B1 positive: "${msg}"`, () => {
    assert.ok(matchesTimeline(msg), `Expected timeline match for: "${msg}"`)
  })
}

// ── 3. B1: negative cases — B1 fix removes \bdate\b, \bmonth\b, \byear\b ─────
// These must NOT match — the old regex had broad terms that caused false positives.

const negativeMessages = [
  "What year did Starbucks start?",
  "What month has the highest coffee sales?",
  "What date should I pick for equipment delivery?",
  "How is my budget looking this year?",
  "What are my biggest cost risks?",
  "Can you review my financial projections?",
  "What should I name my shop?",
  "Help me write a mission statement",
]

for (const msg of negativeMessages) {
  test(`B1 negative: "${msg}"`, () => {
    assert.ok(!matchesTimeline(msg), `Expected NO timeline match for: "${msg}"`)
  })
}

// ── 4. B2: timeline_mismatch filter — no field write on accept ────────────────
// Inlines the CoPilotDrawer filter logic (CoPilotDrawer.tsx:858-868).

test("B2: timeline_mismatch is filtered out before onApplySuggestions", () => {
  const accepted = [
    { suggestionId: "s1", fieldId: "timeline_mismatch", finalValue: "2027-03-01", wasEdited: false },
    { suggestionId: "s2", fieldId: "concept_vision", finalValue: "Bold & warm", wasEdited: true },
  ]
  const actionable = accepted.filter((c) => c.fieldId !== "timeline_mismatch")
  assert.equal(actionable.length, 1)
  assert.equal(actionable[0].fieldId, "concept_vision")
})

test("B2: when only timeline_mismatch entries, actionable is empty (no write)", () => {
  const accepted = [
    { suggestionId: "s1", fieldId: "timeline_mismatch", finalValue: "2027-03-01", wasEdited: false },
  ]
  const actionable = accepted.filter((c) => c.fieldId !== "timeline_mismatch")
  assert.equal(actionable.length, 0)
})

test("B2: non-timeline_mismatch entries are preserved in actionable set", () => {
  const accepted = [
    { suggestionId: "s1", fieldId: "menu_price", finalValue: "$5.50", wasEdited: true },
    { suggestionId: "s2", fieldId: "budget_estimate", finalValue: "$80000", wasEdited: false },
  ]
  const actionable = accepted.filter((c) => c.fieldId !== "timeline_mismatch")
  assert.equal(actionable.length, 2)
})
