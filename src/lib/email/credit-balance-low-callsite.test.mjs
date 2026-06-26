// TIM-3023: integration test for the call-site wiring helper.
//
// The pure monitor is already covered by credit-balance-monitor.test.mjs
// (8 tests, dependency-injected). This file pins the integration shape:
//   - A fake Supabase service client that mirrors the
//     `credit_low_month_markers` (user_id, month_key) PK semantics.
//   - The full notifyIfCreditBalanceLow path including user lookup,
//     threshold derivation from CREDIT_LOW_EMAIL_THRESHOLD_USD, and the
//     mark-only-on-success ordering.
//   - The Acceptance #3 invariant: no double-send across two grant/charge
//     cycles in the same month, even with two separate notifyIfCreditBalanceLow
//     calls and an interleaved successful send.
//
// `sendNotice` is injected as a stub on every call so the .tsx template is
// NEVER loaded — keeps the test compatible with --experimental-strip-types.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  notifyIfCreditBalanceLow,
  _resetThresholdCache,
} from "../../../src/lib/email/credit-balance-low-callsite.ts";

// --- Fake Supabase service client ----------------------------------------

function makeFakeSupabase({ users, markers }) {
  return {
    from(tableName) {
      if (tableName === "users") return new UsersQuery(users);
      if (tableName === "credit_low_month_markers") {
        return new MarkersQuery(markers);
      }
      throw new Error(`Unexpected table: ${tableName}`);
    },
  };
}

class UsersQuery {
  constructor(rows) {
    this.rows = rows;
    this.filter = {};
  }
  select() {
    return this;
  }
  eq(col, val) {
    this.filter[col] = val;
    return this;
  }
  async maybeSingle() {
    const match = this.rows.find((r) => {
      for (const [k, v] of Object.entries(this.filter)) {
        if (r[k] !== v) return false;
      }
      return true;
    });
    return { data: match ?? null, error: null };
  }
}

class MarkersQuery {
  constructor(state) {
    this.state = state;
    this.filter = {};
  }
  select() {
    return this;
  }
  eq(col, val) {
    this.filter[col] = val;
    return this;
  }
  async maybeSingle() {
    const key = `${this.filter.user_id}:${this.filter.month_key}`;
    return {
      data: this.state.markers.has(key)
        ? { user_id: this.filter.user_id }
        : null,
      error: null,
    };
  }
  upsert(row, opts) {
    const key = `${row.user_id}:${row.month_key}`;
    if (!this.state.markers.has(key)) {
      this.state.markers.set(key, {
        user_id: row.user_id,
        month_key: row.month_key,
        sent_at: new Date().toISOString(),
      });
      this.state.upsertCount += 1;
    } else if (!opts?.ignoreDuplicates) {
      throw new Error("PK violation: would overwrite");
    }
    return Promise.resolve({ data: null, error: null });
  }
}

function makeSendNoticeStub(result) {
  const calls = [];
  const fn = async (args) => {
    calls.push(args);
    return (
      result ?? {
        ok: true,
        provider: "resend",
        id: `msg_${calls.length}`,
      }
    );
  };
  fn.calls = calls;
  return fn;
}

function withEnv(overrides, fn) {
  return async () => {
    const prior = {};
    for (const [k, v] of Object.entries(overrides)) {
      prior[k] = process.env[k];
      if (v === null) delete process.env[k];
      else process.env[k] = v;
    }
    _resetThresholdCache();
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(prior)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      _resetThresholdCache();
    }
  };
}

const USER_ID = "00000000-0000-0000-0000-000000000001";

test(
  "no double-send across two grant/charge cycles in the same month",
  withEnv({ CREDIT_LOW_EMAIL_THRESHOLD_USD: "1.00" }, async () => {
    const state = { markers: new Map(), upsertCount: 0 };
    const supabase = makeFakeSupabase({
      users: [
        {
          id: USER_ID,
          email: "user@groundwork.test",
          full_name: "Test Owner",
        },
      ],
      markers: state,
    });
    const sendNotice = makeSendNoticeStub();

    const r1 = await notifyIfCreditBalanceLow({
      userId: USER_ID,
      postMutationBalance: 3,
      supabase,
      sendNotice,
    });
    assert.equal(r1.status, "delegated");
    assert.equal(r1.monitor.status, "sent");

    const r2 = await notifyIfCreditBalanceLow({
      userId: USER_ID,
      postMutationBalance: 7,
      supabase,
      sendNotice,
    });
    assert.equal(r2.status, "delegated");
    assert.equal(r2.monitor.status, "skipped");
    assert.equal(r2.monitor.reason, "already_noticed_this_month");

    const r3 = await notifyIfCreditBalanceLow({
      userId: USER_ID,
      postMutationBalance: 2,
      supabase,
      sendNotice,
    });
    assert.equal(r3.status, "delegated");
    assert.equal(r3.monitor.status, "skipped");
    assert.equal(r3.monitor.reason, "already_noticed_this_month");

    assert.equal(sendNotice.calls.length, 1, "exactly one Resend dispatch");
    assert.equal(state.upsertCount, 1, "exactly one marker upsert");
    assert.equal(state.markers.size, 1);
    const [onlyKey] = state.markers.keys();
    assert.match(onlyKey, /^[0-9a-f-]+:[0-9]{4}-(0[1-9]|1[0-2])$/);
  }),
);

test(
  "above-threshold balance short-circuits with no lookup, no send",
  withEnv({ CREDIT_LOW_EMAIL_THRESHOLD_USD: "1.00" }, async () => {
    const state = { markers: new Map(), upsertCount: 0 };
    const supabase = makeFakeSupabase({ users: [], markers: state });
    const sendNotice = makeSendNoticeStub();

    const r = await notifyIfCreditBalanceLow({
      userId: USER_ID,
      postMutationBalance: 50,
      supabase,
      sendNotice,
    });
    assert.equal(r.status, "skipped_above_threshold");
    assert.equal(sendNotice.calls.length, 0);
    assert.equal(state.upsertCount, 0);
  }),
);

test(
  "unknown user returns skipped_no_user — caller never sees a throw",
  withEnv({ CREDIT_LOW_EMAIL_THRESHOLD_USD: "1.00" }, async () => {
    const state = { markers: new Map(), upsertCount: 0 };
    const supabase = makeFakeSupabase({ users: [], markers: state });
    const sendNotice = makeSendNoticeStub();

    const r = await notifyIfCreditBalanceLow({
      userId: USER_ID,
      postMutationBalance: 2,
      supabase,
      sendNotice,
    });
    assert.equal(r.status, "skipped_no_user");
    assert.equal(sendNotice.calls.length, 0);
    assert.equal(state.upsertCount, 0);
  }),
);

test(
  "send_failed (no_api_key) does NOT mark — month open for retry next deploy",
  withEnv({ CREDIT_LOW_EMAIL_THRESHOLD_USD: "1.00" }, async () => {
    const state = { markers: new Map(), upsertCount: 0 };
    const supabase = makeFakeSupabase({
      users: [
        {
          id: USER_ID,
          email: "user@groundwork.test",
          full_name: "Test Owner",
        },
      ],
      markers: state,
    });
    const sendNoticeFail = makeSendNoticeStub({
      ok: false,
      skipped: true,
      reason: "no_api_key",
    });

    const r = await notifyIfCreditBalanceLow({
      userId: USER_ID,
      postMutationBalance: 1,
      supabase,
      sendNotice: sendNoticeFail,
    });
    assert.equal(r.status, "delegated");
    assert.equal(r.monitor.status, "send_failed");
    assert.equal(state.upsertCount, 0);

    const sendNoticeOk = makeSendNoticeStub();
    const r2 = await notifyIfCreditBalanceLow({
      userId: USER_ID,
      postMutationBalance: 1,
      supabase,
      sendNotice: sendNoticeOk,
    });
    assert.equal(r2.status, "delegated");
    assert.equal(r2.monitor.status, "sent");
    assert.equal(state.upsertCount, 1);
    assert.equal(sendNoticeOk.calls.length, 1);
  }),
);

test(
  "emailOverride bypasses user lookup (Stripe webhook path)",
  withEnv({ CREDIT_LOW_EMAIL_THRESHOLD_USD: "1.00" }, async () => {
    const state = { markers: new Map(), upsertCount: 0 };
    const supabase = makeFakeSupabase({ users: [], markers: state });
    const sendNotice = makeSendNoticeStub();

    const r = await notifyIfCreditBalanceLow({
      userId: USER_ID,
      postMutationBalance: 2,
      supabase,
      emailOverride: "override@groundwork.test",
      firstNameOverride: "Trent",
      sendNotice,
    });
    assert.equal(r.status, "delegated");
    assert.equal(r.monitor.status, "sent");
    assert.equal(sendNotice.calls.length, 1);
    assert.equal(sendNotice.calls[0].to, "override@groundwork.test");
    assert.equal(sendNotice.calls[0].props.firstName, "Trent");
  }),
);

test(
  "env override changes the threshold (USD → credits via Pro rate)",
  withEnv({ CREDIT_LOW_EMAIL_THRESHOLD_USD: "5.00" }, async () => {
    const state = { markers: new Map(), upsertCount: 0 };
    const supabase = makeFakeSupabase({
      users: [
        { id: USER_ID, email: "user@groundwork.test", full_name: "Test" },
      ],
      markers: state,
    });
    const sendNotice = makeSendNoticeStub();

    const r = await notifyIfCreditBalanceLow({
      userId: USER_ID,
      postMutationBalance: 30,
      supabase,
      sendNotice,
    });
    assert.equal(r.status, "delegated");
    assert.equal(r.monitor.status, "sent");
  }),
);

test(
  "malformed env threshold falls back to default (does NOT fire on 99 credits)",
  withEnv({ CREDIT_LOW_EMAIL_THRESHOLD_USD: "abc" }, async () => {
    const state = { markers: new Map(), upsertCount: 0 };
    const supabase = makeFakeSupabase({
      users: [
        { id: USER_ID, email: "user@groundwork.test", full_name: "Test" },
      ],
      markers: state,
    });
    const sendNotice = makeSendNoticeStub();

    const r = await notifyIfCreditBalanceLow({
      userId: USER_ID,
      postMutationBalance: 99,
      supabase,
      sendNotice,
    });
    assert.equal(r.status, "skipped_above_threshold");
    assert.equal(sendNotice.calls.length, 0);
  }),
);
