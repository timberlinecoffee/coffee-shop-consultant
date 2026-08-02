"use client";

// TIM-2381: Canonical page-level entry point for Scout. Phase 2 rollout
// surfaces this on each workspace page header. Clicking dispatches
// copilot:open-with-prompt so CoPilotDrawer opens scoped + seeded — no
// flash of unscoped chat.
//
// TIM-4106 (UX Phase 1): THE LABEL NO LONGER CHANGES.
//
// It used to read "Ask Scout" on an empty workspace and "Improve with Scout"
// once you had typed something. Same button, same screen, renaming itself as
// you worked. Across eleven workspaces that produced what looked like eleven
// separate naming decisions — Equipment and Suppliers said "Ask Scout" purely
// because they happened to be empty — when it was one expression all along.
// (Flagged as an open question in decisions-log D-002: "Pick one." This picks.)
//
// "Ask Scout" is the one name, because it is true in every state. "Improve
// with Scout" is a lie on a blank screen, and the blank screen is exactly
// where a first-time owner needs the invitation most.
//
// The PROMPT still adapts to context — that is behaviour the owner never sees
// as a label, and adapting it is correct. Only the visible name is fixed.

import { Sparkles } from "lucide-react";
import { WorkspaceActionButton } from "./WorkspaceActionButton";
import type { WorkspaceKey } from "@/types/supabase";

/** The one name. Exported so a guard test can pin it. */
export const ASK_SCOUT_LABEL = "Ask Scout";

export interface AskScoutButtonProps {
  workspaceKey: WorkspaceKey;
  focusLabel?: string;
  // Seeds a specific prompt. Does NOT change the button's label.
  action?: string;
  // Whether the workspace has content yet. Chooses between a "help me" and an
  // "improve my" prompt. Does NOT change the button's label.
  hasContent?: boolean;
}

export function AskScoutButton({
  workspaceKey,
  focusLabel,
  action,
  hasContent,
}: AskScoutButtonProps) {
  const subject = focusLabel ?? workspaceKey.replace(/_/g, " ");
  const prompt =
    action ?? (hasContent ? `Improve my ${subject}` : `Help me with my ${subject}`);

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
      {ASK_SCOUT_LABEL}
    </WorkspaceActionButton>
  );
}
