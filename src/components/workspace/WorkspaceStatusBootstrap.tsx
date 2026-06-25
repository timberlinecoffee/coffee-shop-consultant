import { createClient } from "@/lib/supabase/server";
import { isWorkspaceStatus, type WorkspaceStatus } from "@/lib/workspace-status";
import { getActivePlanId } from "@/lib/plan-context";
import { WorkspaceStatusApplier } from "./WorkspaceStatusApplier";

// TIM-1093: Async server component that fetches workspace_status rows for the
// active plan. Rendered inside a <Suspense fallback={null}> in
// workspace/layout.tsx so it never blocks the sidebar shell from appearing.
// On any query error the component swallows the exception; the sidebar keeps
// working with the empty initialStatuses it received at layout render time.
//
// TIM-2962: resolve via users.current_plan_id, not latest-by-created. The
// sidebar status badges would otherwise reflect the newest plan even after
// the user switched back to an older one.
export async function WorkspaceStatusBootstrap({ userId }: { userId: string }) {
  const statuses: Record<string, WorkspaceStatus> = {};

  try {
    const supabase = await createClient();
    const planId = await getActivePlanId(supabase, userId);

    if (planId) {
      const { data: rows } = await supabase
        .from("workspace_status")
        .select("component_key, status")
        .eq("plan_id", planId);

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
