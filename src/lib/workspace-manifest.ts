import { AVAILABLE_MODULES } from "./modules";

export interface WorkspaceSectionItem {
  id: string;
  label: string;
}

export interface WorkspaceManifestItem {
  moduleNumber: number;
  label: string;
  href: string;
  /** null = content not yet shipped; renders as locked with "Coming soon" tooltip */
  totalSections: number | null;
  sections: WorkspaceSectionItem[];
}

export interface WorkspaceNavItem {
  moduleNumber: number;
  label: string;
  href: string;
  totalSections: number | null;
  completedSections: number;
  isUnlocked: boolean;
  sections: WorkspaceSectionItem[];
}

const CONCEPT_SECTIONS: WorkspaceSectionItem[] = [
  { id: "shop_identity", label: "Shop identity" },
  { id: "vision", label: "Vision" },
  { id: "target_customer", label: "Target customer" },
  { id: "differentiation", label: "Differentiation" },
  { id: "brand_voice", label: "Brand voice" },
];

export const WORKSPACE_MANIFEST: WorkspaceManifestItem[] = [
  { moduleNumber: 1, label: "Concept",             href: "/workspace/concept",           totalSections: 5,   sections: CONCEPT_SECTIONS },
  { moduleNumber: 2, label: "Financials",           href: "/workspace/financials",         totalSections: null, sections: [] },
  { moduleNumber: 3, label: "Location & Lease",     href: "/workspace/location-lease",     totalSections: null, sections: [] },
  { moduleNumber: 4, label: "Menu & Pricing",       href: "/workspace/menu-pricing",       totalSections: null, sections: [] },
  { moduleNumber: 5, label: "Buildout & Equipment", href: "/workspace/buildout-equipment", totalSections: null, sections: [] },
  { moduleNumber: 6, label: "Launch Plan",          href: "/workspace/launch-plan",        totalSections: null, sections: [] },
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
