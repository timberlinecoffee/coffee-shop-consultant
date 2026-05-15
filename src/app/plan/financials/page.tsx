import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ComingSoon } from "@/components/coming-soon";

export const dynamic = "force-dynamic";

export default async function FinancialsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <ComingSoon
      title="Financial Model"
      description="Your live P&L, break-even, and cash-flow model, pulled from your Module 2 inputs and exportable for lenders or partners."
      icon="📊"
      shipsWith="Module 2 polish + PDF export"
    />
  );
}
