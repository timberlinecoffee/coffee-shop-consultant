// TIM-1259: unit tests for the org-structure <-> Salaries sync logic.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeOrgSyncDiff,
  applyOrgToSalaries,
  applySalariesToOrg,
  relinkAfterPush,
} from "./org-sync.ts";

// A monthly-pay line of `amount` cents/head with no benefits has loaded cost
// = amount * headcount, which makes the org<->salaries cost comparison exact.
function line(over = {}) {
  return {
    id: "staff:1",
    role: "Barista",
    headcount: 2,
    pay_basis: "monthly",
    pay_amount_cents: 300000,
    benefits_pct: 0,
    cost_category: "overhead",
    ...over,
  };
}

function role(over = {}) {
  return {
    id: "role:1",
    role_title: "Barista",
    headcount: 2,
    monthly_cost_cents: 600000,
    ...over,
  };
}

// ── diff: matching ──────────────────────────────────────────────────────────

test("name match with equal headcount and cost is in sync", () => {
  const diff = computeOrgSyncDiff([line()], [role()]);
  assert.equal(diff.rows.length, 1);
  assert.equal(diff.rows[0].status, "linked_in_sync");
  assert.equal(diff.rows[0].matchedBy, "name");
  assert.equal(diff.counts.inSync, 1);
});

test("id link takes priority over name", () => {
  const l = line({ role: "Renamed In Salaries", org_role_id: "role:1" });
  const diff = computeOrgSyncDiff([l], [role()]);
  assert.equal(diff.rows[0].matchedBy, "id");
  assert.equal(diff.rows[0].status, "linked_diff");
  assert.equal(diff.rows[0].nameDiffers, true);
});

test("headcount divergence flags linked_diff", () => {
  const diff = computeOrgSyncDiff([line({ headcount: 2 })], [role({ headcount: 5 })]);
  assert.equal(diff.rows[0].status, "linked_diff");
  assert.equal(diff.rows[0].headcountDiffers, true);
});

test("cost divergence beyond tolerance flags linked_diff", () => {
  const diff = computeOrgSyncDiff([line()], [role({ monthly_cost_cents: 700000 })]);
  assert.equal(diff.rows[0].costDiffers, true);
  assert.equal(diff.rows[0].status, "linked_diff");
});

test("cost within tolerance does not flag", () => {
  const diff = computeOrgSyncDiff([line()], [role({ monthly_cost_cents: 600050 })]);
  assert.equal(diff.rows[0].costDiffers, false);
  assert.equal(diff.rows[0].status, "linked_in_sync");
});

test("org-only and salaries-only are classified", () => {
  const diff = computeOrgSyncDiff(
    [line({ id: "staff:x", role: "Owner" })],
    [role({ id: "role:y", role_title: "Dishwasher" })]
  );
  const byStatus = Object.fromEntries(diff.rows.map((r) => [r.status, r]));
  assert.ok(byStatus.org_only);
  assert.ok(byStatus.salaries_only);
  assert.equal(diff.counts.orgOnly, 1);
  assert.equal(diff.counts.salariesOnly, 1);
});

// ── pull: org -> salaries ─────────────────────────────────────────────────────

test("pull updates name and headcount, sets link, preserves financial-only fields", () => {
  const l = line({
    role: "Barista",
    org_role_id: "role:1", // already linked, so the org rename matches by id
    headcount: 2,
    benefits_pct: 18,
    benefits_fixed_cents: 5000,
    ramp: { enabled: true, start_month: 3, ramp_months: 2, start_pct: 50 },
    end_month: 12,
  });
  const r = role({ role_title: "Lead Barista", headcount: 4 });
  const { personnel, updated, added } = applyOrgToSalaries([l], [r]);
  assert.equal(added, 0);
  assert.equal(updated, 1);
  const out = personnel[0];
  assert.equal(out.role, "Lead Barista"); // Title Case from org
  assert.equal(out.headcount, 4);
  assert.equal(out.org_role_id, "role:1");
  // financial-only fields untouched
  assert.equal(out.benefits_pct, 18);
  assert.equal(out.benefits_fixed_cents, 5000);
  assert.equal(out.end_month, 12);
  assert.deepEqual(out.ramp, { enabled: true, start_month: 3, ramp_months: 2, start_pct: 50 });
  // existing pay is not clobbered
  assert.equal(out.pay_amount_cents, 300000);
});

test("pull seeds pay only when the line has none", () => {
  const l = line({ role: "Barista", pay_amount_cents: 0, pay_basis: "hourly", hours_per_week: 30 });
  const r = role({ role_title: "Barista", headcount: 2, monthly_cost_cents: 600000 });
  const { personnel } = applyOrgToSalaries([l], [r]);
  assert.equal(personnel[0].pay_basis, "monthly");
  assert.equal(personnel[0].pay_amount_cents, 300000); // 600000 / 2 heads
  assert.equal(personnel[0].hours_per_week, undefined);
});

test("pull adds a new line for an org-only role", () => {
  const r = role({ id: "role:new", role_title: "Pastry Chef", headcount: 1, monthly_cost_cents: 400000 });
  const { personnel, added } = applyOrgToSalaries([], [r]);
  assert.equal(added, 1);
  assert.equal(personnel.length, 1);
  assert.equal(personnel[0].role, "Pastry Chef");
  assert.equal(personnel[0].headcount, 1);
  assert.equal(personnel[0].pay_amount_cents, 400000);
  assert.equal(personnel[0].org_role_id, "role:new");
});

test("pull with roleIds applies only the selected role", () => {
  const r1 = role({ id: "role:1", role_title: "Barista" });
  const r2 = role({ id: "role:2", role_title: "Manager" });
  const { personnel, added } = applyOrgToSalaries([], [r1, r2], { roleIds: ["role:2"] });
  assert.equal(added, 1);
  assert.equal(personnel[0].role, "Manager");
});

// ── push: salaries -> org ─────────────────────────────────────────────────────

test("push produces an update for a matched role and a create for a new one", () => {
  const linked = line({ id: "staff:a", role: "Barista", org_role_id: "role:1", headcount: 3 });
  const fresh = line({ id: "staff:b", role: "Owner", headcount: 1, pay_amount_cents: 100000 });
  const { upserts } = applySalariesToOrg([linked, fresh], [role()]);
  assert.equal(upserts.length, 2);
  const update = upserts.find((u) => u.id === "role:1");
  assert.ok(update);
  assert.equal(update.headcount, 3);
  assert.equal(update.monthly_cost_cents, 900000); // 300000 * 3
  const create = upserts.find((u) => !u.id);
  assert.ok(create);
  assert.equal(create.role_title, "Owner");
  assert.equal(create.monthly_cost_cents, 100000);
});

test("push with lineIds pushes only selected lines", () => {
  const a = line({ id: "staff:a", role: "Barista" });
  const b = line({ id: "staff:b", role: "Owner" });
  const { upserts } = applySalariesToOrg([a, b], [], { lineIds: ["staff:b"] });
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].role_title, "Owner");
});

test("relinkAfterPush sets org_role_id for newly created same-named roles", () => {
  const l = line({ id: "staff:b", role: "Owner" }); // no org_role_id
  const newRoles = [role({ id: "role:created", role_title: "Owner", headcount: 1 })];
  const out = relinkAfterPush([l], newRoles);
  assert.equal(out[0].org_role_id, "role:created");
});

test("relinkAfterPush does not steal an already-used role id", () => {
  const a = line({ id: "staff:a", role: "Owner", org_role_id: "role:created" });
  const b = line({ id: "staff:b", role: "Owner" });
  const newRoles = [role({ id: "role:created", role_title: "Owner" })];
  const out = relinkAfterPush([a, b], newRoles);
  assert.equal(out[1].org_role_id, undefined); // role:created already taken by a
});

// ── round-trip safety ─────────────────────────────────────────────────────────

test("pull then push is stable (no churn) for an in-sync pair", () => {
  const l = line();
  const r = role();
  const pulled = applyOrgToSalaries([l], [r]).personnel;
  const { upserts } = applySalariesToOrg(pulled, [r]);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].id, "role:1");
  assert.equal(upserts[0].headcount, 2);
  assert.equal(upserts[0].monthly_cost_cents, 600000);
});
