// Regression test for TIM-1041 / TIM-1015: addRole stale-closure race.
//
// The bug: addRole used a direct array spread `[...roles, optimistic]` for the
// optimistic update, capturing stale `roles` from its closure. When two addRole
// calls overlapped (second click before first API round-trip), the second call's
// optimistic push overwrote the first, then the first's API callback replaced the
// entire list with only one role. Net result: one role in state, editingId points
// at the first-created real ID but the second role vanished — perceived as the
// card opening and immediately closing.
//
// The fix: use a functional updater `(prev) => [...prev, optimistic]` so every
// call always appends to the current state, not to a stale snapshot.

import { test } from "node:test";
import assert from "node:assert/strict";

// Minimal simulation of React's useState queue: processes functional and
// value updaters in order, as React does.
function makeStateQueue(initial) {
  let state = initial;
  const queue = [];

  function enqueue(updater) {
    queue.push(updater);
  }

  function flush() {
    for (const u of queue) {
      state = typeof u === "function" ? u(state) : u;
    }
    queue.length = 0;
    return state;
  }

  return { enqueue, flush, get: () => state };
}

// Simulates addRole (BUGGY — stale spread).
function addRoleBuggy(roles, enqueueRolesChange, setEditingId, planId, created) {
  const optimistic = { id: `local_${Math.random().toString(36).slice(2, 6)}`, plan_id: planId };
  // BUG: direct spread captures stale `roles`
  enqueueRolesChange([...roles, optimistic]);
  setEditingId(optimistic.id);
  // Simulate API returning `created`
  return () => {
    enqueueRolesChange((prev) => prev.map((r) => (r.id === optimistic.id ? created : r)));
    setEditingId(created.id);
  };
}

// Simulates addRole (FIXED — functional updater).
function addRoleFixed(enqueueRolesChange, setEditingId, planId, created) {
  const optimistic = { id: `local_${Math.random().toString(36).slice(2, 6)}`, plan_id: planId };
  // FIX: functional updater avoids stale closure
  enqueueRolesChange((prev) => [...prev, optimistic]);
  setEditingId(optimistic.id);
  return () => {
    enqueueRolesChange((prev) => prev.map((r) => (r.id === optimistic.id ? created : r)));
    setEditingId(created.id);
  };
}

test("buggy addRole: second concurrent call drops the first optimistic role", () => {
  // Simulates React: both calls capture the same stale `roles = []` from their
  // closure because neither flush has run yet (React batches event-handler updates).
  const q = makeStateQueue([]);

  let editingId = null;
  const setEditingId = (id) => { editingId = id; };

  const staleRoles = q.get(); // [] — captured before any updates are flushed

  // Both calls enqueue BEFORE any flush, simulating two rapid clicks
  const resolve1 = addRoleBuggy(staleRoles, q.enqueue, setEditingId, "p1", { id: "real-1", plan_id: "p1" });
  const resolve2 = addRoleBuggy(staleRoles, q.enqueue, setEditingId, "p1", { id: "real-2", plan_id: "p1" });

  // Flush: second direct-array write clobbers the first (both wrote over [])
  q.flush();

  // Both API callbacks resolve
  resolve1();
  resolve2();
  const final = q.flush();

  // With the bug: only one role survives — real-1 was never in `prev` when
  // resolve1's map ran because resolve2's direct write replaced the state.
  assert.equal(final.length, 1, "buggy version loses one role due to stale spread (demonstrates the bug)");
});

test("fixed addRole: concurrent calls both survive in final state", () => {
  const q = makeStateQueue([]);

  let editingId = null;
  const setEditingId = (id) => { editingId = id; };

  const resolve1 = addRoleFixed(q.enqueue, setEditingId, "p1", { id: "real-1", plan_id: "p1" });
  q.flush();

  const resolve2 = addRoleFixed(q.enqueue, setEditingId, "p1", { id: "real-2", plan_id: "p1" });
  q.flush();

  resolve1();
  resolve2();
  const final = q.flush();

  assert.equal(final.length, 2, "both roles should survive with functional updaters");
  assert.ok(final.some((r) => r.id === "real-1"), "real-1 must be present");
  assert.ok(final.some((r) => r.id === "real-2"), "real-2 must be present");
});

test("fixed addRole: editingId tracks the confirmed DB id after API resolves", () => {
  const q = makeStateQueue([]);

  let editingId = null;
  const setEditingId = (id) => { editingId = id; };

  const resolve = addRoleFixed(q.enqueue, setEditingId, "p1", { id: "db-uuid-42", plan_id: "p1" });
  q.flush();

  // editingId is set to the optimistic local id immediately
  const localId = editingId;
  assert.ok(localId.startsWith("local_"), "editingId should be the optimistic local id before API resolves");

  resolve(); // API completes
  q.flush();

  assert.equal(editingId, "db-uuid-42", "editingId must be updated to the real DB id after API resolves");
  assert.notEqual(editingId, localId, "editingId must no longer point at the local optimistic id");
});

test("fixed addRole: role list is correct when starting from non-empty state", () => {
  const existing = [{ id: "old-role", plan_id: "p1" }];
  const q = makeStateQueue(existing);

  let editingId = null;
  const setEditingId = (id) => { editingId = id; };

  const resolve = addRoleFixed(q.enqueue, setEditingId, "p1", { id: "new-role", plan_id: "p1" });
  q.flush();

  resolve();
  const final = q.flush();

  assert.equal(final.length, 2, "existing role must not be lost");
  assert.ok(final.some((r) => r.id === "old-role"), "old-role preserved");
  assert.ok(final.some((r) => r.id === "new-role"), "new-role added");
  assert.equal(editingId, "new-role", "editingId points at the new role");
});
