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

export const MONTHLY_CREDITS: Record<Tier, number> = {
  starter: 25,
  growth: 100,
  pro: 0,    // unlimited — tracked differently
  free: 0,
};
