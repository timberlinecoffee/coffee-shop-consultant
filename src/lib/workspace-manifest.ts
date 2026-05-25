import { AVAILABLE_MODULES } from "./modules";
import { computePlanReadiness as _computePlanReadiness } from "./plan-readiness";

export type NavIcon =
  | "lightbulb"
  | "bar-chart"
  | "map-pin"
  | "utensils"
  | "wrench"
  | "rocket"
  | "users"
  | "megaphone";

export interface WorkspaceManifestItem {
  moduleNumber: number;
  label: string;
  href: string;
  icon: NavIcon;
  /** null = no section-based progress tracking; page still accessible */
  totalSections: number | null;
}

export interface WorkspaceNavItem {
  moduleNumber: number;
  label: string;
  href: string;
  icon: NavIcon;
  totalSections: number | null;
  completedSections: number;
  isUnlocked: boolean;
}

export const WORKSPACE_MANIFEST: WorkspaceManifestItem[] = [
  { moduleNumber: 1, label: "Concept",               href: "/workspace/concept",           icon: "lightbulb",  totalSections: 5 },
  { moduleNumber: 2, label: "Financials",             href: "/workspace/financials",         icon: "bar-chart",  totalSections: 2 },
  { moduleNumber: 3, label: "Location & Lease",       href: "/workspace/location-lease",     icon: "map-pin",    totalSections: 3 },
  { moduleNumber: 4, label: "Menu & Pricing",         href: "/workspace/menu-pricing",       icon: "utensils",   totalSections: null },
  { moduleNumber: 5, label: "Build Out & Equipment",  href: "/workspace/buildout-equipment", icon: "wrench",     totalSections: null },
  { moduleNumber: 6, label: "Launch Plan",            href: "/workspace/launch-plan",        icon: "rocket",     totalSections: null },
  { moduleNumber: 7, label: "Hiring & Onboarding",    href: "/workspace/hiring",             icon: "users",      totalSections: 4 },
  { moduleNumber: 9, label: "Marketing",               href: "/workspace/marketing",          icon: "megaphone",  totalSections: null },
];

export function buildNavItems(
  completedByModule: Map<number, number>
): WorkspaceNavItem[] {
  return WORKSPACE_MANIFEST.map((item) => ({
    ...item,
    completedSections: completedByModule.get(item.moduleNumber) ?? 0,
    isUnlocked: AVAILABLE_MODULES.has(item.moduleNumber),
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
