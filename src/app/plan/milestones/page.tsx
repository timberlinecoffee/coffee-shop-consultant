import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ComingSoon } from "@/components/coming-soon";

export const dynamic = "force-dynamic";

export default async function MilestonesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <ComingSoon
      title="Milestones"
      description="A full milestone timeline from lease signing through grand opening, with target dates and module completion tied in."
      icon="📅"
      shipsWith="Module 8: BRD Assembly"
    />
  );
}
