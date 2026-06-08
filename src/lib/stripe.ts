import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-03-25.dahlia",
    });
  }
  return _stripe;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string, unknown>)[prop as string];
  },
});

// Groundwork pricing: Starter / Pro x monthly / annual. Approved by board on
// TIM-1898 §8 (confirmation 09434556, 2026-06-03). TIM-1902 collapsed the
// three-tier ladder to two. TIM-1954 raised annual to $399 / $999. TIM-2309
// (TIM-1898 plan rev 4 / TIM-2306, approval 47745142, 2026-06-04) re-priced
// annual at a 20% discount: Starter $375/yr ($39 × 12 × 0.80 = $374.40,
// rounded up), Pro $950/yr ($99 × 12 × 0.80 = $950.40, rounded down). Monthly
// stays $39 / $99. The old $399 / $999 annual prices (themselves never
// launched live) are archived in Stripe; STRIPE_STARTER_ANNUAL_PRICE_ID /
// STRIPE_PRO_ANNUAL_PRICE_ID are repointed to the new $375 / $950 IDs. Any
// subscriber already on an archived annual price is grandfathered for the
// lifetime of their current subscription.
export const PLANS = {
  starter_monthly: {
    name: "Starter",
    tier: "starter" as const,
    interval: "monthly" as const,
    priceId: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID ?? "",
    amount: 3900,
  },
  starter_annual: {
    name: "Starter",
    tier: "starter" as const,
    interval: "annual" as const,
    priceId: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID ?? "",
    amount: 37500,
  },
  pro_monthly: {
    name: "Pro",
    tier: "pro" as const,
    interval: "monthly" as const,
    priceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "",
    amount: 9900,
  },
  pro_annual: {
    name: "Pro",
    tier: "pro" as const,
    interval: "annual" as const,
    priceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? "",
    amount: 95000,
  },
} as const;

export type PlanKey = keyof typeof PLANS;
export type Tier = "starter" | "pro" | "free";

export function planKeyFromParams(tier: string, interval: string): PlanKey | null {
  const key = `${tier}_${interval}` as PlanKey;
  return key in PLANS ? key : null;
}

export function tierFromPriceId(priceId: string): Tier {
  for (const plan of Object.values(PLANS)) {
    if (plan.priceId && plan.priceId === priceId) return plan.tier;
  }
  return "free";
}

// TIM-1663: the set of configured annual price IDs. The renewal-reminder job
// uses this to confirm a subscriber is still on an annual plan before reminding
// (a subscriber can opt in while annual, then switch to monthly).
export const ANNUAL_PRICE_IDS: ReadonlySet<string> = new Set(
  Object.values(PLANS)
    .filter((plan) => plan.interval === "annual" && plan.priceId)
    .map((plan) => plan.priceId),
);

export function isAnnualPriceId(priceId: string | null | undefined): boolean {
  return !!priceId && ANNUAL_PRICE_IDS.has(priceId);
}

// TIM-929: No tier is unlimited. Every paid tier has a hard monthly credit cap.
// TIM-1902 bumped Starter 50 → 100. TIM-1954 briefly equalized Pro to 100/mo.
// TIM-2309 (TIM-1898 plan rev 4 / TIM-2306, approval 47745142, 2026-06-04)
// restored a real credit gap: Starter stays 100/mo, Pro becomes 1,000/mo —
// 10× the Starter grant. This makes the Pro upgrade compelling for heavy Scout
// users without removing Pro's feature differentiation (Coffee Shop World,
// Office Hours, deeper insights, priority support, multi-project). Existing
// subscribers' next renewal moves them to the new grant (the monthly /
// renewal branch of the webhook resets ai_credits_remaining to
// MONTHLY_CREDITS[tier]).
//
// The 75-credit trial grant (see TRIAL_CREDITS) is replaced by
// MONTHLY_CREDITS[tier] on day-7 conversion.
export const MONTHLY_CREDITS: Record<Tier, number> = {
  starter: 100,
  pro: 1000,
  free: 0,
};

// TIM-1902: 7-day free trial — Stripe owns the timer via trial_period_days on
// subscription creation. Card is required at signup; Stripe auto-charges on day
// 7. Replaces the legacy message-count free trial from TIM-866.
export const TRIAL_PERIOD_DAYS = 7;

// TIM-1902: one-time credit allotment granted on trial start (regardless of
// chosen plan). On conversion the webhook replaces this with
// MONTHLY_CREDITS[chosen_tier]. Supersedes the 15-credit grant from TIM-1825.
export const TRIAL_CREDITS = 75;

// TIM-1544: Pause plan price — $2.99/mo. Set via STRIPE_PAUSE_MONTHLY_PRICE_ID.
export const PAUSE_PRICE_ID = process.env.STRIPE_PAUSE_MONTHLY_PRICE_ID ?? "";

// TIM-1687: one-off credit top-up prices. Provision three one-time prices in
// Stripe (small / medium / large pack — see src/lib/credits/packs.ts for the
// credit amount and dollar price each must match) and set the IDs in env. The
// credit catalog itself lives in packs.ts (client-safe); only the Stripe price
// IDs live here, mirroring the PLANS pattern so a price revision is config-only.
import type { CreditPackKey } from "@/lib/credits/packs";

export function creditPackPriceId(key: CreditPackKey): string {
  switch (key) {
    case "small":
      return process.env.STRIPE_CREDITS_SMALL_PRICE_ID ?? "";
    case "medium":
      return process.env.STRIPE_CREDITS_MEDIUM_PRICE_ID ?? "";
    case "large":
      return process.env.STRIPE_CREDITS_LARGE_PRICE_ID ?? "";
  }
}

// Returns the monthly price ID for a given tier, or null if not found.
export function monthlyPriceIdForTier(tier: string): string | null {
  for (const plan of Object.values(PLANS)) {
    if (plan.tier === tier && plan.interval === "monthly") return plan.priceId || null;
  }
  return null;
}
