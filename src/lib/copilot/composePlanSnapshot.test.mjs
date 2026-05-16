// Unit tests for composePlanSnapshot — menu_pricing branch
// Run: npm test  (uses node --experimental-strip-types --test)

import { test } from "node:test"
import assert from "node:assert/strict"

const TOKEN_CHARS = 4
const MAX_TOKENS = 600

// ── Mock Supabase client builder ──────────────────────────────────────────────

function makeSupabase({ items = [], docContent = {} } = {}) {
  return {
    from(table) {
      if (table === "menu_items") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: items, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === "workspace_documents") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { content: docContent },
                    error: null,
                  }),
              }),
            }),
          }),
        }
      }
      // Default: workspace_documents for non-menu_pricing workspaces
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }
    },
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(overrides = {}) {
  return {
    name: "Test Item",
    category: "espresso_drink",
    price_cents: 600,
    cogs_cents: 150,
    expected_mix_pct: 5,
    archived: false,
    ...overrides,
  }
}

// ── Import under test (dynamic so we can use .mjs without tsconfig path aliases)

// Since we can't use @/ alias in .mjs test files, we import the compiled output.
// The test runner uses --experimental-strip-types, so we import the .ts source directly.

const { composePlanSnapshot } = await import("./composePlanSnapshot.ts")

// ── Test: 0-item menu ─────────────────────────────────────────────────────────

test("menu_pricing: 0-item menu emits digest with item_count=0, no truncation", async () => {
  const supabase = makeSupabase({ items: [], docContent: { region_benchmark_set: "pacific_northwest_metro" } })
  const result = await composePlanSnapshot("plan-1", "menu_pricing", supabase)

  assert.ok(result.snapshot.includes("item_count=0"), `Expected item_count=0 in: ${result.snapshot}`)
  assert.ok(!result.truncated, "Expected truncated=false for empty menu")
  assert.ok(!result.snapshot.includes("truncated=true"), "truncated flag must not appear in snapshot text")
  assert.ok(result.estimatedTokens <= MAX_TOKENS, `Token count ${result.estimatedTokens} exceeds ${MAX_TOKENS}`)
  assert.equal(result.regionBenchmarkSet, "pacific_northwest_metro")
})

// ── Test: 30-item menu ────────────────────────────────────────────────────────

test("menu_pricing: 30-item menu produces digest ≤600 tokens with truncated=true", async () => {
  const items = Array.from({ length: 30 }, (_, i) =>
    makeItem({
      name: `Item ${String(i + 1).padStart(2, "0")}`,
      price_cents: 400 + i * 25,
      cogs_cents: 100 + i * 5,
      expected_mix_pct: (i % 10) + 1,
    }),
  )

  const supabase = makeSupabase({
    items,
    docContent: {
      pricing_tier: "specialty",
      target_avg_margin_pct: 70,
      region_benchmark_set: "pacific_northwest_metro",
    },
  })

  const result = await composePlanSnapshot("plan-2", "menu_pricing", supabase)

  assert.ok(result.snapshot.includes("item_count=30"), `Expected item_count=30 in: ${result.snapshot}`)
  assert.ok(result.truncated === true, "Expected truncated=true for 30-item menu")
  assert.ok(result.snapshot.includes("truncated=true"), "truncated=true must appear in snapshot _digest line")
  assert.ok(
    result.estimatedTokens <= MAX_TOKENS,
    `Token count ${result.estimatedTokens} exceeds ${MAX_TOKENS}. Snapshot length: ${result.snapshot.length}`,
  )
  // Top-3 / bottom-3 sections present
  assert.ok(result.snapshot.includes("Top-3 margin"), "Expected Top-3 margin section")
  assert.ok(result.snapshot.includes("Bottom-3 margin"), "Expected Bottom-3 margin section")
})

// ── Test: digest stats correctness ───────────────────────────────────────────

test("menu_pricing: 2-item menu computes correct mean_price and margin stats", async () => {
  const items = [
    makeItem({ name: "Latte", price_cents: 700, cogs_cents: 140, expected_mix_pct: 60 }),
    makeItem({ name: "Drip", price_cents: 400, cogs_cents: 50, expected_mix_pct: 40 }),
  ]

  const supabase = makeSupabase({ items })
  const result = await composePlanSnapshot("plan-3", "menu_pricing", supabase)

  // mean_price = (700 + 400) / 2 = $5.50
  assert.ok(result.snapshot.includes("mean_price=$5.50"), `Expected mean_price=$5.50 in: ${result.snapshot}`)

  // latte margin = (700-140)/700 = 80%, drip margin = (400-50)/400 = 87.5%
  // mean_margin = (80 + 87.5) / 2 = 83.75 → 83.8%
  assert.ok(result.snapshot.includes("mean_margin=83.8%"), `Expected mean_margin=83.8% in: ${result.snapshot}`)

  // weighted_margin = (80*60 + 87.5*40) / 100 = (4800 + 3500) / 100 = 83.0%
  assert.ok(result.snapshot.includes("weighted_margin=83.0%"), `Expected weighted_margin=83.0% in: ${result.snapshot}`)
})

// ── Test: non-menu_pricing workspace unchanged ────────────────────────────────

test("non-menu_pricing workspace returns generic snapshot", async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }

  const result = await composePlanSnapshot("plan-4", "financials", supabase)

  assert.ok(!result.truncated, "Non-menu_pricing workspace should not set truncated")
  assert.equal(result.regionBenchmarkSet, undefined)
})
