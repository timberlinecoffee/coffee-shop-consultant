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
