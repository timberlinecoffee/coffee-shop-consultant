// TIM-3022: unit tests for the auth-email-hook dispatcher.
//
// Each Supabase `email_action_type` must call the right template send
// function with the right URL/props. We stub the senders to capture calls
// and assert routing — no real Resend hit, no React Email render needed.
//
// TIM-3441: the previous version of this file asserted the bug. It contained
// `test('signup action calls sendWelcomeEmail with dashboardUrl')`, which is
// a green test for "the confirmation email contains no way to confirm". A
// passing suite is why this reached a real user. The guard at the bottom of
// this file is the one that would have caught it: EVERY mail this hook sends
// must carry the token it was minted for.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  appOriginFrom,
  buildConfirmUrl,
  dispatchEmailHook,
  firstNameFromMetadata,
  NEXT_BY_ACTION,
} from './dispatch.ts';
import { resolveNext } from '../../../../lib/safe-next.ts';

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

// The single URL every prop on every template ultimately carries.
function linkFromCall(call) {
  const p = call.args.props;
  return p.verifyUrl ?? p.resetUrl ?? p.confirmUrl ?? p.magicLinkUrl;
}

test('firstNameFromMetadata: prefers first_name, then given_name, then full_name', () => {
  assert.equal(firstNameFromMetadata({ first_name: 'A' }), 'A');
  assert.equal(firstNameFromMetadata({ given_name: 'B' }), 'B');
  assert.equal(firstNameFromMetadata({ full_name: 'C D' }), 'C');
  assert.equal(firstNameFromMetadata({ name: 'E F' }), 'E');
  assert.equal(firstNameFromMetadata({}), null);
  assert.equal(firstNameFromMetadata(null), null);
});

test('appOriginFrom prefers redirect_to, then env, then site_url', () => {
  const restore = envSafe('NEXT_PUBLIC_SITE_URL', 'https://env.groundwork.cafe');
  try {
    assert.equal(
      appOriginFrom({
        redirect_to: 'https://www.groundwork.cafe/auth/callback?next=/plan',
        site_url: 'https://groundwork.cafe',
        email_action_type: 'signup',
      }),
      'https://www.groundwork.cafe',
    );
    assert.equal(
      appOriginFrom({ site_url: 'https://groundwork.cafe', email_action_type: 'signup' }),
      'https://env.groundwork.cafe',
    );
  } finally {
    restore();
  }
  const restoreNone = envSafe('NEXT_PUBLIC_SITE_URL', undefined);
  try {
    assert.equal(
      appOriginFrom({ site_url: 'https://groundwork.cafe', email_action_type: 'signup' }),
      'https://groundwork.cafe',
    );
    assert.equal(appOriginFrom({ email_action_type: 'signup' }), null);
  } finally {
    restoreNone();
  }
});

test('buildConfirmUrl targets our own /auth/confirm, never Supabase /auth/v1/verify', () => {
  const url = buildConfirmUrl({
    site_url: 'https://groundwork.cafe',
    redirect_to: 'https://groundwork.cafe/auth/callback',
    token_hash: 'th_123',
    email_action_type: 'recovery',
  });
  assert.match(url, /^https:\/\/groundwork\.cafe\/auth\/confirm\?/);
  // TIM-3441 bug 2: site_url is this app's domain, so `${site_url}/auth/v1/verify`
  // was a 404 in our own Next app. Never build that shape again.
  assert.doesNotMatch(url, /auth\/v1\/verify/);
  assert.match(url, /token_hash=th_123/);
  assert.match(url, /type=recovery/);
  assert.match(url, /next=%2Freset-password/);
});

test('buildConfirmUrl honors useNewTokenHash for email_change confirm-to-new-address', () => {
  const url = buildConfirmUrl(
    {
      redirect_to: 'https://groundwork.cafe/auth/callback',
      token_hash: 'th_old',
      token_hash_new: 'th_new',
      email_action_type: 'email_change',
    },
    { useNewTokenHash: true },
  );
  assert.match(url, /token_hash=th_new/);
});

test('buildConfirmUrl returns null rather than a tokenless link', () => {
  assert.equal(
    buildConfirmUrl({
      redirect_to: 'https://groundwork.cafe/auth/callback',
      email_action_type: 'signup',
    }),
    null,
  );
  assert.equal(
    buildConfirmUrl({ token_hash: 'th_1', email_action_type: 'signup' }),
    null,
  );
});

test('every NEXT_BY_ACTION landing path survives the safe-next allowlist', () => {
  // If this fails, /auth/confirm would silently drop the `next` and dump the
  // user on /dashboard — including password-reset users, who would never
  // reach the form that sets their new password.
  for (const [action, path] of Object.entries(NEXT_BY_ACTION)) {
    assert.equal(resolveNext(path), path, `${action} → ${path} is not allowlisted`);
  }
});

test('signup action sends the VERIFY email carrying the token hash', async () => {
  // TIM-3441 regression: this previously sent the welcome email, whose only
  // link was the dashboard. The confirmation mail must confirm.
  const { calls, senders } = stubSenders();
  const outcome = await dispatchEmailHook(
    {
      user: BASE_USER,
      email_data: {
        email_action_type: 'signup',
        site_url: 'https://groundwork.cafe',
        redirect_to: 'https://groundwork.cafe/auth/callback',
        token_hash: 'th_signup',
      },
    },
    senders,
  );
  assert.equal(outcome.kind, 'sent');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'verify');
  assert.equal(calls[0].args.to, 'user@example.com');
  assert.equal(calls[0].args.userId, 'u1');
  assert.equal(calls[0].args.props.firstName, 'Pat');
  assert.match(calls[0].args.props.verifyUrl, /token_hash=th_signup/);
  assert.match(calls[0].args.props.verifyUrl, /type=signup/);
  assert.match(calls[0].args.props.verifyUrl, /next=%2Fonboarding/);
});

test('signup with no token_hash refuses to send, so Supabase falls back to its own email', async () => {
  const { calls, senders } = stubSenders();
  const outcome = await dispatchEmailHook(
    {
      user: BASE_USER,
      email_data: {
        email_action_type: 'signup',
        site_url: 'https://groundwork.cafe',
        redirect_to: 'https://groundwork.cafe/auth/callback',
      },
    },
    senders,
  );
  assert.deepEqual(outcome, { kind: 'invalid', reason: 'missing_token_hash' });
  assert.equal(calls.length, 0);
});

test('email action calls sendVerifyEmail with token-hash confirm URL', async () => {
  const { calls, senders } = stubSenders();
  const outcome = await dispatchEmailHook(
    {
      user: BASE_USER,
      email_data: {
        email_action_type: 'email',
        redirect_to: 'https://groundwork.cafe/auth/callback',
        token_hash: 'th_verify',
      },
    },
    senders,
  );
  assert.equal(outcome.kind, 'sent');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'verify');
  assert.match(calls[0].args.props.verifyUrl, /token_hash=th_verify/);
  assert.match(calls[0].args.props.verifyUrl, /type=email/);
});

test('recovery action calls sendPasswordResetEmail with resetUrl', async () => {
  const { calls, senders } = stubSenders();
  const outcome = await dispatchEmailHook(
    {
      user: BASE_USER,
      email_data: {
        email_action_type: 'recovery',
        redirect_to: 'https://groundwork.cafe/auth/callback?next=/reset-password',
        token_hash: 'th_reset',
      },
    },
    senders,
  );
  assert.equal(outcome.kind, 'sent');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'reset');
  assert.match(calls[0].args.props.resetUrl, /type=recovery/);
  assert.match(calls[0].args.props.resetUrl, /token_hash=th_reset/);
  assert.match(calls[0].args.props.resetUrl, /next=%2Freset-password/);
});

test('email_change uses old token-hash by default; new when user.email == new_email', async () => {
  const { calls, senders } = stubSenders();
  // First fires to the OLD address — payload.user.email is the old one.
  await dispatchEmailHook(
    {
      user: { id: 'u1', email: 'old@example.com', user_metadata: null },
      email_data: {
        email_action_type: 'email_change',
        redirect_to: 'https://groundwork.cafe/auth/callback',
        token_hash: 'th_old',
        token_hash_new: 'th_new',
        new_email: 'new@example.com',
      },
    },
    senders,
  );
  assert.match(calls.at(-1).args.props.confirmUrl, /token_hash=th_old/);
  assert.equal(calls.at(-1).args.props.oldEmail, 'old@example.com');
  assert.equal(calls.at(-1).args.props.newEmail, 'new@example.com');

  // Second fires to the NEW address — payload.user.email == new_email.
  await dispatchEmailHook(
    {
      user: { id: 'u1', email: 'new@example.com', user_metadata: null },
      email_data: {
        email_action_type: 'email_change',
        redirect_to: 'https://groundwork.cafe/auth/callback',
        token_hash: 'th_old',
        token_hash_new: 'th_new',
        new_email: 'new@example.com',
      },
    },
    senders,
  );
  assert.match(calls.at(-1).args.props.confirmUrl, /token_hash=th_new/);
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
          redirect_to: 'https://groundwork.cafe/auth/callback',
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
          redirect_to: 'https://groundwork.cafe/auth/callback',
          token_hash: 'th_magic',
        },
      },
      senders,
    );
    assert.equal(outcome.kind, 'sent');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'magic');
    assert.match(calls[0].args.props.magicLinkUrl, /token_hash=th_magic/);
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
        redirect_to: 'https://groundwork.cafe/auth/callback',
        token_hash: 'th_x',
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
        redirect_to: 'https://groundwork.cafe/auth/callback',
        token_hash: 'th_1',
      },
    },
    senders,
  );
  assert.deepEqual(outcome, { kind: 'invalid', reason: 'missing_user_email' });
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// TIM-3441 — the guard that would have caught the original bug.
//
// The failure was not "wrong template". It was that the link we mailed had no
// relationship to the token Supabase minted for that email. So assert exactly
// that relationship, for every action, in one loop. Any future action added to
// NEXT_BY_ACTION is covered automatically.
// ---------------------------------------------------------------------------
test('every email this hook sends carries the token hash it was minted for', async () => {
  const restore = envSafe('NEXT_PUBLIC_FEATURE_MAGIC_LINK', '1');
  try {
    for (const action of Object.keys(NEXT_BY_ACTION)) {
      const { calls, senders } = stubSenders();
      const outcome = await dispatchEmailHook(
        {
          user: BASE_USER,
          email_data: {
            email_action_type: action,
            site_url: 'https://groundwork.cafe',
            redirect_to: 'https://groundwork.cafe/auth/callback',
            token_hash: `th_${action}`,
          },
        },
        senders,
      );
      assert.equal(outcome.kind, 'sent', `${action} sent nothing`);
      assert.equal(calls.length, 1, `${action} sent ${calls.length} emails`);

      const link = linkFromCall(calls[0]);
      assert.ok(link, `${action} produced no link at all`);
      const url = new URL(link);
      assert.equal(
        url.searchParams.get('token_hash'),
        `th_${action}`,
        `${action} mailed a link without its own token`,
      );
      assert.equal(url.pathname, '/auth/confirm', `${action} pointed at ${url.pathname}`);
      assert.equal(url.searchParams.get('type'), action);
    }
  } finally {
    restore();
  }
});
