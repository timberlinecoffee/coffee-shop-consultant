import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ComingSoon } from "@/components/coming-soon";

export const dynamic = "force-dynamic";

export default async function CostsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <ComingSoon
      title="Cost Tracker"
      description="Track every dollar against your startup budget: receipts, vendor quotes, and variance from plan in one place."
      icon="💰"
      shipsWith="Module 2: Financial Modeling expansion"
    />
  );
}
