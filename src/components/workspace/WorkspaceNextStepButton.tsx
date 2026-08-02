"use client";

// TIM-4108 (UX Phase 3): the one emphasised button, rendered the same way on
// every workspace.
//
// It takes the owner to the next unfinished step: opens that section and
// scrolls it into view. Nothing is saved, nothing is generated, nothing is
// destroyed — pressing it can only ever move you. That is deliberate. The
// loudest control on a page a first-time owner has never seen before should be
// the safest one.

import { ArrowDown } from "lucide-react";

import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "./WorkspaceActionButton";
import type { NextStepView } from "./next-step";

export function WorkspaceNextStepButton({
  step,
  onGo,
}: {
  step: NextStepView;
  onGo: (id: string) => void;
}) {
  return (
    <WorkspaceActionButton variant="primary" onClick={() => onGo(step.id)}>
      <ArrowDown size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
      {step.label}
    </WorkspaceActionButton>
  );
}

/**
 * Open the step and bring it into view. Shared so "go to a step" behaves
 * identically everywhere — a workspace that scrolls differently is drift.
 */
export function scrollToStep(id: string) {
  const el = document.getElementById(`step-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}
