// TIM-1140: Categories are per-plan rows in menu_categories (not a hard-coded enum).
// 'piece' joins the existing unit set for items measured by count.
// TIM-3247: CategoryPreset — system-seeded COGS target templates from menu_category_presets.

import type { ExpectedPopularity } from './menu-engineering'

export type IngredientUnit = 'g' | 'ml' | 'oz' | 'each' | 'piece'

export const UNIT_OPTIONS: { value: IngredientUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'oz', label: 'oz' },
  { value: 'each', label: 'each' },
  { value: 'piece', label: 'piece' },
]

// TIM-3247: Read from menu_category_presets (system reference table, service-role-only writes).
export type CategoryPreset = {
  id: string
  slug: string
  name: string
  target_cogs_low_pct: number
  target_cogs_high_pct: number
  financial_role: string
  position: number
}

export type MenuCategory = {
  id: string
  plan_id: string
  name: string
  position: number
  is_default: boolean
  // TIM-3243: per-category COGS target range. null = no range set yet (triggers onboarding picker).
  target_cogs_low_pct: number | null
  target_cogs_high_pct: number | null
  financial_role: string | null
  created_at: string
  updated_at: string
}

export type MenuItem = {
  id: string
  plan_id: string
  position: number
  name: string
  category_id: string
  price_cents: number
  cogs_cents: number | null
  expected_mix_pct: number
  // TIM-1322: owner's popularity estimate (no POS history pre-launch). Feeds
  // the menu-engineering matrix. null = not estimated yet.
  expected_popularity: ExpectedPopularity | null
  prep_time_seconds: number | null
  notes: string | null
  recipe: Record<string, unknown>
  // TIM-1471: ordered prep instructions shown in the Recipe tab. Owner-editable,
  // AI-seedable. Always an array (DB default '{}').
  preparation_steps: string[]
  // TIM-2949: user-uploaded 4:5 photo storage path in the menu-item-photos bucket.
  // null = no photo. Replaces the curated illustration treatment.
  photo_path: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

// TIM-1471: workspace-level target gross margin (default 0.75) drives the MSRP
// readout in the Cost of Goods tab. Persisted on coffee_shop_plans.
export const DEFAULT_TARGET_GROSS_MARGIN = 0.75

export type MenuItemWithCogs = MenuItem & {
  computed_cogs_cents: number
}

export type MenuIngredient = {
  id: string
  plan_id: string
  name: string
  package_size: number
  package_unit: IngredientUnit
  package_cost_cents: number
  vendor_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type MenuItemIngredient = {
  id: string
  menu_item_id: string
  ingredient_id: string
  amount: number
  unit: IngredientUnit
  created_at: string
}

export type CategoryDefaultIngredient = {
  id: string
  category_id: string
  ingredient_id: string
  amount: number
  unit: IngredientUnit
  position: number
  created_at: string
}

export function formatCents(cents: number | null): string {
  if (cents === null || cents === 0) return '—'
  return '$' + (cents / 100).toFixed(2)
}

export function costPerUnit(ingredient: MenuIngredient): number {
  return ingredient.package_cost_cents / ingredient.package_size / 100
}

export function computeItemCogs(item: MenuItemWithCogs): number {
  return item.computed_cogs_cents
}

// TIM-1140: Workspace + per-category aggregate metrics.
// Weighted-by-revenue would need a sales-mix input we don't capture yet, so
// we report the unweighted simple mean of COGS % and gross-profit %, computed
// only over items that have BOTH a price and a non-zero COGS (so half-built
// items don't drag the average to zero).
export function aggregateMargins(items: MenuItemWithCogs[]): {
  count: number
  avgCogsPct: number | null
  avgGpPct: number | null
} {
  const usable = items.filter(
    (i) => !i.archived && i.price_cents > 0 && effectiveCogsCents(i) > 0
  )
  if (usable.length === 0) return { count: 0, avgCogsPct: null, avgGpPct: null }
  const sumCogs = usable.reduce(
    (s, i) => s + effectiveCogsCents(i) / i.price_cents,
    0
  )
  const avgCogs = sumCogs / usable.length
  return {
    count: usable.length,
    avgCogsPct: avgCogs * 100,
    avgGpPct: (1 - avgCogs) * 100,
  }
}

export function effectiveCogsCents(item: MenuItemWithCogs): number {
  if (item.computed_cogs_cents > 0) return item.computed_cogs_cents
  return item.cogs_cents ?? 0
}

// TIM-3683: shared color logic for the profitability meter chip. COGS % is a
// lower-is-better metric: at or below the category target range is *good*
// (beating the margin target), not "under" and yellow — that was the inverted
// TIM-3248 mapping. Slightly above the range is yellow; significantly above is
// red. "Slightly" = within max(2 percentage points, 15% of catHigh) so both
// low-COGS food categories (e.g. 22-28% target → tolerance ~4pp) and high-COGS
// beverage categories (e.g. 8-12% target → tolerance 2pp floor) behave sanely.
export type CogsChipStatus = "green" | "yellow" | "red"

export function cogsChipStatusFor(
  cogsPct: number,
  catLow: number,
  catHigh: number,
): { status: CogsChipStatus; label: string } {
  if (cogsPct <= catHigh) {
    return { status: "green", label: "On target" }
  }
  const tolerance = Math.max(2, catHigh * 0.15)
  if (cogsPct <= catHigh + tolerance) {
    return { status: "yellow", label: "Slightly over" }
  }
  return { status: "red", label: "Over target" }
}

// TIM-1471: Minimum Suggested Retail Price from COGS and a target gross margin.
// Returns null when COGS is unknown (a meaningful MSRP requires it). Margin is
// clamped into the valid open interval (0, 1) defensively.
export function computeMsrpCents(
  cogsCents: number,
  targetGrossMargin: number,
): number | null {
  if (!Number.isFinite(cogsCents) || cogsCents <= 0) return null
  if (!Number.isFinite(targetGrossMargin)) return null
  const m = Math.min(Math.max(targetGrossMargin, 0.001), 0.999)
  return Math.round(cogsCents / (1 - m))
}

// TIM-2482 (F13): blended menu ticket in cents, popularity-weighted by default
// so it matches the canonical COGS blend in financial-projection.ts
// (menuItemMixWeight: low=1 / medium=2 / high=3, default 1). Archived items
// and items without a positive price are excluded. Returns null when the menu
// has no priced items, so the caller can keep the user's Forecast Inputs value
// instead of overwriting with a meaningless 0.
//
// Optional `mix` arg lets a caller pass an item-id → weight map (e.g. POS
// pulls, owner-tuned slider) that overrides the popularity default. Unknown
// ids fall back to popularity. Empty / all-zero mix falls back too.
//
// Lives in menu.ts (not cross-suite/) because this is a menu-domain selector
// the Menu workspace itself consumes — the cross-suite detector just imports
// it. Pattern mirrors computeMenuBlendedCogsPct() so a single audit can pin
// price and COGS to the same blend.
export interface BlendedTicketItem {
  id?: string | null
  price_cents: number
  expected_popularity?: ExpectedPopularity | null
  archived?: boolean | null
}

function popularityWeight(p: ExpectedPopularity | null | undefined): number {
  if (p === "high") return 3
  if (p === "medium") return 2
  if (p === "low") return 1
  return 1
}

export function blendedTicketCentsFromMenu(
  items: ReadonlyArray<BlendedTicketItem> | null | undefined,
  mix?: ReadonlyMap<string, number> | Record<string, number> | null,
): number | null {
  if (!items || items.length === 0) return null
  const lookup = (id: string | null | undefined): number | null => {
    if (!id || !mix) return null
    const m = mix as Record<string, number> | ReadonlyMap<string, number>
    if (m instanceof Map) {
      const v = m.get(id)
      return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null
    }
    const v = (m as Record<string, number>)[id]
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null
  }
  let totalPriceWeighted = 0
  let totalWeight = 0
  for (const it of items) {
    if (it.archived) continue
    const price = Number(it.price_cents ?? 0)
    if (!Number.isFinite(price) || price <= 0) continue
    const override = lookup(it.id ?? null)
    const weight = override ?? popularityWeight(it.expected_popularity)
    if (weight <= 0) continue
    totalPriceWeighted += price * weight
    totalWeight += weight
  }
  if (totalWeight <= 0) return null
  return Math.round(totalPriceWeighted / totalWeight)
}
