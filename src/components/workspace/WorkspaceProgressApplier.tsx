"use client";

import { useEffect } from "react";
import { WORKSPACE_MANIFEST } from "@/lib/workspace-manifest";
import { useWorkspaceProgress } from "./WorkspaceProgressProvider";

// TIM-1093: Client tail of <WorkspaceProgressBootstrap>. Pushes server-fetched
// progress counts into the WorkspaceProgressProvider so the sidebar updates
// from manifest-default zeros to the user's real numbers once the queries
// resolve. Workspace pages that mount later (concept, financials, etc.) will
// keep overwriting their own moduleNumber via setModuleProgress.
export function WorkspaceProgressApplier({
  completed,
}: {
  completed: Record<number, number>;
}) {
  const { setModuleProgress } = useWorkspaceProgress();

  useEffect(() => {
    for (const item of WORKSPACE_MANIFEST) {
      if (item.totalSections === null) continue;
      const filled = completed[item.moduleNumber];
      if (filled === undefined) continue;
      setModuleProgress(item.moduleNumber, filled, item.totalSections);
    }
  }, [completed, setModuleProgress]);

  return null;
}
