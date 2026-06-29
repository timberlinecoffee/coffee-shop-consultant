// TIM-3022: unit tests for the auth-email-hook dispatcher.
//
// Each Supabase `email_action_type` must call the right template send
// function with the right URL/props. We stub the senders to capture calls
// and assert routing — no real Resend hit, no React Email render needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildVerifyUrl,
  buildDashboardUrl,
  dispatchEmailHook,
  firstNameFromMetadata,
} from './dispatch.ts';

function envSafe(key, val) {
  const prev = process.env[key];
  if (val === undefined) delete process.env[key];
  else process.env[key] = val;
  return () => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  };
}

function stubSenders() {
  const calls = [];
  const sentOk = (refId) => ({ ok: true, provider: 'resend', id: refId });
  const factory =
    (name, refIdPrefix) =>
    async (args) => {
      calls.push({ name, args });
      return sentOk(`${refIdPrefix}-${args.userId}`);
    };
  return {
    calls,
    senders: {
      sendVerifyEmail: factory('verify', 'tim2366-verify'),
      sendWelcomeEmail: factory('welcome', 'tim2366-welcome'),
      sendPasswordResetEmail: factory('reset', 'tim2366-reset'),
      sendEmailChangeEmail: factory('emailchange', 'tim2366-emailchange'),
      sendMagicLinkEmail: factory('magic', 'tim2366-magic'),
    },
  };
}

const BASE_USER = {
  id: 'u1',
  email: 'user@example.com',
  user_metadata: { first_name: 'Pat' },
};

test('firstNameFromMetadata: prefers first_name, then given_name, then full_name', () => {
  assert.equal(firstNameFromMetadata({ first_name: 'A' }), 'A');
  assert.equal(firstNameFromMetadata({ given_name: 'B' }), 'B');
  assert.equal(firstNameFromMetadata({ full_name: 'C D' }), 'C');
  assert.equal(firstNameFromMetadata({ name: 'E F' }), 'E');
  assert.equal(firstNameFromMetadata({}), null);
  assert.equal(firstNameFromMetadata(null), null);
});

test('buildVerifyUrl uses token_hash and includes type + redirect_to', () => {
  const url = buildVerifyUrl({
    site_url: 'https://groundwork.cafe/',
    token_hash: 'th_123',
    email_action_type: 'recovery',
    redirect_to: 'https://app.groundwork.cafe/reset-password',
  });
  assert.match(url, /^https:\/\/groundwork\.cafe\/auth\/v1\/verify\?/);
  assert.match(url, /token=th_123/);
  assert.match(url, /type=recovery/);
  assert.match(url, /redirect_to=https%3A%2F%2Fapp\.groundwork\.cafe%2Freset-password/);
});

test('buildVerifyUrl honors useNewTokenHash for email_change confirm-to-new-address', () => {
  const url = buildVerifyUrl(
    {
      site_url: 'https://groundwork.cafe',
      token_hash: 'th_old',
      token_hash_new: 'th_new',
      email_action_type: 'email_change',
    },
    { useNewTokenHash: true },
  );
  assert.match(url, /token=th_new/);
});

test('buildDashboardUrl prefers redirect_to, falls back to site_url/dashboard', () => {
  assert.equal(
    buildDashboardUrl({
      redirect_to: 'https://app.groundwork.cafe/welcome',
      email_action_type: 'signup',
    }),
    'https://app.groundwork.cafe/welcome',
  );
  assert.equal(
    buildDashboardUrl({
      site_url: 'https://groundwork.cafe',
      email_action_type: 'signup',
    }),
    'https://groundwork.cafe/dashboard',
  );
});

test('signup action calls sendWelcomeEmail with dashboardUrl', async () => {
  const { calls, senders } = stubSenders();
  const outcome = await dispatchEmailHook(
    {
      user: BASE_USER,
      email_data: {
        email_action_type: 'signup',
        site_url: 'https://groundwork.cafe',
        redirect_to: 'https://app.groundwork.cafe/dashboard',
      },
    },
    senders,
  );
  assert.equal(outcome.kind, 'sent');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'welcome');
  assert.equal(calls[0].args.to, 'user@example.com');
  assert.equal(calls[0].args.userId, 'u1');
  assert.equal(calls[0].args.props.firstName, 'Pat');
  assert.equal(
    calls[0].args.props.dashboardUrl,
    'https://app.groundwork.cafe/dashboard',
  );
});

test('email action calls sendVerifyEmail with token-hash verify URL', async () => {
  const { calls, senders } = stubSenders();
  const outcome = await dispatchEmailHook(
    {
      user: BASE_USER,
      email_data: {
        email_action_type: 'email',
        site_url: 'https://groundwork.cafe',
        token_hash: 'th_verify',
      },
    },
    senders,
  );
  assert.equal(outcome.kind, 'sent');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'verify');
  assert.match(calls[0].args.props.verifyUrl, /token=th_verify/);
  assert.match(calls[0].args.props.verifyUrl, /type=email/);
});

test('recovery action calls sendPasswordResetEmail with resetUrl', async () => {
  const { calls, senders } = stubSenders();
  const outcome = await dispatchEmailHook(
    {
      user: BASE_USER,
      email_data: {
        email_action_type: 'recovery',
        site_url: 'https://groundwork.cafe',
        token_hash: 'th_reset',
        redirect_to: 'https://app.groundwork.cafe/account/reset-password',
      },
    },
    senders,
  );
  assert.equal(outcome.kind, 'sent');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'reset');
  assert.match(calls[0].args.props.resetUrl, /type=recovery/);
  assert.match(calls[0].args.props.resetUrl, /token=th_reset/);
});

test('email_change uses old token-hash by default; new when user.email == new_email', async () => {
  const { calls, senders } = stubSenders();
  // First fires to the OLD address — payload.user.email is the old one.
  await dispatchEmailHook(
    {
      user: { id: 'u1', email: 'old@example.com', user_metadata: null },
      email_data: {
        email_action_type: 'email_change',
        site_url: 'https://groundwork.cafe',
        token_hash: 'th_old',
        token_hash_new: 'th_new',
        new_email: 'new@example.com',
      },
    },
    senders,
  );
  assert.match(calls.at(-1).args.props.confirmUrl, /token=th_old/);
  assert.equal(calls.at(-1).args.props.oldEmail, 'old@example.com');
  assert.equal(calls.at(-1).args.props.newEmail, 'new@example.com');

  // Second fires to the NEW address — payload.user.email == new_email.
  await dispatchEmailHook(
    {
      user: { id: 'u1', email: 'new@example.com', user_metadata: null },
      email_data: {
        email_action_type: 'email_change',
        site_url: 'https://groundwork.cafe',
        token_hash: 'th_old',
        token_hash_new: 'th_new',
        new_email: 'new@example.com',
      },
    },
    senders,
  );
  assert.match(calls.at(-1).args.props.confirmUrl, /token=th_new/);
});

test('magiclink action is skipped when feature flag is off', async () => {
  const restore = envSafe('NEXT_PUBLIC_FEATURE_MAGIC_LINK', '0');
  try {
    const { calls, senders } = stubSenders();
    const outcome = await dispatchEmailHook(
      {
        user: BASE_USER,
        email_data: {
          email_action_type: 'magiclink',
          site_url: 'https://groundwork.cafe',
          token_hash: 'th_magic',
        },
      },
      senders,
    );
    assert.deepEqual(outcome, {
      kind: 'skipped',
      reason: 'magic_link_flag_off',
    });
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test('magiclink action calls sendMagicLinkEmail when flag is on', async () => {
  const restore = envSafe('NEXT_PUBLIC_FEATURE_MAGIC_LINK', '1');
  try {
    const { calls, senders } = stubSenders();
    const outcome = await dispatchEmailHook(
      {
        user: BASE_USER,
        email_data: {
          email_action_type: 'magiclink',
          site_url: 'https://groundwork.cafe',
          token_hash: 'th_magic',
        },
      },
      senders,
    );
    assert.equal(outcome.kind, 'sent');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'magic');
    assert.match(calls[0].args.props.magicLinkUrl, /token=th_magic/);
    assert.match(calls[0].args.props.magicLinkUrl, /type=magiclink/);
  } finally {
    restore();
  }
});

test('unknown action_type returns skipped/unknown_action (no sender called)', async () => {
  const { calls, senders } = stubSenders();
  const outcome = await dispatchEmailHook(
    {
      user: BASE_USER,
      email_data: {
        email_action_type: 'reauthentication',
        site_url: 'https://groundwork.cafe',
      },
    },
    senders,
  );
  assert.deepEqual(outcome, { kind: 'skipped', reason: 'unknown_action' });
  assert.equal(calls.length, 0);
});

test('missing user.email returns invalid (no sender called)', async () => {
  const { calls, senders } = stubSenders();
  const outcome = await dispatchEmailHook(
    {
      user: { id: 'u1', email: undefined, user_metadata: null },
      email_data: {
        email_action_type: 'signup',
        site_url: 'https://groundwork.cafe',
      },
    },
    senders,
  );
  assert.deepEqual(outcome, { kind: 'invalid', reason: 'missing_user_email' });
  assert.equal(calls.length, 0);
});
