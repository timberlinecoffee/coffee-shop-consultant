"use client";

// TIM-1634: Shared sub-nav for the Launch Plan suite. Renders a tab strip at
// the top of both the Launch Milestones page
// (/workspace/launch-plan/milestones) and the Opening Month Plan page
// (/workspace/launch-plan/opening-month) so the founder toggles between them
// inside one suite. Replaces the old two-card landing page.
//
// TIM-1793: now delegates to the canonical WorkspaceSubNav (pill style) so its
// layout matches every other Groundwork workspace.

import { Rocket, ClipboardList } from "lucide-react";
import {
  WorkspaceSubNav,
  type WorkspaceSubNavTab,
} from "@/components/workspace/WorkspaceSubNav";

type Active = "milestones" | "playbook";

const TABS: ReadonlyArray<WorkspaceSubNavTab<Active>> = [
  { key: "milestones", label: "Launch Milestones", href: "/workspace/launch-plan/milestones", Icon: Rocket },
  { key: "playbook", label: "Opening Month Plan", href: "/workspace/launch-plan/opening-month", Icon: ClipboardList },
];

export function LaunchPlanSubNav({ active }: { active: Active }) {
  return <WorkspaceSubNav tabs={TABS} active={active} ariaLabel="Launch Plan" />;
}
