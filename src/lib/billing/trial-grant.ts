// TIM-3447: credits and write access are one decision, not two.
//
// The 5 August audit found 23 users in `free_trial` with a null
// `trial_ends_at` and 0 users with write access. `hasWriteAccess` requires
// `free_trial` AND a future `trial_ends_at` — so a row with the status but no
// end date is a user who is nominally on a trial and cannot edit anything.
//
// The Stripe webhook grants 75 credits and write access in one statement,
// which is right. But the end date it writes comes straight from Stripe's
// `subscription.trial_end`, and the code already admits that field might not
// be a number (`typeof sub.trial_end === "number" ? … : null`). If it ever
// isn't, the user is granted 75 AI credits and a read-only product — credits
// they cannot spend, on a plan they just paid to start. That is the exact
// shape of the bug that produced 23 stranded signups.
//
// So the end date gets a floor. A trial that Stripe cannot date is still a
// seven-day trial, and the product should behave like one.
//
// No runtime `@/` imports — must stay loadable from `node --test`.

/** Board-set trial length (TIM-1902). Mirrors TRIAL_PERIOD_DAYS in stripe.ts. */
export const TRIAL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The `trial_ends_at` to write when granting a trial.
 *
 * Prefers what Stripe reported. Falls back to `now + 7 days` rather than null,
 * because null is not "we don't know when this ends" — downstream it means
 * "this user cannot edit anything", which is never the right reading of a
 * subscription Stripe just told us is trialing.
 *
 * @param stripeTrialEndSeconds `subscription.trial_end`, a UNIX timestamp.
 * @param now injected for testability.
 */
export function trialEndsAtIso(
  stripeTrialEndSeconds: number | null | undefined,
  now: Date = new Date(),
): string {
  if (typeof stripeTrialEndSeconds === "number" && Number.isFinite(stripeTrialEndSeconds)) {
    const fromStripe = new Date(stripeTrialEndSeconds * 1000);
    // A past or nonsensical date would lock the user out just as null does.
    if (!Number.isNaN(fromStripe.getTime()) && fromStripe > now) {
      return fromStripe.toISOString();
    }
  }
  return new Date(now.getTime() + TRIAL_DAYS * DAY_MS).toISOString();
}

/**
 * Every field a trial grant must set, built together so none can be forgotten.
 *
 * The point of returning one object is that there is no way to write the
 * credits without also writing the access, or vice versa. `trial-grant.test.mjs`
 * asserts the webhook spreads this rather than hand-listing the fields.
 */
export interface TrialGrant {
  subscription_status: "free_trial";
  subscription_tier: string;
  ai_credits_remaining: number;
  trial_ends_at: string;
  trial_credits_granted: true;
}

export function buildTrialGrant(args: {
  tier: string;
  credits: number;
  stripeTrialEndSeconds: number | null | undefined;
  now?: Date;
}): TrialGrant {
  return {
    subscription_status: "free_trial",
    subscription_tier: args.tier,
    ai_credits_remaining: args.credits,
    trial_ends_at: trialEndsAtIso(args.stripeTrialEndSeconds, args.now),
    trial_credits_granted: true,
  };
}
