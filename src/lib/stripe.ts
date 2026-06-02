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

// Groundwork pricing: Starter / Growth / Pro x monthly / annual
// Price IDs are stored in env so revising a price (e.g. Pro) is a config change only.
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
    amount: 29900,
  },
  growth_monthly: {
    name: "Growth",
    tier: "growth" as const,
    interval: "monthly" as const,
    priceId: process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID ?? "",
    amount: 9900,
  },
  growth_annual: {
    name: "Growth",
    tier: "growth" as const,
    interval: "annual" as const,
    priceId: process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID ?? "",
    amount: 79900,
  },
  pro_monthly: {
    name: "Pro",
    tier: "pro" as const,
    interval: "monthly" as const,
    priceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "",
    amount: 19900,
  },
  pro_annual: {
    name: "Pro",
    tier: "pro" as const,
    interval: "annual" as const,
    priceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? "",
    amount: 159900,
  },
} as const;

export type PlanKey = keyof typeof PLANS;
export type Tier = "starter" | "growth" | "pro" | "free";

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
// TIM-1821: Launch grants confirmed by Trent on TIM-1727 (confirmation cce3d4a7,
// accepted 2026-06-02). Supersedes board approval e47bfbba (proposed 25/100/500).
export const MONTHLY_CREDITS: Record<Tier, number> = {
  starter: 50,
  growth: 150,
  pro: 500,
  free: 0,
};

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
