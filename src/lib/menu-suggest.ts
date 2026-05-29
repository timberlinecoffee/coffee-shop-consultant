// TIM-1323: AI menu-item starting points — parse an AI-suggested menu into a
// pick-list of candidate items the owner can add into a category in one tap.
//
// Pure logic only (no DB / network) so it is unit-testable: turn the model's
// raw text into validated candidates with Title Case names (TIM-1002) and
// em-dash-free rationale (founder voice mandate — QA bounces em dashes).

import { toTitleCase } from "./text.ts"
import { normalizeAIOutput } from "./normalize.ts"

export type SuggestedMenuItem = {
  name: string
  // The category name the model assigned this item to. The API layer resolves
  // it to a real category id; an unmatched/blank value falls back server-side.
  category: string
  rationale?: string
}

const MAX_ITEMS = 16

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

    items.push({ name, category, rationale })
    if (items.length >= MAX_ITEMS) break
  }

  return items.length > 0 ? items : null
}
