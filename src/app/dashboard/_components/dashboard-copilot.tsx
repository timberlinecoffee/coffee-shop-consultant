"use client";

// TIM-1788: Scout entry point on the post-login dashboard (no suite open).
// Mirrors the in-suite wiring (WorkspaceShell): the global CoPilotBeacon is the
// desktop launcher (bottom-6 right-6) and the CoPilotDrawer's own FAB covers
// mobile (lg:hidden). showDesktopLauncher stays false so the Beacon is the lone
// desktop button — preserving the single-button, no-overlap behaviour from
// TIM-1574 / TIM-1560. Scout opens to the foundational "concept" scope; users
// can switch to any workspace or a general thread from the conversations rail.
import { CoPilotBeacon } from "@/components/workspace/CoPilotBeacon";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";

export function DashboardCoPilot({ planId }: { planId: string }) {
  return (
    <>
      <CoPilotBeacon />
      <CoPilotDrawer planId={planId} workspaceKey="concept" />
    </>
  );
}
