// TIM-1002: pinning tests for toTitleCase + titleCaseFields.
// These tests are the contract — every AI/seed boundary calls this helper, so
// regressions in casing rules surface here first.

import { test } from "node:test";
import assert from "node:assert/strict";
import { toTitleCase, titleCaseFields } from "./text.ts";

test("the literal cases from TIM-1002 acceptance criteria", () => {
  assert.equal(toTitleCase("the espresso machine"), "The Espresso Machine");
  assert.equal(toTitleCase("porta filter set"), "Porta Filter Set");
  assert.equal(toTitleCase("milk steaming pitcher (32oz)"), "Milk Steaming Pitcher (32oz)");
});

test("articles and short prepositions stay lowercase in the middle", () => {
  assert.equal(toTitleCase("back to dashboard"), "Back to Dashboard");
  assert.equal(toTitleCase("a place of work"), "A Place of Work");
  assert.equal(toTitleCase("white-glove onboarding"), "White-Glove Onboarding");
  assert.equal(toTitleCase("learning by doing"), "Learning by Doing");
});

test("articles/prepositions are capitalized when first or last", () => {
  // first word always capitalized
  assert.equal(toTitleCase("the team"), "The Team");
  assert.equal(toTitleCase("of mice"), "Of Mice");
  // last word capitalized (AP style)
  assert.equal(toTitleCase("what we live by"), "What We Live By");
});

test("hyphenated compounds capitalize both parts", () => {
  assert.equal(toTitleCase("white-glove onboarding"), "White-Glove Onboarding");
  assert.equal(toTitleCase("cold-brew tower"), "Cold-Brew Tower");
  assert.equal(toTitleCase("bean-to-cup machine"), "Bean-To-Cup Machine");
});

test("acronyms and units are preserved", () => {
  assert.equal(toTitleCase("pos terminal"), "POS Terminal");
  assert.equal(toTitleCase("hvac inspection"), "HVAC Inspection");
  assert.equal(toTitleCase("ada compliance"), "ADA Compliance");
  // unit-suffixed tokens like "32oz" are not capitalized to "32Oz"
  assert.equal(toTitleCase("32oz pitcher"), "32oz Pitcher");
});

// TIM-1175: coffee/equipment acronym set
test("coffee and equipment acronyms render ALL CAPS (TIM-1175)", () => {
  // Technique acronyms
  assert.equal(toTitleCase("wdt needle tool"), "WDT Needle Tool");
  assert.equal(toTitleCase("rdt water dropper"), "RDT Water Dropper");
  assert.equal(toTitleCase("pid controller upgrade"), "PID Controller Upgrade");
  // Filter basket brands
  assert.equal(toTitleCase("vst precision basket"), "VST Precision Basket");
  assert.equal(toTitleCase("ims basket 20g"), "IMS Basket 20g");
  // Equipment model names
  assert.equal(toTitleCase("ek43 grinder"), "EK43 Grinder");
  assert.equal(toTitleCase("mahlkonig ek43"), "Mahlkonig EK43");
  // Brand name with mixed case
  assert.equal(toTitleCase("puqpress q2"), "PUQpress Q2");
  assert.equal(toTitleCase("automatic puqpress"), "Automatic PUQpress");
  // Regulatory / commercial
  assert.equal(toTitleCase("nsf certified sink"), "NSF Certified Sink");
  assert.equal(toTitleCase("osha compliant storage"), "OSHA Compliant Storage");
  assert.equal(toTitleCase("sku tracking"), "SKU Tracking");
  assert.equal(toTitleCase("upc label printer"), "UPC Label Printer");
  assert.equal(toTitleCase("btu gas range"), "BTU Gas Range");
  // Title-case rule still applies to non-acronym words
  assert.equal(toTitleCase("wdt tool for espresso"), "WDT Tool for Espresso");
});

test("punctuation, parentheses, and trailing chars survive", () => {
  assert.equal(toTitleCase("milk steaming pitcher (32oz)"), "Milk Steaming Pitcher (32oz)");
  assert.equal(toTitleCase("espresso machine, dual boiler"), "Espresso Machine, Dual Boiler");
  assert.equal(toTitleCase("knock box"), "Knock Box");
});

test("ALL CAPS and Mixed Case are normalized to title case", () => {
  assert.equal(toTitleCase("ESPRESSO MACHINE"), "Espresso Machine");
  assert.equal(toTitleCase("eSpResSo MaChInE"), "Espresso Machine");
});

test("brand-name casing must be added to PRESERVED_CASING explicitly", () => {
  // Mixed-case input that isn't on the preserve list is normalized — we don't
  // try to guess at branding intent. If a brand like "iPad" needs to land
  // mid-label, add it to PRESERVED_CASING in src/lib/text.ts.
  assert.equal(toTitleCase("the iPad stand"), "The Ipad Stand");
});

test("empty / whitespace inputs round-trip", () => {
  assert.equal(toTitleCase(""), "");
  assert.equal(toTitleCase("   "), "   ");
});

test("single words capitalize regardless of part of speech", () => {
  // first word == last word, so the exception list doesn't apply
  assert.equal(toTitleCase("the"), "The");
  assert.equal(toTitleCase("of"), "Of");
  assert.equal(toTitleCase("espresso"), "Espresso");
});

test("titleCaseFields only touches named string fields and never mutates input", () => {
  const input = {
    name: "the morning rush",
    description: "We open at 5:45 a.m. on weekdays.",
    count: 4,
    nullable: null,
  };
  const out = titleCaseFields(input, ["name", "description", "nullable"]);
  assert.equal(out.name, "The Morning Rush");
  // description gets title-cased too — caller decides what is label-shaped.
  // If the value is a full sentence, the caller should NOT include it in fields.
  assert.equal(out.description, "We Open at 5:45 A.m. on Weekdays.");
  assert.equal(out.count, 4);
  assert.equal(out.nullable, null);
  // input not mutated
  assert.equal(input.name, "the morning rush");
});

test("titleCaseFields skips fields that are not strings on the object", () => {
  const input = { name: "cold brew", missing: undefined };
  const out = titleCaseFields(input, ["name", "missing"]);
  assert.equal(out.name, "Cold Brew");
  assert.equal(out.missing, undefined);
});
