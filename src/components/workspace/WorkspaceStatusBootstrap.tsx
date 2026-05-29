import { createClient } from "@/lib/supabase/server";
import { isWorkspaceStatus, type WorkspaceStatus } from "@/lib/workspace-status";
import { WorkspaceStatusApplier } from "./WorkspaceStatusApplier";

// TIM-1093: Async server component that fetches workspace_status rows for the
// user's most recent plan. Rendered inside a <Suspense fallback={null}> in
// workspace/layout.tsx so it never blocks the sidebar shell from appearing.
// On any query error the component swallows the exception; the sidebar keeps
// working with the empty initialStatuses it received at layout render time.
export async function WorkspaceStatusBootstrap({ userId }: { userId: string }) {
  const statuses: Record<string, WorkspaceStatus> = {};

  try {
    const supabase = await createClient();

    const { data: plan } = await supabase
      .from("coffee_shop_plans")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (plan?.id) {
      const { data: rows } = await supabase
        .from("workspace_status")
        .select("component_key, status")
        .eq("plan_id", plan.id);

      for (const row of rows ?? []) {
        if (isWorkspaceStatus(row.status)) {
          statuses[row.component_key] = row.status;
        }
      }
    }
  } catch {
    // Soft fail — sidebar renders with empty statuses from initialStatuses={}.
  }

  return <WorkspaceStatusApplier statuses={statuses} />;
}
