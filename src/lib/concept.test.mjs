// TIM-619: Concept helpers — normalizeConcept tolerates messy storage shape
// and formatConceptForAI produces clean bullets for the co-pilot prompt.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_CONCEPT,
  formatConceptForAI,
  isConceptComplete,
  normalizeConcept,
} from "./concept.ts";

test("normalizeConcept returns empty doc for null/undefined", () => {
  assert.deepEqual(normalizeConcept(null), EMPTY_CONCEPT);
  assert.deepEqual(normalizeConcept(undefined), EMPTY_CONCEPT);
  assert.deepEqual(normalizeConcept("not an object"), EMPTY_CONCEPT);
});

test("normalizeConcept fills missing fields with empty strings", () => {
  const partial = { name: "Tide & Timber" };
  const normalized = normalizeConcept(partial);
  assert.equal(normalized.name, "Tide & Timber");
  assert.equal(normalized.mission, "");
  assert.equal(normalized.target_market, "");
  assert.equal(normalized.differentiation, "");
  assert.equal(normalized.brand_voice, "");
});

test("normalizeConcept ignores non-string field values", () => {
  const messy = {
    name: 42,
    mission: { unexpected: "object" },
    target_market: null,
    differentiation: ["array"],
    brand_voice: "Warm, direct",
  };
  const normalized = normalizeConcept(messy);
  assert.equal(normalized.name, "");
  assert.equal(normalized.mission, "");
  assert.equal(normalized.target_market, "");
  assert.equal(normalized.differentiation, "");
  assert.equal(normalized.brand_voice, "Warm, direct");
});

test("isConceptComplete requires every field non-empty", () => {
  assert.equal(isConceptComplete(EMPTY_CONCEPT), false);
  const partial = {
    name: "Tide",
    mission: "x",
    target_market: "y",
    differentiation: "z",
    brand_voice: "",
  };
  assert.equal(isConceptComplete(partial), false);
  const full = {
    name: "Tide & Timber",
    mission: "Serve great espresso to commuters.",
    target_market: "Under-40 commuters in the South End.",
    differentiation: "Direct-trade single-origin program.",
    brand_voice: "Warm, direct, craft.",
  };
  assert.equal(isConceptComplete(full), true);
});

test("formatConceptForAI renders fields as labelled bullets", () => {
  const doc = {
    name: "Tide & Timber",
    mission: "Serve great espresso to commuters.",
    target_market: "Under-40 commuters in the South End.",
    differentiation: "Direct-trade single-origin program.",
    brand_voice: "Warm, direct, craft.",
  };
  const out = formatConceptForAI(doc);
  assert.match(out, /\*\*Shop name\*\*: Tide & Timber/);
  assert.match(out, /\*\*Mission\*\*: Serve great espresso/);
  assert.match(out, /\*\*Target customer\*\*: Under-40 commuters/);
  assert.match(out, /\*\*Differentiation\*\*: Direct-trade/);
  assert.match(out, /\*\*Brand voice & pillars\*\*: Warm, direct/);
});

test("formatConceptForAI returns empty marker when nothing is filled", () => {
  assert.equal(formatConceptForAI(EMPTY_CONCEPT), "_no concept fields filled in yet_");
});

test("formatConceptForAI skips blank fields silently", () => {
  const partial = {
    name: "Tide & Timber",
    mission: "",
    target_market: "  ",
    differentiation: "Direct-trade only.",
    brand_voice: "",
  };
  const out = formatConceptForAI(partial);
  assert.match(out, /\*\*Shop name\*\*: Tide & Timber/);
  assert.match(out, /\*\*Differentiation\*\*: Direct-trade only/);
  assert.doesNotMatch(out, /\*\*Mission\*\*/);
  assert.doesNotMatch(out, /\*\*Target customer\*\*/);
  assert.doesNotMatch(out, /\*\*Brand voice & pillars\*\*/);
});
