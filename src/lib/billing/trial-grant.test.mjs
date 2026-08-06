// TIM-3447: a trial that grants credits must grant the access to spend them.
//
// 23 users sat in `free_trial` with a null `trial_ends_at`. `hasWriteAccess`
// reads that pair, so every one of them held a trial they could not use. The
// grant and the gate are two sides of one contract, and — as with every other
// defect found this week — nothing compared the two sides.
//
// These tests compare them: the same states that `buildTrialGrant` produces
// are fed to the real `hasWriteAccess`, and the webhook source is scanned to
// confirm it still builds the grant as one object instead of hand-listing the
// fields (which is how one of them came to be forgotten).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildTrialGrant, trialEndsAtIso, TRIAL_DAYS } from "./trial-grant.ts";
import { hasWriteAccess } from "./../access.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEBHOOK = join(HERE, "..", "..", "app", "api", "stripe", "webhook", "route.ts");

const NOW = new Date("2026-08-06T12:00:00.000Z");

test("a granted trial can always spend the credits it was granted", () => {
  // Stripe reported a date, Stripe reported nothing, Stripe reported nonsense.
  // Every one of these is a real trial and must be able to edit.
  const cases = [
    { name: "normal Stripe trial_end", ts: Math.floor(NOW.getTime() / 1000) + 7 * 86400 },
    { name: "trial_end missing", ts: null },
    { name: "trial_end undefined", ts: undefined },
    { name: "trial_end in the past", ts: Math.floor(NOW.getTime() / 1000) - 86400 },
    { name: "trial_end NaN", ts: Number.NaN },
  ];

  for (const c of cases) {
    const grant = buildTrialGrant({
      tier: "pro",
      credits: 75,
      stripeTrialEndSeconds: c.ts,
      now: NOW,
    });

    assert.ok(grant.ai_credits_remaining > 0, `${c.name}: granted no credits`);
    assert.equal(
      hasWriteAccess({
        subscription_status: grant.subscription_status,
        trial_ends_at: grant.trial_ends_at,
      }),
      true,
      `${c.name}: granted ${grant.ai_credits_remaining} credits the user cannot spend`,
    );
  }
});

test("the grant never writes a null trial end", () => {
  // Null is not "unknown end date". Downstream it means "cannot edit".
  for (const ts of [null, undefined, Number.NaN, 0]) {
    const grant = buildTrialGrant({ tier: "starter", credits: 75, stripeTrialEndSeconds: ts, now: NOW });
    assert.equal(typeof grant.trial_ends_at, "string");
    assert.ok(new Date(grant.trial_ends_at) > NOW, `trial ends at ${grant.trial_ends_at}, not in the future`);
  }
});

test("Stripe's date is preferred when it is usable", () => {
  const stripeEnd = Math.floor(new Date("2026-08-20T09:30:00.000Z").getTime() / 1000);
  assert.equal(trialEndsAtIso(stripeEnd, NOW), "2026-08-20T09:30:00.000Z");
});

test("the fallback is the board-set trial length", () => {
  const iso = trialEndsAtIso(null, NOW);
  const days = (new Date(iso).getTime() - NOW.getTime()) / 86_400_000;
  assert.equal(days, TRIAL_DAYS);
  assert.equal(TRIAL_DAYS, 7, "TIM-1902 set the trial at 7 days");
});

test("the webhook grants every field together, not one at a time", () => {
  const src = readFileSync(WEBHOOK, "utf8");
  const code = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

  // Both trial branches (subscription.created and checkout.session.completed).
  const uses = code.match(/buildTrialGrant\(/g) ?? [];
  assert.equal(uses.length, 2, `expected both trial paths to build the grant, found ${uses.length}`);

  // The failure mode this replaces: a hand-listed update where one field can
  // be edited out without the others noticing.
  assert.doesNotMatch(
    code,
    /ai_credits_remaining:\s*TRIAL_CREDITS/,
    "a trial credit grant is being hand-written again instead of built as one object",
  );
});

test("hasWriteAccess and the grant agree on what a live trial is", () => {
  // Pin the actual contract rather than trusting the two to stay aligned.
  const grant = buildTrialGrant({ tier: "pro", credits: 75, stripeTrialEndSeconds: null, now: NOW });
  assert.equal(grant.subscription_status, "free_trial");

  // And the negative case: an expired trial must NOT have write access, or the
  // gate means nothing.
  assert.equal(
    hasWriteAccess({ subscription_status: "free_trial", trial_ends_at: "2020-01-01T00:00:00.000Z" }),
    false,
    "an expired trial still has write access — the gate is not gating",
  );
});
