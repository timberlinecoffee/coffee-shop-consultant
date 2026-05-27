import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildNavItems } from "@/lib/workspace-manifest";
import { WorkspaceProgressProvider } from "@/components/workspace/WorkspaceProgressProvider";
import { WorkspaceProgressBootstrap } from "@/components/workspace/WorkspaceProgressBootstrap";

export const dynamic = "force-dynamic";

// TIM-1093: Keep this layout's await-chain to auth-only. Progress data is
// fetched inside <WorkspaceProgressBootstrap> behind a Suspense boundary so
// a slow or failing progress query never blocks the sidebar shell from
// rendering. The provider seeds with manifest-default counters (all 0) so
// the sidebar is fully usable immediately; bootstrap then patches real
// values into context once the queries return.
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <WorkspaceProgressProvider initialItems={buildNavItems(new Map())}>
      <Suspense fallback={null}>
        <WorkspaceProgressBootstrap userId={user.id} />
      </Suspense>
      {children}
    </WorkspaceProgressProvider>
  );
}
