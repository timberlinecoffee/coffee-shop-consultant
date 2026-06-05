"use client";

// TIM-2381: Canonical page-level entry point for Scout. Phase 2 rollout
// surfaces this on each workspace page header. Clicking dispatches
// copilot:open-with-prompt so CoPilotDrawer opens scoped + seeded — no
// flash of unscoped chat.

import { Sparkles } from "lucide-react";
import { WorkspaceActionButton } from "./WorkspaceActionButton";
import type { WorkspaceKey } from "@/types/supabase";

export interface AskScoutButtonProps {
  workspaceKey: WorkspaceKey;
  focusLabel?: string;
  // When action is provided the button reads "Improve with Scout"; default is "Ask Scout".
  action?: string;
  // hasContent controls which label variant is shown when action is omitted.
  hasContent?: boolean;
}

export function AskScoutButton({
  workspaceKey,
  focusLabel,
  action,
  hasContent,
}: AskScoutButtonProps) {
  const label = action
    ? "Improve with Scout"
    : hasContent
    ? "Improve with Scout"
    : "Ask Scout";

  const prompt = action ?? (hasContent ? `Improve my ${focusLabel ?? workspaceKey.replace(/_/g, " ")}` : `Help me with my ${focusLabel ?? workspaceKey.replace(/_/g, " ")}`);

  function handleClick() {
    window.dispatchEvent(
      new CustomEvent("copilot:open-with-prompt", {
        detail: { prompt, workspaceKey, focusLabel, action },
      }),
    );
  }

  return (
    <WorkspaceActionButton variant="secondary" onClick={handleClick}>
      <Sparkles size={12} aria-hidden />
      {label}
    </WorkspaceActionButton>
  );
}
