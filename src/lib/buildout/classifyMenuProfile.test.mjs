// TIM-726: classifyMenuProfile unit tests
// Verifies acceptance criteria: empty menu → espresso_plus_brew;
// correct heuristic dispatch for food / drip-heavy / espresso-only / mixed menus.

import { test } from "node:test"
import assert from "node:assert/strict"
import { classifyMenuProfile } from "./classifyMenuProfile.ts"

// Minimal Supabase mock: thenable chain that returns pre-loaded rows
function mockClient(tableRows) {
  return {
    from(table) {
      const rows = tableRows[table] ?? []
      const chain = {
        select() { return chain },
        eq() { return chain },
        order() { return chain },
        limit() { return chain },
        maybeSingle() {
          const single = { then(resolve) { resolve({ data: rows[0] ?? null, error: null }) } }
          return single
        },
        then(resolve) { resolve({ data: rows, error: null }) },
      }
      return chain
    },
  }
}

test("no menu items → espresso_plus_brew", async () => {
  const client = mockClient({ menu_items: [] })
  assert.equal(await classifyMenuProfile("plan-1", client), "espresso_plus_brew")
})

test("null result from DB → espresso_plus_brew", async () => {
  const nullClient = { from() { return { select() { return this }, eq() { return this }, then(resolve) { resolve({ data: null, error: null }) } } } }
  assert.equal(await classifyMenuProfile("plan-1", nullClient), "espresso_plus_brew")
})

test("any food item → full_food", async () => {
  const client = mockClient({ menu_items: [{ category: "espresso" }, { category: "food" }, { category: "brewed" }] })
  assert.equal(await classifyMenuProfile("plan-1", client), "full_food")
})

test("single food item with no espresso → full_food", async () => {
  const client = mockClient({ menu_items: [{ category: "food" }] })
  assert.equal(await classifyMenuProfile("plan-1", client), "full_food")
})

test("brewed > 50% → full_drip", async () => {
  const client = mockClient({ menu_items: [
    { category: "brewed" },
    { category: "brewed" },
    { category: "brewed" },
    { category: "espresso" },
  ] })
  assert.equal(await classifyMenuProfile("plan-1", client), "full_drip")
})

test("brewed exactly 50% → NOT full_drip (falls through to espresso_plus_brew)", async () => {
  const client = mockClient({ menu_items: [
    { category: "brewed" },
    { category: "espresso" },
  ] })
  // 1/2 = 0.5, not > 0.5 → skips full_drip
  assert.equal(await classifyMenuProfile("plan-1", client), "espresso_plus_brew")
})

test("all espresso items → espresso_focused", async () => {
  const client = mockClient({ menu_items: [
    { category: "espresso" },
    { category: "espresso" },
    { category: "espresso" },
  ] })
  assert.equal(await classifyMenuProfile("plan-1", client), "espresso_focused")
})

test("single espresso item → espresso_focused", async () => {
  const client = mockClient({ menu_items: [{ category: "espresso" }] })
  assert.equal(await classifyMenuProfile("plan-1", client), "espresso_focused")
})

test("espresso + seasonal (no brewed, no food) → espresso_plus_brew fallback", async () => {
  // seasonal items don't match brewed or food, so espresso share < 100% (seasonal is there)
  const client = mockClient({ menu_items: [
    { category: "espresso" },
    { category: "seasonal" },
  ] })
  assert.equal(await classifyMenuProfile("plan-1", client), "espresso_plus_brew")
})

test("espresso + brewed mixed → espresso_plus_brew", async () => {
  const client = mockClient({ menu_items: [
    { category: "espresso" },
    { category: "espresso" },
    { category: "brewed" },
  ] })
  assert.equal(await classifyMenuProfile("plan-1", client), "espresso_plus_brew")
})
