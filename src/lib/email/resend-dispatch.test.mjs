// TIM-2366: dispatch — pre-rendered html path + feature flag gate +
// no-api-key skip + replyTo + ref-id wiring.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sendTransactionalEmail } from '../../../src/lib/email/resend-dispatch.ts';

function envSafe(setKey, setVal) {
  const prev = process.env[setKey];
  if (setVal === undefined) delete process.env[setKey];
  else process.env[setKey] = setVal;
  return () => {
    if (prev === undefined) delete process.env[setKey];
    else process.env[setKey] = prev;
  };
}

test('returns skipped when RESEND_API_KEY missing', async () => {
  const restore = envSafe('RESEND_API_KEY', undefined);
  try {
    const r = await sendTransactionalEmail({
      to: 'x@y.com',
      subject: 's',
      text: 't',
      refId: 'tim2366-test-1',
      html: '<p>hi</p>',
    });
    assert.deepEqual(r, { ok: false, skipped: true, reason: 'no_api_key' });
  } finally {
    restore();
  }
});

test('refuses to send when feature flag is off', async () => {
  const r1 = envSafe('RESEND_API_KEY', 'pk_live');
  const r2 = envSafe('NEXT_PUBLIC_FEATURE_MAGIC_LINK', '0');
  try {
    const r = await sendTransactionalEmail({
      to: 'x@y.com',
      subject: 's',
      text: 't',
      refId: 'tim2366-test-2',
      html: '<p>hi</p>',
      featureFlag: 'magic_link',
    });
    assert.deepEqual(r, {
      ok: false,
      skipped: true,
      reason: 'feature_flagged_off',
    });
  } finally {
    r2();
    r1();
  }
});

test('sends when feature flag is on', async () => {
  const r1 = envSafe('RESEND_API_KEY', 'pk_live');
  const r2 = envSafe('NEXT_PUBLIC_FEATURE_MAGIC_LINK', '1');
  const prevFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ id: 'msg_1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const r = await sendTransactionalEmail({
      to: 'x@y.com',
      subject: 's',
      text: 't',
      refId: 'tim2366-test-3',
      html: '<p>hi</p>',
      featureFlag: 'magic_link',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.id, 'msg_1');
    assert.equal(captured.url, 'https://api.resend.com/emails');
    const body = JSON.parse(captured.init.body);
    assert.equal(body.subject, 's');
    assert.equal(body.text, 't');
    assert.equal(body.html, '<p>hi</p>');
    assert.equal(body.headers['X-Entity-Ref-ID'], 'tim2366-test-3');
    assert.match(body.from, /noreply@groundwork\.cafe/);
    assert.equal(body.reply_to, 'support@groundwork.cafe');
    assert.equal(captured.init.headers.Authorization, 'Bearer pk_live');
  } finally {
    globalThis.fetch = prevFetch;
    r2();
    r1();
  }
});

test('trailing \\n on flag env-var does not block send', async () => {
  // 6th repeat of the TIM-2384 / TIM-2356 / TIM-1670 NEXT_PUBLIC_* \\n bug —
  // pin it so a future env-paste trailing newline can't silently flip a
  // launched feature back off.
  const r1 = envSafe('RESEND_API_KEY', 'pk_live');
  const r2 = envSafe('NEXT_PUBLIC_FEATURE_MAGIC_LINK', '1\n');
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ id: 'msg_2' }), { status: 200 });
  try {
    const r = await sendTransactionalEmail({
      to: 'x@y.com',
      subject: 's',
      text: 't',
      refId: 'tim2366-newline',
      html: '<p>hi</p>',
      featureFlag: 'magic_link',
    });
    assert.equal(r.ok, true);
  } finally {
    globalThis.fetch = prevFetch;
    r2();
    r1();
  }
});

test('surfaces Resend HTTP failure status + truncated error body', async () => {
  const r1 = envSafe('RESEND_API_KEY', 'pk_live');
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('something blew up '.repeat(100), { status: 502 });
  try {
    const r = await sendTransactionalEmail({
      to: 'x@y.com',
      subject: 's',
      text: 't',
      refId: 'tim2366-test-fail',
      html: '<p>hi</p>',
    });
    assert.equal(r.ok, false);
    if (!r.ok && !r.skipped) {
      assert.equal(r.status, 502);
      assert.ok(r.error.length <= 500);
    }
  } finally {
    globalThis.fetch = prevFetch;
    r1();
  }
});

test('honors TRANSACTIONAL_FROM_EMAIL / TRANSACTIONAL_REPLY_TO env overrides', async () => {
  const r1 = envSafe('RESEND_API_KEY', 'pk_live');
  const r2 = envSafe(
    'TRANSACTIONAL_FROM_EMAIL',
    'Bootstrap <hello@timberline.coffee>',
  );
  const r3 = envSafe('TRANSACTIONAL_REPLY_TO', 'hello@timberline.coffee');
  const prevFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, init) => {
    captured = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'msg_3' }), { status: 200 });
  };
  try {
    const r = await sendTransactionalEmail({
      to: 'x@y.com',
      subject: 's',
      text: 't',
      refId: 'tim2366-overrides',
      html: '<p>hi</p>',
    });
    assert.equal(r.ok, true);
    assert.equal(captured.from, 'Bootstrap <hello@timberline.coffee>');
    assert.equal(captured.reply_to, 'hello@timberline.coffee');
  } finally {
    globalThis.fetch = prevFetch;
    r3();
    r2();
    r1();
  }
});
