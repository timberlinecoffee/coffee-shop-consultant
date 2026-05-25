// TIM-903: Plan readiness formula — completed sections / total expected sections.
//
// Formula: for each module in the manifest,
//   total  += totalSections ?? LOCKED_MODULE_WEIGHT
//   filled += completedByModule.get(moduleNumber) ?? 0
//
// Locked (unshipped) modules count LOCKED_MODULE_WEIGHT sections toward the
// denominator and 0 toward the numerator.  This prevents the overall
// readiness score from reading 100% when only the concept module is done.
//
// Extracted into its own file (no imports) so unit tests can import it
// without pulling in AVAILABLE_MODULES or the Next.js module graph.

export const LOCKED_MODULE_WEIGHT = 5;

export interface ReadinessManifestEntry {
  moduleNumber: number;
  totalSections: number | null;
}

export function computePlanReadiness(
  manifest: ReadonlyArray<ReadinessManifestEntry>,
  completedByModule: Map<number, number>
): { filled: number; total: number } {
  let filled = 0;
  let total = 0;
  for (const item of manifest) {
    total += item.totalSections ?? LOCKED_MODULE_WEIGHT;
    filled += completedByModule.get(item.moduleNumber) ?? 0;
  }
  return { filled, total };
}
