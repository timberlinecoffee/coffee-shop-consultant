"use client";

import { useEffect } from "react";
import { useWorkspaceStatus } from "./WorkspaceProgressProvider";
import type { WorkspaceStatus } from "@/lib/workspace-status";

// TIM-1093: Client tail of <WorkspaceStatusBootstrap>. Pushes server-fetched
// statuses into WorkspaceProgressProvider via hydrateStatuses once the
// out-of-band bootstrap query resolves. The sidebar shell already rendered
// with empty statuses; this patches in the real values without an API write.
export function WorkspaceStatusApplier({
  statuses,
}: {
  statuses: Record<string, WorkspaceStatus>;
}) {
  const { hydrateStatuses } = useWorkspaceStatus();

  useEffect(() => {
    hydrateStatuses(statuses);
  }, [statuses, hydrateStatuses]);

  return null;
}
