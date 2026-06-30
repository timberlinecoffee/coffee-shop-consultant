// TIM-3490: Resolver for the per-plan top-level section order.
//
// The persisted per-plan order lives on
// coffee_shop_plans.business_plan_section_order JSONB. Every server route,
// page loader, AI assembler, PDF renderer, and the workspace UI reads
// through resolveSectionOrder() so the AI-context DoD ("prompt assembler
// must order sections by the persisted section_order") holds platform-wide.
//
// This module intentionally takes the default-order array as a parameter
// instead of importing BUSINESS_PLAN_SECTIONS. The default lives in
// src/lib/business-plan.ts (colocated with the section metadata) and is
// exported as DEFAULT_BUSINESS_PLAN_SECTION_ORDER from there. Decoupling
// keeps this helper unit-testable without dragging in the whole BP
// taxonomy + its @/-aliased deps that the node:test runner won't resolve.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KEBAB_KEY_RE = /^[a-z][a-z0-9-]{0,79}$/;

/**
 * Resolve the effective top-level section order for a plan.
 *
 * - `persisted` empty / null / undefined → returns
 *   `[...defaultStandardKeys, ...customSectionIds]`.
 * - `persisted` non-empty → returns persisted, but:
 *     * unknown entries are dropped,
 *     * duplicates are de-duped (first win),
 *     * any default key missing from persisted is appended at the tail in
 *       default order (so a new standard section added after a user
 *       reorders still appears in their list).
 *
 * Pure. Safe in server routes, page loaders, AI assemblers, and the
 * workspace client component.
 */
export function resolveSectionOrder(
  persisted: readonly string[] | null | undefined,
  defaultStandardKeys: readonly string[],
  customSectionIds: readonly string[] = [],
): string[] {
  const standardSet = new Set<string>(defaultStandardKeys);
  const customSet = new Set<string>(customSectionIds);

  if (!persisted || persisted.length === 0) {
    return [...defaultStandardKeys, ...customSectionIds];
  }

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of persisted) {
    if (typeof id !== "string" || seen.has(id)) continue;
    if (standardSet.has(id) || customSet.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }

  for (const key of defaultStandardKeys) {
    if (!seen.has(key)) ordered.push(key);
  }
  for (const id of customSectionIds) {
    if (!seen.has(id)) ordered.push(id);
  }

  return ordered;
}

/**
 * True for any string that COULD belong to a persisted section_order array:
 * a known standard section key (passed in) or a UUID-shaped custom-section id.
 * The API route uses this to reject obvious garbage before writing to Postgres.
 */
export function isValidSectionOrderEntry(
  value: unknown,
  knownStandardKeys: readonly string[],
): value is string {
  if (typeof value !== "string") return false;
  if (knownStandardKeys.includes(value)) return true;
  if (UUID_RE.test(value)) return true;
  return false;
}

/**
 * Loose shape check used when the API route doesn't have the full list of
 * custom section IDs at validation time (it always does, but defensive in
 * case a future caller doesn't). Accepts any UUID-shaped or kebab-shaped
 * string. Used ONLY when knownStandardKeys validation isn't available.
 */
export function isPlausibleSectionOrderEntry(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return KEBAB_KEY_RE.test(value) || UUID_RE.test(value);
}

/**
 * Cap on the persisted array length. Standard sections (~20) plus a pad for
 * custom sections. Persisted arrays larger than this are almost certainly a
 * client-side bug repeatedly appending IDs.
 */
export const MAX_SECTION_ORDER_ENTRIES = 200;
