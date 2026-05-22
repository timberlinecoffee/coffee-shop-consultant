import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeConceptV2, getConceptV2Progress } from "@/lib/concept";
import { buildNavItems } from "@/lib/workspace-manifest";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceTopBar } from "@/components/workspace/WorkspaceTopBar";

export const dynamic = "force-dynamic";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const completedByModule = new Map<number, number>();

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (plan?.id) {
    const { data: conceptDoc } = await supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", plan.id)
      .eq("workspace_key", "concept")
      .maybeSingle();

    if (conceptDoc?.content) {
      const progress = getConceptV2Progress(normalizeConceptV2(conceptDoc.content));
      completedByModule.set(1, progress.filled);
    }

    const { data: responses } = await supabase
      .from("module_responses")
      .select("module_number")
      .eq("plan_id", plan.id)
      .eq("status", "completed");

    if (responses) {
      for (const row of responses) {
        const n = row.module_number;
        completedByModule.set(n, (completedByModule.get(n) ?? 0) + 1);
      }
    }
  }

  const navItems = buildNavItems(completedByModule);

  return (
    <div className="flex min-h-screen bg-[#faf9f7]">
      <AppSidebar items={navItems} />
      <div className="flex-1 min-w-0 lg:pl-[224px] flex flex-col">
        <WorkspaceTopBar items={navItems} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
