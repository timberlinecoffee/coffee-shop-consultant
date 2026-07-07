// TIM-1323: tests for menu-item suggestion parsing. Guards the pure logic that
// turns a model response into a Title Case, em-dash-free candidate pick-list.

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  parseSuggestedItems,
  sanitizeRationale,
  resolveCategoryId,
  normalizeNameForDedupe,
  isDuplicateOfExisting,
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
  // Rationale flows through normalizeAIOutput, which Title Cases short
  // label-shaped fragments — this test guards the em-dash strip, not casing.
  const items = parseSuggestedItems(
    '{"items":[{"name":"cold brew","category":"Brewed Coffee","rationale":"Summer staple — high margin, low labor"}]}'
  )
  assert.ok(items[0].rationale)
  assert.ok(!items[0].rationale.includes("—"))
  assert.ok(!items[0].rationale.includes("–"))
  assert.ok(items[0].rationale.includes("-"))
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
  // sanitizeRationale runs normalizeAIOutput at the end, which Title Cases
  // short label-shaped fragments. This test asserts the strip/collapse
  // behavior, not the casing.
  assert.equal(sanitizeRationale(undefined), undefined)
  assert.equal(sanitizeRationale(42), undefined)
  assert.equal(sanitizeRationale("   "), undefined)
  const cleaned = sanitizeRationale("  two   spaces  ")
  assert.ok(cleaned)
  assert.equal(cleaned.toLowerCase(), "two spaces")
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

// TIM-3683 Bug 2: dedupe against existing menu items, including close variants.
test("normalizeNameForDedupe strips filler tokens and punctuation", () => {
  assert.equal(normalizeNameForDedupe("Vanilla Latte"), "vanilla latte")
  assert.equal(normalizeNameForDedupe("Classic Vanilla Latte"), "vanilla latte")
  assert.equal(normalizeNameForDedupe("Our Vanilla Café Latte"), "vanilla latte")
  assert.equal(normalizeNameForDedupe("The House Coffee Latte"), "latte")
})

test("isDuplicateOfExisting catches exact matches", () => {
  assert.equal(isDuplicateOfExisting("Vanilla Latte", ["Vanilla Latte"]), true)
})

test("isDuplicateOfExisting catches case + whitespace variants", () => {
  assert.equal(isDuplicateOfExisting("  VANILLA   LATTE ", ["Vanilla Latte"]), true)
})

test("isDuplicateOfExisting catches 'Classic X' vs 'X' — the board's exact case", () => {
  // If this fails, TIM-3683 Bug 2 is regressed and the AI will start
  // re-suggesting items the owner already has.
  assert.equal(isDuplicateOfExisting("Classic Vanilla Latte", ["Vanilla Latte"]), true)
  assert.equal(isDuplicateOfExisting("Vanilla Café Latte", ["Vanilla Latte"]), true)
  assert.equal(isDuplicateOfExisting("Vanilla Latte", ["Classic Vanilla Latte"]), true)
})

test("isDuplicateOfExisting lets net-new items through", () => {
  const existing = ["Vanilla Latte", "Cold Brew", "Avocado Toast"]
  assert.equal(isDuplicateOfExisting("Maple Syrup Latte", existing), false)
  assert.equal(isDuplicateOfExisting("Iced Matcha", existing), false)
  assert.equal(isDuplicateOfExisting("Breakfast Sandwich", existing), false)
})

test("isDuplicateOfExisting handles empty inputs", () => {
  assert.equal(isDuplicateOfExisting("", ["Vanilla Latte"]), false)
  assert.equal(isDuplicateOfExisting("Vanilla Latte", []), false)
})

// TIM-3683 Bug 3: the parser must surface AI-supplied price, COGS, and full
// ingredient list so accepting a suggestion yields a complete item.
test("parses estimated_price_cents, estimated_cogs_cents, and full ingredients list", () => {
  const raw = JSON.stringify({
    items: [
      {
        name: "Maple Syrup Latte",
        category: "Espresso",
        rationale: "House twist",
        estimated_price_cents: 575,
        estimated_cogs_cents: 145,
        ingredients: [
          { name: "espresso beans", amount: 18, unit: "g" },
          { name: "whole milk", amount: 240, unit: "ml" },
          { name: "maple syrup", amount: 15, unit: "ml" },
        ],
      },
    ],
  })
  const items = parseSuggestedItems(raw)
  assert.equal(items.length, 1)
  const item = items[0]
  assert.equal(item.estimated_price_cents, 575)
  assert.equal(item.estimated_cogs_cents, 145)
  assert.ok(Array.isArray(item.ingredients))
  assert.equal(item.ingredients.length, 3)
  // Non-default (maple syrup) must appear — this is the entire point of Bug 3.
  const maple = item.ingredients.find((i) => i.name === "Maple Syrup")
  assert.ok(maple, "maple syrup must be in the parsed ingredients list")
  assert.equal(maple.amount, 15)
  assert.equal(maple.unit, "ml")
  // Title Case is applied.
  assert.equal(item.ingredients[0].name, "Espresso Beans")
})

test("parser accepts price in dollars OR cents and normalizes to cents", () => {
  const raw = JSON.stringify({
    items: [
      { name: "A", category: "X", estimated_price_cents: 5.75, ingredients: [{name:"x",amount:1,unit:"g"}] },
      { name: "B", category: "X", estimated_price_cents: 575, ingredients: [{name:"x",amount:1,unit:"g"}] },
    ],
  })
  const items = parseSuggestedItems(raw)
  assert.equal(items[0].estimated_price_cents, 575)
  assert.equal(items[1].estimated_price_cents, 575)
})

test("parser drops invalid ingredient rows but keeps valid siblings", () => {
  const raw = JSON.stringify({
    items: [
      {
        name: "X",
        category: "Y",
        ingredients: [
          { name: "Good", amount: 10, unit: "g" },
          { name: "Bad Unit", amount: 10, unit: "liters" },
          { name: "", amount: 10, unit: "g" },
          { name: "Bad Amount", amount: -5, unit: "g" },
          { name: "Good", amount: 20, unit: "g" }, // dupe by name
        ],
      },
    ],
  })
  const items = parseSuggestedItems(raw)
  assert.equal(items[0].ingredients.length, 1)
  assert.equal(items[0].ingredients[0].name, "Good")
})

test("parser gracefully handles suggestions without any recipe (fallback path)", () => {
  const raw = JSON.stringify({
    items: [{ name: "Nothing", category: "X" }],
  })
  const items = parseSuggestedItems(raw)
  assert.equal(items[0].estimated_price_cents, undefined)
  assert.equal(items[0].estimated_cogs_cents, undefined)
  assert.equal(items[0].ingredients, undefined)
})

test("parser normalizes unit aliases (grams → g, milliliters → ml, ounces → oz)", () => {
  const raw = JSON.stringify({
    items: [{ name: "X", category: "Y", ingredients: [
      { name: "A", amount: 10, unit: "grams" },
      { name: "B", amount: 10, unit: "milliliters" },
      { name: "C", amount: 10, unit: "ounces" },
      { name: "D", amount: 10, unit: "pcs" },
    ]}],
  })
  const items = parseSuggestedItems(raw)
  assert.deepEqual(items[0].ingredients.map((i) => i.unit), ["g", "ml", "oz", "piece"])
})
