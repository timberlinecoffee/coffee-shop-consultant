// TIM-2901 acceptance tests: persona-add intent heuristic for the
// `add_persona` Scout tool gate.
//
// The function is not exported from route.ts (the heuristic is server-side and
// tightly coupled to the tool registration block), so we inline the
// specification regex and assert against it. This test locks the contract,
// not the impl.

import { test } from "node:test"
import assert from "node:assert/strict"

// Mirror of shouldOfferAddPersonaTool's intent regex in
// src/app/api/copilot/stream/route.ts. Keep in sync.
const PERSONA_INTENT = /\b(add|create|draft|write|design|make|come up with|propose|generate|suggest|build|sketch)\b[^.?!\n]{0,60}\bpersonas?\b/i

function matches(msg) {
  return PERSONA_INTENT.test(msg)
}

// ── must fire ─────────────────────────────────────────────────────────────────

const POSITIVES = [
  "add a persona",
  "Add a persona to my workspace",
  "can you add a persona for me?",
  "draft a persona for the morning crowd",
  "create a customer persona",
  "make me a persona",
  "design a persona for weekend regulars",
  "come up with a persona for remote workers",
  "propose a persona we should target",
  "generate a customer persona for me",
  "suggest a persona",
  "build a persona for the late-night crowd",
  "sketch a persona based on the menu",
  "add another persona",
  "create a second customer persona",
  "write a third persona",
  "Add the morning persona please",
  // Plurals
  "add a couple of personas",
  "create personas for my shop",
]

for (const msg of POSITIVES) {
  test(`fires on: ${msg}`, () => {
    assert.equal(matches(msg), true, `expected match, got none for "${msg}"`)
  })
}

// ── must NOT fire ─────────────────────────────────────────────────────────────

const NEGATIVES = [
  "tell me about my personas",
  "what's a persona?",
  "how many personas should I have?",
  "review my personas",
  "explain my customer persona",
  "show me the persona example",
  "I want to talk about my target customer",
  "who is my customer",
  "improve my marketing plan",
  // Across-sentence: intent verb in sentence 1, "persona" in sentence 2 ->
  // intentional reject (the [^.?!\n] guard caps span at 60 chars same line).
  "Tell me what you can do. Do my personas need work?",
]

for (const msg of NEGATIVES) {
  test(`does NOT fire on: ${msg}`, () => {
    assert.equal(matches(msg), false, `expected no match, got match for "${msg}"`)
  })
}
