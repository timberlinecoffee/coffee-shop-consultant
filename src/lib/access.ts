// Subscription-tier access policy. Single source of truth for which modules
// and sections a tier can reach — consumed by the /plan route guard and the
// client-side gating UI. Keep this aligned with the schema's allowed values
// in `users.subscription_tier`: 'free' | 'starter' | 'growth' | 'pro'.
//
// Write-gate rule (TIM-643): workspace mutations require subscription_status === 'active'.
// free_trial, cancelled, expired, and paused are all read-only.
// TIM-1541: 'paused' added — user keeps tier access for reads but cannot mutate.
export type SubscriptionStatus = 'free_trial' | 'active' | 'cancelled' | 'expired' | 'paused';

export function isSubscriptionActive(status: string | null | undefined): boolean {
  return status === 'active';
}

// TIM-1541: When a subscription is paused the user retains read access at
// the tier they were on before pausing.  For all other statuses, the tier
// stored on the user record is authoritative.
export function effectiveTierForRead(user: {
  subscription_status: string | null | undefined;
  subscription_tier: string | null | undefined;
  paused_from_tier?: string | null;
}): string {
  if (user.subscription_status === 'paused' && user.paused_from_tier) {
    return user.paused_from_tier;
  }
  return normalizeTier(user.subscription_tier);
}

// TIM-925: Beta waiver bypass — true when betaWaiverUntil is a future timestamp.
// Checked in paywall gates before enforcing subscription_status.
export function isBetaWaived(betaWaiverUntil: string | Date | null | undefined): boolean {
  if (!betaWaiverUntil) return false;
  const expiry = typeof betaWaiverUntil === 'string' ? new Date(betaWaiverUntil) : betaWaiverUntil;
  return expiry > new Date();
}

// Canonical set of workspace keys that require an active subscription to mutate.
// TIM-1458: 'inventory' removed — Supplies is now a page inside the
// Equipment & Supplies suite, gated by the same 'buildout_equipment' key.
export const MUTABLE_WORKSPACE_KEYS = new Set([
  'concept',
  'location_lease',
  'financials',
  'menu_pricing',
  'buildout_equipment',
  'opening_month_plan',
  'hiring',
  'marketing',
  'suppliers',
  'operations_playbook',
] as const);

export type SubscriptionTier = "free" | "starter" | "growth" | "pro";

const PAID_TIERS = new Set<SubscriptionTier>(["starter", "growth", "pro"]);

// Free users get a single preview module so they can experience the product
// before paying. Anything beyond this is a paid route.
export const FREE_PREVIEW_MODULE = 1;

// Inside the preview module, only this section is fully readable for free.
// The remaining sections render an upgrade gate.
export const FREE_PREVIEW_SECTION_KEYS: ReadonlySet<string> = new Set([
  "shop_type",
]);

export function normalizeTier(tier: string | null | undefined): SubscriptionTier {
  if (tier === "starter" || tier === "growth" || tier === "pro") return tier;
  return "free";
}

export function isPaidTier(tier: string | null | undefined): boolean {
  return PAID_TIERS.has(normalizeTier(tier));
}

// Can the user navigate to /plan/{moduleNumber} at all? Paid users can reach
// any module that has shipped content; free users only reach the preview.
export function canAccessModule(
  tier: string | null | undefined,
  moduleNumber: number
): boolean {
  if (isPaidTier(tier)) return true;
  return moduleNumber === FREE_PREVIEW_MODULE;
}

// Can the user open a specific section's content (vs. seeing the paywall)?
export function canAccessSection(
  tier: string | null | undefined,
  moduleNumber: number,
  sectionKey: string
): boolean {
  if (isPaidTier(tier)) return true;
  if (moduleNumber !== FREE_PREVIEW_MODULE) return false;
  return FREE_PREVIEW_SECTION_KEYS.has(sectionKey);
}

// Where to send a free user who hits a paid surface. Centralized so the
// upgrade link in copy and the redirect target never drift apart.
export const UPGRADE_PATH = "/pricing";

// TIM-1825: Free-trial users receive a one-time grant of this many AI credits,
// then spend them per-action through the same variable credit path as paid
// tiers (src/lib/credits/cost.ts). Replaces the old 5-message
// COPILOT_FREE_TRIAL_LIMIT counter — a 15-credit grant is only meaningful if
// trial actions debit variable cost (short chat ~1 · long gen ~2 · deep
// research ~12) rather than counting messages. The one-time grant is applied
// lazily and idempotently via `ensureTrialGrant` (src/lib/credits/trial.ts),
// gated on the `users.trial_credits_granted` flag.
export const TRIAL_GRANT_CREDITS = 15;
