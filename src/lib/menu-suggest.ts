// TIM-1323: AI menu-item starting points — parse an AI-suggested menu into a
// pick-list of candidate items the owner can add into a category in one tap.
//
// Pure logic only (no DB / network) so it is unit-testable: turn the model's
// raw text into validated candidates with Title Case names (TIM-1002) and
// em-dash-free rationale (founder voice mandate — QA bounces em dashes).

import { toTitleCase } from "./text.ts"
import { normalizeAIOutput } from "./normalize.ts"

// TIM-3683 Bug 3: AI-suggested ingredient with amount and unit, including
// non-default items (syrups, alt milks, toppings, sauces). Client accepts a
// suggestion and the item-create path hydrates these onto the new item so the
// owner gets a complete recipe, not category defaults alone.
export type SuggestedIngredient = {
  name: string
  amount: number
  unit: "g" | "ml" | "oz" | "each" | "piece"
}

export type SuggestedMenuItem = {
  name: string
  // The category name the model assigned this item to. The API layer resolves
  // it to a real category id; an unmatched/blank value falls back server-side.
  category: string
  rationale?: string
  // TIM-3683: full item spec from the AI (Option A from the board directive).
  estimated_price_cents?: number
  estimated_cogs_cents?: number
  ingredients?: SuggestedIngredient[]
}

const MAX_ITEMS = 16
const MAX_INGREDIENTS_PER_ITEM = 12
const VALID_UNITS: ReadonlyArray<SuggestedIngredient["unit"]> = [
  "g", "ml", "oz", "each", "piece",
]

// TIM-3683 Bug 2: normalize an item name for dedupe checks. Lowercase, strip
// punctuation, collapse whitespace, drop common filler tokens (café, coffee,
// house, classic, our, the, style, drink) so "Classic Vanilla Latte", "Our
// Vanilla Café Latte" and "Vanilla Latte" all collide.
const DEDUPE_FILLER = new Set([
  "cafe", "café", "coffee", "house", "classic", "our", "the", "a", "an", "of",
  "style", "drink", "signature", "special",
])

export function normalizeNameForDedupe(raw: string): string {
  const stripped = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const tokens = stripped
    .split(" ")
    .filter((t) => t && !DEDUPE_FILLER.has(t))
  return tokens.join(" ")
}

// TIM-3683 Bug 2: is `candidate` a duplicate or close variant of `existing`?
// Uses normalized-substring matching in both directions so "Vanilla Latte"
// matches "Classic Vanilla Latte" AND "Vanilla Café Latte". Also matches when
// the head of one is the whole of the other (e.g. "Iced Vanilla Latte" vs
// "Vanilla Latte" — the shared core is a full existing item).
export function isDuplicateOfExisting(
  candidate: string,
  existing: ReadonlyArray<string>,
): boolean {
  const cand = normalizeNameForDedupe(candidate)
  if (!cand) return false
  for (const e of existing) {
    const en = normalizeNameForDedupe(e)
    if (!en) continue
    if (cand === en) return true
    if (cand.includes(en) || en.includes(cand)) return true
  }
  return false
}

// Founder voice mandate: no em/en dashes in user-facing copy. Normalize any the
// model emits to a plain hyphen and collapse stray whitespace.
export function sanitizeRationale(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined
  const cleaned = raw
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned ? normalizeAIOutput(cleaned) : undefined
}

// Resolve a model-supplied category name to one of the plan's real categories.
// Exact (case-insensitive) match wins; otherwise a loose contains match in
// either direction; otherwise null so the caller can fall back to a default.
export function resolveCategoryId(
  categoryName: unknown,
  categories: ReadonlyArray<{ id: string; name: string }>
): string | null {
  if (typeof categoryName !== "string") return null
  const want = categoryName.trim().toLowerCase()
  if (!want) return null

  const exact = categories.find((c) => c.name.trim().toLowerCase() === want)
  if (exact) return exact.id

  const loose = categories.find((c) => {
    const have = c.name.trim().toLowerCase()
    return have.includes(want) || want.includes(have)
  })
  return loose ? loose.id : null
}

// Parse the model's raw text into validated candidate items. Accepts either
// {"items": [...]} or a bare [...]. Returns null when no usable array is found.
export function parseSuggestedItems(rawText: string): SuggestedMenuItem[] | null {
  if (!rawText) return null

  // The model may return {"items": [...]} or a bare [...]. A greedy object match
  // can swallow a bare array into invalid JSON, so try both and keep the first
  // candidate that parses into usable items.
  const candidates = [
    rawText.match(/\{[\s\S]*\}/)?.[0],
    rawText.match(/\[[\s\S]*\]/)?.[0],
  ].filter((c): c is string => Boolean(c))

  for (const candidate of candidates) {
    const items = extractItems(candidate)
    if (items) return items
  }
  return null
}

function extractItems(candidate: string): SuggestedMenuItem[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return null
  }

  let rawItems: unknown
  if (Array.isArray(parsed)) {
    rawItems = parsed
  } else if (parsed && typeof parsed === "object") {
    rawItems = (parsed as Record<string, unknown>).items
  }
  if (!Array.isArray(rawItems)) return null

  const items: SuggestedMenuItem[] = []
  const seen = new Set<string>()

  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const rawName = typeof r.name === "string" ? r.name.trim() : ""
    if (!rawName) continue

    const name = toTitleCase(rawName)
    const dedupeKey = name.toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const category = typeof r.category === "string" ? r.category.trim() : ""
    const rationale = sanitizeRationale(r.rationale)
    const estimated_price_cents = parseCents(r.estimated_price_cents ?? r.price_cents)
    const estimated_cogs_cents = parseCents(r.estimated_cogs_cents ?? r.cogs_cents)
    const ingredients = parseIngredients(r.ingredients)

    items.push({
      name,
      category,
      rationale,
      estimated_price_cents,
      estimated_cogs_cents,
      ingredients,
    })
    if (items.length >= MAX_ITEMS) break
  }

  return items.length > 0 ? items : null
}

function parseCents(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return undefined
  // Model may return cents or dollars — accept either. A "price under $2" makes
  // no sense for menu items, so anything under 100 is treated as dollars.
  const cents = raw < 100 ? Math.round(raw * 100) : Math.round(raw)
  return cents > 0 ? cents : undefined
}

function parseIngredients(raw: unknown): SuggestedIngredient[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: SuggestedIngredient[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    const rawName = typeof r.name === "string" ? r.name.trim() : ""
    if (!rawName) continue
    const name = toTitleCase(rawName)
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    const amountRaw = typeof r.amount === "number"
      ? r.amount
      : typeof r.amount === "string"
        ? Number.parseFloat(r.amount)
        : NaN
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) continue
    const rawUnit = typeof r.unit === "string" ? r.unit.trim().toLowerCase() : ""
    const unit = normalizeUnit(rawUnit)
    if (!unit) continue
    seen.add(key)
    out.push({ name, amount: Math.round(amountRaw * 100) / 100, unit })
    if (out.length >= MAX_INGREDIENTS_PER_ITEM) break
  }
  return out.length > 0 ? out : undefined
}

function normalizeUnit(u: string): SuggestedIngredient["unit"] | null {
  // Accept common variants: "grams" → "g", "milliliter" → "ml", etc.
  if (!u) return null
  if (u === "gram" || u === "grams") return "g"
  if (u === "milliliter" || u === "milliliters" || u === "millilitre" || u === "millilitres") return "ml"
  if (u === "ounce" || u === "ounces" || u === "fl oz" || u === "floz") return "oz"
  if (u === "pcs" || u === "piece") return "piece"
  if (u === "count" || u === "unit" || u === "units") return "each"
  if ((VALID_UNITS as ReadonlyArray<string>).includes(u)) {
    return u as SuggestedIngredient["unit"]
  }
  return null
}
