// TIM-2266: sweep helper unit tests.
//
// Pins the purge semantics without bringing up the Next.js runtime:
//   - past expires_at + storage_path → object removed, row marked expired
//   - future expires_at → never selected (the WHERE clause guards us)
//   - null storage_path → row still marked expired (no storage call attempted)
//   - empty result set → quick exit with all zeros
//   - storage error → surfaced in errors[] but row update still proceeds
//   - update error → propagates and marked=0
//
// Run with: node --experimental-strip-types --test src/app/api/cron/expire-exports/sweep.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { sweepExpiredExports } from "./sweep.ts";

// ---------------------------------------------------------------------------
// Fake Supabase client. Mirrors the chain the helper uses; lets the test pin
// what was queried, removed, and updated.
// ---------------------------------------------------------------------------

function makeFakeClient({ rows = [], selectError = null, removeError = null, removed = null, updateError = null } = {}) {
  const calls = {
    select: null,
    storageRemove: null,
    update: null,
  };

  const selectBuilder = {
    _filters: {},
    _order: null,
    _limit: null,
    eq(col, val) {
      this._filters[`eq:${col}`] = val;
      return this;
    },
    not(col, op, val) {
      this._filters[`not:${col}:${op}`] = val;
      return this;
    },
    lt(col, val) {
      this._filters[`lt:${col}`] = val;
      return this;
    },
    order(col, opts) {
      this._order = { col, ...opts };
      return this;
    },
    async limit(n) {
      this._limit = n;
      calls.select = { ...this._filters, order: this._order, limit: this._limit };
      if (selectError) return { data: null, error: { message: selectError } };
      return { data: rows, error: null };
    },
  };

  const updateBuilder = (patch) => ({
    async in(col, vals) {
      calls.update = { col, vals, patch };
      if (updateError) return { error: { message: updateError } };
      return { error: null };
    },
  });

  return {
    calls,
    from(table) {
      if (table !== "account_export_requests") {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        select() { return selectBuilder; },
        update(patch) { return updateBuilder(patch); },
      };
    },
    storage: {
      from(bucket) {
        if (bucket !== "account-exports") {
          throw new Error(`unexpected bucket: ${bucket}`);
        }
        return {
          async remove(paths) {
            calls.storageRemove = paths;
            if (removeError) return { data: null, error: { message: removeError } };
            return { data: removed ?? paths.map((p) => ({ name: p })), error: null };
          },
        };
      },
    },
  };
}

const FIXED_NOW = new Date("2026-06-05T12:00:00.000Z");

describe("sweepExpiredExports — happy path", () => {
  test("expired rows with storage paths → storage removed + rows marked expired", async () => {
    const client = makeFakeClient({
      rows: [
        { id: "row-1", storage_path: "user-a/groundwork-export-2026-06-01.json", expires_at: "2026-06-02T00:00:00Z" },
        { id: "row-2", storage_path: "user-b/groundwork-export-2026-06-02.json", expires_at: "2026-06-03T00:00:00Z" },
      ],
    });

    const result = await sweepExpiredExports(client, FIXED_NOW);

    assert.equal(result.scanned, 2);
    assert.equal(result.purged, 2);
    assert.equal(result.marked, 2);
    assert.deepEqual(result.errors, []);

    // Verify the SELECT was filtered correctly.
    assert.equal(client.calls.select["eq:status"], "ready");
    assert.equal(client.calls.select["lt:expires_at"], FIXED_NOW.toISOString());
    assert.equal(client.calls.select["not:expires_at:is"], null);
    assert.equal(client.calls.select.limit, 500);

    // Verify storage removal targeted the right objects.
    assert.deepEqual(client.calls.storageRemove, [
      "user-a/groundwork-export-2026-06-01.json",
      "user-b/groundwork-export-2026-06-02.json",
    ]);

    // Verify the row update flipped status and stamped completed_at.
    assert.deepEqual(client.calls.update.vals, ["row-1", "row-2"]);
    assert.equal(client.calls.update.patch.status, "expired");
    assert.equal(client.calls.update.patch.completed_at, FIXED_NOW.toISOString());
  });
});

describe("sweepExpiredExports — empty backlog", () => {
  test("no expired rows → no storage call, all zeros", async () => {
    const client = makeFakeClient({ rows: [] });

    const result = await sweepExpiredExports(client, FIXED_NOW);

    assert.equal(result.scanned, 0);
    assert.equal(result.purged, 0);
    assert.equal(result.marked, 0);
    assert.equal(client.calls.storageRemove, null);
    assert.equal(client.calls.update, null);
  });
});

describe("sweepExpiredExports — null storage_path", () => {
  test("expired row with null storage_path → no remove call, row still marked", async () => {
    const client = makeFakeClient({
      rows: [
        { id: "row-failed", storage_path: null, expires_at: "2026-06-01T00:00:00Z" },
      ],
    });

    const result = await sweepExpiredExports(client, FIXED_NOW);

    assert.equal(result.scanned, 1);
    assert.equal(result.purged, 0);
    assert.equal(result.marked, 1);
    assert.equal(client.calls.storageRemove, null, "storage.remove must not be called when no valid paths");
    assert.deepEqual(client.calls.update.vals, ["row-failed"]);
  });
});

describe("sweepExpiredExports — storage error", () => {
  test("storage.remove fails → errors[] surfaces it, rows still marked", async () => {
    const client = makeFakeClient({
      rows: [{ id: "row-1", storage_path: "u/a.json", expires_at: "2026-06-01T00:00:00Z" }],
      removeError: "bucket unavailable",
    });

    const result = await sweepExpiredExports(client, FIXED_NOW);

    assert.equal(result.scanned, 1);
    assert.equal(result.purged, 0);
    assert.equal(result.marked, 1);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].kind, "storage_remove");
    assert.match(result.errors[0].detail, /bucket unavailable/);
  });
});

describe("sweepExpiredExports — db errors", () => {
  test("SELECT fails → returns zeros + select_failed error", async () => {
    const client = makeFakeClient({ selectError: "connection reset" });

    const result = await sweepExpiredExports(client, FIXED_NOW);

    assert.equal(result.scanned, 0);
    assert.equal(result.marked, 0);
    assert.equal(result.errors[0].kind, "select_failed");
  });

  test("UPDATE fails → marked=0, row_update error surfaced", async () => {
    const client = makeFakeClient({
      rows: [{ id: "row-1", storage_path: "u/a.json", expires_at: "2026-06-01T00:00:00Z" }],
      updateError: "duplicate key",
    });

    const result = await sweepExpiredExports(client, FIXED_NOW);

    assert.equal(result.scanned, 1);
    assert.equal(result.purged, 1); // storage delete already happened
    assert.equal(result.marked, 0);
    assert.equal(result.errors[0].kind, "row_update");
  });
});

describe("sweepExpiredExports — defence in depth", () => {
  test("storage_path > 1024 chars or empty string is filtered out before remove", async () => {
    const longPath = "u/" + "a".repeat(1100) + ".json";
    const client = makeFakeClient({
      rows: [
        { id: "row-good", storage_path: "u/legit.json", expires_at: "2026-06-01T00:00:00Z" },
        { id: "row-empty", storage_path: "", expires_at: "2026-06-01T00:00:00Z" },
        { id: "row-long", storage_path: longPath, expires_at: "2026-06-01T00:00:00Z" },
      ],
    });

    const result = await sweepExpiredExports(client, FIXED_NOW);

    assert.deepEqual(client.calls.storageRemove, ["u/legit.json"]);
    // All three rows still get marked expired — the row is the source of truth.
    assert.equal(result.marked, 3);
  });
});
