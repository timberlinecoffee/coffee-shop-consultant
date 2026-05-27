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
  | "megaphone"
  | "file-text"
  | "truck"
  | "clipboard-list"
  | "package";

// TIM-1142: phase-based categories for the workspace sidebar.
// Order here is the order rendered in the sidebar.
export type WorkspaceCategory = "plan" | "setup" | "launch" | "operate";

export const WORKSPACE_CATEGORY_ORDER: ReadonlyArray<WorkspaceCategory> = [
  "plan",
  "setup",
  "launch",
  "operate",
];

export const WORKSPACE_CATEGORY_LABEL: Record<WorkspaceCategory, string> = {
  plan: "Plan",
  setup: "Set Up",
  launch: "Launch",
  operate: "Operate",
};

export interface WorkspaceManifestItem {
  moduleNumber: number;
  label: string;
  href: string;
  icon: NavIcon;
  /** null = no section-based progress tracking; page still accessible */
  totalSections: number | null;
  category: WorkspaceCategory;
}

export interface WorkspaceNavItem {
  moduleNumber: number;
  label: string;
  href: string;
  icon: NavIcon;
  totalSections: number | null;
  completedSections: number;
  isUnlocked: boolean;
  category: WorkspaceCategory;
}

export const WORKSPACE_MANIFEST: WorkspaceManifestItem[] = [
  { moduleNumber: 1,  label: "Concept",               href: "/workspace/concept",              icon: "lightbulb",      totalSections: 5,    category: "plan"    },
  { moduleNumber: 2,  label: "Financials",            href: "/workspace/financials",           icon: "bar-chart",      totalSections: 2,    category: "plan"    },
  { moduleNumber: 8,  label: "Business Plan",         href: "/workspace/business-plan",        icon: "file-text",      totalSections: null, category: "plan"    },
  { moduleNumber: 3,  label: "Location & Lease",      href: "/workspace/location-lease",       icon: "map-pin",        totalSections: 3,    category: "setup"   },
  { moduleNumber: 4,  label: "Menu & Pricing",        href: "/workspace/menu-pricing",         icon: "utensils",       totalSections: null, category: "setup"   },
  { moduleNumber: 5,  label: "Build Out & Equipment", href: "/workspace/buildout-equipment",   icon: "wrench",         totalSections: null, category: "setup"   },
  { moduleNumber: 10, label: "Suppliers & Vendors",   href: "/workspace/suppliers",            icon: "truck",          totalSections: null, category: "setup"   },
  { moduleNumber: 7,  label: "Hiring & Onboarding",   href: "/workspace/hiring",               icon: "users",          totalSections: 4,    category: "launch"  },
  { moduleNumber: 12, label: "Marketing & Pre-Launch", href: "/workspace/marketing-pre-launch", icon: "megaphone",     totalSections: 5,    category: "launch"  },
  { moduleNumber: 6,  label: "Launch Plan",           href: "/workspace/launch-plan",          icon: "rocket",         totalSections: null, category: "launch"  },
  { moduleNumber: 11, label: "Operations Playbook",   href: "/workspace/operations-playbook",  icon: "clipboard-list", totalSections: 6,    category: "operate" },
  { moduleNumber: 13, label: "Inventory",             href: "/workspace/inventory",            icon: "package",        totalSections: null, category: "operate" },
  { moduleNumber: 9,  label: "Marketing",             href: "/workspace/marketing",            icon: "megaphone",      totalSections: null, category: "operate" },
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
