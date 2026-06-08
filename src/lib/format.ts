/**
 * Capitalize the first letter of a name for display.
 * - All-lowercase input → capitalize first letter ("trent" → "Trent")
 * - Mixed or ALL CAPS → preserve as typed ("Trent" → "Trent", "TRENT" → "TRENT")
 */
export function capitalizeFirst(s: string): string {
  if (!s) return s;
  if (s === s.toLowerCase()) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return s;
}

// TIM-2475: shared percentage formatter — 1 dp, expects a 0-1 ratio.
// Matches the canonical `fmtPct` used in src/lib/cross-suite/hiring-financials.ts:76
// so identical underlying values render identically across surfaces.
export function fmtPct(ratio: number): string {
  return `${(Math.round(ratio * 1000) / 10).toFixed(1)}%`;
}
