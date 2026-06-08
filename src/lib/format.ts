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

// TIM-2480: shared 1-5 scorecard formatter. Both LocationCard (averages) and
// TradeoffPanel (per-factor) must render the same underlying number identically.
// `display` is 1 dp ("3.4"); `pct` is the bar-width ratio in percent (0-100).
export function formatLocationScore(score: number): { display: string; pct: number } {
  const display = (Math.round(score * 10) / 10).toFixed(1);
  const pct = Math.max(0, Math.min(100, (score / 5) * 100));
  return { display, pct };
}
