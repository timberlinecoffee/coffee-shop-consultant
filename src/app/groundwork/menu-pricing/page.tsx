import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MenuItemsTable } from "@/components/menu-items/MenuItemsTable";
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
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Menu &amp; Pricing</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Build your menu, set prices, track margin per item.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
        <MenuItemsTable
          planId={plan.id}
          initialItems={(items ?? []) as MenuItem[]}
        />
      </div>
    </div>
  );
}
