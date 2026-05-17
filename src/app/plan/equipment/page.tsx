import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { EquipmentTable } from "@/components/buildout-equipment/EquipmentTable";

export const dynamic = "force-dynamic";

export default async function EquipmentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!plan) redirect("/onboarding");

  const { data: items } = await supabase
    .from("buildout_equipment_items")
    .select("*")
    .eq("plan_id", plan.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <div className="min-h-screen bg-neutral-100 pb-16 lg:pb-0">
      <nav className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <a href="/dashboard" className="hover:text-neutral-900 transition-colors">Dashboard</a>
            <span>/</span>
            <span className="text-neutral-900 font-medium">Equipment List</span>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">Equipment List</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Every machine, tool, and small ware your shop needs — with cost estimates, vendor info, and priority tier.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 sm:p-6">
          <EquipmentTable
            planId={plan.id}
            initialItems={items ?? []}
          />
        </div>
      </div>
    </div>
  );
}
