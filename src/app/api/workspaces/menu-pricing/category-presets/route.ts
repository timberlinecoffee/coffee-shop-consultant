// TIM-3247: Read the seeded system presets from menu_category_presets.
// Used by the onboarding picker to let users copy preset values into their
// own user categories without converting them to a preset.
import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

export type CategoryPreset = {
  id: string
  slug: string
  name: string
  target_cogs_low_pct: number
  target_cogs_high_pct: number
  financial_role: string
  position: number
}

export async function GET(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("menu_category_presets")
    .select("id, slug, name, target_cogs_low_pct, target_cogs_high_pct, financial_role, position")
    .order("position")

  if (error) return Response.json({ error: "Failed to fetch presets" }, { status: 500 })
  return Response.json(data ?? [])
}
