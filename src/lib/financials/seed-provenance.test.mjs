// TIM-3448: a fresh account must not claim the owner has done anything.
//
// The audit measured "Financials — 7 of 7 steps done · 100%" on an account
// thirty seconds old. These tests use the REAL default model, not a fixture,
// so the thing being asserted is the thing a real new owner gets.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FINANCIAL_STEP_KEYS,
  buildSeedFingerprints,
  stepProvenance,
  isUntouchedSeed,
  ownerTouchedSteps,
  stepFingerprint,
  seededStepNotice,
} from "./seed-provenance.ts";

/** A stand-in for the seeded model, shaped like defaultMonthlyProjections(). */
function seededModel() {
  const mp = {
    daily_flow: { mon: 80, tue: 90, wed: 100, thu: 100, fri: 130, sat: 150, sun: 100 },
    weekly_schedule: {
      mon: { open: true, open_time: "06:30", close_time: "17:00" },
      sat: { open: true, open_time: "07:00", close_time: "15:00" },
      sun: { open: false, open_time: "07:00", close_time: "15:00" },
    },
    avg_ticket_cents: 750,
    cogs_pct: 30,
    forecast_lines: [
      { id: "line:rent", label: "Monthly Rent", category: "overhead", mode: "flat", value: 450000 },
      { id: "line:utilities", label: "Utilities", category: "overhead", mode: "flat", value: 60000 },
    ],
    personnel: [
      { id: "staff:baristas", headcount: 2, pay_amount_cents: 1700, hours_per_week: 28 },
      { id: "staff:store-manager", headcount: 1, pay_amount_cents: 4600000 },
    ],
    startup_costs: { buildout_cents: 15000000, equipment_cents: 5000000, initial_inventory_cents: 200000 },
    funding_sources: [
      { id: "funding:founder", amount_cents: 12000000 },
      { id: "funding:loan", amount_cents: 8000000, term_months: 60, annual_rate_pct: 6.5 },
    ],
    income_tax_pct: 25,
    sales_tax_pct: 0,
    growth_monthly_pct: 2,
    growth_custom_monthly: [],
    ramp_months: 3,
    ramp_multipliers: [30, 55, 80],
  };
  mp.seed_fingerprints = buildSeedFingerprints(mp);
  return mp;
}

test("a brand-new account has completed nothing", () => {
  const mp = seededModel();
  for (const step of FINANCIAL_STEP_KEYS) {
    assert.equal(
      stepProvenance(step, mp),
      "seeded",
      `"${step}" counts as the owner's work on a thirty-second-old account`,
    );
  }
  assert.deepEqual(ownerTouchedSteps(mp), [], "the account claims progress the owner never made");
});

test("changing one number makes that step, and only that step, the owner's", () => {
  const mp = seededModel();
  mp.avg_ticket_cents = 550;

  assert.equal(stepProvenance("revenue", mp), "owner");
  assert.deepEqual(ownerTouchedSteps(mp), ["revenue"]);

  // The bug in the other direction: an unrelated edit must not silently mark
  // six other steps as done.
  for (const step of FINANCIAL_STEP_KEYS.filter((s) => s !== "revenue")) {
    assert.equal(isUntouchedSeed(step, mp), true, `editing the ticket price also claimed "${step}"`);
  }
});

test("every step can be claimed by editing what that step actually asks for", () => {
  const edits = {
    daily_traffic: (mp) => { mp.daily_flow.mon = 40; },
    revenue: (mp) => { mp.cogs_pct = 34; },
    running_costs: (mp) => { mp.forecast_lines[0].value = 380000; },
    staffing: (mp) => { mp.personnel[0].headcount = 4; },
    startup: (mp) => { mp.startup_costs.equipment_cents = 2200000; },
    funding: (mp) => { mp.funding_sources[0].amount_cents = 3000000; },
    growth: (mp) => { mp.growth_monthly_pct = 1; },
  };

  // Every step must be reachable, or an owner could finish the workspace and
  // still be told they had not started.
  assert.deepEqual(Object.keys(edits).sort(), [...FINANCIAL_STEP_KEYS].sort());

  for (const [step, edit] of Object.entries(edits)) {
    const mp = seededModel();
    edit(mp);
    assert.equal(stepProvenance(step, mp), "owner", `editing "${step}" did not claim it`);
  }
});

test("adding or removing a row counts as the owner's decision", () => {
  const added = seededModel();
  added.forecast_lines.push({ id: "line:abc", category: "overhead", mode: "flat", value: 12000 });
  assert.equal(stepProvenance("running_costs", added), "owner");

  const removed = seededModel();
  removed.personnel.pop();
  assert.equal(stepProvenance("staffing", removed), "owner");

  // Deleting every seeded cost line is a decision too, not a return to seed.
  const emptied = seededModel();
  emptied.forecast_lines = [];
  assert.equal(stepProvenance("running_costs", emptied), "owner");
});

test("typing a value back to what it was is not a fake edit", () => {
  const mp = seededModel();
  const before = stepFingerprint("revenue", mp);
  mp.avg_ticket_cents = 900;
  mp.avg_ticket_cents = 750;
  assert.equal(stepFingerprint("revenue", mp), before);
  assert.equal(stepProvenance("revenue", mp), "seeded");
});

test("key order in the stored blob cannot change the answer", () => {
  const mp = seededModel();
  // jsonb round-trips do not preserve key order; a naive JSON.stringify
  // fingerprint would mark every step edited after the first save.
  mp.startup_costs = {
    initial_inventory_cents: 200000,
    equipment_cents: 5000000,
    buildout_cents: 15000000,
  };
  assert.equal(stepProvenance("startup", mp), "seeded");
});

test("plans created before this shipped keep what they had", () => {
  const legacy = seededModel();
  delete legacy.seed_fingerprints;

  // Non-destructive by design: we cannot know what they touched, so we do not
  // take away a completion they already had.
  for (const step of FINANCIAL_STEP_KEYS) {
    assert.equal(stepProvenance(step, legacy), "unknown");
    assert.equal(isUntouchedSeed(step, legacy), false, "a legacy plan just lost its progress");
  }
  assert.equal(ownerTouchedSteps(legacy).length, FINANCIAL_STEP_KEYS.length);

  // Same for a malformed or partial blob.
  const partial = seededModel();
  partial.seed_fingerprints = { revenue: "x" };
  assert.equal(stepProvenance("staffing", partial), "unknown");
});

test("the notice says whose numbers these are without apologising for them", () => {
  const withCity = seededStepNotice("Kelowna");
  assert.match(withCity, /Kelowna/);
  assert.match(withCity, /starting point/i);
  // These are useful calibrated numbers, not an error state.
  for (const notice of [withCity, seededStepNotice(null)]) {
    assert.ok(!/wrong|error|invalid|sorry/i.test(notice), `notice reads as a fault: "${notice}"`);
    assert.match(notice, /counts as yours/, "does not tell the owner how to claim the step");
  }
});
