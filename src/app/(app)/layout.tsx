import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_MANIFEST } from "@/lib/workspace-manifest";
import { WorkspaceProgressProvider } from "@/components/workspace/WorkspaceProgressProvider";
import { WorkspaceStatusBootstrap } from "@/components/workspace/WorkspaceStatusBootstrap";
import { CurrencyProvider } from "@/components/CurrencyProvider";
import { getAccountSettings } from "@/lib/account-settings";

export const dynamic = "force-dynamic";

// TIM-2461: shared shell for every authenticated surface. The sidebar mounts
// here so it persists across /dashboard ↔ /workspace/* transitions instead of
// remounting in each leaf layout.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const settings = await getAccountSettings(supabase, user.id);

  return (
    <CurrencyProvider currencyCode={settings.currencyCode}>
      <WorkspaceProgressProvider
        manifest={WORKSPACE_MANIFEST}
        initialStatuses={{}}
      >
        <Suspense fallback={null}>
          <WorkspaceStatusBootstrap userId={user.id} />
        </Suspense>
        {children}
      </WorkspaceProgressProvider>
    </CurrencyProvider>
  );
}
