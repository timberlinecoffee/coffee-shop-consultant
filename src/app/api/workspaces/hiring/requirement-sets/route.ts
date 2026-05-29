// TIM-1300: Hiring requirement sets — content-driven, country-scoped.
// GET /api/workspaces/hiring/requirement-sets?country=US
// Returns all is_system rows for the given ISO-2 country code.

import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const country = request.nextUrl.searchParams.get("country")
  if (!country) return Response.json({ error: "country param required" }, { status: 400 })

  const { data, error } = await supabase
    .from("hiring_requirement_sets")
    .select("*")
    .eq("country_code", country.toUpperCase())
    .eq("is_system", true)
    .order("order_index", { ascending: true })

  if (error) return Response.json({ error: "Failed to fetch requirement sets" }, { status: 500 })
  return Response.json(data ?? [])
}
