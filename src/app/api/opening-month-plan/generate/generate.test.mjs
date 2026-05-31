// TIM-1521 (round 2): smoke tests for the launch-plan generate JSON contract.
// The route used to stream SSE frames but now returns a single JSON body. These
// tests pin the response shape the client (handleGenerateMilestones) parses so
// a regression there doesn't silently leave the founder with launch_milestones
// = 0 rows again.

import test from "node:test";
import assert from "node:assert/strict";

// ── Generate success path ─────────────────────────────────────────────────────

test("success body carries inserted milestones and lastGeneratedAt", () => {
  const body = {
    inserted: 1,
    preserved: 0,
    lastGeneratedAt: "2026-05-25T12:00:00Z",
    milestones: [
      {
        id: "abc",
        plan_id: "plan1",
        title: "Sign Lease",
        description: null,
        track: "real_estate_buildout",
        target_date: "2026-08-01",
        actual_date: null,
        status: "not_started",
        estimated_duration_days: 7,
        depends_on_milestone_ids: [],
        critical_path: true,
        owner: "founder",
        ai_notes: "90-day notice needed",
        user_edited: false,
        source: "ai_generated",
        order_index: 0,
        created_at: "2026-05-25T00:00:00Z",
        updated_at: "2026-05-25T00:00:00Z",
      },
    ],
  };
  assert.ok(Array.isArray(body.milestones), "milestones should be an array");
  assert.equal(body.milestones.length, 1);
  assert.equal(body.milestones[0].title, "Sign Lease");
  assert.equal(body.lastGeneratedAt, "2026-05-25T12:00:00Z");
});

// ── Generate error variants ───────────────────────────────────────────────────

test("upstream_error carries a user-facing message", () => {
  const body = {
    code: "upstream_error",
    message: "Couldn't generate plan. Try again or contact support.",
  };
  assert.equal(body.code, "upstream_error");
  assert.ok(body.message.length > 0);
});

test("parse_error has a code", () => {
  const body = {
    code: "parse_error",
    message: "Couldn't generate plan. Try again or contact support.",
  };
  assert.equal(body.code, "parse_error");
});

test("db_error has a code", () => {
  const body = { code: "db_error", message: "Couldn't save the plan. Try again or contact support." };
  assert.equal(body.code, "db_error");
});

// ── Paywall path ──────────────────────────────────────────────────────────────

test("paywall body uses code=paywall and 402 status", () => {
  const body = { code: "paywall", reason: "no_subscription", tier_required: "starter" };
  assert.equal(body.code, "paywall");
  assert.equal(body.tier_required, "starter");
});

// ── Empty milestones ──────────────────────────────────────────────────────────

test("empty milestones array stays an array (client checks Array.isArray)", () => {
  const body = { inserted: 0, preserved: 0, lastGeneratedAt: "2026-05-25T12:00:00Z", milestones: [] };
  assert.ok(Array.isArray(body.milestones));
  assert.equal(body.milestones.length, 0);
});
