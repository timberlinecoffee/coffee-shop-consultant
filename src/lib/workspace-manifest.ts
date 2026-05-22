import { AVAILABLE_MODULES } from "./modules";
import { computePlanReadiness as _computePlanReadiness } from "./plan-readiness";

export interface WorkspaceManifestItem {
  moduleNumber: number;
  label: string;
  href: string;
  /** null = content not yet shipped; renders as locked with "Coming soon" tooltip */
  totalSections: number | null;
}

export interface WorkspaceNavItem {
  moduleNumber: number;
  label: string;
  href: string;
  totalSections: number | null;
  completedSections: number;
  isUnlocked: boolean;
}

export const WORKSPACE_MANIFEST: WorkspaceManifestItem[] = [
  { moduleNumber: 1, label: "Concept",             href: "/workspace/concept",           totalSections: 5 },
  { moduleNumber: 2, label: "Financials",           href: "/workspace/financials",         totalSections: null },
  { moduleNumber: 3, label: "Location & Lease",     href: "/workspace/location-lease",     totalSections: 3 },
  { moduleNumber: 4, label: "Menu & Pricing",       href: "/workspace/menu-pricing",       totalSections: null },
  { moduleNumber: 5, label: "Buildout & Equipment", href: "/workspace/buildout-equipment", totalSections: null },
  { moduleNumber: 6, label: "Launch Plan",          href: "/workspace/launch-plan",        totalSections: null },
];

export function buildNavItems(
  completedByModule: Map<number, number>
): WorkspaceNavItem[] {
  return WORKSPACE_MANIFEST.map((item) => ({
    ...item,
    completedSections: completedByModule.get(item.moduleNumber) ?? 0,
    isUnlocked:
      AVAILABLE_MODULES.has(item.moduleNumber) && item.totalSections !== null,
  }));
}

/**
 * Computes overall plan readiness as filled_sections / total_expected_sections.
 * Locked modules contribute LOCKED_MODULE_WEIGHT sections to the denominator
 * (see plan-readiness.ts), so completing only concept gives ~17%, not 100%.
 */
export function computePlanReadiness(
  completedByModule: Map<number, number>
): { filled: number; total: number } {
  return _computePlanReadiness(WORKSPACE_MANIFEST, completedByModule);
}
