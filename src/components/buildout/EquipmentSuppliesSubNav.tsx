"use client";

// TIM-1458: Shared sub-nav for the Equipment & Supplies suite. Renders a tab
// strip at the top of both the Equipment page (/workspace/buildout-equipment)
// and the Supplies page (/workspace/buildout-equipment/supplies) so the
// founder toggles between them inside one suite.
//
// TIM-1793: now delegates to the canonical WorkspaceSubNav (pill style) so its
// layout matches every other Groundwork workspace. The old underline tab style
// was the board-flagged drift example.

import {
  WorkspaceSubNav,
  type WorkspaceSubNavTab,
} from "@/components/workspace/WorkspaceSubNav";

type Active = "equipment" | "supplies";

// TIM-1888 H-6: text-only pills (no leading icon) to match the Financials canonical.
const TABS: ReadonlyArray<WorkspaceSubNavTab<Active>> = [
  { key: "equipment", label: "Equipment", href: "/workspace/buildout-equipment" },
  { key: "supplies", label: "Supplies", href: "/workspace/buildout-equipment/supplies" },
];

export function EquipmentSuppliesSubNav({ active }: { active: Active }) {
  return <WorkspaceSubNav tabs={TABS} active={active} ariaLabel="Equipment & Supplies" />;
}
