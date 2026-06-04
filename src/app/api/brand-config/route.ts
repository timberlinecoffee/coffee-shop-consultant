// TIM-2253: Brand config API — GET (load) and PATCH (save name + colors).
// Logo upload/delete is handled by the existing /api/brand/logo route (TIM-1700).

export const dynamic = "force-dynamic"

import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

const HEX_RE = /^#[0-9A-Fa-f]{6}$/

async function getAuthedPlan(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, plan: null }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return { user, plan }
}

export async function GET() {
  const supabase = await createClient()
  const { user, plan } = await getAuthedPlan(supabase)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!plan) return Response.json({ error: "No plan" }, { status: 404 })

  const { data: config } = await supabase
    .from("brand_config")
    .select("shop_name, primary_color, secondary_color, accent_color, logo_path, updated_at")
    .eq("plan_id", plan.id)
    .maybeSingle()

  // Build a signed logo URL when a logo path exists.
  let logoUrl: string | null = null
  if (config?.logo_path) {
    const { data: signed } = await supabase.storage
      .from("shop-brand-logos")
      .createSignedUrl(config.logo_path, 3600)
    logoUrl = signed?.signedUrl ?? null
  }

  return Response.json({
    shop_name: config?.shop_name ?? plan.plan_name ?? "",
    primary_color: config?.primary_color ?? "#155e63",
    secondary_color: config?.secondary_color ?? "#76b39d",
    accent_color: config?.accent_color ?? "#f59e0b",
    logo_path: config?.logo_path ?? null,
    logo_url: logoUrl,
    updated_at: config?.updated_at ?? null,
  })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { user, plan } = await getAuthedPlan(supabase)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!plan) return Response.json({ error: "No plan" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json() as Record<string, unknown>
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const patch: Record<string, unknown> = { plan_id: plan.id, updated_at: new Date().toISOString() }

  if ("shop_name" in body) {
    const name = typeof body.shop_name === "string" ? body.shop_name.trim() : null
    patch.shop_name = name || null
  }

  for (const field of ["primary_color", "secondary_color", "accent_color"] as const) {
    if (field in body) {
      const val = body[field]
      if (typeof val !== "string" || !HEX_RE.test(val)) {
        return Response.json({ error: `Invalid hex value for ${field}` }, { status: 422 })
      }
      patch[field] = val
    }
  }

  const { error } = await supabase
    .from("brand_config")
    .upsert(patch, { onConflict: "plan_id" })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
