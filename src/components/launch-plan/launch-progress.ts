// TIM-4108 (UX Phase 3): what the Launch Plan header states.
//
// Three sub-pages share one header — Launch Plan (overview), Launch Milestones,
// and Opening Month Plan — so the line has to say something true on each
// without three different vocabularies appearing as the owner clicks between
// them.
//
// A count rather than a bar (D-011), for a reason specific to this screen: the
// owner adds their own milestones and tasks, so the denominator moves under
// the bar. Add three tasks you have not done and a bar goes DOWN, which reads
// as losing ground for the crime of planning more carefully.
//
// "done" is stated plainly because both lists carry a real done status the
// owner sets by hand. That is a fact about their work, not a score.
//
// Pure and dependency-free (no runtime "@/" imports) so node:test can load it.

import type { WorkspaceProgress } from "../workspace/workspace-progress";

export type LaunchSection = "overview" | "milestones" | "playbook" | "all";

export interface LaunchCounts {
  milestones: number;
  milestonesDone: number;
  tasks: number;
  tasksDone: number;
}

function part(total: number, done: number, singular: string, plural: string) {
  const n = Math.max(0, Math.floor(total));
  const d = Math.min(Math.max(0, Math.floor(done)), n);
  const noun = n === 1 ? singular : plural;
  return d > 0 ? `${n} ${noun} · ${d} done` : `${n} ${noun}`;
}

export function launchProgress(
  section: LaunchSection,
  counts: LaunchCounts,
): WorkspaceProgress | undefined {
  const hasMilestones = Math.floor(counts.milestones) > 0;
  const hasTasks = Math.floor(counts.tasks) > 0;

  if (section === "milestones") {
    if (!hasMilestones) return { kind: "count", text: "No milestones yet" };
    return {
      kind: "count",
      text: part(counts.milestones, counts.milestonesDone, "milestone", "milestones"),
    };
  }

  if (section === "playbook") {
    if (!hasTasks) return { kind: "count", text: "No tasks yet" };
    return {
      kind: "count",
      text: part(counts.tasks, counts.tasksDone, "task", "tasks"),
    };
  }

  // Overview and the legacy unified page show both lists, so the line names
  // both — and omits whichever is still empty rather than reporting a zero the
  // owner cannot act on from here.
  const pieces: string[] = [];
  if (hasMilestones) {
    pieces.push(part(counts.milestones, counts.milestonesDone, "milestone", "milestones"));
  }
  if (hasTasks) {
    pieces.push(part(counts.tasks, counts.tasksDone, "task", "tasks"));
  }
  if (pieces.length === 0) return { kind: "count", text: "Nothing planned yet" };
  return { kind: "count", text: pieces.join(" · ") };
}
