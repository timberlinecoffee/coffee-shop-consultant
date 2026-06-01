"use client";

// TIM-1408: Single global Co-pilot entry point. Replaces the WorkspaceTopBar
// "Co-pilot" button and the per-card "Ask Co-pilot" controls. Fields that need
// a seeded prompt can still dispatch `copilot:open-with-prompt` directly.

import { usePathname } from "next/navigation";
import { COPILOT_NAME } from "@/lib/copilot/branding";
import { AITriggerButton } from "@/components/ui/ai-trigger-button";

export function CoPilotBeacon() {
  const pathname = usePathname();
  const isWorkspacePage = pathname?.startsWith("/workspace/");

  if (!isWorkspacePage) return null;

  function open() {
    window.dispatchEvent(new CustomEvent("workspace-copilot-open"));
  }

  return (
    <AITriggerButton
      variant="fab"
      label={COPILOT_NAME}
      aria-label={`Open ${COPILOT_NAME}`}
      onClick={open}
    />
  );
}
