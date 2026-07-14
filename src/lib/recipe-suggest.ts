// TIM-1321: AI recipe starting points — parse an AI-suggested recipe into
// editable ingredient lines that flow into the existing COGS math.
//
// The product's ingredient/recipe model has no unit conversion: COGS is
// amount × cost-per-package-unit, so a recipe line's unit is only meaningful
// relative to its ingredient's package unit. We constrain the model to the
// five supported units, but defensively normalize any stray unit the model
// returns (with amount conversion where the conversion is well-defined).
//
// TIM-3862: Enhanced response shape supports inventory context injection.
// - group: 'ingredient' | 'supply' — two-group tagging (TIM-3861 follow-up)
// - action: 'keep' | 'add' | 'replace' — server-side guard rejects 'replace'
//   on inventory-linked items before results reach the review panel.
// - inventory_item_id: references an existing menu_ingredient row when the
//   model matched the item to the user's inventory.

import { toTitleCase } from "./text.ts"
import { normalizeAIOutput } from "./normalize.ts"
import type { IngredientUnit } from "./menu"

export const ALLOWED_UNITS: IngredientUnit[] = ["g", "ml", "oz", "each", "piece"]

export type RecipeItemGroup = "ingredient" | "supply"
export type RecipeItemAction = "keep" | "add" | "replace"

export type SuggestedRecipeLine = {
  name: string
  amount: number
  unit: IngredientUnit
  note?: string
  group?: RecipeItemGroup
  action?: RecipeItemAction
  inventory_item_id?: string | null
}

// Map a raw unit string to a supported unit plus the multiplier needed to
// convert the amount into that unit. Unknown units fall through to "each".
const UNIT_CONVERSIONS: Record<string, { unit: IngredientUnit; factor: number }> = {
  g: { unit: "g", factor: 1 },
  gram: { unit: "g", factor: 1 },
  grams: { unit: "g", factor: 1 },
  gr: { unit: "g", factor: 1 },
  kg: { unit: "g", factor: 1000 },
  kilogram: { unit: "g", factor: 1000 },
  kilograms: { unit: "g", factor: 1000 },

  ml: { unit: "ml", factor: 1 },
  milliliter: { unit: "ml", factor: 1 },
  milliliters: { unit: "ml", factor: 1 },
  millilitre: { unit: "ml", factor: 1 },
  millilitres: { unit: "ml", factor: 1 },
  cc: { unit: "ml", factor: 1 },
  l: { unit: "ml", factor: 1000 },
  liter: { unit: "ml", factor: 1000 },
  liters: { unit: "ml", factor: 1000 },
  litre: { unit: "ml", factor: 1000 },
  litres: { unit: "ml", factor: 1000 },
  tsp: { unit: "ml", factor: 5 },
  teaspoon: { unit: "ml", factor: 5 },
  teaspoons: { unit: "ml", factor: 5 },
  tbsp: { unit: "ml", factor: 15 },
  tablespoon: { unit: "ml", factor: 15 },
  tablespoons: { unit: "ml", factor: 15 },
  cup: { unit: "ml", factor: 240 },
  cups: { unit: "ml", factor: 240 },
  shot: { unit: "ml", factor: 30 },
  shots: { unit: "ml", factor: 30 },
  pump: { unit: "ml", factor: 8 },
  pumps: { unit: "ml", factor: 8 },
  dash: { unit: "ml", factor: 1 },
  dashes: { unit: "ml", factor: 1 },

  oz: { unit: "oz", factor: 1 },
  ounce: { unit: "oz", factor: 1 },
  ounces: { unit: "oz", factor: 1 },
  "fl oz": { unit: "oz", factor: 1 },
  floz: { unit: "oz", factor: 1 },
  "fluid ounce": { unit: "oz", factor: 1 },
  "fluid ounces": { unit: "oz", factor: 1 },
  lb: { unit: "oz", factor: 16 },
  lbs: { unit: "oz", factor: 16 },
  pound: { unit: "oz", factor: 16 },
  pounds: { unit: "oz", factor: 16 },

  each: { unit: "each", factor: 1 },
  ea: { unit: "each", factor: 1 },
  unit: { unit: "each", factor: 1 },
  units: { unit: "each", factor: 1 },
  count: { unit: "each", factor: 1 },
  whole: { unit: "each", factor: 1 },
  serving: { unit: "each", factor: 1 },
  servings: { unit: "each", factor: 1 },

  piece: { unit: "piece", factor: 1 },
  pieces: { unit: "piece", factor: 1 },
  pc: { unit: "piece", factor: 1 },
  slice: { unit: "piece", factor: 1 },
  slices: { unit: "piece", factor: 1 },
}

const DEFAULT_PACKAGE_SIZE: Record<IngredientUnit, number> = {
  g: 1000,
  ml: 1000,
  oz: 32,
  each: 1,
  piece: 1,
}

// A sensible default package size so cost-per-unit is reasonable the moment
// the user enters a package cost on a freshly-created ingredient.
export function defaultPackageSize(unit: IngredientUnit): number {
  return DEFAULT_PACKAGE_SIZE[unit] ?? 1
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Normalize a raw (unit, amount) pair to a supported unit, converting the
// amount when the source unit maps to a different scale.
export function normalizeUnitAndAmount(
  rawUnit: unknown,
  rawAmount: unknown
): { unit: IngredientUnit; amount: number } {
  let amount = typeof rawAmount === "number" ? rawAmount : Number(rawAmount)
  if (!Number.isFinite(amount) || amount <= 0) amount = 1

  const key = typeof rawUnit === "string" ? rawUnit.trim().toLowerCase() : ""
  const conv = UNIT_CONVERSIONS[key]
  if (conv) {
    return { unit: conv.unit, amount: round2(amount * conv.factor) }
  }
  // Unknown unit: keep the amount, fall back to a countable unit.
  return { unit: "each", amount: round2(amount) }
}

const MAX_LINES = 12

// Parse the model's raw text into validated, editable recipe lines.
// Returns null when no usable JSON array of ingredients can be found.
export function parseRecipeResponse(rawText: string): SuggestedRecipeLine[] | null {
  if (!rawText) return null

  // The model may return either {"ingredients": [...]} or a bare [...]. Try the
  // object candidate first, then the array, and keep the first that parses into
  // usable lines (a greedy object match can swallow a bare array into invalid
  // JSON, so we must not stop at the first regex hit).
  const candidates = [
    rawText.match(/\{[\s\S]*\}/)?.[0],
    rawText.match(/\[[\s\S]*\]/)?.[0],
  ].filter((c): c is string => Boolean(c))

  for (const candidate of candidates) {
    const lines = extractLines(candidate)
    if (lines) return lines
  }
  return null
}

function extractLines(candidate: string): SuggestedRecipeLine[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return null
  }

  let rawLines: unknown
  if (Array.isArray(parsed)) {
    rawLines = parsed
  } else if (parsed && typeof parsed === "object") {
    rawLines = (parsed as Record<string, unknown>).ingredients
  }
  if (!Array.isArray(rawLines)) return null

  const lines: SuggestedRecipeLine[] = []
  const seen = new Set<string>()

  const VALID_GROUPS = new Set<string>(["ingredient", "supply"])
  const VALID_ACTIONS = new Set<string>(["keep", "add", "replace"])

  for (const raw of rawLines) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const rawName = typeof r.name === "string" ? r.name.trim() : ""
    if (!rawName) continue

    const name = toTitleCase(rawName)
    const dedupeKey = name.toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const { unit, amount } = normalizeUnitAndAmount(r.unit, r.amount)
    const note = typeof r.note === "string" && r.note.trim() ? normalizeAIOutput(r.note.trim()) : undefined

    const rawGroup = typeof r.group === "string" ? r.group.trim().toLowerCase() : undefined
    const group = rawGroup && VALID_GROUPS.has(rawGroup) ? (rawGroup as RecipeItemGroup) : undefined

    const rawAction = typeof r.action === "string" ? r.action.trim().toLowerCase() : undefined
    const action = rawAction && VALID_ACTIONS.has(rawAction) ? (rawAction as RecipeItemAction) : undefined

    const inventory_item_id =
      typeof r.inventory_item_id === "string" && r.inventory_item_id.trim()
        ? r.inventory_item_id.trim()
        : null

    lines.push({ name, amount, unit, note, group, action, inventory_item_id })
    if (lines.length >= MAX_LINES) break
  }

  return lines.length > 0 ? lines : null
}

// TIM-3862: Server-side guard — rejects any AI-suggested 'replace' action
// that targets an inventory-linked recipe line. Converts to 'keep' when the
// suggested item maps to the same ingredient (same inventory_item_id or same
// name as an existing linked item), or 'add' when it is a genuinely different
// item. Never lets a linked-item replacement reach the review panel.
//
// linkedIngredientIds: set of ingredient_id values currently on the item's recipe.
// linkedIngredientNames: case-insensitive names of those same ingredients.
// requestId: for server-side audit log.
export function applyLinkedItemGuard(
  lines: SuggestedRecipeLine[],
  linkedIngredientIds: ReadonlySet<string>,
  linkedIngredientNames: ReadonlySet<string>,
  requestId: string,
): SuggestedRecipeLine[] {
  return lines.map((line) => {
    if (line.action !== "replace") return line

    const targetsLinkedById =
      line.inventory_item_id != null && linkedIngredientIds.has(line.inventory_item_id)
    const targetsLinkedByName = linkedIngredientNames.has(line.name.toLowerCase())

    if (targetsLinkedById || targetsLinkedByName) {
      console.warn(
        `suggest-recipe [${requestId}]: rejected linked-item replace for "${line.name}"` +
          ` (id=${line.inventory_item_id ?? "none"}) — converted to keep`,
      )
      return { ...line, action: "keep" as RecipeItemAction }
    }

    // 'replace' targeting a non-linked item: treat as an add so the review
    // panel shows it as a new candidate rather than a destructive swap.
    console.info(
      `suggest-recipe [${requestId}]: demoted replace→add for non-linked item "${line.name}"`,
    )
    return { ...line, action: "add" as RecipeItemAction }
  })
}
