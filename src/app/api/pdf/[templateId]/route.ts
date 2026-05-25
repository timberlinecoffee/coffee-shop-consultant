import { createClient } from "@/lib/supabase/server"
import { isSubscriptionActive } from "@/lib/access"
import { getTemplate } from "@/lib/pdf/registry"
import "@/lib/pdf/templates" // Side-effect: registers all templates
import { BRAND, registerFonts } from "@/lib/pdf/brand"
import type { NextRequest } from "next/server"
import type { DocumentProps } from "@react-pdf/renderer"
import type { ReactElement, JSXElementConstructor } from "react"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type RouteContext = { params: Promise<{ templateId: string }> }

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { templateId } = await params

  const tmpl = getTemplate(templateId)
  if (!tmpl) {
    return Response.json({ error: "Unknown template" }, { status: 404 })
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, email")
    .eq("id", user.id)
    .single()

  if (!profile || !isSubscriptionActive(profile.subscription_status)) {
    return Response.json(
      { reason: "paywall", tier_required: "starter" },
      { status: 402 }
    )
  }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, shop_name")
    .eq("user_id", user.id)
    .single()

  if (!plan) {
    return Response.json({ error: "No plan found" }, { status: 404 })
  }

  let content: unknown

  if (tmpl.dataLoader) {
    content = await tmpl.dataLoader(plan.id, user.id, supabase)
  } else {
    const wsKeys = [tmpl.workspace_key, ...(tmpl.also_load ?? [])]

    const { data: docs } = await supabase
      .from("workspace_documents")
      .select("workspace_key, content")
      .eq("plan_id", plan.id)
      .in("workspace_key", wsKeys)

    const primary = docs?.find((d: { workspace_key: string }) => d.workspace_key === tmpl.workspace_key)
    if (!primary) {
      return Response.json({ error: "Workspace document not found" }, { status: 404 })
    }
    content = primary.content
  }

  registerFonts()

  const ctx = {
    content,
    brand: BRAND,
    user: { id: user.id, email: profile.email ?? null },
    plan: { id: plan.id, shop_name: plan.shop_name ?? null },
  }

  const element = (await tmpl.render(ctx)) as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>
  const filename = tmpl.filename(ctx)

  const { renderToStream } = await import("@react-pdf/renderer")
  const stream = await renderToStream(element)

  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
