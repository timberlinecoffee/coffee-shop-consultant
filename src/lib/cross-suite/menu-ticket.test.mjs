// TIM-2482 (F13): menu↔ticket detector — pure-function tests.
//
// Run via node:test with --experimental-strip-types so .ts can load directly.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MENU_TICKET_ABS_TOLERANCE_CENTS,
  MENU_TICKET_REL_TOLERANCE,
  detectMenuTicketMismatch,
  isMenuTicketDriftMeaningful,
} from "./menu-ticket.ts";

// ── Tolerance pinning ────────────────────────────────────────────────────────

test("tolerance constants are 5% relative AND 25¢ absolute", () => {
  // Both gates must be exceeded — keep the constants public so the workspace
  // banner and the detector agree on what triggers a surface.
  assert.equal(MENU_TICKET_REL_TOLERANCE, 0.05);
  assert.equal(MENU_TICKET_ABS_TOLERANCE_CENTS, 25);
});

test("drift under either threshold returns false", () => {
  // 20¢ delta on $7.50 ticket — absolute gate fails (20 < 25).
  assert.equal(isMenuTicketDriftMeaningful(770, 750), false);
  // 25¢ delta on $25.00 ticket — relative gate fails (25/2500 = 1% < 5%).
  assert.equal(isMenuTicketDriftMeaningful(2525, 2500), false);
});

test("drift over both thresholds returns true", () => {
  // 70¢ delta on $7.50 ticket → 9.3% — both gates clear.
  assert.equal(isMenuTicketDriftMeaningful(820, 750), true);
  // 60¢ delta on $5.00 ticket → 12% — both gates clear.
  assert.equal(isMenuTicketDriftMeaningful(560, 500), true);
});

test("isMenuTicketDriftMeaningful rejects missing inputs", () => {
  assert.equal(isMenuTicketDriftMeaningful(null, 750), false);
  assert.equal(isMenuTicketDriftMeaningful(0, 750), false);
  assert.equal(isMenuTicketDriftMeaningful(820, 0), false);
});

// ── Detector — happy path: menu blend ABOVE forecast (F13 spec case) ────────

const aboveInput = {
  menuBlendedTicketCents: 820, // $8.20 menu blend
  forecastAvgTicketCents: 750, // $7.50 forecast default
  activeMenuItemCount: 5,
  currencyCode: "USD",
};

test("F13 spec case: menu $8.20 vs forecast $7.50 surfaces a conflict", () => {
  const c = detectMenuTicketMismatch(aboveInput);
  assert.ok(c, "should detect");
  assert.equal(c.id, "menu_ticket_mismatch");
  assert.equal(c.kind, "numeric");
  assert.equal(c.suiteA.suiteKey, "menu-pricing");
  assert.equal(c.suiteB.suiteKey, "financials");
  assert.match(c.suiteA.displayValue, /\$8\.20/);
  assert.match(c.suiteB.displayValue, /\$7\.50/);
  assert.match(c.suiteA.displaySubvalue ?? "", /5 priced items/);
});

test("statement leads with the menu-is-higher framing when menu > forecast", () => {
  const c = detectMenuTicketMismatch(aboveInput);
  assert.match(c.statement, /menu prices imply a higher average ticket/i);
});

test("gap label calls out the per-ticket dollar delta", () => {
  const c = detectMenuTicketMismatch(aboveInput);
  // Delta = $8.20 - $7.50 = $0.70
  assert.match(c.gapLabel ?? "", /\$0\.70/);
});

test("two paths surfaced, recommended is sync-forecast-to-menu", () => {
  const c = detectMenuTicketMismatch(aboveInput);
  assert.equal(c.paths.length, 2);
  assert.equal(c.paths[0].id, "sync_forecast_to_menu");
  assert.equal(c.paths[1].id, "reprice_menu_to_forecast");
  assert.equal(c.recommendedPathId, "sync_forecast_to_menu");
});

test("sync path emits one structured suggestion: forecast avg_ticket_cents", () => {
  const c = detectMenuTicketMismatch(aboveInput);
  const syncPath = c.paths.find((p) => p.id === "sync_forecast_to_menu");
  assert.ok(syncPath);
  assert.equal(syncPath.suggestions.length, 1);
  const s = syncPath.suggestions[0];
  assert.equal(
    s.fieldId,
    "cross_suite:menu_ticket_mismatch:sync_forecast_to_menu:financials:forecast:avg_ticket_cents",
  );
  assert.equal(s.workspaceLabel, "Financials");
  assert.match(s.originalValue, /\$7\.50/);
  assert.match(s.proposedValue, /\$8\.20/);
});

test("sync path downstream effects mention the directional impact", () => {
  const c = detectMenuTicketMismatch(aboveInput);
  const syncPath = c.paths.find((p) => p.id === "sync_forecast_to_menu");
  // 3 effects: avg ticket / revenue projection / break-even.
  assert.equal(syncPath.downstreamEffects.length, 3);
  const breakEven = syncPath.downstreamEffects.find((e) => e.field === "Break-even point");
  assert.match(breakEven.to, /Break-even transactions drop/i);
});

test("reprice path emits NO structured suggestions — repricing is human judgement", () => {
  const c = detectMenuTicketMismatch(aboveInput);
  const repricePath = c.paths.find((p) => p.id === "reprice_menu_to_forecast");
  assert.equal(repricePath.suggestions.length, 0);
});

// ── Detector — inverted case: menu blend BELOW forecast ────────────────────

const belowInput = {
  menuBlendedTicketCents: 600, // $6.00 menu blend
  forecastAvgTicketCents: 750, // $7.50 forecast
  activeMenuItemCount: 4,
  currencyCode: "USD",
};

test("inverted case: forecast > menu surfaces an overshoot warning", () => {
  const c = detectMenuTicketMismatch(belowInput);
  assert.ok(c);
  assert.match(c.statement, /financial plan is forecasting a higher average ticket/i);
  // Break-even effect direction flips — break-even transactions RISE.
  const syncPath = c.paths.find((p) => p.id === "sync_forecast_to_menu");
  const breakEven = syncPath.downstreamEffects.find((e) => e.field === "Break-even point");
  assert.match(breakEven.to, /Break-even transactions rise/i);
});

// ── Detector — no-op cases ──────────────────────────────────────────────────

test("returns null when menu blend is null (no priced items)", () => {
  assert.equal(
    detectMenuTicketMismatch({ ...aboveInput, menuBlendedTicketCents: null }),
    null,
  );
});

test("returns null when forecast avg ticket is 0", () => {
  assert.equal(
    detectMenuTicketMismatch({ ...aboveInput, forecastAvgTicketCents: 0 }),
    null,
  );
});

test("returns null when activeMenuItemCount is 0 (defensive)", () => {
  assert.equal(
    detectMenuTicketMismatch({ ...aboveInput, activeMenuItemCount: 0 }),
    null,
  );
});

test("returns null when drift is under the tolerance threshold", () => {
  // 750 → 770 = $0.20 delta, 2.7% relative — below both gates.
  assert.equal(
    detectMenuTicketMismatch({ ...aboveInput, menuBlendedTicketCents: 770 }),
    null,
  );
});

// ── Currency-neutral formatting ────────────────────────────────────────────

test("non-USD currency renders with the ISO code prefix, not $", () => {
  const c = detectMenuTicketMismatch({ ...aboveInput, currencyCode: "CAD" });
  assert.match(c.suiteA.displayValue, /^CAD /);
  assert.match(c.suiteB.displayValue, /^CAD /);
  assert.equal(c.suiteA.displayValue.includes("$"), false);
});

// ── Drift guard — fieldId convention must be 6 colon-separated parts ───────

test("drift guard: fieldId conforms to cross_suite:<6-parts> convention", () => {
  const c = detectMenuTicketMismatch(aboveInput);
  const syncPath = c.paths.find((p) => p.id === "sync_forecast_to_menu");
  const s = syncPath.suggestions[0];
  const parts = s.fieldId.split(":");
  assert.equal(parts.length, 6);
  assert.equal(parts[0], "cross_suite");
  assert.equal(parts[1], "menu_ticket_mismatch"); // conflict id
  assert.equal(parts[2], "sync_forecast_to_menu"); // path id
  assert.equal(parts[3], "financials"); // suite key
  assert.equal(parts[4], "forecast"); // record key
  assert.equal(parts[5], "avg_ticket_cents"); // column
});
