// TIM-3446: one copy of the FTC auto-renew disclosure.
//
// The Negative Option Rule requires this text in front of the user before they
// hand over a card (TIM-1905 §1, Marketing + Legal signed off). It was living
// in two places already — as a template literal in the Stripe checkout route
// and as hand-written JSX on /pricing — and the onboarding trial offer would
// have made three. Three hand-maintained copies of a legally-required sentence
// is a compliance incident waiting for someone to edit one of them.
//
// So: the words live here once. `trial-disclosure.test.mjs` reads the other
// surfaces and fails if any of them has drifted from these sentences.
//
// DO NOT EDIT THE WORDING without re-clearing with Marketing and Legal. The
// prices are quoted inside the sentences, so a price change is a legal-copy
// change — that is deliberate, not an oversight.
//
// No runtime `@/` imports: must stay loadable from `node --test`.

/**
 * The disclosure, one sentence per element, in order.
 *
 * Split into sentences rather than one blob so a surface can render the
 * "Subscription Terms" link inline without any surface owning the wording.
 */
export const TRIAL_DISCLOSURE_SENTENCES = [
  "Your free trial includes full Pro access for 7 days.",
  "A credit card is required at signup.",
  "After your trial, your card will be charged automatically for the plan you selected at signup: Starter at $39/month or Pro at $99/month.",
  "Cancel in Settings > Billing at any time before day 7 to avoid a charge.",
  "Subscription Terms apply.",
] as const;

/** Plain-text disclosure, for places that cannot render markup. */
export const TRIAL_DISCLOSURE_TEXT = TRIAL_DISCLOSURE_SENTENCES.join(" ");

/** Where the terms live. Quoted in the last sentence above. */
export const SUBSCRIPTION_TERMS_PATH = "/subscription-terms";

/**
 * The disclosure with the terms link as markdown, for Stripe Checkout's
 * `custom_text.submit.message` (which supports a markdown subset, 1200 char
 * limit — this is roughly 370).
 */
export function trialDisclosureMarkdown(origin: string): string {
  const parts: string[] = [...TRIAL_DISCLOSURE_SENTENCES.slice(0, -1)];
  parts.push(`[Subscription Terms](${origin}${SUBSCRIPTION_TERMS_PATH}) apply.`);
  return parts.join(" ");
}
