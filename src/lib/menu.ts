// TIM-1140: Categories are per-plan rows in menu_categories (not a hard-coded enum).
// 'piece' joins the existing unit set for items measured by count.

import type { ExpectedPopularity } from './menu-engineering'

export type IngredientUnit = 'g' | 'ml' | 'oz' | 'each' | 'piece'

export const UNIT_OPTIONS: { value: IngredientUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'oz', label: 'oz' },
  { value: 'each', label: 'each' },
  { value: 'piece', label: 'piece' },
]

export type MenuCategory = {
  id: string
  plan_id: string
  name: string
  position: number
  is_default: boolean
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
