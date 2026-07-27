// Board directive 2026-07-26 (Cowork onboarding brief §1C, and §3 rule 7: "No
// user of this platform should ever see JSON, arrays, brackets, curly braces,
// or raw data structures anywhere, under any circumstances").
//
// Pure rendering model for "structured" AI suggestion values — the payloads
// passed to AIReviewModal with `isStructured: true`. Kept out of the .tsx so it
// can be pinned by structured-value.test.mjs; the modal owns only the markup.
//
// What went wrong before (the bug this file replaces):
//   AIReviewModal.StructuredDiff stringified each row, re-parsed it, then called
//   Object.values() on the result. For an array of OBJECTS that looked
//   table-shaped. For an array of STRINGS it was not — parseRow() returned the
//   string itself, and Object.values("Grind beans") returns its characters. Menu
//   & Pricing preparation steps are exactly that shape (menu-workspace.tsx sends
//   JSON.stringify(currentSteps) with isStructured: true), so each prep step
//   rendered as its first four letters in four separate cells.
//   It also dropped every column past the fourth via slice(0, 4), printed
//   "[object Object]" for nested values, and emitted no header row.
//
// Relative import with the .ts extension keeps this loadable under
// `node --experimental-strip-types` for the .test.mjs sibling — same reason
// src/lib/ai/models.ts imports "../credits/cost.ts" (TIM-2343).
import { toTitleCase } from "./text.ts"

/** Placeholder for a missing / empty cell. Never leave a cell blank-ambiguous. */
export const EMPTY_CELL = "-"

/** snake_case / camelCase field key -> human column heading (AGENTS.md Title Case rule). */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
  return toTitleCase(spaced)
}

/** Render any JSON leaf as readable text. Must never emit JSON syntax. */
export function formatCellValue(value: unknown): string {
  if (value == null || value === "") return EMPTY_CELL
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : EMPTY_CELL
  if (typeof value === "string") return value.trim() || EMPTY_CELL
  if (Array.isArray(value)) {
    const parts = value.map(formatCellValue).filter((p) => p !== EMPTY_CELL)
    return parts.length > 0 ? parts.join(", ") : EMPTY_CELL
  }
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [humanizeKey(k), formatCellValue(v)] as const)
      .filter(([, v]) => v !== EMPTY_CELL)
      .map(([k, v]) => `${k}: ${v}`)
    return parts.length > 0 ? parts.join(", ") : EMPTY_CELL
  }
  return String(value)
}

export type RowKind = "added" | "removed" | "unchanged"

export interface StructuredRow {
  /** Canonical identity, used only to diff Current against Suggested. Never rendered. */
  signature: string
  cells: string[]
}

export interface StructuredTableModel {
  /** Column headings. Empty = a single unnamed column (a plain list of values). */
  columns: string[]
  rows: Array<StructuredRow & { kind: RowKind }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

/** Parse a raw suggestion value into a list of items. Non-JSON falls back to lines. */
export function toItems(raw: string): unknown[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
  }
  if (parsed == null) return []
  return Array.isArray(parsed) ? parsed : [parsed]
}

/**
 * Union of object keys in first-seen order, so no column is silently dropped
 * (the old slice(0, 4) did exactly that). Returns [] for a scalar list.
 */
export function deriveKeys(items: unknown[]): string[] {
  const keys: string[] = []
  for (const item of items) {
    if (!isRecord(item)) continue
    for (const k of Object.keys(item)) if (!keys.includes(k)) keys.push(k)
  }
  return keys
}

export function toRows(items: unknown[], keys: string[]): StructuredRow[] {
  return items.map((item) => {
    const signature = JSON.stringify(item) ?? String(item)
    if (keys.length === 0) return { signature, cells: [formatCellValue(item)] }
    if (isRecord(item)) return { signature, cells: keys.map((k) => formatCellValue(item[k])) }
    // A scalar mixed into an otherwise object-shaped list: show it in column 1.
    return { signature, cells: [formatCellValue(item), ...keys.slice(1).map(() => EMPTY_CELL)] }
  })
}

/**
 * Current-state model. The old code called StructuredDiff with `original` as
 * BOTH arguments, so every row scored "unchanged" and the Current column
 * rendered as an unlabelled all-white table — a diff of a thing against itself.
 * The Current column is not a diff; it is the data as it stands today.
 */
export function buildStructuredList(value: string): StructuredTableModel {
  const items = toItems(value)
  const keys = deriveKeys(items)
  return {
    columns: keys.map(humanizeKey),
    rows: toRows(items, keys).map((r) => ({ ...r, kind: "unchanged" as const })),
  }
}

/**
 * Diff model. Proposed order comes first (that is the list the user is being
 * asked to accept); removed rows are appended so nothing vanishes unshown.
 */
export function buildStructuredDiff(original: string, proposed: string): StructuredTableModel {
  const origItems = toItems(original)
  const propItems = toItems(proposed)
  // Derive keys across BOTH sides so the columns stay aligned and a field that
  // only appears on a proposed row still gets a heading.
  const keys = deriveKeys([...origItems, ...propItems])
  const origRows = toRows(origItems, keys)
  const propRows = toRows(propItems, keys)
  const origSigs = new Set(origRows.map((r) => r.signature))
  const propSigs = new Set(propRows.map((r) => r.signature))

  return {
    columns: keys.map(humanizeKey),
    rows: [
      ...propRows.map((r) => ({
        ...r,
        kind: (origSigs.has(r.signature) ? "unchanged" : "added") as RowKind,
      })),
      ...origRows
        .filter((r) => !propSigs.has(r.signature))
        .map((r) => ({ ...r, kind: "removed" as RowKind })),
    ],
  }
}
