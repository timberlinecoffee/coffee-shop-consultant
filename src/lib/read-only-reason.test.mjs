// TIM-3442: the read-only message must agree with the read-only gate.
//
// The bug this replaces was not a typo. `concept-editor.tsx` asserted one
// specific reason — "your subscription is paused" — for a condition that has
// six possible causes, and shipped it to 23 users whose cause was none of
// them. The guard that matters is therefore not "does the copy read well" but
// "does the copy describe the same world the gate is enforcing".
//
// So this file checks readOnlyReason() against hasWriteAccess() itself, for
// every status either one knows about. If someone widens the gate later
// without widening the message, this fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readOnlyReason, trialIsLive } from './read-only-reason.ts';
import { hasWriteAccess } from './access.ts';

const FUTURE = new Date(Date.now() + 7 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

// Every status the product can put a user in, plus the shapes that actually
// occur in the database.
const CASES = [
  { label: 'active subscriber', user: { subscription_status: 'active', trial_ends_at: null } },
  { label: 'active with stale trial stamp', user: { subscription_status: 'active', trial_ends_at: PAST } },
  { label: 'card-backed trial, live', user: { subscription_status: 'free_trial', trial_ends_at: FUTURE } },
  { label: 'signed up, no trial started', user: { subscription_status: 'free_trial', trial_ends_at: null } },
  { label: 'trial finished', user: { subscription_status: 'free_trial', trial_ends_at: PAST } },
  { label: 'paused', user: { subscription_status: 'paused', trial_ends_at: null } },
  { label: 'cancelled', user: { subscription_status: 'cancelled', trial_ends_at: null } },
  { label: 'past due', user: { subscription_status: 'past_due', trial_ends_at: null } },
  { label: 'expired', user: { subscription_status: 'expired', trial_ends_at: null } },
  { label: 'null status', user: { subscription_status: null, trial_ends_at: null } },
  { label: 'unknown status', user: { subscription_status: 'something_new', trial_ends_at: null } },
];

test('the message agrees with the gate for every status', () => {
  for (const { label, user } of CASES) {
    const canWrite = hasWriteAccess(user);
    const copy = readOnlyReason(user);
    assert.equal(
      copy.kind === 'editable',
      canWrite,
      `${label}: gate says canWrite=${canWrite} but message says kind=${copy.kind}`,
    );
  }
});

test('every locked state offers a heading, a reason and a way out', () => {
  for (const { label, user } of CASES) {
    const copy = readOnlyReason(user);
    if (copy.kind === 'editable') {
      assert.equal(copy.heading, null, `${label}: editable must carry no heading`);
      continue;
    }
    assert.ok(copy.heading && copy.heading.length > 0, `${label}: no heading`);
    assert.ok(copy.body && copy.body.length > 0, `${label}: no body`);
    assert.ok(copy.ctaLabel && copy.ctaLabel.length > 0, `${label}: no way out`);
  }
});

// The specific libel: 23 real users were told this.
test('a user who never subscribed is never told their subscription is paused', () => {
  const fresh = { subscription_status: 'free_trial', trial_ends_at: null };
  const copy = readOnlyReason(fresh);

  assert.equal(copy.kind, 'never_started_trial');
  const all = `${copy.heading} ${copy.body} ${copy.ctaLabel}`.toLowerCase();
  assert.doesNotMatch(all, /paused/, 'must not claim a subscription is paused');
  assert.doesNotMatch(all, /reactivate/, 'cannot re-activate what was never activated');
  assert.doesNotMatch(all, /resume/, 'nothing to resume');
  assert.doesNotMatch(all, /expired|ended|lapsed/, 'nothing has ended for this user');
});

test('only the genuinely paused are told they are paused', () => {
  for (const { user } of CASES) {
    const copy = readOnlyReason(user);
    if (/paused/i.test(`${copy.heading} ${copy.body}`)) {
      assert.equal(
        user.subscription_status,
        'paused',
        'the word "paused" may only appear for status === paused',
      );
    }
  }
});

test('a finished trial is not mistaken for an unstarted one', () => {
  assert.equal(
    readOnlyReason({ subscription_status: 'free_trial', trial_ends_at: PAST }).kind,
    'trial_ended',
  );
  assert.equal(
    readOnlyReason({ subscription_status: 'free_trial', trial_ends_at: null }).kind,
    'never_started_trial',
  );
});

test('an unrecognised status invents no reason', () => {
  const copy = readOnlyReason({ subscription_status: 'something_new' });
  assert.equal(copy.kind, 'locked');
  // It may say editing is unavailable. It may not say why.
  assert.doesNotMatch(
    `${copy.heading} ${copy.body}`.toLowerCase(),
    /paused|cancelled|trial|payment|expired/,
  );
});

test('trialIsLive tolerates the shapes the database actually produces', () => {
  assert.equal(trialIsLive(null), false);
  assert.equal(trialIsLive(undefined), false);
  assert.equal(trialIsLive(''), false);
  assert.equal(trialIsLive('not a date'), false, 'an unparseable stamp is not a live trial');
  assert.equal(trialIsLive(PAST), false);
  assert.equal(trialIsLive(FUTURE), true);
  assert.equal(trialIsLive(new Date(Date.now() + 60_000)), true);
});
