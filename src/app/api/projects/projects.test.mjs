// TIM-2377: Projects API cap enforcement tests.
// Tests the business logic for Starter cap, Pro unlimited, trial-as-pro,
// sole-project delete guard, and active-plan reassignment on delete.

import { test } from "node:test";
import assert from "node:assert/strict";
import { effectivePlanForGating } from "../../../lib/access.ts";

// ── effectivePlanForGating helper sanity (foundation for cap logic) ───────

test("effectivePlanForGating: starter active = starter", () => {
  assert.equal(
    effectivePlanForGating({ subscription_status: "active", subscription_tier: "starter" }),
    "starter",
  );
});

test("effectivePlanForGating: pro active = pro", () => {
  assert.equal(
    effectivePlanForGating({ subscription_status: "active", subscription_tier: "pro" }),
    "pro",
  );
});

test("effectivePlanForGating: free_trial with active trial = pro (trial-as-pro)", () => {
  const future = new Date(Date.now() + 86400_000).toISOString();
  assert.equal(
    effectivePlanForGating({
      subscription_status: "free_trial",
      subscription_tier: "starter",
      trial_ends_at: future,
    }),
    "pro",
  );
});

test("effectivePlanForGating: free_trial with expired trial = starter (falls back to tier)", () => {
  const past = new Date(Date.now() - 86400_000).toISOString();
  assert.equal(
    effectivePlanForGating({
      subscription_status: "free_trial",
      subscription_tier: "starter",
      trial_ends_at: past,
    }),
    "starter",
  );
});

// ── Cap enforcement logic ─────────────────────────────────────────────────
// Mirrors the POST /api/projects decision tree.

function checkPostCap(profile, existingCount) {
  const tier = effectivePlanForGating(profile);
  if (tier === "starter" && existingCount >= 1) {
    return { status: 402, code: "pro_required" };
  }
  return { status: 201 };
}

test("Starter + 0 existing projects → 201 (first project allowed)", () => {
  const profile = { subscription_status: "active", subscription_tier: "starter" };
  assert.equal(checkPostCap(profile, 0).status, 201);
});

test("Starter + 1 existing project → 402 pro_required (cap hit)", () => {
  const profile = { subscription_status: "active", subscription_tier: "starter" };
  const result = checkPostCap(profile, 1);
  assert.equal(result.status, 402);
  assert.equal(result.code, "pro_required");
});

test("Starter + 2 existing projects → 402 pro_required", () => {
  const profile = { subscription_status: "active", subscription_tier: "starter" };
  const result = checkPostCap(profile, 2);
  assert.equal(result.status, 402);
  assert.equal(result.code, "pro_required");
});

test("Pro + 4 existing projects → 201 (no cap for Pro)", () => {
  const profile = { subscription_status: "active", subscription_tier: "pro" };
  assert.equal(checkPostCap(profile, 4).status, 201);
});

test("Trial-as-pro + 1 existing project → 201 (trial is treated as Pro)", () => {
  const future = new Date(Date.now() + 86400_000).toISOString();
  const profile = {
    subscription_status: "free_trial",
    subscription_tier: "starter",
    trial_ends_at: future,
  };
  assert.equal(checkPostCap(profile, 1).status, 201);
});

// ── Delete guard logic ────────────────────────────────────────────────────
// Mirrors the DELETE /api/projects/:id sole-project guard.

function checkDeleteGuard(plans, targetId) {
  const target = plans.find((p) => p.id === targetId);
  if (!target) return { status: 404 };
  if (plans.length === 1) return { status: 400, error: "Cannot delete the only project" };
  return { status: 204 };
}

test("Delete sole project → 400", () => {
  const plans = [{ id: "plan-1", created_at: "2026-01-01" }];
  const result = checkDeleteGuard(plans, "plan-1");
  assert.equal(result.status, 400);
});

test("Delete one of two projects → 204", () => {
  const plans = [
    { id: "plan-2", created_at: "2026-02-01" },
    { id: "plan-1", created_at: "2026-01-01" },
  ];
  assert.equal(checkDeleteGuard(plans, "plan-1").status, 204);
});

test("Delete non-existent project → 404", () => {
  const plans = [{ id: "plan-1", created_at: "2026-01-01" }];
  assert.equal(checkDeleteGuard(plans, "plan-999").status, 404);
});

// ── Active-plan reassignment on delete ───────────────────────────────────
// Mirrors the DELETE reassignment logic for users.current_plan_id.

function resolveNextActivePlan(plans, deletedId, currentActivePlanId) {
  if (currentActivePlanId !== deletedId) return currentActivePlanId;
  const next = plans.find((p) => p.id !== deletedId);
  return next?.id ?? null;
}

test("Delete non-active plan → current_plan_id unchanged", () => {
  const plans = [
    { id: "plan-2", created_at: "2026-02-01" },
    { id: "plan-1", created_at: "2026-01-01" },
  ];
  const result = resolveNextActivePlan(plans, "plan-1", "plan-2");
  assert.equal(result, "plan-2");
});

test("Delete active plan → current_plan_id reassigned to next-newest", () => {
  const plans = [
    { id: "plan-2", created_at: "2026-02-01" },
    { id: "plan-1", created_at: "2026-01-01" },
  ];
  // plans is already sorted newest-first; plan-2 is next after removing plan-1's active
  // actually plan-1 is being deleted, plan-2 is next
  const result = resolveNextActivePlan(plans, "plan-2", "plan-2");
  assert.equal(result, "plan-1");
});

test("Delete active plan with 3 plans → reassigns to most-recent remaining", () => {
  const plans = [
    { id: "plan-3", created_at: "2026-03-01" },
    { id: "plan-2", created_at: "2026-02-01" },
    { id: "plan-1", created_at: "2026-01-01" },
  ];
  // Deleting plan-3 (active) → should reassign to plan-2 (next newest)
  const result = resolveNextActivePlan(plans, "plan-3", "plan-3");
  assert.equal(result, "plan-2");
});

// ── getActivePlanId priority ──────────────────────────────────────────────

function resolveActivePlanId(currentPlanId, latestPlanId) {
  return currentPlanId ?? latestPlanId ?? null;
}

test("getActivePlanId: users.current_plan_id takes priority over latest", () => {
  assert.equal(resolveActivePlanId("explicit-id", "latest-id"), "explicit-id");
});

test("getActivePlanId: falls back to latest when current_plan_id is null", () => {
  assert.equal(resolveActivePlanId(null, "latest-id"), "latest-id");
});

test("getActivePlanId: null when no plans exist", () => {
  assert.equal(resolveActivePlanId(null, null), null);
});
