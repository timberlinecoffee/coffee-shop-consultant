// TIM-3245: resolve per-category COGS target fraction for the pricing recommender.
// The fraction is used as: price_floor = Math.ceil(cogs_cents / fraction).
//
// Fallback (25% = 75% gross margin) matches the pre-TIM-3245 hardcoded global.

export const DEFAULT_COGS_FRACTION = 0.25

/**
 * Resolve the COGS target as a fraction (0..1) from a category's low/high pct
 * range. Returns the midpoint fraction when both bounds are set; falls back to
 * DEFAULT_COGS_FRACTION (25%) when either is null.
 */
export function resolveCogsFraction(
  lowPct: number | null | undefined,
  highPct: number | null | undefined,
): number {
  if (lowPct != null && highPct != null) {
    const midPct = (Number(lowPct) + Number(highPct)) / 2
    if (midPct > 0 && midPct < 100) return midPct / 100
  }
  return DEFAULT_COGS_FRACTION
}

/**
 * Minimum retail price in cents that satisfies the COGS target fraction.
 * price = ceil(cogs / fraction) → cogs / price <= fraction.
 */
export function computeMarginFloorCents(
  cogsCents: number,
  cogsTargetFraction: number,
): number {
  return Math.ceil(cogsCents / cogsTargetFraction)
}
