// TIM-3446: every surface that takes a card shows the same disclosure.
//
// The FTC Negative Option Rule requires it, Marketing and Legal signed off on
// exact wording, and it was already duplicated across two surfaces before the
// onboarding trial offer existed. This test reads each surface's source and
// fails if the sentences have drifted — the same shape of guard as
// ai-error-copy.test.mjs, applied to a contract with legal consequences.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  TRIAL_DISCLOSURE_SENTENCES,
  TRIAL_DISCLOSURE_TEXT,
  trialDisclosureMarkdown,
} from "./trial-disclosure.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");

const PRICING_PAGE = join(SRC, "app", "pricing", "page.tsx");
const TRIAL_OFFER = join(SRC, "app", "onboarding", "trial-offer-step.tsx");

/**
 * Source flattened for prose comparison: JSX entities decoded, tags and
 * braces dropped, whitespace collapsed. Surfaces break these sentences across
 * lines and wrap phrases in <strong> and <a>, so a literal substring search
 * would report drift that isn't there.
 */
function prose(path) {
  return readFileSync(path, "utf8")
    // JSX's explicit-space expression. Must go before brace stripping, or the
    // quote marks survive and split the sentence being compared.
    .replace(/\{\s*["']\s*["']\s*\}/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ");
}

test("the pricing page still shows the disclosure verbatim", () => {
  const text = prose(PRICING_PAGE);
  for (const sentence of TRIAL_DISCLOSURE_SENTENCES) {
    assert.ok(
      text.includes(sentence),
      `/pricing has drifted from the approved disclosure. Missing: "${sentence}"`,
    );
  }
});

test("the onboarding trial offer shows the disclosure", () => {
  // It renders from the shared constant, so what this really pins is that the
  // screen asking for a card has not stopped importing it.
  const src = readFileSync(TRIAL_OFFER, "utf8");
  assert.match(
    src,
    /from\s*"@\/lib\/legal\/trial-disclosure"/,
    "the trial offer screen no longer imports the disclosure — it takes a card without one",
  );
  assert.match(src, /TRIAL_DISCLOSURE_SENTENCES/);
});

test("the Stripe checkout message says the same thing", () => {
  const md = trialDisclosureMarkdown("https://groundwork.cafe");
  for (const sentence of TRIAL_DISCLOSURE_SENTENCES.slice(0, -1)) {
    assert.ok(md.includes(sentence), `checkout message missing: "${sentence}"`);
  }
  assert.match(md, /\[Subscription Terms\]\(https:\/\/groundwork\.cafe\/subscription-terms\) apply\./);
  // Stripe's custom_text limit.
  assert.ok(md.length < 1200, `checkout message is ${md.length} chars, over Stripe's 1200 limit`);
});

test("the disclosure states the four things the rule requires", () => {
  const t = TRIAL_DISCLOSURE_TEXT;
  assert.match(t, /7 days/, "must state the trial length");
  assert.match(t, /credit card is required/, "must state that a card is required");
  assert.match(t, /charged automatically/, "must state that the charge is automatic");
  assert.match(t, /\$39\/month|\$99\/month/, "must state the amount that will be charged");
  assert.match(t, /Cancel in Settings > Billing/, "must state how to cancel");
});
