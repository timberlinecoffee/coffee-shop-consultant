// Subscription-tier access policy. Single source of truth for which modules
// and sections a tier can reach — consumed by the /plan route guard and the
// client-side gating UI. Keep this aligned with the schema's allowed values
// in `users.subscription_tier`: 'free' | 'starter' | 'growth' | 'pro'.
//
// Write-gate rule (TIM-643): workspace mutations require subscription_status === 'active'.
// free_trial, cancelled, and expired are all read-only.
export type SubscriptionStatus = 'free_trial' | 'active' | 'cancelled' | 'expired';

export function isSubscriptionActive(status: string | null | undefined): boolean {
  return status === 'active';
}

// Canonical set of workspace keys that require an active subscription to mutate.
export const MUTABLE_WORKSPACE_KEYS = new Set([
  'concept',
  'location_lease',
  'financials',
  'menu_pricing',
  'buildout_equipment',
  'launch_plan',
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
