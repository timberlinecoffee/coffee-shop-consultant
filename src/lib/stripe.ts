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

export const PLANS = {
  builder_monthly: {
    name: "Builder",
    priceId: process.env.STRIPE_BUILDER_MONTHLY_PRICE_ID ?? "",
    amount: 4900,
    interval: "month" as const,
  },
  builder_annual: {
    name: "Builder",
    priceId: process.env.STRIPE_BUILDER_ANNUAL_PRICE_ID ?? "",
    amount: 46800,
    interval: "year" as const,
  },
  accelerator_monthly: {
    name: "Accelerator",
    priceId: process.env.STRIPE_ACCELERATOR_MONTHLY_PRICE_ID ?? "",
    amount: 9900,
    interval: "month" as const,
  },
  accelerator_annual: {
    name: "Accelerator",
    priceId: process.env.STRIPE_ACCELERATOR_ANNUAL_PRICE_ID ?? "",
    amount: 94800,
    interval: "year" as const,
  },
} as const;

export type PlanKey = keyof typeof PLANS;

export function tierFromPriceId(priceId: string): "builder" | "accelerator" | "free" {
  if (
    priceId === PLANS.builder_monthly.priceId ||
    priceId === PLANS.builder_annual.priceId
  ) return "builder";
  if (
    priceId === PLANS.accelerator_monthly.priceId ||
    priceId === PLANS.accelerator_annual.priceId
  ) return "accelerator";
  return "free";
}

export const MONTHLY_CREDITS: Record<string, number> = {
  builder: 50,
  accelerator: 0,
  free: 0,
};
