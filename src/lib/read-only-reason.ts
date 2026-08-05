// TIM-3442: why editing is locked, stated truthfully.
//
// Before this, every read-only surface hardcoded one sentence: "Your
// subscription is paused so we've locked editing. Reactivate to keep editing."
// That sentence is wrong for the most common case in the product.
//
// The first-run audit on 2026-08-05 found 23 users in `free_trial` with a null
// `trial_ends_at`, and 0 users with write access. Every one of them signed up,
// walked eleven onboarding steps, and was then told that a subscription they
// had never held was paused, and invited to "reactivate" something they had
// never activated. Both halves of the sentence were false, and the half that
// implied anything implied an accusation — that they had let a payment lapse.
//
// This is not the trial gate being wrong. TIM-1902 made the 7-day trial
// card-required by board decision (TIM-1898 §8, confirmation 09434556), so a
// signed-up-but-cardless user holding read-only access is the design working
// as approved. What was wrong is that the design never said so. A paywall that
// misdescribes itself cannot sell anything, and 23 signups against 0
// conversions is what that looks like from the inside.
//
// So: derive the message from the actual state, and give each state a true
// sentence and an accurate call to action. No runtime `@/` imports — this must
// stay loadable from `node --test` (see AGENTS.md on pure, testable modules).

export type ReadOnlyKind =
  | "editable"
  | "never_started_trial"
  | "trial_ended"
  | "paused"
  | "cancelled"
  | "past_due"
  | "locked";

export interface ReadOnlyCopy {
  kind: ReadOnlyKind;
  /** Bold first line. Null only when the user can edit. */
  heading: string | null;
  /** Explanatory sentence. Never asserts a state the user is not in. */
  body: string | null;
  /** Link text. Never says "reactivate" to someone who never activated. */
  ctaLabel: string | null;
}

export interface AccessSnapshot {
  subscription_status: string | null | undefined;
  trial_ends_at?: string | Date | null;
}

const EDITABLE: ReadOnlyCopy = {
  kind: "editable",
  heading: null,
  body: null,
  ctaLabel: null,
};

const TRIAL_ENDED: ReadOnlyCopy = {
  kind: "trial_ended",
  heading: "Your free trial has ended",
  body: "Everything you built is saved. Choosing a plan turns editing back on.",
  ctaLabel: "Choose a plan",
};

/** True when `trialEndsAt` is a usable timestamp in the future. */
export function trialIsLive(
  trialEndsAt: string | Date | null | undefined,
): boolean {
  if (!trialEndsAt) return false;
  const expiry =
    typeof trialEndsAt === "string" ? new Date(trialEndsAt) : trialEndsAt;
  if (Number.isNaN(expiry.getTime())) return false;
  return expiry > new Date();
}

/**
 * The one sentence a locked surface is allowed to say.
 *
 * Deliberately mirrors `hasWriteAccess` in ./access.ts: the same two states
 * return `editable` here that return `true` there. read-only-reason.test.mjs
 * asserts that agreement across every status, because a message that
 * disagrees with the gate it describes is exactly the bug this replaces.
 */
export function readOnlyReason(user: AccessSnapshot): ReadOnlyCopy {
  const status = user.subscription_status ?? null;

  if (status === "active") return EDITABLE;
  if (status === "free_trial" && trialIsLive(user.trial_ends_at)) return EDITABLE;

  switch (status) {
    case "free_trial":
      // A trial with an end date in the past is a finished trial, not an
      // unstarted one. Telling someone to "start" a trial they already spent
      // reads as though their week never happened.
      if (user.trial_ends_at) return TRIAL_ENDED;

      // The common case, and the one the old copy libelled: signed up, has not
      // started the card-backed trial. Nothing is wrong with their account —
      // they simply have not begun. Say that, and offer what they came for.
      return {
        kind: "never_started_trial",
        heading: "Start your free trial to edit this",
        body: "You can read everything here. Starting your 7-day free trial unlocks editing across all eleven workspaces.",
        ctaLabel: "Start my free trial",
      };

    case "paused":
      return {
        kind: "paused",
        heading: "Editing is paused",
        body: "You paused your subscription, so we've kept everything here and locked editing.",
        ctaLabel: "Resume my subscription",
      };

    case "cancelled":
      return {
        kind: "cancelled",
        heading: "Your subscription has ended",
        body: "Your plan is still here and always will be. Restart any time to pick up editing where you left off.",
        ctaLabel: "Choose a plan",
      };

    case "past_due":
      return {
        kind: "past_due",
        heading: "We couldn't take your last payment",
        body: "Editing is locked until the payment goes through. Updating your card fixes it straight away.",
        ctaLabel: "Update my payment details",
      };

    case "expired":
      return TRIAL_ENDED;

    // Unknown or missing status. Say only what is certainly true — never
    // invent a reason, which is the mistake this module exists to undo.
    default:
      return {
        kind: "locked",
        heading: "This is a read-only view",
        body: "Editing isn't available on your account right now.",
        ctaLabel: "See your options",
      };
  }
}
