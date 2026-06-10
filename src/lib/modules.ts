// Single source of truth for which plan modules have implemented content.
// Updating AVAILABLE_MODULES here keeps dashboard navigation in sync.

export const TOTAL_MODULES = 14;

// Modules with shipped pages — Concept, Financials, Location, Menu, Buildout, Opening Month Plan (6), Hiring, Business Plan, Marketing, Suppliers & Vendors, Operations Playbook, Inventory. Module 12 (Marketing & Pre-Launch) was folded into Marketing in TIM-1417; slot 12 is now Benchmarks (TIM-2498). The TIM-1411 split of Opening Milestones (6) + Opening Month Plan (14) was merged back into a single Opening Month Plan suite at slot 6 in TIM-1449.
// Module 99: TIM-2595 Build workspace (v2 consolidated nav entry, outside the 1–14 plan range).
export const AVAILABLE_MODULES: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 99]);

export function isModuleAvailable(moduleNumber: number): boolean {
  return (
    Number.isInteger(moduleNumber) &&
    moduleNumber >= 1 &&
    moduleNumber <= TOTAL_MODULES &&
    AVAILABLE_MODULES.has(moduleNumber)
  );
}
