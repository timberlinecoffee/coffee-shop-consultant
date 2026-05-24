export type MenuCategory = 'espresso' | 'brewed' | 'food' | 'retail' | 'seasonal'

export type MenuItem = {
  id: string
  plan_id: string
  position: number
  name: string
  category: MenuCategory
  price_cents: number
  cogs_cents: number | null
  expected_mix_pct: number
  prep_time_seconds: number | null
  notes: string | null
  recipe: Record<string, unknown>
  archived: boolean
  created_at: string
  updated_at: string
}

export type MenuItemWithCogs = MenuItem & {
  computed_cogs_cents: number
}

export type MenuIngredient = {
  id: string
  plan_id: string
  name: string
  package_size: number
  package_unit: 'g' | 'ml' | 'oz' | 'each'
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
  unit: 'g' | 'ml' | 'oz' | 'each'
  created_at: string
}

export const CATEGORY_LABELS: Record<MenuCategory, string> = {
  espresso: 'Espresso',
  brewed: 'Brewed Coffee',
  food: 'Food',
  retail: 'Retail',
  seasonal: 'Seasonal',
}

export const CATEGORY_ORDER: MenuCategory[] = ['espresso', 'brewed', 'food', 'retail', 'seasonal']

export function formatCents(cents: number | null): string {
  if (cents === null || cents === 0) return '—'
  return '$' + (cents / 100).toFixed(2)
}

export function costPerUnit(ingredient: MenuIngredient): number {
  return ingredient.package_cost_cents / ingredient.package_size
}

export function computeItemCogs(item: MenuItemWithCogs): number {
  return item.computed_cogs_cents
}
