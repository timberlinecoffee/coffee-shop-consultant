// Single source of truth for which plan modules have implemented content.
// Updating AVAILABLE_MODULES here keeps dashboard navigation in sync.

export const TOTAL_MODULES = 8;

// Modules with shipped pages — all six are available.
export const AVAILABLE_MODULES: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6]);

export function isModuleAvailable(moduleNumber: number): boolean {
  return (
    Number.isInteger(moduleNumber) &&
    moduleNumber >= 1 &&
    moduleNumber <= TOTAL_MODULES &&
    AVAILABLE_MODULES.has(moduleNumber)
  );
}
