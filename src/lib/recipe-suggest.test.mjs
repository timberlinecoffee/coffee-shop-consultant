// TIM-1321: tests for recipe-suggestion parsing/normalization. These guard the
// pure logic that turns a model response into editable, COGS-safe recipe lines.

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  parseRecipeResponse,
  normalizeUnitAndAmount,
  defaultPackageSize,
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
