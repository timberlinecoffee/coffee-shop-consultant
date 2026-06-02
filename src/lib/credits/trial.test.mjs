// TIM-1825: ensureTrialGrant — one-time 15-credit free-trial grant.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureTrialGrant } from "./trial.ts";
import { TRIAL_GRANT_CREDITS } from "../access.ts";

// Minimal chainable mock of the supabase service client, recording calls.
function mockSvc() {
  const calls = { updates: [], inserts: [] };
  const svc = {
    from(table) {
      return {
        update(payload) {
          return {
            eq(_col, _val) {
              calls.updates.push({ table, payload });
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(payload) {
          calls.inserts.push({ table, payload });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { svc, calls };
}

test("grants 15 credits once for an ungranted trial user", async () => {
  const { svc, calls } = mockSvc();
  const balance = await ensureTrialGrant(svc, "u1", {
    ai_credits_remaining: 0,
    trial_credits_granted: false,
  });

  assert.equal(balance, TRIAL_GRANT_CREDITS);
  assert.equal(calls.updates.length, 1);
  assert.deepEqual(calls.updates[0].payload, {
    ai_credits_remaining: TRIAL_GRANT_CREDITS,
    trial_credits_granted: true,
  });
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.inserts[0].table, "credit_transactions");
  assert.equal(calls.inserts[0].payload.type, "trial_grant");
  assert.equal(calls.inserts[0].payload.amount, TRIAL_GRANT_CREDITS);
});

test("is a no-op once already granted (idempotent)", async () => {
  const { svc, calls } = mockSvc();
  const balance = await ensureTrialGrant(svc, "u1", {
    ai_credits_remaining: 7,
    trial_credits_granted: true,
  });

  assert.equal(balance, 7); // returns stored balance untouched
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.inserts.length, 0);
});

test("adds the grant on top of any existing balance", async () => {
  const { svc } = mockSvc();
  const balance = await ensureTrialGrant(svc, "u1", {
    ai_credits_remaining: 3,
    trial_credits_granted: false,
  });
  assert.equal(balance, 3 + TRIAL_GRANT_CREDITS);
});

test("treats missing trial_credits_granted as not-yet-granted", async () => {
  const { svc, calls } = mockSvc();
  const balance = await ensureTrialGrant(svc, "u1", {
    ai_credits_remaining: null,
  });
  assert.equal(balance, TRIAL_GRANT_CREDITS);
  assert.equal(calls.updates.length, 1);
});
