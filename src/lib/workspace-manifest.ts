import { AVAILABLE_MODULES } from "./modules.ts";
import {
  planReadinessPctFromStatuses,
  type WorkspaceStatus,
} from "./workspace-status.ts";

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
  | "package"
  | "trending-up";

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
  /**
   * One-line "why I'd click it" summary, shown on the dashboard workspace list
   * (TIM-1286) so each entry reads as a useful destination rather than a bare
   * link. Plainspoken voice: no emojis, no em dashes.
   */
  blurb: string;
}

export interface WorkspaceNavItem extends WorkspaceManifestItem {
  status: WorkspaceStatus;
  isUnlocked: boolean;
}

// TIM-1147: manifest no longer carries `totalSections` — manual 3-state
// status replaces auto-derived percentages.
export const WORKSPACE_MANIFEST: WorkspaceManifestItem[] = [
  { moduleNumber: 1,  workspaceKey: "concept",              label: "Concept",                href: "/workspace/concept",              icon: "lightbulb",      category: "plan",    blurb: "Shape your shop's identity, story, and what sets it apart." },
  { moduleNumber: 2,  workspaceKey: "financials",           label: "Financials",             href: "/workspace/financials",           icon: "bar-chart",      category: "plan",    blurb: "Model your startup costs, pricing, and path to profit." },
  { moduleNumber: 8,  workspaceKey: "business_plan",        label: "Business Plan",          href: "/workspace/business-plan",        icon: "file-text",      category: "plan",    blurb: "Pull every workspace into one lender-ready document." },
  { moduleNumber: 3,  workspaceKey: "location_lease",       label: "Location & Lease",       href: "/workspace/location-lease",       icon: "map-pin",        category: "setup",   blurb: "Compare sites and weigh lease terms before you sign." },
  { moduleNumber: 4,  workspaceKey: "menu_pricing",         label: "Menu & Pricing",         href: "/workspace/menu-pricing",         icon: "utensils",       category: "setup",   blurb: "Build your drink lineup and price it for healthy margins." },
  // TIM-1458: Inventory standalone entry folded into the Equipment & Supplies
  // suite. Supplies still lives under the same workspace_key + module slot.
  { moduleNumber: 5,  workspaceKey: "buildout_equipment",   label: "Equipment & Supplies",   href: "/workspace/buildout-equipment",   icon: "wrench",         category: "setup",   blurb: "Plan the gear and the opening-day consumables that go on the bar." },
  { moduleNumber: 10, workspaceKey: "suppliers",            label: "Suppliers & Vendors",    href: "/workspace/suppliers",            icon: "truck",          category: "setup",   blurb: "Line up the roasters and vendors behind your bar." },
  { moduleNumber: 7,  workspaceKey: "hiring",               label: "Hiring & Onboarding",    href: "/workspace/hiring",               icon: "users",          category: "launch",  blurb: "Define roles, screen candidates, and train your first team." },
  { moduleNumber: 9,  workspaceKey: "marketing",            label: "Marketing",              href: "/workspace/marketing",            icon: "megaphone",      category: "launch",  blurb: "Plan the story, channels, and milestones that get people in the door." },
  // TIM-1521: renamed "Opening Month Plan" → "Launch Plan" umbrella; the
  // umbrella page links out to Launch Milestones + Opening Month sub-pages.
  // workspace_key stays `opening_month_plan` so workspace_documents/status
  // rows + RLS keep working without a migration.
  { moduleNumber: 6,  workspaceKey: "opening_month_plan",   label: "Launch Plan",            href: "/workspace/launch-plan",          icon: "rocket",         category: "launch",  blurb: "Map the dated milestones to opening day and the tactical playbook for your first month." },
  { moduleNumber: 11, workspaceKey: "operations_playbook",  label: "Operations Playbook",    href: "/workspace/operations-playbook",  icon: "clipboard-list", category: "operate", blurb: "Document the daily routines that keep the shop running." },
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
