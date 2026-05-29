import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_MANIFEST } from "@/lib/workspace-manifest";
import { WorkspaceProgressProvider } from "@/components/workspace/WorkspaceProgressProvider";
import { WorkspaceStatusBootstrap } from "@/components/workspace/WorkspaceStatusBootstrap";
import { AiConsentProvider } from "@/components/legal/AiConsentProvider";

export const dynamic = "force-dynamic";

// TIM-1093: Only block on auth (fast JWT verify). Progress statuses are fetched
// by <WorkspaceStatusBootstrap> behind a Suspense boundary so a slow or failing
// Supabase query never prevents the sidebar shell from rendering.
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
    <WorkspaceProgressProvider
      manifest={WORKSPACE_MANIFEST}
      initialStatuses={{}}
    >
      <Suspense fallback={null}>
        <WorkspaceStatusBootstrap userId={user.id} />
      </Suspense>
      <AiConsentProvider>{children}</AiConsentProvider>
    </WorkspaceProgressProvider>
  );
}
