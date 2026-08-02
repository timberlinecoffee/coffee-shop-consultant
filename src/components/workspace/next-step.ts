// TIM-4108 (UX Phase 3): what "the next real thing to do" actually is.
//
// Phase 2 gave the header a single emphasised slot and Trent's ruling fixed
// what belongs in it: the next real step on this screen, never the AI button.
// This module answers "which step is that" the same way on every workspace,
// so eleven screens cannot arrive at eleven different ideas of progress.
//
// A workspace declares its steps in the order an owner should walk them.
// From that one list we derive BOTH things the header shows:
//
//   • the emphasised button — the first step that isn't done
//   • the progress line     — how many of them are done
//
// Deriving both from one list is the point. Before this, a screen could show a
// progress bar counting one set of things and a button pointing at another.
//
// Wording:
//   nothing done yet → "Start with Overview"      (an invitation)
//   some done        → "Continue with Channels"   (a resumption)
//   everything done  → no button at all
//
// That last case matters. A screen with nothing left to do should say so by
// going quiet, not by inventing a task so the button has something to say.
//
// Pure and dependency-free (no runtime "@/" imports) so node:test can load it.

import type { WorkspaceProgress } from "./workspace-progress";

export interface WorkspaceStep {
  /** Stable id, also used as the scroll target on the page. */
  id: string;
  /** What the owner calls this step. Appears inside the button label. */
  label: string;
  /** Finished. Partly-filled counts as NOT done — it is still the next thing. */
  done: boolean;
}

export interface NextStepView {
  /** The step to scroll to and open. */
  id: string;
  /** The full button label, ready to render. */
  label: string;
}

export function nextStep(steps: readonly WorkspaceStep[]): NextStepView | null {
  const pending = steps.find((s) => !s.done);
  if (!pending) return null;

  const anyDone = steps.some((s) => s.done);
  return {
    id: pending.id,
    label: `${anyDone ? "Continue with" : "Start with"} ${pending.label}`,
  };
}

/** The progress line for the same list of steps. Always agrees with the button. */
export function stepsProgress(steps: readonly WorkspaceStep[]): WorkspaceProgress {
  return {
    kind: "steps",
    done: steps.filter((s) => s.done).length,
    total: steps.length,
  };
}
