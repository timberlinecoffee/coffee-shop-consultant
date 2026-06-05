// Subscription-tier access policy. Single source of truth for which modules
// and sections a tier can reach — consumed by the /plan route guard and the
// client-side gating UI. Keep this aligned with the schema's allowed values
// in `users.subscription_tier`: 'free' | 'starter' | 'pro'.
//
// Write-gate rule (TIM-643): workspace mutations require subscription_status === 'active'.
// free_trial, cancelled, expired, and paused are all read-only.
// TIM-1541: 'paused' added — user keeps tier access for reads but cannot mutate.
// TIM-1902: free_trial users on a Stripe-backed 7-day trial are treated as
// 'active' for write access (their card is on file; Stripe will auto-charge on
// day 7) and as Pro for feature gates regardless of chosen plan.
export type SubscriptionStatus = 'free_trial' | 'active' | 'cancelled' | 'expired' | 'paused';

export function isSubscriptionActive(status: string | null | undefined): boolean {
  return status === 'active';
}

// TIM-1902: write-gate predicate. True when the user is fully active OR on a
// card-backed 7-day trial (free_trial with a future trial_ends_at). Pre-1902
// free_trial users had no card and message-count gating; this helper preserves
// that callers can opt in to the new gate without touching every existing site.
export function hasWriteAccess(user: {
  subscription_status: string | null | undefined;
  trial_ends_at?: string | Date | null;
}): boolean {
  if (user.subscription_status === 'active') return true;
  if (user.subscription_status === 'free_trial' && isTrialActive(user.trial_ends_at)) {
    return true;
  }
  return false;
}

export function isTrialActive(trialEndsAt: string | Date | null | undefined): boolean {
  if (!trialEndsAt) return false;
  const expiry = typeof trialEndsAt === 'string' ? new Date(trialEndsAt) : trialEndsAt;
  return expiry > new Date();
}

// TIM-1541: When a subscription is paused the user retains read access at
// the tier they were on before pausing. For all other statuses, the tier
// stored on the user record is authoritative.
// TIM-1902: During a 7-day card-backed trial, return 'pro' so trialists get
// full Pro features regardless of the plan they'll convert to.
export function effectiveTierForRead(user: {
  subscription_status: string | null | undefined;
  subscription_tier: string | null | undefined;
  paused_from_tier?: string | null;
  trial_ends_at?: string | Date | null;
}): string {
  if (user.subscription_status === 'paused' && user.paused_from_tier) {
    return user.paused_from_tier;
  }
  if (user.subscription_status === 'free_trial' && isTrialActive(user.trial_ends_at)) {
    return 'pro';
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
  'business_plan',
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

export type SubscriptionTier = "free" | "starter" | "pro";

const PAID_TIERS = new Set<SubscriptionTier>(["starter", "pro"]);

// Free users get a single preview module so they can experience the product
// before paying. Anything beyond this is a paid route.
export const FREE_PREVIEW_MODULE = 1;

// Inside the preview module, only this section is fully readable for free.
// The remaining sections render an upgrade gate.
export const FREE_PREVIEW_SECTION_KEYS: ReadonlySet<string> = new Set([
  "shop_type",
]);

export function normalizeTier(tier: string | null | undefined): SubscriptionTier {
  if (tier === "starter" || tier === "pro") return tier;
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

// TIM-1902: legacy message-count free-trial limit, kept exported for UI
// surfaces that still read `copilot_trial_messages_used` (chat widget badge,
// account page). The new card-on-file trial does not increment this counter —
// trialists are gated on ai_credits_remaining. New AI routes should use
// hasWriteAccess() instead. Removing this export is a follow-up sweep.
export const COPILOT_FREE_TRIAL_LIMIT = 5;

// TIM-1955: canonical Starter/Pro Pro-feature gate. Wraps effectiveTierForRead
// so callers gating Pro-only surfaces have a single predicate that already
// honors trial-as-Pro (TIM-1902) and paused_from_tier (TIM-1541). Free is out
// of scope here — Free users can't reach any of the Pro-only routes anyway —
// but normalizeTier still maps unknown values to 'free' so this is safe to
// strict-compare with === 'pro' for the gate.
export function effectivePlanForGating(user: {
  subscription_status: string | null | undefined;
  subscription_tier: string | null | undefined;
  paused_from_tier?: string | null;
  trial_ends_at?: string | Date | null;
}): SubscriptionTier {
  return normalizeTier(effectiveTierForRead(user));
}
