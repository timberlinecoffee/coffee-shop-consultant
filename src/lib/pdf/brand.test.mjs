// TIM-2539: Pin tests — BRAND.colors.accent must be brand teal, never gold.
// Covers the latent gold-leak discovered during TIM-1317 sign-off.

import { test } from "node:test"
import assert from "node:assert/strict"
import { BRAND, resolveBrand } from "./brand.ts"

// ── Default registry ──────────────────────────────────────────────────────────

test("BRAND.colors.accent is brand teal #155E63, not gold", () => {
  assert.equal(BRAND.colors.accent, "#155E63")
})

test("BRAND.colors.accent is not the old gold default", () => {
  assert.notEqual(BRAND.colors.accent, "#E8C24A")
})

// ── resolveBrand with no accent override ──────────────────────────────────────

test("resolveBrand with empty config returns teal accent", () => {
  const brand = resolveBrand({})
  assert.equal(brand.colors.accent, "#155E63")
})

test("resolveBrand preserves all other default tokens unchanged", () => {
  const brand = resolveBrand({})
  assert.equal(brand.colors.primary, "#1A6E3B")
  assert.equal(brand.colors.ink, "#0F1B11")
  assert.equal(brand.colors.paper, "#FFFFFF")
  assert.equal(brand.colors.muted, "#6B7B70")
  assert.equal(brand.colors.rule, "#D9DEDA")
})

// ── User customization still wins ─────────────────────────────────────────────

test("resolveBrand with explicit accent overrides the default", () => {
  const brand = resolveBrand({ colors: { accent: "#2563EB" } })
  assert.equal(brand.colors.accent, "#2563EB")
})

test("resolveBrand with null colors leaves defaults intact", () => {
  const brand = resolveBrand({ colors: undefined })
  assert.equal(brand.colors.accent, "#155E63")
})
