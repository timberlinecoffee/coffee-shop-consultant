"use client";

// TIM-2759: Business Plan V2 sub-nav. 6 route-based tabs — one per BP section
// group — matching the WorkspaceSubNav pill style canonical from TIM-1793.
// Mirrors LaunchPlanSubNav; delegates all chrome to WorkspaceSubNav so no
// new styling is introduced.

import {
  WorkspaceSubNav,
  type WorkspaceSubNavTab,
} from "@/components/workspace/WorkspaceSubNav";

type BpTab =
  | "executive-summary"
  | "opportunity"
  | "execution"
  | "company"
  | "financial-plan"
  | "appendix";

const TABS: ReadonlyArray<WorkspaceSubNavTab<BpTab>> = [
  { key: "executive-summary", label: "Executive Summary", href: "/workspace/business-plan/executive-summary" },
  { key: "opportunity",       label: "Opportunity",       href: "/workspace/business-plan/opportunity" },
  { key: "execution",         label: "Execution",         href: "/workspace/business-plan/execution" },
  { key: "company",           label: "Company",           href: "/workspace/business-plan/company" },
  { key: "financial-plan",    label: "Financial Plan",    href: "/workspace/business-plan/financial-plan" },
  { key: "appendix",          label: "Appendix",          href: "/workspace/business-plan/appendix" },
];

export function BusinessPlanSubNav({ active }: { active: BpTab }) {
  return <WorkspaceSubNav tabs={TABS} active={active} ariaLabel="Business Plan" />;
}
