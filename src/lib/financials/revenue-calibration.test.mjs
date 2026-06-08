// TIM-2521 (CQ-07): Pin shop-type × currency revenue calibration.
import test from "node:test";
import assert from "node:assert/strict";
import {
  calibrateRevenue,
  convertUsdTicketCents,
  dailyFlowFromAverage,
  SHOP_TYPE_REVENUE_BASES,
} from "./revenue-calibration.ts";

function dailyAvg(flow) {
  return (
    flow.mon + flow.tue + flow.wed + flow.thu + flow.fri + flow.sat + flow.sun
  ) / 7;
}

// ── AC#1: full_cafe + Seattle ≈ 275 cust/day × $12 ─────────────────────────
test("TIM-2521 AC#1: full_cafe seeds ≈ 275 cust/day × $12 ticket", () => {
  const r = calibrateRevenue({
    shopTypes: ["Full cafe with food"],
    currencyCode: "USD",
  });
  assert.equal(r.avg_ticket_cents, 1200, "full_cafe USD ticket = $12.00");
  const avg = dailyAvg(r.daily_flow);
  assert.ok(Math.abs(avg - 275) < 1, `daily_flow avg ${avg} ~= 275`);
  // Daily-flow shape: weekend skew preserved (Sat highest).
  assert.ok(r.daily_flow.sat > r.daily_flow.mon, "sat > mon");
  assert.ok(r.daily_flow.fri > r.daily_flow.thu, "fri > thu");
});

// ── AC#2: mobile_cart + Austin ≈ 100 cust/day × $7 ─────────────────────────
test("TIM-2521 AC#2: mobile_cart seeds ≈ 100 cust/day × $7 ticket", () => {
  const r = calibrateRevenue({
    shopTypes: ["Mobile cart or pop-up"],
    currencyCode: "USD",
  });
  assert.equal(r.avg_ticket_cents, 700, "mobile_cart USD ticket = $7.00");
  const avg = dailyAvg(r.daily_flow);
  assert.ok(Math.abs(avg - 100) < 1, `daily_flow avg ${avg} ~= 100`);
});

// ── Other shop types from CQ-07 spec table ─────────────────────────────────
test("TIM-2521: espresso_bar seeds 150-200 cust/day × $6.50", () => {
  const r = calibrateRevenue({
    shopTypes: ["Espresso bar (drinks only)"],
    currencyCode: "USD",
  });
  assert.equal(r.avg_ticket_cents, 650, "espresso_bar USD ticket = $6.50");
  const avg = dailyAvg(r.daily_flow);
  assert.ok(avg >= 150 && avg <= 200, `espresso_bar avg ${avg} in [150,200]`);
});

test("TIM-2521: drive_thru seeds 200-300 cust/day × $7", () => {
  const r = calibrateRevenue({
    shopTypes: ["Drive-through"],
    currencyCode: "USD",
  });
  assert.equal(r.avg_ticket_cents, 700, "drive_thru USD ticket = $7.00");
  const avg = dailyAvg(r.daily_flow);
  assert.ok(avg >= 200 && avg <= 300, `drive_thru avg ${avg} in [200,300]`);
});

test("TIM-2521: roastery_retail seeds 70-100 cust/day × $14", () => {
  const r = calibrateRevenue({
    shopTypes: ["Roastery cafe"],
    currencyCode: "USD",
  });
  assert.equal(r.avg_ticket_cents, 1400, "roastery_retail USD ticket = $14.00");
  const avg = dailyAvg(r.daily_flow);
  assert.ok(avg >= 70 && avg <= 100, `roastery_retail avg ${avg} in [70,100]`);
});

// ── Currency conversion: ticket FX'd into plan's currency ──────────────────
test("TIM-2521: AUD plan FX-converts USD ticket (~×1.5)", () => {
  const r = calibrateRevenue({
    shopTypes: ["Full cafe with food"],
    currencyCode: "AUD",
  });
  // 1200 USD × 1.50 = 1800 cents → $18.00 AUD, rounded to nearest 25¢.
  assert.equal(r.avg_ticket_cents, 1800);
});

test("TIM-2521: CAD plan FX-converts USD ticket (~×1.37)", () => {
  const r = calibrateRevenue({
    shopTypes: ["Full cafe with food"],
    currencyCode: "CAD",
  });
  // 1200 × 1.37 = 1644 → nearest 25¢ = 1650 ($16.50 CAD).
  assert.equal(r.avg_ticket_cents, 1650);
});

test("TIM-2521: MXN plan FX-converts USD ticket (~×18)", () => {
  const r = calibrateRevenue({
    shopTypes: ["Mobile cart or pop-up"],
    currencyCode: "MXN",
  });
  // 700 × 18 = 12600 → already on quarter boundary.
  assert.equal(r.avg_ticket_cents, 12600);
});

test("TIM-2521: unknown currency falls back to USD (×1.0)", () => {
  const r = calibrateRevenue({
    shopTypes: ["Full cafe with food"],
    currencyCode: "ZZZ",
  });
  assert.equal(r.avg_ticket_cents, 1200);
});

// ── Default fall-back: no shop types → full_cafe (safe upper bound) ────────
test("TIM-2521: null shopTypes falls back to full_cafe", () => {
  const r = calibrateRevenue({ currencyCode: "USD" });
  assert.equal(r.avg_ticket_cents, 1200);
  const avg = dailyAvg(r.daily_flow);
  assert.ok(Math.abs(avg - 275) < 1);
});

test("TIM-2521: null currency falls back to USD", () => {
  const r = calibrateRevenue({ shopTypes: ["Full cafe with food"] });
  assert.equal(r.avg_ticket_cents, 1200);
});

// ── Multi-select picks most capital-intensive shop type ────────────────────
test("TIM-2521: roastery+cart selection seeds roastery (largest)", () => {
  const r = calibrateRevenue({
    shopTypes: ["Mobile cart or pop-up", "Roastery cafe"],
    currencyCode: "USD",
  });
  assert.equal(r.avg_ticket_cents, 1400);
});

// ── Helper invariants ──────────────────────────────────────────────────────
test("TIM-2521: convertUsdTicketCents rounds to nearest quarter", () => {
  // 1234 cents × 1.0 should round to 1225 (nearest 25).
  assert.equal(convertUsdTicketCents(1234, "USD"), 1225);
  assert.equal(convertUsdTicketCents(1213, "USD"), 1225);
  assert.equal(convertUsdTicketCents(1212, "USD"), 1200);
});

test("TIM-2521: dailyFlowFromAverage preserves weekend skew", () => {
  const flow = dailyFlowFromAverage(100);
  assert.ok(flow.sat > flow.fri, "sat > fri");
  assert.ok(flow.fri > flow.mon, "fri > mon");
  assert.ok(flow.wed === flow.thu, "wed == thu");
  // Sum should average to ~100.
  const total = flow.mon + flow.tue + flow.wed + flow.thu + flow.fri + flow.sat + flow.sun;
  assert.ok(Math.abs(total - 700) < 7, `weekly sum ${total} ~= 700`);
});

test("TIM-2521: base table covers all 5 shop-type keys", () => {
  assert.deepEqual(
    Object.keys(SHOP_TYPE_REVENUE_BASES).sort(),
    ["drive_thru", "espresso_bar", "full_cafe", "mobile_cart", "roastery_retail"],
  );
});
