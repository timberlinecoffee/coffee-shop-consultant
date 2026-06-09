// TIM-2366 #25: credit-balance-low monitor — threshold + dedup ordering.
//
// Pure dependency-injected: the send fn is passed in, so this test does not
// pull in the React Email template (which would break --experimental-strip-types
// on .tsx).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CREDIT_BALANCE_LOW_THRESHOLD,
  maybeFireCreditBalanceLowNotice,
  monthKeyFor,
} from '../../../src/lib/email/credit-balance-monitor.ts';

function deps(opts = {}) {
  const noticed = new Set(opts.alreadyNoticed ?? []);
  const calls = { has: 0, mark: 0, send: 0 };
  const sendResult =
    opts.sendResult ?? { ok: true, provider: 'resend', id: 'msg_x' };
  return {
    state: { noticed, calls, sentArgs: null },
    hasNoticedThisMonth: async (uid, m) => {
      calls.has += 1;
      return noticed.has(`${uid}:${m}`);
    },
    markNoticedThisMonth: async (uid, m) => {
      calls.mark += 1;
      noticed.add(`${uid}:${m}`);
    },
    sendNotice: async (a) => {
      calls.send += 1;
      return sendResult;
    },
  };
}

test('monthKeyFor: pads zero on January', () => {
  assert.equal(monthKeyFor(new Date('2026-01-15T00:00:00Z')), '2026-01');
  assert.equal(monthKeyFor(new Date('2026-12-15T23:59:59Z')), '2026-12');
});

test('threshold is 10 credits', () => {
  assert.equal(CREDIT_BALANCE_LOW_THRESHOLD, 10);
});

test('skips when balance is at threshold (no peek, no send)', async () => {
  const d = deps();
  const r = await maybeFireCreditBalanceLowNotice({
    userId: 'u1',
    email: 'a@b.com',
    currentBalance: 10,
    buyMoreUrl: 'https://app.example/buy',
    sendNotice: d.sendNotice,
    hasNoticedThisMonth: d.hasNoticedThisMonth,
    markNoticedThisMonth: d.markNoticedThisMonth,
    now: () => new Date('2026-06-05T12:00:00Z'),
  });
  assert.deepEqual(r, { status: 'skipped', reason: 'above_threshold' });
  assert.equal(d.state.calls.has, 0);
  assert.equal(d.state.calls.mark, 0);
  assert.equal(d.state.calls.send, 0);
});

test('skips when balance is above threshold', async () => {
  const d = deps();
  const r = await maybeFireCreditBalanceLowNotice({
    userId: 'u1',
    email: 'a@b.com',
    currentBalance: 999,
    buyMoreUrl: 'https://app.example/buy',
    sendNotice: d.sendNotice,
    hasNoticedThisMonth: d.hasNoticedThisMonth,
    markNoticedThisMonth: d.markNoticedThisMonth,
  });
  assert.equal(r.status, 'skipped');
  assert.equal(r.reason, 'above_threshold');
});

test('skips when this user was already noticed this month (no send)', async () => {
  const monthKey = '2026-06';
  const d = deps({ alreadyNoticed: [`u1:${monthKey}`] });
  const r = await maybeFireCreditBalanceLowNotice({
    userId: 'u1',
    email: 'a@b.com',
    currentBalance: 4,
    buyMoreUrl: 'https://app.example/buy',
    sendNotice: d.sendNotice,
    hasNoticedThisMonth: d.hasNoticedThisMonth,
    markNoticedThisMonth: d.markNoticedThisMonth,
    now: () => new Date('2026-06-05T00:00:00Z'),
  });
  assert.deepEqual(r, {
    status: 'skipped',
    reason: 'already_noticed_this_month',
  });
  assert.equal(d.state.calls.send, 0);
  assert.equal(d.state.calls.mark, 0);
});

test('fires AND marks when below threshold and not yet noticed', async () => {
  const d = deps();
  const r = await maybeFireCreditBalanceLowNotice({
    userId: 'u1',
    email: 'a@b.com',
    currentBalance: 5,
    buyMoreUrl: 'https://app.example/buy',
    sendNotice: d.sendNotice,
    hasNoticedThisMonth: d.hasNoticedThisMonth,
    markNoticedThisMonth: d.markNoticedThisMonth,
    now: () => new Date('2026-06-05T00:00:00Z'),
  });
  assert.equal(r.status, 'sent');
  assert.equal(r.monthKey, '2026-06');
  assert.equal(d.state.calls.send, 1);
  assert.equal(d.state.calls.mark, 1);
  assert.ok(d.state.noticed.has('u1:2026-06'));
});

test('does NOT mark when send fails — month is open for retry next deploy', async () => {
  const d = deps({
    sendResult: { ok: false, skipped: true, reason: 'no_api_key' },
  });
  const r = await maybeFireCreditBalanceLowNotice({
    userId: 'u1',
    email: 'a@b.com',
    currentBalance: 3,
    buyMoreUrl: 'https://app.example/buy',
    sendNotice: d.sendNotice,
    hasNoticedThisMonth: d.hasNoticedThisMonth,
    markNoticedThisMonth: d.markNoticedThisMonth,
  });
  assert.equal(r.status, 'send_failed');
  assert.equal(d.state.calls.send, 1);
  assert.equal(d.state.calls.mark, 0);
});

test('does NOT mark when send returns HTTP failure (5xx)', async () => {
  const d = deps({
    sendResult: { ok: false, skipped: false, status: 503, error: 'down' },
  });
  const r = await maybeFireCreditBalanceLowNotice({
    userId: 'u1',
    email: 'a@b.com',
    currentBalance: 1,
    buyMoreUrl: 'https://app.example/buy',
    sendNotice: d.sendNotice,
    hasNoticedThisMonth: d.hasNoticedThisMonth,
    markNoticedThisMonth: d.markNoticedThisMonth,
  });
  assert.equal(r.status, 'send_failed');
  assert.equal(d.state.calls.mark, 0);
});
