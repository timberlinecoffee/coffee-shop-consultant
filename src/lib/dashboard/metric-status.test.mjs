// TIM-4102 (T1-C): no metric may render a bare absence.
//
// The bug: computeBreakEvenModel's reason for declining was computed and then
// discarded in favour of `0`, which Home drew as an em dash. These tests pin
// the recovered reasons — one per way the calculation can legitimately fail —
// and the rule that our own failures are never blamed on the owner's inputs.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveBreakEvenStatus,
  deriveRunwayStatus,
  deriveRevenueStatus,
  showsRevenueRamp,
  rampExplanation,
  BREAK_EVEN_BLOCKED_COPY,
  BREAK_EVEN_BLOCKED_WORKSPACE_COPY,
  RUNWAY_BLOCKED_COPY,
  REVENUE_BLOCKED_COPY,
} from "./metric-status.ts";

// A healthy model: 30% contribution margin, $12,000/mo fixed costs.
function healthyModel(overrides = {}) {
  return {
    breakEvenRevenueCents: 4_000_000,
    breakEvenTransactions: 4878,
    contributionMarginPct: 0.3,
    contributionPerTicketCents: 246,
    variablePct: 0.7,
    fixedCostsCents: 1_200_000,
    avgTicketCents: 820,
    ...overrides,
  };
}

// ── Break-even ───────────────────────────────────────────────────────────────

test("a computable break-even is not blocked", () => {
  const s = deriveBreakEvenStatus({
    model: healthyModel(),
    avgTicketCents: 820,
    netRevenueCents: 5_200_000,
  });
  assert.equal(s.ok, true);
});

test("no sales modelled yet reports no_revenue, not a generic failure", () => {
  // computeBreakEvenModel returns null when net revenue is <= 0. Pre-T1-C this
  // became `0` and then a dash, which told the owner nothing at all.
  const s = deriveBreakEvenStatus({
    model: null,
    avgTicketCents: 820,
    netRevenueCents: 0,
  });
  assert.equal(s.ok, false);
  assert.equal(s.reason, "no_revenue");
});

test("a zero ticket price reports no_avg_ticket", () => {
  const s = deriveBreakEvenStatus({
    model: null,
    avgTicketCents: 0,
    netRevenueCents: 5_200_000,
  });
  assert.equal(s.ok, false);
  assert.equal(s.reason, "no_avg_ticket");
});

test("break-even of zero is a missing input, not an achievement", () => {
  // Fixed costs of 0 make break-even solve to 0. That is arithmetically true
  // and completely useless — and it is exactly the value that used to render
  // as a dash. It must read as "you haven't entered your rent yet".
  const s = deriveBreakEvenStatus({
    model: healthyModel({ fixedCostsCents: 0, breakEvenRevenueCents: 0 }),
    avgTicketCents: 820,
    netRevenueCents: 5_200_000,
  });
  assert.equal(s.ok, false);
  assert.equal(s.reason, "no_fixed_costs");
});

test("costs that eat every dollar of sales report no_contribution_margin", () => {
  // Genuinely infinite break-even. This is a real and serious finding about
  // the plan, and the old dash buried it completely.
  const s = deriveBreakEvenStatus({
    model: healthyModel({
      contributionMarginPct: -0.05,
      breakEvenRevenueCents: Infinity,
      breakEvenTransactions: Infinity,
    }),
    avgTicketCents: 820,
    netRevenueCents: 5_200_000,
  });
  assert.equal(s.ok, false);
  assert.equal(s.reason, "no_contribution_margin");
});

test("a zero contribution margin is blocked too, not treated as positive", () => {
  const s = deriveBreakEvenStatus({
    model: healthyModel({ contributionMarginPct: 0, breakEvenRevenueCents: Infinity }),
    avgTicketCents: 820,
    netRevenueCents: 5_200_000,
  });
  assert.equal(s.ok, false);
  assert.equal(s.reason, "no_contribution_margin");
});

test("margin is checked before fixed costs so the message names the real problem", () => {
  // Both are wrong at once. Telling someone to add rent when their COGS is
  // over 100% would send them to fix the wrong screen.
  const s = deriveBreakEvenStatus({
    model: healthyModel({ contributionMarginPct: -0.2, fixedCostsCents: 0 }),
    avgTicketCents: 820,
    netRevenueCents: 5_200_000,
  });
  assert.equal(s.reason, "no_contribution_margin");
});

test("a thrown computation is our fault and says so", () => {
  const s = deriveBreakEvenStatus({
    model: null,
    avgTicketCents: 820,
    netRevenueCents: 5_200_000,
    computeThrew: true,
  });
  assert.equal(s.ok, false);
  assert.equal(s.reason, "compute_failed");
});

test("a null model with healthy-looking inputs falls back to compute_failed", () => {
  // Nothing about the owner's inputs explains this, so we must not invent an
  // instruction for them to follow.
  const s = deriveBreakEvenStatus({
    model: null,
    avgTicketCents: 820,
    netRevenueCents: 5_200_000,
  });
  assert.equal(s.reason, "compute_failed");
});

test("a non-finite break-even revenue never reaches the screen as a number", () => {
  const s = deriveBreakEvenStatus({
    model: healthyModel({ breakEvenRevenueCents: Infinity }),
    avgTicketCents: 820,
    netRevenueCents: 5_200_000,
  });
  assert.equal(s.ok, false);
});

// ── Runway ───────────────────────────────────────────────────────────────────

test("runway needs both funding and monthly costs", () => {
  assert.equal(
    deriveRunwayStatus({ totalFundingCents: 5_000_000, monthlyBurnCents: 800_000 }).ok,
    true
  );
  assert.equal(
    deriveRunwayStatus({ totalFundingCents: 0, monthlyBurnCents: 800_000 }).reason,
    "no_funding"
  );
  assert.equal(
    deriveRunwayStatus({ totalFundingCents: 5_000_000, monthlyBurnCents: 0 }).reason,
    "no_monthly_costs"
  );
});

// ── Revenue ──────────────────────────────────────────────────────────────────

test("zero projected revenue is a missing input, not a measurement", () => {
  assert.equal(deriveRevenueStatus({ monthlyRevenueCents: 0 }).reason, "no_revenue");
  assert.equal(deriveRevenueStatus({ monthlyRevenueCents: 2_366_000 }).ok, true);
});

// ── Revenue ramp (T1-B) ──────────────────────────────────────────────────────

test("the spec's own example shows both figures", () => {
  // $23,660 first month vs $78,700 up to speed — the ~3x gap that made the
  // product look broken when only one number was ever visible at a time.
  assert.equal(
    showsRevenueRamp({
      firstMonthCents: 2_366_000,
      matureCents: 7_870_000,
      rampMonths: 6,
    }),
    true
  );
});

test("a plan with no ramp shows one clean figure, not a false distinction", () => {
  assert.equal(
    showsRevenueRamp({
      firstMonthCents: 7_870_000,
      matureCents: 7_870_000,
      rampMonths: 0,
    }),
    false
  );
});

test("a gap too small to see is not worth two numbers", () => {
  // 2% apart. Splitting this into "first month" and "up to speed" would make
  // the owner hunt for a difference that does not matter.
  assert.equal(
    showsRevenueRamp({
      firstMonthCents: 7_713_000,
      matureCents: 7_870_000,
      rampMonths: 3,
    }),
    false
  );
  // 5% is the threshold and does show.
  assert.equal(
    showsRevenueRamp({
      firstMonthCents: 7_476_500,
      matureCents: 7_870_000,
      rampMonths: 3,
    }),
    true
  );
});

test("no ramp treatment when there is no revenue to compare", () => {
  assert.equal(
    showsRevenueRamp({ firstMonthCents: 0, matureCents: 0, rampMonths: 6 }),
    false
  );
  assert.equal(
    showsRevenueRamp({ firstMonthCents: 0, matureCents: 7_870_000, rampMonths: 6 }),
    false
  );
});

test("the ramp explanation names the owner's own assumption and pluralises", () => {
  const six = rampExplanation(6);
  assert.match(six, /6 months/);
  // It must explain WHY, not merely label the two figures — the difference
  // between a caption and the thing that teaches a first-time owner something.
  assert.match(six, /take time to fill/);
  assert.match(rampExplanation(1), /1 month\b/);
  assert.doesNotMatch(rampExplanation(1), /1 months/);
});

// ── Copy ─────────────────────────────────────────────────────────────────────

test("every blocked reason has copy on both surfaces", () => {
  // A reason with no message would render as an empty tile — the dash bug
  // reintroduced by a different route. This fails the moment someone adds a
  // reason without wording it.
  for (const reason of [
    "no_revenue",
    "no_avg_ticket",
    "no_fixed_costs",
    "no_contribution_margin",
    "compute_failed",
  ]) {
    assert.ok(BREAK_EVEN_BLOCKED_COPY[reason]?.length > 0, `home copy: ${reason}`);
    assert.ok(
      BREAK_EVEN_BLOCKED_WORKSPACE_COPY[reason]?.length > 0,
      `workspace copy: ${reason}`
    );
  }
  for (const reason of ["no_funding", "no_monthly_costs", "compute_failed"]) {
    assert.ok(RUNWAY_BLOCKED_COPY[reason]?.length > 0, `runway copy: ${reason}`);
  }
  for (const reason of ["no_revenue", "compute_failed"]) {
    assert.ok(REVENUE_BLOCKED_COPY[reason]?.length > 0, `revenue copy: ${reason}`);
  }
});

test("owner-facing copy names an action, never just an absence", () => {
  // The house rule from the T1-C spec: "The text must name the action, never
  // just the absence." Every message the owner can act on starts with a verb.
  const actionable = [
    BREAK_EVEN_BLOCKED_COPY.no_revenue,
    BREAK_EVEN_BLOCKED_COPY.no_avg_ticket,
    BREAK_EVEN_BLOCKED_COPY.no_fixed_costs,
    RUNWAY_BLOCKED_COPY.no_funding,
    RUNWAY_BLOCKED_COPY.no_monthly_costs,
    REVENUE_BLOCKED_COPY.no_revenue,
  ];
  for (const msg of actionable) {
    assert.match(msg, /^(Add|Lower|Raise|Enter|Set|Try)\b/, msg);
  }
  // And our own failures must not be phrased as the owner's to fix.
  assert.match(BREAK_EVEN_BLOCKED_COPY.compute_failed, /^We couldn't/);
});
