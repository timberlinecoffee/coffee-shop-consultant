// TIM-2287: Server-side guard for public.users.subscription_status writes.
//
// The DB constraint is:
//   CHECK (subscription_status IN ('free_trial','active','cancelled','expired','past_due','paused'))
//
// When a writer sends a value outside that set, Postgres returns a 23514 CHECK
// violation. That surfaces in the user's request as a generic 500 and in Vercel
// logs as a Supabase error blob with no clue who the offender was. This module
// validates the value before the write and emits a single structured log line
// with caller context so the offending route + Stripe event id are immediately
// identifiable.
//
// Allowed-set source of truth: supabase/migrations/20260604065949_tim1541_paused_status.sql

export const USER_SUBSCRIPTION_STATUSES = [
  "free_trial",
  "active",
  "cancelled",
  "expired",
  "past_due",
  "paused",
] as const;

export type UserSubscriptionStatus = (typeof USER_SUBSCRIPTION_STATUSES)[number];

export type SubscriptionStatusGuardContext = {
  // Free-form caller tag, e.g. "stripe.webhook.customer.subscription.updated".
  // Required so the structured log identifies the writer without a stack trace.
  caller: string;
  userId: string;
  stripeEventId?: string | null;
  stripeEventType?: string | null;
  stripeSubscriptionId?: string | null;
};

export class BadSubscriptionStatusError extends Error {
  readonly attempted: unknown;
  readonly context: SubscriptionStatusGuardContext;
  constructor(attempted: unknown, context: SubscriptionStatusGuardContext) {
    super(
      `users.subscription_status write refused: ${String(attempted)} not in allowed enum (caller=${context.caller})`,
    );
    this.name = "BadSubscriptionStatusError";
    this.attempted = attempted;
    this.context = context;
  }
}

export function isUserSubscriptionStatus(v: unknown): v is UserSubscriptionStatus {
  return (
    typeof v === "string" &&
    (USER_SUBSCRIPTION_STATUSES as readonly string[]).includes(v)
  );
}

// Validates `value` against the CHECK constraint and throws BadSubscriptionStatusError
// if it does not match. Before throwing, emits a single JSON line to the route's
// log stream (console.error) tagged `bad_subscription_status_write` so Vercel log
// search can find every refused write with one query.
//
// Use it as the LAST line before `supabase.from("users").update({ subscription_status })`.
// In Next.js route handlers without an outer try/catch, the throw surfaces as a
// 500 to the caller (and to Stripe, which then dead-letters the event via the
// stripe_processed_events unique index on retry) — that loud failure is the
// intended fail-closed behavior. Routes that need to swallow can wrap the call.
export function assertUserSubscriptionStatus(
  value: unknown,
  context: SubscriptionStatusGuardContext,
): asserts value is UserSubscriptionStatus {
  if (isUserSubscriptionStatus(value)) return;
  console.error(
    JSON.stringify({
      event: "bad_subscription_status_write",
      severity: "error",
      caller: context.caller,
      userId: context.userId,
      stripeEventId: context.stripeEventId ?? null,
      stripeEventType: context.stripeEventType ?? null,
      stripeSubscriptionId: context.stripeSubscriptionId ?? null,
      attempted:
        typeof value === "string"
          ? value
          : `(non-string ${typeof value})`,
      allowed: USER_SUBSCRIPTION_STATUSES,
    }),
  );
  throw new BadSubscriptionStatusError(value, context);
}
