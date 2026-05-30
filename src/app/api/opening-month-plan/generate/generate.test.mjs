// TIM-1057: Smoke tests for the launch-plan generate SSE stream.
// Validates that SSE frame parsing produces correct state transitions for
// the generate flow — success, error, and paywall paths.

import test from "node:test";
import assert from "node:assert/strict";
import { consumeSseFrames } from "../../../../components/copilot/sse.ts";

// ── helpers ───────────────────────────────────────────────────────────────────

function buildSseFrame(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseSseBuffer(buf) {
  const { events } = consumeSseFrames(buf);
  const results = [];
  for (const { data } of events) {
    try {
      results.push(JSON.parse(data));
    } catch {
      // skip non-JSON (ping comments are filtered by consumeSseFrames)
    }
  }
  return results;
}

// ── Generate success path ─────────────────────────────────────────────────────

test("done event with milestones sets milestone list", () => {
  const milestones = [
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
  ];

  const buf = buildSseFrame("done", {
    inserted: 1,
    preserved: 0,
    lastGeneratedAt: "2026-05-25T12:00:00Z",
    milestones,
  });

  const payloads = parseSseBuffer(buf);
  assert.equal(payloads.length, 1);
  const p = payloads[0];
  assert.ok(Array.isArray(p.milestones), "milestones should be an array");
  assert.equal(p.milestones.length, 1);
  assert.equal(p.milestones[0].title, "Sign Lease");
  assert.equal(p.lastGeneratedAt, "2026-05-25T12:00:00Z");
});

// ── Generate error path ───────────────────────────────────────────────────────

test("error event with code surfaces message", () => {
  const buf = buildSseFrame("error", {
    code: "timeout",
    message: "Couldn't generate plan — try again or contact support.",
  });

  const payloads = parseSseBuffer(buf);
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].code, "timeout");
  assert.ok(payloads[0].message.length > 0);
});

test("db_error code is recognised as an error variant", () => {
  const buf = buildSseFrame("error", { code: "db_error", message: "Couldn't save the plan — try again or contact support." });
  const payloads = parseSseBuffer(buf);
  assert.equal(payloads[0].code, "db_error");
});

test("upstream_error code is recognised", () => {
  const buf = buildSseFrame("error", { code: "upstream_error", message: "Couldn't generate plan — try again or contact support." });
  const payloads = parseSseBuffer(buf);
  assert.equal(payloads[0].code, "upstream_error");
});

// ── Paywall path ──────────────────────────────────────────────────────────────

test("paywall event has code paywall", () => {
  const buf = buildSseFrame("error", { code: "paywall", reason: "no_subscription", tier_required: "starter" });
  const payloads = parseSseBuffer(buf);
  assert.equal(payloads[0].code, "paywall");
});

// ── Heartbeat ping is silently skipped ────────────────────────────────────────

test("heartbeat ping comment does not produce a payload", () => {
  const buf = `: ping\n\n` + buildSseFrame("done", { inserted: 0, preserved: 0, lastGeneratedAt: "2026-05-25T12:00:00Z", milestones: [] });
  const payloads = parseSseBuffer(buf);
  // The ping is skipped; only the done event parses
  assert.equal(payloads.length, 1);
  assert.ok("milestones" in payloads[0]);
});

// ── Partial chunk buffering ───────────────────────────────────────────────────

test("partial SSE frame is held in rest until complete", () => {
  const fullFrame = buildSseFrame("done", { inserted: 0, preserved: 0, milestones: [] });
  // Split halfway
  const half = Math.floor(fullFrame.length / 2);
  const chunk1 = fullFrame.slice(0, half);
  const chunk2 = fullFrame.slice(half);

  const { events: e1, rest } = consumeSseFrames(chunk1);
  assert.equal(e1.length, 0, "no complete frame in first chunk");
  assert.ok(rest.length > 0, "rest holds the partial frame");

  const { events: e2 } = consumeSseFrames(rest + chunk2);
  assert.equal(e2.length, 1, "complete frame parsed after second chunk");
});

// ── Done event with empty milestones ─────────────────────────────────────────

test("done event with empty milestones array is truthy and sets empty list", () => {
  const buf = buildSseFrame("done", { inserted: 0, preserved: 0, lastGeneratedAt: "2026-05-25T12:00:00Z", milestones: [] });
  const payloads = parseSseBuffer(buf);
  const p = payloads[0];
  // [] is truthy in JS — client code uses `if (payload.milestones)` which evaluates to true
  assert.ok(Array.isArray(p.milestones));
  assert.equal(p.milestones.length, 0);
});
