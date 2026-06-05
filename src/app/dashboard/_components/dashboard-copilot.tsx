"use client";

// TIM-1788: Scout entry point on the post-login dashboard (no suite open).
// TIM-2381: CoPilotBeacon retired — CoPilotDrawer FAB is now the sole launcher
// on both mobile and desktop. showDesktopLauncher defaults to true post-retirement.
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";

export function DashboardCoPilot({ planId }: { planId: string }) {
  return <CoPilotDrawer planId={planId} workspaceKey="concept" />;
}
