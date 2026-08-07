// TIM-3445: what the AI writer says when it cannot write.
//
// The 5 August UX audit found the worst moment in the product here. When a
// user's credits run out, `/api/copilot/improve` returns HTTP 402 with a
// precise, machine-readable `code: "out_of_credits"` — and the callout threw
// the code away, rendered a hardcoded "Something went wrong", and offered a
// single button, "Try Again", which cannot ever succeed. Nothing had gone
// wrong; the user had spent an allowance. They were told their software was
// broken at the exact moment they were most willing to pay, and the one
// action that would have worked appeared nowhere on the screen.
//
// This is the same defect as TIM-3442 (the read-only banner asserting a
// paused subscription to people who never had one) and it is the same fix:
// derive the message from the state the server actually reported, and give
// every state a true sentence and an action that can succeed.
//
// It is also the same *structural* defect this codebase keeps producing: a
// contract with two sides — the route that emits codes, the component that
// maps them — and no test comparing the two. `ai-error-copy.test.mjs` reads
// the route source, extracts every code it can emit, and fails if this module
// does not know that code. That check is the point of the file.
//
// No runtime `@/` imports: this must stay loadable from `node --test`.

/**
 * Every error code `/api/copilot/improve` can emit, plus `network`, which the
 * client raises when the fetch itself fails.
 *
 * Adding a code to the route without adding it here fails the paired test.
 */
export const AI_ERROR_CODES = [
  "out_of_credits",
  "paywall",
  "account_missing",
  "rate_limited",
  "unauthorized",
  "bad_request",
  "timeout",
  "upstream_error",
  "network",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

/** Why write access is refused, as reported by the route's paywall frame. */
export type PaywallReason = "no_subscription" | "paused" | "expired";

export interface AiErrorFrame {
  code?: string | null;
  message?: string | null;
  reason?: string | null;
  retryAfterSec?: number | null;
}

export interface AiErrorCopy {
  /** Bold first line. Never claims a failure that did not happen. */
  heading: string;
  /** One explanatory sentence. */
  body: string;
  /** Primary action label. Always something that can actually succeed. */
  primaryLabel: string;
  /**
   * Where the primary action goes. `null` means the primary action is handled
   * in-app rather than by navigation — see `primaryAction`.
   */
  primaryHref: string | null;
  /** In-app behaviour for the primary button when `primaryHref` is null. */
  primaryAction: "retry" | "buy_credits" | null;
  /** A quieter second option, offered only where a second option is real. */
  secondaryLabel: string | null;
  secondaryHref: string | null;
  /**
   * True only for states a retry could plausibly clear. The audit's finding
   * was a "Try Again" button on a state that retrying can never fix; this
   * flag is what stops that from being expressible.
   */
  retryable: boolean;
  /** Renders the error in the alarm palette. False for expected states. */
  isFailure: boolean;
}

/** Where a user goes to choose or change a plan. Mirrors `UPGRADE_PATH`. */
const PLANS = "/pricing";
const BILLING = "/account/billing";

/**
 * Turn the server's error frame into something a first-time coffee shop owner
 * can read and act on.
 *
 * The two rules this function exists to enforce:
 *   1. An expected state is never dressed as a system failure.
 *   2. The button offered is one that can work.
 */
export function aiErrorCopy(frame: AiErrorFrame): AiErrorCopy {
  const code = (frame.code ?? "") as AiErrorCode | "";

  switch (code) {
    // Not a failure. The user spent an allowance, which is the allowance
    // working. Two real ways forward, both offered.
    case "out_of_credits":
      return {
        heading: "You've used this month's AI credits",
        body: "Your credits reset on the 1st. You can top up now if you'd rather not wait.",
        primaryLabel: "Top up credits",
        primaryHref: null,
        primaryAction: "buy_credits",
        secondaryLabel: "See plans",
        secondaryHref: PLANS,
        retryable: false,
        isFailure: false,
      };

    // Also not a failure — this is the paywall doing its job. Which sentence
    // is true depends on why, so say the true one. Mirrors readOnlyReason().
    case "paywall":
      if (frame.reason === "paused") {
        return {
          heading: "Editing is paused",
          body: "You paused your subscription, so writing with AI is paused too. Everything you've written is saved.",
          primaryLabel: "Resume my subscription",
          primaryHref: BILLING,
          primaryAction: null,
          secondaryLabel: null,
          secondaryHref: null,
          retryable: false,
          isFailure: false,
        };
      }
      if (frame.reason === "expired") {
        return {
          heading: "Your free trial has ended",
          body: "Everything you built is saved. Choosing a plan turns writing back on.",
          primaryLabel: "Choose a plan",
          primaryHref: PLANS,
          primaryAction: null,
          secondaryLabel: null,
          secondaryHref: null,
          retryable: false,
          isFailure: false,
        };
      }
      return {
        heading: "Start your free trial to write with AI",
        body: "Writing and improving text is part of the 7-day trial. Anything you've typed stays exactly where it is.",
        primaryLabel: "Start my free trial",
        primaryHref: PLANS,
        primaryAction: null,
        secondaryLabel: null,
        secondaryHref: null,
        retryable: false,
        isFailure: false,
      };

    // This one IS our problem. It used to be emitted under `code: "quota"`,
    // which told a user with a missing profile row that they were out of
    // credits — a false statement pointing them at a purchase that would not
    // have helped. Renamed at the route in the same change as this file.
    case "account_missing":
      return {
        heading: "We couldn't load your account",
        body: "This is on our side, not yours. Reloading usually clears it — if it doesn't, get in touch and we'll sort it.",
        primaryLabel: "Try again",
        primaryHref: null,
        primaryAction: "retry",
        secondaryLabel: null,
        secondaryHref: null,
        retryable: true,
        isFailure: true,
      };

    case "rate_limited": {
      const secs = frame.retryAfterSec ?? null;
      return {
        heading: "That's a lot of writing at once",
        body:
          secs && secs > 0
            ? `Give it about ${secs} second${secs === 1 ? "" : "s"} and try again.`
            : "Give it a few seconds and try again.",
        primaryLabel: "Try again",
        primaryHref: null,
        primaryAction: "retry",
        secondaryLabel: null,
        secondaryHref: null,
        retryable: true,
        isFailure: false,
      };
    }

    case "unauthorized":
      return {
        heading: "Please sign in again",
        body: "Your session expired while you were working. Signing back in brings you straight back here.",
        primaryLabel: "Sign in",
        primaryHref: "/login",
        primaryAction: null,
        secondaryLabel: null,
        secondaryHref: null,
        retryable: false,
        isFailure: false,
      };

    case "timeout":
      return {
        heading: "That took too long",
        body: "The AI didn't answer in time. Nothing was changed — your text is untouched.",
        primaryLabel: "Try again",
        primaryHref: null,
        primaryAction: "retry",
        secondaryLabel: null,
        secondaryHref: null,
        retryable: true,
        isFailure: true,
      };

    case "upstream_error":
      return {
        heading: "The AI service is having a moment",
        body: "This is a hiccup on their end. Your text is untouched — trying again in a minute usually works.",
        primaryLabel: "Try again",
        primaryHref: null,
        primaryAction: "retry",
        secondaryLabel: null,
        secondaryHref: null,
        retryable: true,
        isFailure: true,
      };

    case "network":
      return {
        heading: "Lost the connection",
        body: "Check you're online and try again. Nothing you've typed was lost.",
        primaryLabel: "Try again",
        primaryHref: null,
        primaryAction: "retry",
        secondaryLabel: null,
        secondaryHref: null,
        retryable: true,
        isFailure: true,
      };

    case "bad_request":
      return {
        heading: "We couldn't send that",
        body:
          frame.message ??
          "Something about that request didn't look right. Try again, and let us know if it keeps happening.",
        primaryLabel: "Try again",
        primaryHref: null,
        primaryAction: "retry",
        secondaryLabel: null,
        secondaryHref: null,
        retryable: true,
        isFailure: true,
      };

    // Unknown code. Say only what is certainly true, and offer the one action
    // that is safe to offer when we don't know what happened.
    default:
      return {
        heading: "Something went wrong",
        body: frame.message ?? "We're not sure what happened. Your text is untouched.",
        primaryLabel: "Try again",
        primaryHref: null,
        primaryAction: "retry",
        secondaryLabel: null,
        secondaryHref: null,
        retryable: true,
        isFailure: true,
      };
  }
}
