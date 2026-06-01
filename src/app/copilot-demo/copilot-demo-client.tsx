"use client";

import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import type { WorkspaceKey } from "@/types/supabase";

export function CopilotDemoClient({
  planId,
  workspaceKey,
}: {
  planId: string;
  workspaceKey: WorkspaceKey;
}) {
  return (
    <CoPilotDrawer
      planId={planId}
      workspaceKey={workspaceKey}
      currentFocus={{ label: "Demo page" }}
      // TIM-1574: demo page has no CoPilotBeacon, so keep the desktop launcher.
      showDesktopLauncher
    />
  );
}
