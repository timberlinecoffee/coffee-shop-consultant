// TIM-632: composePlanSnapshot library tests.
// Covers: empty plan, full plan, oversized plan, missing workspace rows.

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  composePlanSnapshot,
  renderJsonbAsMarkdown,
  WORKSPACE_KEYS,
} from "../composePlanSnapshot.ts"

// ── Mock Supabase client ─────────────────────────────────────────────────────
// Mirrors the fluent query surface the library uses:
//   from(table).select(cols).eq(field, val).single()
//   from(table).select(cols).eq(field, val)           ← thenable for arrays

function makeSupabase({ plan, user, docs }) {
  return {
    from(table) {
      const result =
        table === "coffee_shop_plans"
          ? { data: plan ?? null, error: null }
          : table === "users"
            ? { data: user ?? null, error: null }
            : table === "workspace_documents"
              ? { data: docs ?? [], error: null }
              : { data: null, error: null }

      const chain = {
        select() {
          return chain
        },
        eq() {
          return chain
        },
        single() {
          return Promise.resolve(result)
        },
        then(resolve) {
          return Promise.resolve(result).then(resolve)
        },
      }
      return chain
    },
  }
}

const PLAN_ID = "plan-1"
const USER_ID = "user-1"

// ── 1. Empty plan ───────────────────────────────────────────────────────────

test("empty plan: no workspace documents, no user data", async () => {
  const supabase = makeSupabase({
    plan: { user_id: USER_ID, plan_name: "Test Plan" },
    user: { full_name: null, target_opening_date: null, onboarding_data: null },
    docs: [],
  })

  const { snapshot, metadata } = await composePlanSnapshot(PLAN_ID, "concept", supabase)

  assert.match(snapshot, /## User Snapshot/)
  assert.match(snapshot, /## Plan Snapshot/)
  assert.match(snapshot, /## Current Workspace/)
  assert.match(snapshot, /Concept \(current workspace\)/)
  // All six workspaces shown as not started.
  assert.equal(WORKSPACE_KEYS.length, 6)
  const notStartedCount = (snapshot.match(/\(not started\)/g) ?? []).length
  assert.equal(notStartedCount, 6, "all six workspaces should be marked not started")

  assert.deepEqual(metadata.workspacesIncluded, [])
  assert.deepEqual(metadata.truncated, [])
  assert.ok(metadata.totalTokens > 0)
})

test("empty plan: missing plan row falls back gracefully", async () => {
  const supabase = makeSupabase({ plan: null, user: null, docs: [] })
  const { snapshot, metadata } = await composePlanSnapshot(PLAN_ID, "concept", supabase)
  assert.match(snapshot, /## User Snapshot/)
  assert.match(snapshot, /not specified/)
  assert.deepEqual(metadata.workspacesIncluded, [])
})

// ── 2. Full plan ────────────────────────────────────────────────────────────

test("full plan: all six workspaces present with content", async () => {
  const docs = WORKSPACE_KEYS.map((key) => ({
    workspace_key: key,
    content: { summary: `${key} summary`, status: "drafted" },
  }))

  const supabase = makeSupabase({
    plan: { user_id: USER_ID, plan_name: "Full Plan" },
    user: {
      full_name: "Sam Roaster",
      target_opening_date: "2026-09-01",
      onboarding_data: {
        budget: "$150k",
        location: "Vancouver, BC",
        stage: "researching",
        motivation: "career change",
        coffee_experience: "barista 3y",
        timeline: "6 months",
        shop_type: ["café", "roastery"],
      },
    },
    docs,
  })

  const { snapshot, metadata } = await composePlanSnapshot(PLAN_ID, "financials", supabase)

  assert.match(snapshot, /Sam Roaster/)
  assert.match(snapshot, /\$150k/)
  assert.match(snapshot, /café, roastery/)
  assert.match(snapshot, /Financials \(current workspace\)/)

  // All workspaces should be included; none truncated.
  assert.equal(metadata.workspacesIncluded.length, 6)
  assert.deepEqual(metadata.truncated, [])
  assert.ok(metadata.totalTokens > 0)

  // No (not started) markers.
  assert.ok(!/\(not started\)/.test(snapshot))
})

// ── 3. Oversized plan ───────────────────────────────────────────────────────

test("oversized plan: large content gets truncated with marker", async () => {
  // ~5000 chars of body per workspace — well beyond the ~2400-char cap.
  const fat = "x".repeat(5_000)
  const docs = WORKSPACE_KEYS.map((key) => ({
    workspace_key: key,
    content: { dump: fat },
  }))

  const supabase = makeSupabase({
    plan: { user_id: USER_ID, plan_name: "Fat Plan" },
    user: { full_name: "Big Doc", target_opening_date: null, onboarding_data: {} },
    docs,
  })

  const { snapshot, metadata } = await composePlanSnapshot(PLAN_ID, "concept", supabase)

  // Every workspace was truncated.
  assert.equal(metadata.truncated.length, 6)
  assert.equal(metadata.workspacesIncluded.length, 6)

  const truncatedMarkers = (snapshot.match(/\(truncated\)/g) ?? []).length
  assert.equal(truncatedMarkers, 6, "one (truncated) marker per oversized workspace")

  // Snapshot must not contain the full 5000-char dump inline.
  assert.ok(!snapshot.includes("x".repeat(5_000)))
})

// ── 4. Missing workspace rows ───────────────────────────────────────────────

test("missing workspace rows: not-started markers for absent keys", async () => {
  const docs = [
    { workspace_key: "concept", content: { vision: "specialty pour-over bar" } },
    { workspace_key: "financials", content: { startup_cost: 120000 } },
  ]

  const supabase = makeSupabase({
    plan: { user_id: USER_ID, plan_name: "Partial Plan" },
    user: { full_name: "Partial User", target_opening_date: null, onboarding_data: {} },
    docs,
  })

  const { snapshot, metadata } = await composePlanSnapshot(PLAN_ID, "concept", supabase)

  assert.deepEqual(metadata.workspacesIncluded.sort(), ["concept", "financials"].sort())
  assert.deepEqual(metadata.truncated, [])

  // 4 workspaces missing → 4 (not started) markers.
  const notStartedCount = (snapshot.match(/\(not started\)/g) ?? []).length
  assert.equal(notStartedCount, 4)

  // Present workspace contents render through.
  assert.match(snapshot, /specialty pour-over bar/)
  assert.match(snapshot, /120000/)
})

test("missing workspace rows: empty content renders as (empty), not included in metadata", async () => {
  const docs = [
    { workspace_key: "concept", content: {} },
    { workspace_key: "menu_pricing", content: { item: "drip coffee" } },
  ]

  const supabase = makeSupabase({
    plan: { user_id: USER_ID, plan_name: "Mixed Plan" },
    user: { full_name: "Mixed", target_opening_date: null, onboarding_data: {} },
    docs,
  })

  const { snapshot, metadata } = await composePlanSnapshot(PLAN_ID, "concept", supabase)

  // Only menu_pricing has real content → workspacesIncluded.
  assert.deepEqual(metadata.workspacesIncluded, ["menu_pricing"])
  assert.match(snapshot, /\(empty\)/)
  assert.match(snapshot, /drip coffee/)
})

// ── renderJsonbAsMarkdown unit cases ───────────────────────────────────────

test("renderJsonbAsMarkdown: handles empty and primitive inputs", () => {
  assert.equal(renderJsonbAsMarkdown(null), "(empty)")
  assert.equal(renderJsonbAsMarkdown(undefined), "(empty)")
  assert.equal(renderJsonbAsMarkdown({}), "(empty)")
  assert.equal(renderJsonbAsMarkdown([]), "(empty)")
  assert.equal(renderJsonbAsMarkdown("hello"), "hello")
  assert.equal(renderJsonbAsMarkdown(42), "42")
})

test("renderJsonbAsMarkdown: humanizes keys and stringifies nested values", () => {
  const out = renderJsonbAsMarkdown({
    shop_name: "Timberline",
    nested: { foo: "bar" },
    empty_field: "",
  })
  assert.match(out, /\*\*shop name\*\*: Timberline/)
  assert.match(out, /\*\*nested\*\*: \{"foo":"bar"\}/)
  assert.ok(!out.includes("empty_field"))
})
