// Single source of truth for which plan modules have implemented content.
// Updating AVAILABLE_MODULES here keeps dashboard navigation in sync.

export const TOTAL_MODULES = 13;

// Modules with shipped pages — Concept, Financials, Location, Menu, Buildout, Launch, Hiring, Business Plan, Marketing, Suppliers & Vendors, Operations Playbook, Inventory. Module 12 (Marketing & Pre-Launch) was folded into Marketing in TIM-1417.
export const AVAILABLE_MODULES: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13]);

export function isModuleAvailable(moduleNumber: number): boolean {
  return (
    Number.isInteger(moduleNumber) &&
    moduleNumber >= 1 &&
    moduleNumber <= TOTAL_MODULES &&
    AVAILABLE_MODULES.has(moduleNumber)
  );
}
