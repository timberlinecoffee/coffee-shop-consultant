// Rewardful affiliate tracking globals (TIM-1620).
// Installed client-side by `RewardfulScript`. `referral` is the referral id that
// gets forwarded to Stripe as `client_reference_id` at checkout.
export {};

declare global {
  interface Window {
    Rewardful?: {
      referral?: string;
      affiliate?: unknown;
      [key: string]: unknown;
    };
    rewardful?: (...args: unknown[]) => void;
  }
}
