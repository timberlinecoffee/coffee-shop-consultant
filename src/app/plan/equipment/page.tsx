import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ComingSoon } from "@/components/coming-soon";

export const dynamic = "force-dynamic";

export default async function EquipmentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <ComingSoon
      title="Equipment List"
      description="A working list of every machine, tool, and small ware your shop needs — with cost estimates and vendor links."
      icon="🔧"
      shipsWith="Module 5: Bar Design & Equipment"
    />
  );
}
