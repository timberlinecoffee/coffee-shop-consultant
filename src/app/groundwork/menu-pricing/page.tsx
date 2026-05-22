import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MenuPricingWorkspace } from "@/components/menu-items/MenuPricingWorkspace";
import type { MenuItem } from "@/components/menu-items/MenuItemsTable";

export const dynamic = "force-dynamic";

export default async function MenuPricingPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) redirect("/onboarding");

  const { data: items } = await supabase
    .from("menu_items")
    .select("*")
    .eq("plan_id", plan.id)
    .eq("archived", false)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <MenuPricingWorkspace
      planId={plan.id}
      initialItems={(items ?? []) as MenuItem[]}
    />
  );
}
