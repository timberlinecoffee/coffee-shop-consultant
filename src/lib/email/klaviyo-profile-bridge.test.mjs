// TIM-2366: Klaviyo profile-property bridge — lookup-then-PATCH vs create path,
// 409 retry-by-lookup, trial helper shapes.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pushTrialCanceled,
  pushTrialConverted,
  pushTrialStarted,
  upsertKlaviyoProfileProperties,
} from '../../../src/lib/email/klaviyo-profile-bridge.ts';

function recordingFetch(plans) {
  // plans is an array of {url-regex, method, response-fn}
  const calls = [];
  const fn = async (url, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const u = typeof url === 'string' ? url : url.toString();
    calls.push({ url: u, method, body: init?.body });
    for (const p of plans) {
      if (p.method === method && p.urlMatch.test(u)) {
        const result = await p.respond(u, init);
        if (result instanceof Response) return result;
        return new Response(JSON.stringify(result.body ?? {}), {
          status: result.status ?? 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    throw new Error(`unmocked fetch: ${method} ${u}`);
  };
  return { fn, calls };
}

test('skipped when KLAVIYO_PRIVATE_API_KEY missing', async () => {
  const prev = process.env.KLAVIYO_PRIVATE_API_KEY;
  delete process.env.KLAVIYO_PRIVATE_API_KEY;
  try {
    const r = await upsertKlaviyoProfileProperties('x@y.com', { foo: 'bar' });
    assert.deepEqual(r, { ok: false, skipped: true, reason: 'no_api_key' });
  } finally {
    if (prev !== undefined) process.env.KLAVIYO_PRIVATE_API_KEY = prev;
  }
});

test('rejects malformed email at the boundary', async () => {
  const prev = process.env.KLAVIYO_PRIVATE_API_KEY;
  process.env.KLAVIYO_PRIVATE_API_KEY = 'pk_test';
  try {
    const r = await upsertKlaviyoProfileProperties('not-an-email', {});
    assert.equal(r.ok, false);
    assert.equal(r.skipped, false);
    assert.match(r.error, /invalid email/);
  } finally {
    if (prev !== undefined) process.env.KLAVIYO_PRIVATE_API_KEY = prev;
    else delete process.env.KLAVIYO_PRIVATE_API_KEY;
  }
});

test('looks up profile then PATCHes when one already exists', async () => {
  const prevFetch = globalThis.fetch;
  const prevKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  process.env.KLAVIYO_PRIVATE_API_KEY = 'pk_test';
  const recorder = recordingFetch([
    {
      urlMatch: /\/api\/profiles\/\?filter=/,
      method: 'GET',
      respond: () => ({ body: { data: [{ id: 'prof_abc', type: 'profile' }] } }),
    },
    {
      urlMatch: /\/api\/profiles\/prof_abc\/$/,
      method: 'PATCH',
      respond: () => ({ status: 200, body: {} }),
    },
  ]);
  globalThis.fetch = recorder.fn;
  try {
    const r = await upsertKlaviyoProfileProperties('user@example.com', {
      trial_started_at: '2026-06-05T00:00:00.000Z',
    });
    assert.deepEqual(r, {
      ok: true,
      action: 'updated',
      profileId: 'prof_abc',
    });
    assert.equal(recorder.calls.length, 2);
    assert.equal(recorder.calls[1].method, 'PATCH');
    const sentBody = JSON.parse(recorder.calls[1].body);
    assert.equal(sentBody.data.id, 'prof_abc');
    assert.equal(
      sentBody.data.attributes.properties.trial_started_at,
      '2026-06-05T00:00:00.000Z',
    );
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey !== undefined) process.env.KLAVIYO_PRIVATE_API_KEY = prevKey;
    else delete process.env.KLAVIYO_PRIVATE_API_KEY;
  }
});

test('POSTs to create profile when lookup returns empty', async () => {
  const prevFetch = globalThis.fetch;
  const prevKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  process.env.KLAVIYO_PRIVATE_API_KEY = 'pk_test';
  const recorder = recordingFetch([
    {
      urlMatch: /\/api\/profiles\/\?filter=/,
      method: 'GET',
      respond: () => ({ body: { data: [] } }),
    },
    {
      urlMatch: /\/api\/profiles\/$/,
      method: 'POST',
      respond: () => ({ body: { data: { id: 'prof_new', type: 'profile' } } }),
    },
  ]);
  globalThis.fetch = recorder.fn;
  try {
    const r = await upsertKlaviyoProfileProperties('fresh@example.com', {
      plan: 'pro',
    });
    assert.deepEqual(r, {
      ok: true,
      action: 'created',
      profileId: 'prof_new',
    });
    const sentBody = JSON.parse(recorder.calls[1].body);
    assert.equal(sentBody.data.attributes.email, 'fresh@example.com');
    assert.equal(sentBody.data.attributes.properties.plan, 'pro');
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey !== undefined) process.env.KLAVIYO_PRIVATE_API_KEY = prevKey;
    else delete process.env.KLAVIYO_PRIVATE_API_KEY;
  }
});

test('retries by lookup when POST returns 409 (race condition)', async () => {
  const prevFetch = globalThis.fetch;
  const prevKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  process.env.KLAVIYO_PRIVATE_API_KEY = 'pk_test';
  let lookupCount = 0;
  const recorder = recordingFetch([
    {
      urlMatch: /\/api\/profiles\/\?filter=/,
      method: 'GET',
      respond: () => {
        lookupCount += 1;
        // first lookup says empty; second lookup (after 409) finds the row.
        if (lookupCount === 1) return { body: { data: [] } };
        return { body: { data: [{ id: 'prof_race', type: 'profile' }] } };
      },
    },
    {
      urlMatch: /\/api\/profiles\/$/,
      method: 'POST',
      respond: () => ({ status: 409, body: { errors: [{ detail: 'exists' }] } }),
    },
    {
      urlMatch: /\/api\/profiles\/prof_race\/$/,
      method: 'PATCH',
      respond: () => ({ status: 200, body: {} }),
    },
  ]);
  globalThis.fetch = recorder.fn;
  try {
    const r = await upsertKlaviyoProfileProperties('race@example.com', {
      trial_state: 'started',
    });
    assert.deepEqual(r, {
      ok: true,
      action: 'updated',
      profileId: 'prof_race',
    });
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey !== undefined) process.env.KLAVIYO_PRIVATE_API_KEY = prevKey;
    else delete process.env.KLAVIYO_PRIVATE_API_KEY;
  }
});

test('pushTrialStarted sets trial_started_at + trial_state', async () => {
  const prevFetch = globalThis.fetch;
  const prevKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  process.env.KLAVIYO_PRIVATE_API_KEY = 'pk_test';
  const recorder = recordingFetch([
    {
      urlMatch: /\/api\/profiles\/\?filter=/,
      method: 'GET',
      respond: () => ({ body: { data: [{ id: 'prof_t', type: 'profile' }] } }),
    },
    {
      urlMatch: /\/api\/profiles\/prof_t\/$/,
      method: 'PATCH',
      respond: () => ({ status: 200, body: {} }),
    },
  ]);
  globalThis.fetch = recorder.fn;
  try {
    const r = await pushTrialStarted({
      email: 'a@b.com',
      trialStartedAtIso: '2026-06-05T12:00:00.000Z',
    });
    assert.equal(r.ok, true);
    const body = JSON.parse(recorder.calls[1].body);
    assert.equal(
      body.data.attributes.properties.trial_started_at,
      '2026-06-05T12:00:00.000Z',
    );
    assert.equal(body.data.attributes.properties.trial_state, 'started');
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey !== undefined) process.env.KLAVIYO_PRIVATE_API_KEY = prevKey;
    else delete process.env.KLAVIYO_PRIVATE_API_KEY;
  }
});

test('pushTrialConverted sets plan + trial_converted_at + state=converted', async () => {
  const prevFetch = globalThis.fetch;
  const prevKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  process.env.KLAVIYO_PRIVATE_API_KEY = 'pk_test';
  const recorder = recordingFetch([
    {
      urlMatch: /\/api\/profiles\/\?filter=/,
      method: 'GET',
      respond: () => ({ body: { data: [{ id: 'prof_c', type: 'profile' }] } }),
    },
    {
      urlMatch: /\/api\/profiles\/prof_c\/$/,
      method: 'PATCH',
      respond: () => ({ status: 200, body: {} }),
    },
  ]);
  globalThis.fetch = recorder.fn;
  try {
    const r = await pushTrialConverted({
      email: 'a@b.com',
      plan: 'pro',
      trialConvertedAtIso: '2026-06-12T12:00:00.000Z',
    });
    assert.equal(r.ok, true);
    const body = JSON.parse(recorder.calls[1].body);
    assert.equal(body.data.attributes.properties.plan, 'pro');
    assert.equal(
      body.data.attributes.properties.trial_converted_at,
      '2026-06-12T12:00:00.000Z',
    );
    assert.equal(body.data.attributes.properties.trial_state, 'converted');
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey !== undefined) process.env.KLAVIYO_PRIVATE_API_KEY = prevKey;
    else delete process.env.KLAVIYO_PRIVATE_API_KEY;
  }
});

test('pushTrialCanceled sets trial_canceled_at + reason', async () => {
  const prevFetch = globalThis.fetch;
  const prevKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  process.env.KLAVIYO_PRIVATE_API_KEY = 'pk_test';
  const recorder = recordingFetch([
    {
      urlMatch: /\/api\/profiles\/\?filter=/,
      method: 'GET',
      respond: () => ({ body: { data: [{ id: 'prof_x', type: 'profile' }] } }),
    },
    {
      urlMatch: /\/api\/profiles\/prof_x\/$/,
      method: 'PATCH',
      respond: () => ({ status: 200, body: {} }),
    },
  ]);
  globalThis.fetch = recorder.fn;
  try {
    const r = await pushTrialCanceled({
      email: 'a@b.com',
      reason: 'too_expensive',
    });
    assert.equal(r.ok, true);
    const body = JSON.parse(recorder.calls[1].body);
    assert.equal(body.data.attributes.properties.trial_state, 'canceled');
    assert.equal(
      body.data.attributes.properties.trial_canceled_reason,
      'too_expensive',
    );
    assert.ok(body.data.attributes.properties.trial_canceled_at);
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey !== undefined) process.env.KLAVIYO_PRIVATE_API_KEY = prevKey;
    else delete process.env.KLAVIYO_PRIVATE_API_KEY;
  }
});
