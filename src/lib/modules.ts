// Single source of truth for which plan modules have implemented content.
// Updating AVAILABLE_MODULES here keeps dashboard navigation in sync.

export const TOTAL_MODULES = 14;

// Modules with shipped pages — Concept, Financials, Location, Menu, Buildout, Opening Milestones (6), Hiring, Business Plan, Marketing, Suppliers & Vendors, Operations Playbook, Inventory, Opening Month Plan (14). Module 12 (Marketing & Pre-Launch) was folded into Marketing in TIM-1417. Module 14 (Opening Month Plan) was split from the old Launch Plan in TIM-1411.
export const AVAILABLE_MODULES: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14]);

export function isModuleAvailable(moduleNumber: number): boolean {
  return (
    Number.isInteger(moduleNumber) &&
    moduleNumber >= 1 &&
    moduleNumber <= TOTAL_MODULES &&
    AVAILABLE_MODULES.has(moduleNumber)
  );
}
