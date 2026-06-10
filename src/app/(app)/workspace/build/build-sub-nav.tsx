"use client";

// TIM-2595: Sub-nav strip for the Build workspace (ui_revamp_v2).
// Uses the canonical WorkspaceSubNav (pill style) so its tab layout matches
// every other Groundwork workspace sub-nav. Tabs are route links that encode
// the active workspace into the ?tab= search param.
//
// Style reference: WorkspaceSubNav (src/components/workspace/WorkspaceSubNav.tsx)
// Visual match: EquipmentSuppliesSubNav pattern (Equipment & Supplies suite).

import {
  WorkspaceSubNav,
  type WorkspaceSubNavTab,
} from "@/components/workspace/WorkspaceSubNav";

export type BuildTab =
  | "location"
  | "equipment"
  | "suppliers"
  | "menu"
  | "hiring"
  | "launch-plan";

export const BUILD_TABS: ReadonlyArray<WorkspaceSubNavTab<BuildTab>> = [
  { key: "location",    label: "Location",     href: "/workspace/build?tab=location" },
  { key: "equipment",   label: "Equipment",    href: "/workspace/build?tab=equipment" },
  { key: "suppliers",   label: "Suppliers",    href: "/workspace/build?tab=suppliers" },
  { key: "menu",        label: "Menu",         href: "/workspace/build?tab=menu" },
  { key: "hiring",      label: "Hiring",       href: "/workspace/build?tab=hiring" },
  { key: "launch-plan", label: "Launch Plan",  href: "/workspace/build?tab=launch-plan" },
];

export function BuildSubNav({ active }: { active: BuildTab }) {
  return (
    <WorkspaceSubNav
      tabs={BUILD_TABS}
      active={active}
      ariaLabel="Build workspace tabs"
    />
  );
}
