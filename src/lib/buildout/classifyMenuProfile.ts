import type { SupabaseClient } from "@supabase/supabase-js"

export type MenuProfile = 'full_food' | 'full_drip' | 'espresso_focused' | 'espresso_plus_brew'

// Heuristics (in priority order):
//   food items present → full_food
//   brewed items > 50% of total → full_drip
//   every item is espresso → espresso_focused
//   otherwise / no menu → espresso_plus_brew (modal first-shop fallback)
export async function classifyMenuProfile(
  planId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<MenuProfile> {
  const { data: items } = await supabase
    .from('menu_items')
    .select('category')
    .eq('plan_id', planId)

  if (!items || items.length === 0) return 'espresso_plus_brew'

  const hasFood = items.some((i: { category: string }) => i.category === 'food')
  if (hasFood) return 'full_food'

  const total = items.length
  const brewedCount = items.filter((i: { category: string }) => i.category === 'brewed').length
  const espressoCount = items.filter((i: { category: string }) => i.category === 'espresso').length

  if (brewedCount / total > 0.5) return 'full_drip'
  if (espressoCount === total) return 'espresso_focused'

  return 'espresso_plus_brew'
}
