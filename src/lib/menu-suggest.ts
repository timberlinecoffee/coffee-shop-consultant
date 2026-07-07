// TIM-1323: AI menu-item starting points — parse an AI-suggested menu into a
// pick-list of candidate items the owner can add into a category in one tap.
//
// TIM-3683 Bugs 2 & 3: candidates now carry a full spec (price + estimated COGS
// + ingredient list w/ amounts/units) so Accept populates everything, and we
// filter close-name duplicates against the plan's existing menu.
//
// Pure logic only (no DB / network) so it is unit-testable: turn the model's
// raw text into validated candidates with Title Case names (TIM-1002) and
// em-dash-free rationale (founder voice mandate -- QA bounces em dashes).

import { toTitleCase } from "./text.ts"
import { normalizeAIOutput } from "./normalize.ts"

export type IngredientUnitLoose = "g" | "ml" | "oz" | "each" | "piece"

export type SuggestedIngredient = {
  name: string
  amount: number
  unit: IngredientUnitLoose
}

export type SuggestedMenuItem = {
  name: string
  // The category name the model assigned this item to. The API layer resolves
  // it to a real category id; an unmatched/blank value falls back server-side.
  category: string
  rationale?: string
  // TIM-3683 Bug 3: full spec so Accept populates everything.
  price_cents?: number
  estimated_cogs_cents?: number
  ingredients?: SuggestedIngredient[]
}

const MAX_ITEMS = 16
const MAX_INGREDIENTS_PER_ITEM = 12
const VALID_UNITS: ReadonlyArray<IngredientUnitLoose> = ["g", "ml", "oz", "each", "piece"]

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

// TIM-3683 Bug 2: normalize an item name for close-variant matching. Strips
// filler words ("classic", "cafe/café", "the"), non-alphanumerics, and
// collapses whitespace. "Classic Vanilla Latte" and "Vanilla Cafe Latte" both
// normalize to "vanilla latte" so the presence of "Vanilla Latte" on the menu
// blocks both.
const FILLER_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "with",
  "classic", "signature", "house", "special",
  "cafe", "café", "coffee",
])

export function normalizeItemNameForMatch(raw: string): string {
  // Strip combining diacritical marks (U+0300..U+036F) after NFKD split, so
  // "café" and "cafe" normalize identically.
  const lower = raw.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  const tokens = lower
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !FILLER_WORDS.has(w))
  return tokens.join(" ")
}

// True if `candidate` is a close variant of any name in `existing`. Normalization
// already strips filler adjectives (classic / house / café / signature) so a
// strict equality check catches those variants without over-filtering genuine
// descriptors like "iced", "hot", "decaf" that remain in the normalized form.
export function isCloseNameVariant(
  candidate: string,
  existing: ReadonlyArray<string>
): boolean {
  const norm = normalizeItemNameForMatch(candidate)
  if (!norm) return false
  for (const e of existing) {
    const other = normalizeItemNameForMatch(e)
    if (!other) continue
    if (norm === other) return true
  }
  return false
}

function coerceUnit(raw: unknown): IngredientUnitLoose | null {
  if (typeof raw !== "string") return null
  const norm = raw.trim().toLowerCase()
  if (norm === "grams" || norm === "gram" || norm === "g") return "g"
  if (norm === "ml" || norm === "milliliter" || norm === "milliliters") return "ml"
  if (norm === "oz" || norm === "ounce" || norm === "ounces" || norm === "fl oz" || norm === "fluid ounce") return "oz"
  if (norm === "each" || norm === "ea") return "each"
  if (norm === "piece" || norm === "pieces" || norm === "pc" || norm === "unit" || norm === "units") return "piece"
  return (VALID_UNITS as ReadonlyArray<string>).includes(norm) ? (norm as IngredientUnitLoose) : null
}

function parseIngredientList(raw: unknown): SuggestedIngredient[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const result: SuggestedIngredient[] = []
  const seen = new Set<string>()
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    const name = typeof r.name === "string" ? toTitleCase(r.name.trim()) : ""
    if (!name) continue
    const amountRaw = typeof r.amount === "number" ? r.amount
      : typeof r.amount === "string" ? Number(r.amount)
      : NaN
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) continue
    const unit = coerceUnit(r.unit)
    if (!unit) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ name, amount: amountRaw, unit })
    if (result.length >= MAX_INGREDIENTS_PER_ITEM) break
  }
  return result.length > 0 ? result : undefined
}

function parseCents(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 500_00) {
    // Heuristic: values <= 100 are probably dollars, >= 200 already cents.
    if (Number.isInteger(raw) && raw >= 100) return raw
    return Math.round(raw * 100)
  }
  if (typeof raw === "string") {
    const stripped = raw.replace(/[^0-9.]/g, "")
    if (!stripped) return undefined
    const n = Number(stripped)
    if (!Number.isFinite(n) || n < 0 || n > 500) return undefined
    return Math.round(n * 100)
  }
  return undefined
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
    const price_cents = parseCents(r.price ?? r.price_cents ?? r.retail_price)
    const estimated_cogs_cents = parseCents(r.cogs ?? r.estimated_cogs ?? r.estimated_cogs_cents)
    const ingredients = parseIngredientList(r.ingredients)

    items.push({ name, category, rationale, price_cents, estimated_cogs_cents, ingredients })
    if (items.length >= MAX_ITEMS) break
  }

  return items.length > 0 ? items : null
}
