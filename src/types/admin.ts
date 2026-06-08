// TIM-1942: Shared admin-portal types.

export type AdminMemberSummary = {
  id: string;
  email: string;
  full_name: string | null;
  subscription_status: string;
  subscription_tier: string;
  trial_ends_at: string | null;
  ai_credits_remaining: number;
  signup_source: string | null;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
  /** Inferred MRR in cents from current Stripe subscription, or 0. */
  mrr_cents: number;
};

export type AdminMemberDetail = AdminMemberSummary & {
  subscription: {
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    tier: string | null;
    status: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
  } | null;
  total_credits_used: number;
  recent_activity: Array<{ at: string; kind: string; description: string }>;
};

export type AdminSupportMessage = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  page_url: string | null;
  user_id: string | null;
  status: "new" | "open" | "closed" | "spam";
  handled_at: string | null;
  internal_notes: string | null;
};

export type AdminAuditRow = {
  id: string;
  created_at: string;
  actor_email: string;
  target_email: string | null;
  action: string;
  before_state: unknown;
  after_state: unknown;
  metadata: unknown;
};

export type ChangePlanRequest = {
  tier: "starter" | "pro";
  interval: "monthly" | "annual";
  proration: "create_prorations" | "none";
};

export type CancelRequest = {
  when: "immediate" | "period_end";
};
