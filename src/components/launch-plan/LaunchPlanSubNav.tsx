"use client";

// TIM-1634: Shared sub-nav for the Launch Plan suite. Renders a tab strip at
// the top of both the Launch Milestones page
// (/workspace/launch-plan/milestones) and the Opening Month Plan page
// (/workspace/launch-plan/opening-month) so the founder toggles between them
// inside one suite. Replaces the old two-card landing page.
//
// TIM-1793: now delegates to the canonical WorkspaceSubNav (pill style) so its
// layout matches every other Groundwork workspace.
//
// TIM-2778: 3-tab layout (Launch Plan overview / Milestones / Opening Month).

import {
  WorkspaceSubNav,
  type WorkspaceSubNavTab,
} from "@/components/workspace/WorkspaceSubNav";

export type LaunchPlanTab = "overview" | "milestones" | "playbook";

// TIM-1888 H-6: text-only pills (no leading icon) to match the Financials canonical.
const TABS: ReadonlyArray<WorkspaceSubNavTab<LaunchPlanTab>> = [
  { key: "overview", label: "Launch Plan", href: "/workspace/launch-plan" },
  { key: "milestones", label: "Milestones", href: "/workspace/launch-plan/milestones" },
  { key: "playbook", label: "Opening Month", href: "/workspace/launch-plan/opening-month" },
];

export function LaunchPlanSubNav({ active }: { active: LaunchPlanTab }) {
  return <WorkspaceSubNav tabs={TABS} active={active} ariaLabel="Launch Plan" />;
}
