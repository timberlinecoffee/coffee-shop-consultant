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

// ── TIM-2346: normalizeConceptV2 competitor parsing ──────────────────────────

import { normalizeConceptV2 } from "./concept.ts";

test("normalizeConceptV2 parses valid competitors array", () => {
  const input = {
    version: 2,
    components: {
      shop_identity:   { content: "Tide & Timber", included: true },
      vision:          { content: "A cozy spot.", included: true },
      target_customer: { content: "", included: true },
      differentiation: { content: "Direct-trade.", included: true },
      brand_voice:     { content: "Warm.", included: true },
      location:        { content: "", included: false },
      offering:        { content: "", included: false },
    },
    competitors: [
      { id: "c-1", name: "Morning Light Coffee", address: "12 Oak St", what_they_do_well: "Great espresso", gaps: "Closes at 2pm" },
      { id: "c-2", name: "Harbour Roast", address: "", what_they_do_well: null, gaps: undefined },
    ],
    no_direct_competitors_identified: false,
  };
  const doc = normalizeConceptV2(input);
  assert.equal(doc.competitors?.length, 2);
  assert.equal(doc.competitors?.[0].name, "Morning Light Coffee");
  assert.equal(doc.competitors?.[0].address, "12 Oak St");
  assert.equal(doc.competitors?.[0].what_they_do_well, "Great espresso");
  assert.equal(doc.competitors?.[0].gaps, "Closes at 2pm");
  // address is empty string — normalizer keeps it as-is (not undefined)
  assert.equal(doc.competitors?.[1].name, "Harbour Roast");
  assert.equal(doc.no_direct_competitors_identified, false);
});

test("normalizeConceptV2 drops competitor rows with missing or blank name", () => {
  const input = {
    version: 2,
    components: {
      shop_identity:   { content: "Test", included: true },
      vision:          { content: "Vision.", included: true },
      target_customer: { content: "", included: true },
      differentiation: { content: "Diff.", included: true },
      brand_voice:     { content: "Voice.", included: true },
      location:        { content: "", included: false },
      offering:        { content: "", included: false },
    },
    competitors: [
      { id: "c-1", name: "  " },            // blank name — dropped
      { id: "c-2", name: null },            // null name — dropped
      { id: "c-3", name: 42 },              // non-string name — dropped
      { id: "c-4", name: "Valid Shop" },    // kept
      null,                                 // null entry — dropped
      "not an object",                      // primitive — dropped
    ],
  };
  const doc = normalizeConceptV2(input);
  assert.equal(doc.competitors?.length, 1);
  assert.equal(doc.competitors?.[0].name, "Valid Shop");
});

test("normalizeConceptV2 omits competitors key when all rows are malformed", () => {
  const input = {
    version: 2,
    components: {
      shop_identity:   { content: "Test", included: true },
      vision:          { content: "Vision.", included: true },
      target_customer: { content: "", included: true },
      differentiation: { content: "Diff.", included: true },
      brand_voice:     { content: "Voice.", included: true },
      location:        { content: "", included: false },
      offering:        { content: "", included: false },
    },
    competitors: [
      { id: "c-1", name: "" },
      null,
      42,
    ],
  };
  const doc = normalizeConceptV2(input);
  assert.equal(doc.competitors, undefined);
});

test("normalizeConceptV2 omits competitors key when competitors is not an array", () => {
  const input = {
    version: 2,
    components: {
      shop_identity:   { content: "Test", included: true },
      vision:          { content: "Vision.", included: true },
      target_customer: { content: "", included: true },
      differentiation: { content: "Diff.", included: true },
      brand_voice:     { content: "Voice.", included: true },
      location:        { content: "", included: false },
      offering:        { content: "", included: false },
    },
    competitors: "not-an-array",
  };
  const doc = normalizeConceptV2(input);
  assert.equal(doc.competitors, undefined);
});

test("normalizeConceptV2 reads no_direct_competitors_identified boolean", () => {
  const base = {
    version: 2,
    components: {
      shop_identity:   { content: "X", included: true },
      vision:          { content: "V", included: true },
      target_customer: { content: "", included: true },
      differentiation: { content: "D", included: true },
      brand_voice:     { content: "B", included: true },
      location:        { content: "", included: false },
      offering:        { content: "", included: false },
    },
  };
  const docTrue = normalizeConceptV2({ ...base, no_direct_competitors_identified: true });
  assert.equal(docTrue.no_direct_competitors_identified, true);

  const docFalse = normalizeConceptV2({ ...base, no_direct_competitors_identified: false });
  assert.equal(docFalse.no_direct_competitors_identified, false);

  // Non-boolean values — field omitted
  const docString = normalizeConceptV2({ ...base, no_direct_competitors_identified: "yes" });
  assert.equal(docString.no_direct_competitors_identified, undefined);
});

test("normalizeConceptV2 assigns fallback id to competitor missing a string id", () => {
  const input = {
    version: 2,
    components: {
      shop_identity:   { content: "Test", included: true },
      vision:          { content: "Vision.", included: true },
      target_customer: { content: "", included: true },
      differentiation: { content: "Diff.", included: true },
      brand_voice:     { content: "Voice.", included: true },
      location:        { content: "", included: false },
      offering:        { content: "", included: false },
    },
    competitors: [
      { name: "Shop One" },            // no id — gets fallback
      { id: null, name: "Shop Two" },  // null id — gets fallback
    ],
  };
  const doc = normalizeConceptV2(input);
  assert.equal(doc.competitors?.length, 2);
  assert.match(doc.competitors?.[0].id ?? "", /competitor-0/);
  assert.match(doc.competitors?.[1].id ?? "", /competitor-1/);
});
