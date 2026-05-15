// Single source of truth for which plan modules have implemented content.
// Updating AVAILABLE_MODULES here keeps dashboard navigation, the dynamic
// /plan/[moduleNumber] route, and the module client in sync.

export const TOTAL_MODULES = 8;

// Modules with section content shipped to users. Add a module number here
// when its sections are wired up in module-client.tsx and dashboard counts.
export const AVAILABLE_MODULES: ReadonlySet<number> = new Set([1, 2]);

export function isModuleAvailable(moduleNumber: number): boolean {
  return (
    Number.isInteger(moduleNumber) &&
    moduleNumber >= 1 &&
    moduleNumber <= TOTAL_MODULES &&
    AVAILABLE_MODULES.has(moduleNumber)
  );
}
