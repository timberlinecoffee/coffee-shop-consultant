import { AVAILABLE_MODULES } from "./modules";
import {
  planReadinessPctFromStatuses,
  type WorkspaceStatus,
} from "./workspace-status";

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
  /** Stable key used in workspace_documents.workspace_key + workspace_status.component_key. */
  workspaceKey: string;
  label: string;
  href: string;
  icon: NavIcon;
  category: WorkspaceCategory;
}

export interface WorkspaceNavItem extends WorkspaceManifestItem {
  status: WorkspaceStatus;
  isUnlocked: boolean;
}

// TIM-1147: manifest no longer carries `totalSections` — manual 3-state
// status replaces auto-derived percentages.
export const WORKSPACE_MANIFEST: WorkspaceManifestItem[] = [
  { moduleNumber: 1,  workspaceKey: "concept",              label: "Concept",                href: "/workspace/concept",              icon: "lightbulb",      category: "plan"    },
  { moduleNumber: 2,  workspaceKey: "financials",           label: "Financials",             href: "/workspace/financials",           icon: "bar-chart",      category: "plan"    },
  { moduleNumber: 8,  workspaceKey: "business_plan",        label: "Business Plan",          href: "/workspace/business-plan",        icon: "file-text",      category: "plan"    },
  { moduleNumber: 3,  workspaceKey: "location_lease",       label: "Location & Lease",       href: "/workspace/location-lease",       icon: "map-pin",        category: "setup"   },
  { moduleNumber: 4,  workspaceKey: "menu_pricing",         label: "Menu & Pricing",         href: "/workspace/menu-pricing",         icon: "utensils",       category: "setup"   },
  { moduleNumber: 5,  workspaceKey: "buildout_equipment",   label: "Build Out & Equipment",  href: "/workspace/buildout-equipment",   icon: "wrench",         category: "setup"   },
  { moduleNumber: 10, workspaceKey: "suppliers",            label: "Suppliers & Vendors",    href: "/workspace/suppliers",            icon: "truck",          category: "setup"   },
  { moduleNumber: 7,  workspaceKey: "hiring",               label: "Hiring & Onboarding",    href: "/workspace/hiring",               icon: "users",          category: "launch"  },
  { moduleNumber: 12, workspaceKey: "marketing_pre_launch", label: "Marketing & Pre-Launch", href: "/workspace/marketing-pre-launch", icon: "megaphone",      category: "launch"  },
  { moduleNumber: 6,  workspaceKey: "launch_plan",          label: "Launch Plan",            href: "/workspace/launch-plan",          icon: "rocket",         category: "launch"  },
  { moduleNumber: 11, workspaceKey: "operations_playbook",  label: "Operations Playbook",    href: "/workspace/operations-playbook",  icon: "clipboard-list", category: "operate" },
  { moduleNumber: 13, workspaceKey: "inventory",            label: "Inventory",              href: "/workspace/inventory",            icon: "package",        category: "operate" },
  { moduleNumber: 9,  workspaceKey: "marketing",            label: "Marketing",              href: "/workspace/marketing",            icon: "megaphone",      category: "operate" },
];

export function buildNavItems(
  statusByKey: ReadonlyMap<string, WorkspaceStatus>
): WorkspaceNavItem[] {
  return WORKSPACE_MANIFEST.map((item) => ({
    ...item,
    status: statusByKey.get(item.workspaceKey) ?? "not_started",
    isUnlocked: AVAILABLE_MODULES.has(item.moduleNumber),
  }));
}

/**
 * Overall plan readiness as the average of per-workspace manual statuses
 * (0/50/100). Locked workspaces are excluded from the denominator so the
 * number doesn't artificially drag while modules are still being shipped.
 */
export function computePlanReadiness(
  statusByKey: ReadonlyMap<string, WorkspaceStatus>
): { pct: number } {
  const unlocked = WORKSPACE_MANIFEST.filter((item) =>
    AVAILABLE_MODULES.has(item.moduleNumber)
  ).map((item) => item.workspaceKey);
  return { pct: planReadinessPctFromStatuses(unlocked, statusByKey) };
}
