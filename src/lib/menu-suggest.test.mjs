// TIM-1323: tests for menu-item suggestion parsing. Guards the pure logic that
// turns a model response into a Title Case, em-dash-free candidate pick-list.

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  parseSuggestedItems,
  sanitizeRationale,
  resolveCategoryId,
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
