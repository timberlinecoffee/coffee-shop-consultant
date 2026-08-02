// TIM-4107 (UX Phase 2): the one way a workspace states how far along you are.
//
// Before this, progress appeared on 4 of 11 workspaces, in three different
// vocabularies, and seven screens gave you no sense of where you were at all.
//
// Two shapes, because not every workspace is a sequence:
//
//   steps  — the workspace has an ordered set of things to complete.
//            Renders "4 of 4 steps done" plus a percentage and a bar.
//            The wording is fixed by T1-D: inside a workspace the unit is
//            "steps"; "sections" means parts of a generated document and
//            "workspaces" is Home's unit. Do not reintroduce either here.
//
//   count  — the workspace is a LIST you add to, not a path you walk.
//            Location & Lease and Suppliers are the cases: you shortlist
//            candidate sites or vendors, and there is no "done".
//            Renders a plain factual line, no bar, no percentage.
//
// Trent's ruling 2026-08-02: list-shaped workspaces do NOT get progress bars.
// Inventing steps so every screen has a bar would be the same class of lie
// this whole batch exists to remove — a number that looks like a measurement
// but is really a decoration.
//
// Pure and dependency-free (no runtime "@/" imports) so node:test can load it.

export type WorkspaceProgress =
  | { kind: "steps"; done: number; total: number }
  | { kind: "count"; text: string };

export interface ProgressView {
  /** The line shown to the owner. */
  label: string;
  /** 0–100, or null when a bar would be meaningless. */
  pct: number | null;
  /** Whether to draw the bar at all. */
  showBar: boolean;
}

export function progressView(progress: WorkspaceProgress): ProgressView {
  if (progress.kind === "count") {
    return { label: progress.text, pct: null, showBar: false };
  }

  const total = Math.max(0, Math.floor(progress.total));
  const done = Math.min(Math.max(0, Math.floor(progress.done)), total);

  // A workspace that reports zero steps has nothing to say. Showing
  // "0 of 0 steps done" and an empty bar reads as broken rather than empty.
  if (total === 0) {
    return { label: "No steps yet", pct: null, showBar: false };
  }

  return {
    label: `${done} of ${total} steps done`,
    pct: Math.round((done / total) * 100),
    showBar: true,
  };
}
