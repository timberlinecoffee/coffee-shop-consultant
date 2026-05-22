// TIM-619 / TIM-884: Concept helpers.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_CONCEPT,
  EMPTY_CONCEPT_V2,
  formatConceptForAI,
  getConceptV2Progress,
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

// ── TIM-884: getConceptV2Progress — "filled" definition tests ────────────────
// These pin the exact counting logic so both surfaces (main page and sidebar)
// can be proven to use the same source of truth.

test("getConceptV2Progress counts only included components toward total", () => {
  const doc = {
    ...EMPTY_CONCEPT_V2,
    components: {
      shop_identity:   { content: "Tide & Timber", included: true },
      vision:          { content: "",              included: true },
      target_customer: { content: "commuters",     included: true },
      differentiation: { content: "direct-trade",  included: true },
      brand_voice:     { content: "warm",           included: true },
      location:        { content: "downtown",       included: false },
      offering:        { content: "",               included: false },
    },
  };
  const p = getConceptV2Progress(doc);
  assert.equal(p.total, 5);
  assert.equal(p.filled, 4);
});

test("getConceptV2Progress treats whitespace-only content as unfilled", () => {
  const doc = {
    ...EMPTY_CONCEPT_V2,
    components: {
      shop_identity:   { content: "  ",     included: true },
      vision:          { content: "exists", included: true },
      target_customer: { content: "",       included: true },
      differentiation: { content: "diff",   included: true },
      brand_voice:     { content: "warm",   included: true },
      location:        { content: "",       included: false },
      offering:        { content: "",       included: false },
    },
  };
  const p = getConceptV2Progress(doc);
  assert.equal(p.total, 5);
  assert.equal(p.filled, 3);
});

test("getConceptV2Progress includes optional components when toggled in", () => {
  const doc = {
    ...EMPTY_CONCEPT_V2,
    components: {
      shop_identity:   { content: "Tide",     included: true },
      vision:          { content: "vision",   included: true },
      target_customer: { content: "target",   included: true },
      differentiation: { content: "diff",     included: true },
      brand_voice:     { content: "voice",    included: true },
      location:        { content: "downtown", included: true },
      offering:        { content: "",         included: false },
    },
  };
  const p = getConceptV2Progress(doc);
  assert.equal(p.total, 6);
  assert.equal(p.filled, 6);
});

test("getConceptV2Progress returns 0/5 for the empty default document", () => {
  const p = getConceptV2Progress(EMPTY_CONCEPT_V2);
  assert.equal(p.total, 5);
  assert.equal(p.filled, 0);
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
