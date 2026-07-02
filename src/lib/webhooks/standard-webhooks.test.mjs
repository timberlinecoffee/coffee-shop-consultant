// TIM-3022: unit tests for the inline standard-webhooks verifier.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractHeaders,
  verifyStandardWebhook,
  signForTest,
} from './standard-webhooks.ts';

// Helper: an arbitrary whsec_ secret with a known decode. Picked once so
// tests don't depend on Math.random.
const WHSEC = 'whsec_QmFzZTY0RGVjb2RlZFNlY3JldEZvclRlc3RpbmcwMTIzNDU=';
const NOW = 1_700_000_000; // fixed wall clock for determinism

function makeReq({ id, timestamp, signature }) {
  const headers = new Headers();
  if (id !== undefined) headers.set('webhook-id', id);
  if (timestamp !== undefined) headers.set('webhook-timestamp', timestamp);
  if (signature !== undefined) headers.set('webhook-signature', signature);
  return headers;
}

test('extractHeaders pulls the three standard-webhooks headers', () => {
  const headers = makeReq({
    id: 'msg_1',
    timestamp: String(NOW),
    signature: 'v1,sig',
  });
  const out = extractHeaders(headers);
  assert.deepEqual(out, {
    id: 'msg_1',
    timestamp: String(NOW),
    signature: 'v1,sig',
  });
});

test('verify: returns missing_secret when secret env unset', () => {
  const result = verifyStandardWebhook({
    secret: undefined,
    headers: { id: 'a', timestamp: String(NOW), signature: 'v1,x' },
    payload: '{}',
    nowSec: NOW,
  });
  assert.deepEqual(result, { ok: false, reason: 'missing_secret' });
});

test('verify: invalid_secret_format when whsec_ followed by empty', () => {
  const result = verifyStandardWebhook({
    secret: 'whsec_',
    headers: { id: 'a', timestamp: String(NOW), signature: 'v1,x' },
    payload: '{}',
    nowSec: NOW,
  });
  assert.deepEqual(result, { ok: false, reason: 'invalid_secret_format' });
});

test('verify: missing_headers when any of id/timestamp/signature absent', () => {
  for (const headers of [
    { id: null, timestamp: String(NOW), signature: 'v1,x' },
    { id: 'a', timestamp: null, signature: 'v1,x' },
    { id: 'a', timestamp: String(NOW), signature: null },
  ]) {
    const result = verifyStandardWebhook({
      secret: WHSEC,
      headers,
      payload: '{}',
      nowSec: NOW,
    });
    assert.deepEqual(result, { ok: false, reason: 'missing_headers' });
  }
});

test('verify: timestamp_out_of_tolerance when stale > 5min', () => {
  const result = verifyStandardWebhook({
    secret: WHSEC,
    headers: { id: 'a', timestamp: String(NOW - 6 * 60), signature: 'v1,x' },
    payload: '{}',
    nowSec: NOW,
  });
  assert.deepEqual(result, { ok: false, reason: 'timestamp_out_of_tolerance' });
});

test('verify: timestamp_out_of_tolerance when timestamp non-numeric', () => {
  const result = verifyStandardWebhook({
    secret: WHSEC,
    headers: { id: 'a', timestamp: 'banana', signature: 'v1,x' },
    payload: '{}',
    nowSec: NOW,
  });
  assert.deepEqual(result, { ok: false, reason: 'timestamp_out_of_tolerance' });
});

test('verify: no_matching_signature when signature is wrong', () => {
  const result = verifyStandardWebhook({
    secret: WHSEC,
    headers: { id: 'a', timestamp: String(NOW), signature: 'v1,d3JvbmdzaWc=' },
    payload: '{"hi":1}',
    nowSec: NOW,
  });
  assert.deepEqual(result, { ok: false, reason: 'no_matching_signature' });
});

test('verify: accepts a correctly signed payload', () => {
  const payload = '{"user":{"id":"u1","email":"a@b.com"},"email_data":{}}';
  const id = 'msg_v1';
  const ts = String(NOW);
  const signature = signForTest({ id, timestamp: ts, payload, secret: WHSEC });
  const result = verifyStandardWebhook({
    secret: WHSEC,
    headers: { id, timestamp: ts, signature },
    payload,
    nowSec: NOW,
  });
  assert.deepEqual(result, { ok: true });
});

test('verify: accepts when one of multiple space-separated signatures matches', () => {
  const payload = '{"hi":1}';
  const id = 'msg_v1';
  const ts = String(NOW);
  const valid = signForTest({ id, timestamp: ts, payload, secret: WHSEC });
  // Rotating senders may include an old + new signature. Either should pass.
  const signature = `v1,d3JvbmdzaWc= ${valid}`;
  const result = verifyStandardWebhook({
    secret: WHSEC,
    headers: { id, timestamp: ts, signature },
    payload,
    nowSec: NOW,
  });
  assert.deepEqual(result, { ok: true });
});

test('verify: rejects when signature is over a different payload', () => {
  const ts = String(NOW);
  const id = 'msg_v1';
  const signature = signForTest({
    id,
    timestamp: ts,
    payload: '{"hi":1}',
    secret: WHSEC,
  });
  const result = verifyStandardWebhook({
    secret: WHSEC,
    headers: { id, timestamp: ts, signature },
    payload: '{"hi":2}',
    nowSec: NOW,
  });
  assert.deepEqual(result, { ok: false, reason: 'no_matching_signature' });
});

test('verify: rejects when secret is wrong', () => {
  const payload = '{"hi":1}';
  const ts = String(NOW);
  const id = 'msg_v1';
  const signature = signForTest({ id, timestamp: ts, payload, secret: WHSEC });
  const result = verifyStandardWebhook({
    secret: 'whsec_NOT-THE-TEST-SECRET-USED-ABOVE',
    headers: { id, timestamp: ts, signature },
    payload,
    nowSec: NOW,
  });
  assert.deepEqual(result, { ok: false, reason: 'no_matching_signature' });
});

test('verify: accepts bare (non-whsec_) secret signed against same bytes', () => {
  const BARE = 'plaintext-secret';
  const payload = '{"hi":1}';
  const ts = String(NOW);
  const id = 'msg_v1';
  const signature = signForTest({ id, timestamp: ts, payload, secret: BARE });
  const result = verifyStandardWebhook({
    secret: BARE,
    headers: { id, timestamp: ts, signature },
    payload,
    nowSec: NOW,
  });
  assert.deepEqual(result, { ok: true });
});
