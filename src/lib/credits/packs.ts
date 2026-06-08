// TIM-1687: one-off credit top-up catalog.
//
// Lets a user buy extra credits mid-month instead of waiting for the monthly
// reset or upgrading tier (spec requires upgrade OR buy-more-credits).
//
// This file is the single, CLIENT-SAFE source of truth for pack credits and
// display price — it imports no server/Stripe SDK, so the purchase modal can
// render the catalog directly. The Stripe price IDs are layered on top in
// src/lib/stripe.ts (server only, read from env), and the webhook resolves the
// granted credit amount from `creditsForPackKey` using our own checkout-session
// metadata — never from Stripe price metadata. That keeps the grant
// deterministic and independent of how the prices are provisioned.
//
// TIM-2309 (TIM-1898 plan rev 4 / TIM-2306, approval 47745142, 2026-06-04)
// re-priced the three packs as launch SKUs: 100/$19, 500/$79, 1,500/$199.
// Per-credit prices stay above the Starter ($0.39/credit) and Pro
// ($0.099/credit) monthly grants so upgrading is still the better value for
// heavy users.

export type CreditPackKey = "small" | "medium" | "large"

export interface CreditPackDef {
  key: CreditPackKey
  /** Title Case label (TIM-1002). */
  name: string
  /** Credits granted on purchase. */
  credits: number
  /** Display price in cents (matches the Stripe price provisioned for this pack). */
  amountCents: number
  /** TIM-2311 (per TIM-2310 design): optional badge — "Best Balanced" / "Best Value". */
  badge?: "balanced" | "value"
}

export const CREDIT_PACK_LIST: CreditPackDef[] = [
  { key: "small", name: "Small Pack", credits: 100, amountCents: 1900 },
  { key: "medium", name: "Medium Pack", credits: 500, amountCents: 7900, badge: "balanced" },
  { key: "large", name: "Large Pack", credits: 1500, amountCents: 19900, badge: "value" },
]

export const CREDIT_PACKS_BY_KEY: Record<CreditPackKey, CreditPackDef> =
  Object.fromEntries(CREDIT_PACK_LIST.map((p) => [p.key, p])) as Record<CreditPackKey, CreditPackDef>

export function isCreditPackKey(key: string): key is CreditPackKey {
  return key in CREDIT_PACKS_BY_KEY
}

/** Credits granted for a pack key, or null if the key is unknown. */
export function creditsForPackKey(key: string): number | null {
  return isCreditPackKey(key) ? CREDIT_PACKS_BY_KEY[key].credits : null
}

/** "$12" / "$39" — whole-dollar packs render without trailing cents. */
export function formatPackPrice(amountCents: number): string {
  const dollars = amountCents / 100
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}
