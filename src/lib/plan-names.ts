// Single source of truth for plan tier display names.
// Internal tier keys (free | starter | growth | pro) live in src/lib/access.ts.
// Stripe plan config (prices, intervals) lives in src/lib/stripe.ts.
export const PLAN_DISPLAY_NAMES: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
};
