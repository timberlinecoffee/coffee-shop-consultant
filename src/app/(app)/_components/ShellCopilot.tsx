"use client";
import { useCurrentWorkspaceKey } from "@/hooks/useCurrentWorkspaceKey";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";

interface ShellCopilotProps { planId: string }

export function ShellCopilot({ planId }: ShellCopilotProps) {
  const workspaceKey = useCurrentWorkspaceKey();
  return (
    <CoPilotDrawer
      workspaceKey={workspaceKey}
      planId={planId}
      showDesktopLauncher={true}
      defaultScopeOverride={workspaceKey}
    />
  );
}
