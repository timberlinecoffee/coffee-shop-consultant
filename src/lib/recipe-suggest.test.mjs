// TIM-1321: tests for recipe-suggestion parsing/normalization. These guard the
// pure logic that turns a model response into editable, COGS-safe recipe lines.
// TIM-3862: extended with server-side guard tests (applyLinkedItemGuard).

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  parseRecipeResponse,
  normalizeUnitAndAmount,
  defaultPackageSize,
  applyLinkedItemGuard,
} from "./recipe-suggest.ts"

test("parses a well-formed cappuccino recipe", () => {
  const raw = `Here is the recipe:
  {"ingredients": [
    {"name": "espresso", "amount": 18, "unit": "g"},
    {"name": "whole milk", "amount": 120, "unit": "ml"}
  ]}`
  const lines = parseRecipeResponse(raw)
  assert.equal(lines.length, 2)
  assert.equal(lines[0].name, "Espresso")
  assert.equal(lines[0].amount, 18)
  assert.equal(lines[0].unit, "g")
  assert.equal(lines[1].name, "Whole Milk")
  assert.equal(lines[1].unit, "ml")
})

test("accepts a bare array response", () => {
  const raw = `[{"name": "avocado", "amount": 1, "unit": "each"},
                {"name": "sourdough bread", "amount": 2, "unit": "slices"}]`
  const lines = parseRecipeResponse(raw)
  assert.equal(lines.length, 2)
  assert.equal(lines[1].name, "Sourdough Bread")
  assert.equal(lines[1].unit, "piece") // "slices" → piece
})

test("titles ingredient names per TIM-1002", () => {
  const lines = parseRecipeResponse('{"ingredients":[{"name":"oat milk","amount":150,"unit":"ml"}]}')
  assert.equal(lines[0].name, "Oat Milk")
})

test("dedupes repeated ingredient names (case-insensitive)", () => {
  const raw = '{"ingredients":[{"name":"Sugar","amount":5,"unit":"g"},{"name":"sugar","amount":3,"unit":"g"}]}'
  const lines = parseRecipeResponse(raw)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].amount, 5)
})

test("returns null when no JSON present", () => {
  assert.equal(parseRecipeResponse("I cannot help with that."), null)
  assert.equal(parseRecipeResponse(""), null)
})

test("returns null when ingredients array is empty", () => {
  assert.equal(parseRecipeResponse('{"ingredients":[]}'), null)
})

test("skips lines with no name", () => {
  const lines = parseRecipeResponse('{"ingredients":[{"amount":5,"unit":"g"},{"name":"Salt","amount":1,"unit":"g"}]}')
  assert.equal(lines.length, 1)
  assert.equal(lines[0].name, "Salt")
})

test("converts kg to g and scales amount", () => {
  const { unit, amount } = normalizeUnitAndAmount("kg", 0.02)
  assert.equal(unit, "g")
  assert.equal(amount, 20)
})

test("converts liters and spoons to ml", () => {
  assert.deepEqual(normalizeUnitAndAmount("l", 0.25), { unit: "ml", amount: 250 })
  assert.deepEqual(normalizeUnitAndAmount("tbsp", 2), { unit: "ml", amount: 30 })
  assert.deepEqual(normalizeUnitAndAmount("shot", 1), { unit: "ml", amount: 30 })
})

test("converts pounds to oz", () => {
  assert.deepEqual(normalizeUnitAndAmount("lb", 1), { unit: "oz", amount: 16 })
})

test("unknown unit falls back to each, amount preserved", () => {
  assert.deepEqual(normalizeUnitAndAmount("sprig", 3), { unit: "each", amount: 3 })
})

test("non-positive or non-numeric amounts default to 1", () => {
  assert.equal(normalizeUnitAndAmount("g", 0).amount, 1)
  assert.equal(normalizeUnitAndAmount("g", -5).amount, 1)
  assert.equal(normalizeUnitAndAmount("g", "abc").amount, 1)
})

test("default package size is sensible per unit", () => {
  assert.equal(defaultPackageSize("g"), 1000)
  assert.equal(defaultPackageSize("ml"), 1000)
  assert.equal(defaultPackageSize("oz"), 32)
  assert.equal(defaultPackageSize("each"), 1)
  assert.equal(defaultPackageSize("piece"), 1)
})

test("caps the number of lines at 12", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ name: `Ingredient ${i}`, amount: 1, unit: "g" }))
  const lines = parseRecipeResponse(JSON.stringify({ ingredients: many }))
  assert.equal(lines.length, 12)
})

test("parses group and action fields from enhanced response", () => {
  const raw = JSON.stringify({
    ingredients: [
      { name: "espresso beans - warmth blend", amount: 18, unit: "g", group: "ingredient", action: "keep", inventory_item_id: "abc-123" },
      { name: "vanilla syrup", amount: 15, unit: "ml", group: "ingredient", action: "add", inventory_item_id: null },
      { name: "custom cup - 8oz", amount: 1, unit: "each", group: "supply", action: "keep", inventory_item_id: "def-456" },
    ],
  })
  const lines = parseRecipeResponse(raw)
  assert.equal(lines.length, 3)
  assert.equal(lines[0].group, "ingredient")
  assert.equal(lines[0].action, "keep")
  assert.equal(lines[0].inventory_item_id, "abc-123")
  assert.equal(lines[1].action, "add")
  assert.equal(lines[1].inventory_item_id, null)
  assert.equal(lines[2].group, "supply")
})

test("ignores unknown group/action values (falls back to undefined)", () => {
  const raw = JSON.stringify({
    ingredients: [
      { name: "oat milk", amount: 150, unit: "ml", group: "beverage", action: "modify" },
    ],
  })
  const lines = parseRecipeResponse(raw)
  assert.equal(lines[0].group, undefined)
  assert.equal(lines[0].action, undefined)
})

// TIM-3862 server-side guard: cappuccino repro with inventory-linked items.
// The model should never be able to replace a linked item — guard converts it.
test("applyLinkedItemGuard: rejects replace targeting linked item by id, converts to keep", () => {
  const linkedIds = new Set(["ing-espresso-id"])
  const linkedNames = new Set(["espresso beans - warmth blend"])

  const lines = [
    {
      name: "Espresso",
      amount: 18,
      unit: "g",
      action: "replace",
      inventory_item_id: "ing-espresso-id", // targets the linked item by id
      group: "ingredient",
    },
  ]

  const guarded = applyLinkedItemGuard(lines, linkedIds, linkedNames, "test-req-1")
  assert.equal(guarded.length, 1)
  assert.equal(guarded[0].action, "keep", "replace targeting linked id must become keep")
})

test("applyLinkedItemGuard: rejects replace targeting linked item by name, converts to keep", () => {
  const linkedIds = new Set(["ing-milk-id"])
  const linkedNames = new Set(["whole milk - d dutchman"])

  const lines = [
    {
      name: "Whole Milk - D Dutchman",
      amount: 120,
      unit: "ml",
      action: "replace",
      inventory_item_id: null, // no id, but name matches
      group: "ingredient",
    },
  ]

  const guarded = applyLinkedItemGuard(lines, linkedIds, linkedNames, "test-req-2")
  assert.equal(guarded[0].action, "keep")
})

test("applyLinkedItemGuard: demotes replace→add for non-linked items", () => {
  const linkedIds = new Set(["ing-espresso-id"])
  const linkedNames = new Set(["espresso beans - warmth blend"])

  const lines = [
    {
      name: "Vanilla Syrup",
      amount: 15,
      unit: "ml",
      action: "replace",
      inventory_item_id: "syrup-id", // not in linked set
      group: "ingredient",
    },
  ]

  const guarded = applyLinkedItemGuard(lines, linkedIds, linkedNames, "test-req-3")
  assert.equal(guarded[0].action, "add")
})

test("applyLinkedItemGuard: passes through keep and add actions unchanged", () => {
  const linkedIds = new Set(["ing-espresso-id"])
  const linkedNames = new Set(["espresso beans - warmth blend"])

  const lines = [
    { name: "Espresso Beans - Warmth Blend", amount: 18, unit: "g", action: "keep", inventory_item_id: "ing-espresso-id" },
    { name: "Vanilla Syrup", amount: 15, unit: "ml", action: "add", inventory_item_id: null },
  ]

  const guarded = applyLinkedItemGuard(lines, linkedIds, linkedNames, "test-req-4")
  assert.equal(guarded[0].action, "keep")
  assert.equal(guarded[1].action, "add")
})

test("applyLinkedItemGuard: full cappuccino repro — no linked-item replacements survive", () => {
  // Fixed repro from TIM-3857/TIM-3862: user has Espresso Beans, Whole Milk,
  // and Custom Cup already linked to their Cappuccino item. The model returns
  // generic replacements. Guard must convert all to keep or add.
  const linkedIds = new Set(["esp-id", "milk-id", "cup-id"])
  const linkedNames = new Set([
    "espresso beans - warmth blend",
    "whole milk - d dutchman",
    "custom cup - 8oz",
  ])

  const modelLines = [
    // These are the destructive suggestions the model returned (the bug):
    { name: "Espresso", amount: 18, unit: "g", action: "replace", inventory_item_id: "esp-id", group: "ingredient" },
    { name: "Whole Milk", amount: 120, unit: "ml", action: "replace", inventory_item_id: "milk-id", group: "ingredient" },
    { name: "Custom Cup - 8oz", amount: 1, unit: "each", action: "replace", inventory_item_id: "cup-id", group: "supply" },
    // A genuinely new add is fine:
    { name: "Vanilla Syrup", amount: 10, unit: "ml", action: "add", inventory_item_id: null, group: "ingredient" },
  ]

  const guarded = applyLinkedItemGuard(modelLines, linkedIds, linkedNames, "test-repro")

  // No replace actions should survive
  const replacements = guarded.filter((l) => l.action === "replace")
  assert.equal(replacements.length, 0, "no replace actions must reach the review panel")

  // The three linked items must be converts to keep
  assert.equal(guarded[0].action, "keep")
  assert.equal(guarded[1].action, "keep")
  assert.equal(guarded[2].action, "keep")

  // The new vanilla syrup stays as add
  assert.equal(guarded[3].action, "add")
})
