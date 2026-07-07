// TIM-1323: tests for menu-item suggestion parsing. Guards the pure logic that
// turns a model response into a Title Case, em-dash-free candidate pick-list.

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  parseSuggestedItems,
  sanitizeRationale,
  resolveCategoryId,
  isCloseNameVariant,
  normalizeItemNameForMatch,
} from "./menu-suggest.ts"

test("parses a well-formed items object", () => {
  const raw = `Here you go:
  {"items": [
    {"name": "oat flat white", "category": "Espresso", "rationale": "A crowd favorite for plant-based regulars"},
    {"name": "maple pecan latte", "category": "Seasonal", "rationale": "Leans into the fall menu"}
  ]}`
  const items = parseSuggestedItems(raw)
  assert.equal(items.length, 2)
  assert.equal(items[0].name, "Oat Flat White") // Title Case (TIM-1002)
  assert.equal(items[0].category, "Espresso")
  assert.equal(items[1].name, "Maple Pecan Latte")
})

test("accepts a bare array response", () => {
  const raw = `[{"name": "avocado toast", "category": "Food"}]`
  const items = parseSuggestedItems(raw)
  assert.equal(items.length, 1)
  assert.equal(items[0].name, "Avocado Toast")
  assert.equal(items[0].category, "Food")
})

test("strips em and en dashes from rationale (voice mandate)", () => {
  const items = parseSuggestedItems(
    '{"items":[{"name":"cold brew","category":"Brewed Coffee","rationale":"Summer staple — high margin, low labor"}]}'
  )
  assert.equal(items[0].rationale, "Summer staple - high margin, low labor")
  assert.ok(!items[0].rationale.includes("—"))
})

test("dedupes by name and skips nameless rows", () => {
  const raw = `{"items":[
    {"name":"Latte","category":"Espresso"},
    {"name":"latte","category":"Espresso"},
    {"category":"Food"},
    {"name":"   ","category":"Food"}
  ]}`
  const items = parseSuggestedItems(raw)
  assert.equal(items.length, 1)
  assert.equal(items[0].name, "Latte")
})

test("returns null when no usable array is present", () => {
  assert.equal(parseSuggestedItems("no json here"), null)
  assert.equal(parseSuggestedItems(""), null)
  assert.equal(parseSuggestedItems('{"items": []}'), null)
})

test("caps the candidate list", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ name: `Item ${i}`, category: "Food" }))
  const items = parseSuggestedItems(JSON.stringify({ items: many }))
  assert.ok(items.length <= 16)
})

test("sanitizeRationale handles non-strings and blanks", () => {
  assert.equal(sanitizeRationale(undefined), undefined)
  assert.equal(sanitizeRationale(42), undefined)
  assert.equal(sanitizeRationale("   "), undefined)
  assert.equal(sanitizeRationale("  two   spaces  "), "two spaces")
})

// TIM-3683 Bug 2: close-variant matching so re-suggested items are filtered.
test("normalizeItemNameForMatch strips filler + diacritics + non-alphanumerics", () => {
  assert.equal(normalizeItemNameForMatch("Vanilla Latte"), "vanilla latte")
  assert.equal(normalizeItemNameForMatch("Classic Vanilla Latte"), "vanilla latte")
  assert.equal(normalizeItemNameForMatch("Vanilla Café Latte"), "vanilla latte")
  assert.equal(normalizeItemNameForMatch("The House Vanilla Latte!"), "vanilla latte")
  assert.equal(normalizeItemNameForMatch("Iced Vanilla Latte"), "iced vanilla latte")
})

test("isCloseNameVariant catches classic / cafe / house / signature adjectives", () => {
  const menu = ["Vanilla Latte"]
  assert.equal(isCloseNameVariant("Classic Vanilla Latte", menu), true)
  assert.equal(isCloseNameVariant("Vanilla Café Latte", menu), true)
  assert.equal(isCloseNameVariant("House Vanilla Latte", menu), true)
  assert.equal(isCloseNameVariant("Signature Vanilla Latte", menu), true)
  // Genuinely different items must NOT be filtered out.
  assert.equal(isCloseNameVariant("Iced Vanilla Latte", menu), false)
  assert.equal(isCloseNameVariant("Maple Syrup Latte", menu), false)
  assert.equal(isCloseNameVariant("Espresso", menu), false)
})

// TIM-3683 hardening: when every token is filler ("Coffee", "Cafe"), normalize
// must keep the raw token set so we don't false-positive-match unrelated
// filler-only names against each other.
test("filler-only names don't collide via empty-string normalization", () => {
  assert.equal(normalizeItemNameForMatch("Coffee"), "coffee")
  assert.equal(normalizeItemNameForMatch("Cafe"), "cafe")
  assert.equal(normalizeItemNameForMatch("The House Special"), "the house special")
  // "Coffee" on the menu should NOT block an unrelated filler-only "Cafe" suggestion.
  assert.equal(isCloseNameVariant("Cafe", ["Coffee"]), false)
  // But a same-name suggestion is still caught.
  assert.equal(isCloseNameVariant("coffee", ["Coffee"]), true)
})

// TIM-3683 Bug 3: full spec (price + estimated COGS + ingredients) survives parsing.
test("parses price, cogs, and ingredients from a full-spec response", () => {
  const raw = `{"items":[
    {
      "name": "Maple Syrup Latte",
      "category": "Espresso",
      "rationale": "Warm-weather sweet drink",
      "price": 5.75,
      "cogs": 1.4,
      "ingredients": [
        { "name": "Espresso Beans", "amount": 18, "unit": "g" },
        { "name": "Whole Milk", "amount": 180, "unit": "ml" },
        { "name": "Maple Syrup", "amount": 15, "unit": "ml" }
      ]
    }
  ]}`
  const items = parseSuggestedItems(raw)
  assert.equal(items.length, 1)
  assert.equal(items[0].price_cents, 575)
  assert.equal(items[0].estimated_cogs_cents, 140)
  assert.equal(items[0].ingredients.length, 3)
  assert.equal(items[0].ingredients[2].name, "Maple Syrup")
  assert.equal(items[0].ingredients[2].amount, 15)
  assert.equal(items[0].ingredients[2].unit, "ml")
})

test("coerces alternate unit spellings (grams, milliliters, pieces)", () => {
  const raw = `{"items":[
    {
      "name": "Fruit Bowl",
      "category": "Food",
      "price": 7,
      "ingredients": [
        { "name": "Strawberries", "amount": 80, "unit": "grams" },
        { "name": "Yogurt", "amount": 100, "unit": "milliliters" },
        { "name": "Banana", "amount": 1, "unit": "pieces" }
      ]
    }
  ]}`
  const items = parseSuggestedItems(raw)
  assert.equal(items[0].ingredients.length, 3)
  assert.equal(items[0].ingredients[0].unit, "g")
  assert.equal(items[0].ingredients[1].unit, "ml")
  assert.equal(items[0].ingredients[2].unit, "piece")
})

test("drops ingredients with invalid amount or unit", () => {
  const raw = `{"items":[
    {
      "name": "Weird Drink",
      "category": "Espresso",
      "ingredients": [
        { "name": "Espresso Beans", "amount": 18, "unit": "g" },
        { "name": "Broken", "amount": -1, "unit": "g" },
        { "name": "Broken2", "amount": 5, "unit": "cups" }
      ]
    }
  ]}`
  const items = parseSuggestedItems(raw)
  assert.equal(items[0].ingredients.length, 1)
  assert.equal(items[0].ingredients[0].name, "Espresso Beans")
})

test("resolveCategoryId matches case-insensitively with loose fallback", () => {
  const cats = [
    { id: "c1", name: "Espresso" },
    { id: "c2", name: "Brewed Coffee" },
    { id: "c3", name: "Food" },
  ]
  assert.equal(resolveCategoryId("espresso", cats), "c1")
  assert.equal(resolveCategoryId("Brewed Coffee", cats), "c2")
  assert.equal(resolveCategoryId("coffee", cats), "c2") // loose contains
  assert.equal(resolveCategoryId("Pastries", cats), null)
  assert.equal(resolveCategoryId("", cats), null)
  assert.equal(resolveCategoryId(undefined, cats), null)
})
