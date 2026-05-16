// Single source of truth for which plan modules have implemented content.
// Updating AVAILABLE_MODULES here keeps dashboard navigation in sync.

export const TOTAL_MODULES = 8;

// Modules with section content shipped to users.
export const AVAILABLE_MODULES: ReadonlySet<number> = new Set([1, 2]);

export function isModuleAvailable(moduleNumber: number): boolean {
  return (
    Number.isInteger(moduleNumber) &&
    moduleNumber >= 1 &&
    moduleNumber <= TOTAL_MODULES &&
    AVAILABLE_MODULES.has(moduleNumber)
  );
}
