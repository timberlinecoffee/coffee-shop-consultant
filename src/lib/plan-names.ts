// Single source of truth for plan tier display names.
// Internal tier keys (free | starter | pro) live in src/lib/access.ts.
// Stripe plan config (prices, intervals) lives in src/lib/stripe.ts.
// TIM-1902: Growth collapsed into Pro at the $99 price.
export const PLAN_DISPLAY_NAMES: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
};
