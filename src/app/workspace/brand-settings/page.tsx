// TIM-2253: Brand Settings workspace — shop name, logo, and brand colors.
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { BrandSettingsClient } from "./brand-settings-client"

export const dynamic = "force-dynamic"

export default async function BrandSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!plan) redirect("/onboarding")

  const { data: config } = await supabase
    .from("brand_config")
    .select("shop_name, primary_color, secondary_color, accent_color, logo_path")
    .eq("plan_id", plan.id)
    .maybeSingle()

  let logoUrl: string | null = null
  if (config?.logo_path) {
    const { data: signed } = await supabase.storage
      .from("shop-brand-logos")
      .createSignedUrl(config.logo_path, 3600)
    logoUrl = signed?.signedUrl ?? null
  }

  return (
    <BrandSettingsClient
      initialShopName={config?.shop_name ?? plan.plan_name ?? ""}
      initialPrimaryColor={config?.primary_color ?? "#155e63"}
      initialSecondaryColor={config?.secondary_color ?? "#76b39d"}
      initialAccentColor={config?.accent_color ?? "#f59e0b"}
      initialLogoUrl={logoUrl}
    />
  )
}
