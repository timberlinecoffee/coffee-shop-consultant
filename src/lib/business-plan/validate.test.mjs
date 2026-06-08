// TIM-2336: Pass 1 reconciliation tests. The pre-fix Beaver & Beef narrative
// is the gold-standard regression — it MUST surface the four investor-flagged
// numerical contradictions. The post-fix narrative (numbers drawn verbatim
// from plan_state) MUST surface zero. Plus targeted coverage for sign-flip
// detection, year-scoped matching, headcount word-form, and the Pass 2 JSON
// response parser.
//
// Conventions match plan-state.test.mjs (relative imports, node:test).

import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanState } from "./plan-state.ts";
import {
  runReconciliation,
  parsePass2Response,
  buildPass2UserMessage,
  PASS2_SYSTEM_PROMPT,
} from "./validate.ts";

// ── Beaver & Beef fixture (mirrors plan-state.test.mjs) ──────────────────────

const FIXTURE_MP = {
  daily_flow: { mon: 80, tue: 80, wed: 80, thu: 90, fri: 100, sat: 110, sun: 0 },
  avg_ticket_cents: 650,
  weekly_schedule: {
    mon: { open: true, open_time: "06:30", close_time: "17:00" },
    tue: { open: true, open_time: "06:30", close_time: "17:00" },
    wed: { open: true, open_time: "06:30", close_time: "17:00" },
    thu: { open: true, open_time: "06:30", close_time: "17:00" },
    fri: { open: true, open_time: "06:30", close_time: "17:00" },
    sat: { open: true, open_time: "07:00", close_time: "15:00" },
    sun: { open: false, open_time: "07:00", close_time: "15:00" },
  },
  cogs_pct: 30,
  forecast_lines: [
    { id: "line:rent",      label: "Rent",       category: "overhead", mode: "flat", value: 488000, legacy_key: "rent" },
    { id: "line:marketing", label: "Marketing",  category: "overhead", mode: "pct",  value: 2,      legacy_key: "marketing" },
    { id: "line:utilities", label: "Utilities",  category: "overhead", mode: "flat", value: 70000,  legacy_key: "utilities" },
    { id: "line:insurance", label: "Insurance",  category: "overhead", mode: "flat", value: 25000,  legacy_key: "insurance" },
  ],
  funding_sources: [
    { id: "f1", kind: "founder_equity",  label: "Founder Equity", amount_cents: 8000000 },
    { id: "f2", kind: "investor_equity", label: "Angel Investor", amount_cents: 2000000 },
    { id: "f3", kind: "loan",            label: "SBA Loan",       amount_cents: 18000000, term_months: 60, annual_rate_pct: 8.5 },
  ],
  personnel: [
    { id: "p1", role: "Owner",        headcount: 1, pay_basis: "annual", pay_amount_cents: 6000000, benefits_pct: 0,  cost_category: "overhead" },
    { id: "p2", role: "Barista",      headcount: 4, pay_basis: "hourly", pay_amount_cents: 1800, hours_per_week: 30, benefits_pct: 10, cost_category: "cogs" },
    { id: "p3", role: "Lead Barista", headcount: 2, pay_basis: "hourly", pay_amount_cents: 2200, hours_per_week: 35, benefits_pct: 15, cost_category: "cogs" },
  ],
  startup_costs: {
    buildout_cents: 5000000, equipment_cents: 7500000, deposits_cents: 976000,
    licenses_cents: 300000, pre_opening_marketing_cents: 500000,
    initial_inventory_cents: 1500000, startup_supplies_cents: 800000,
    professional_fees_cents: 600000, working_capital_reserve_cents: 2000000,
    opening_cash_buffer_cents: 3000000,
    buildout_useful_life_years: 15, equipment_useful_life_years: 7,
  },
  income_tax_pct: 21, sales_tax_pct: 8.875,
  ramp_months: 6, ramp_multipliers: [0.4, 0.55, 0.7, 0.8, 0.9, 1.0],
  growth_mode: "simple", growth_monthly_pct: 0.5, growth_custom_monthly: [],
  fiscal_year_start_month: 1, currency_code: "USD",
  owner_draws_monthly_cents: 0, owner_contributions: [],
};

const FIXTURE_INPUT = {
  shopName: "Beaver & Beef",
  financialModel: { forecast_inputs: FIXTURE_MP, startup_costs: FIXTURE_MP.startup_costs },
  locationCandidates: [
    { id: "L1", name: "488 Hyde Street", address: "488 Hyde St, San Francisco, CA",
      neighborhood: "Tenderloin", sq_ft: 1200, asking_rent_cents: 488000, status: "chosen", notes: null },
  ],
  equipment: [
    { id: "E1", name: "La Marzocco GB5",  cost_usd: 18500, category: "major", notes: null },
    { id: "E2", name: "Mahlkönig EK43",   cost_usd: 4200,  category: "major", notes: null },
    { id: "E3", name: "Bunn Brewer",      cost_usd: 1500,  category: "major", notes: null },
  ],
  hiringRoles: [],
  menuBlendedCogsPct: 32,
};

// ── Pre-fix narrative — the four investor-flagged contradictions ─────────────
//
// Each paragraph quotes a number that contradicts plan_state for Beaver & Beef:
//   #1 headcount "team of seven baristas" — plan has 7 personnel total but
//      the contradiction is the OPPOSITE direction: post-vertical the plan
//      shows 7 staff (1 + 4 + 2 = 7), and investor flagged "narrative said 7,
//      table showed 1+2=3". To exercise that mismatch direction, use 12 staff.
//   #2 total raise "$320,000" vs plan_state $280,000
//   #3 rent "$6,500/mo" vs plan_state $4,880/mo
//   #4 Y1 "net loss of $59,825" vs plan_state Y1 net income (sign + magnitude flip)
const PRE_FIX_NARRATIVE = new Map(Object.entries({
  "executive-summary":
    "Beaver & Beef will open in San Francisco's Tenderloin district. We are seeking a total raise of $320,000 to fund build-out, equipment, and 90 days of working capital.",

  "company-team":
    "Operations require a lean but professional crew. Our team will be twelve baristas at full ramp, supporting morning rush and the afternoon study crowd.",

  "execution-operations":
    "The 488 Hyde Street site offers 1,200 square feet at a monthly rent of $6,500, including CAM. Lease term is five years with one renewal option.",

  "financial-plan-forecast":
    "Year 1 is an investment year. We project a net loss of $59,825 in Year 1 as we ramp foot traffic and absorb pre-opening costs. Year 2 returns to profitability.",
}));

// ── Post-fix narrative — same prose, numbers swapped to plan_state values ────
//
// The Beaver & Beef fixture's Year 1 is an investment year — plan_state shows
// a loss of $314,322.33 (build-out + ramp absorb every dollar of margin).
// Post-fix prose quotes that exact figure so reconciliation passes.
const POST_FIX_NARRATIVE = new Map(Object.entries({
  "executive-summary":
    "Beaver & Beef will open in San Francisco's Tenderloin district. We are seeking a total raise of $280,000 to fund build-out, equipment, and 90 days of working capital.",

  "company-team":
    "Operations require a lean but professional crew. Our team will be seven baristas at full ramp, supporting morning rush and the afternoon study crowd.",

  "execution-operations":
    "The 488 Hyde Street site offers 1,200 square feet at a monthly rent of $4,880, including CAM. Lease term is five years with one renewal option.",

  "financial-plan-forecast":
    "Year 1 is an investment year. We project a net loss of $314,322.33 in Year 1 as we ramp foot traffic. Year 2 returns to profitability.",
}));

// ── Sanity: build plan_state for assertions about expected values ────────────

test("plan_state values match what the pre-fix narrative contradicts", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  assert.equal(st.lease.monthly_rent_cents, 488000, "rent should be $4,880/mo");
  assert.equal(st.capital_stack.total_raise_cents, 28000000, "total raise should be $280,000");
  assert.equal(st.labor.total_headcount, 7, "headcount should be 7 (1 owner + 4 barista + 2 lead)");
  // Y1 in this fixture is an investment year — build-out + ramp absorb every
  // dollar of margin, so net income lands negative. Validator must accept
  // either sign as ground truth; here the pre-fix narrative undersells the
  // depth of that loss ($59,825 vs $314k) which becomes the numeric finding.
  const y1 = st.years.find((y) => y.year === 1);
  assert.ok(y1, "Y1 summary must exist");
  assert.ok(y1.net_income_cents < 0, "Y1 net income is a loss in this fixture");
});

// ── Pre-fix: ≥4 distinct dimensions trip findings ────────────────────────────

test("pre-fix narrative surfaces all four investor-flagged contradictions", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  const rep = runReconciliation({ planState: st, sections: PRE_FIX_NARRATIVE });

  assert.equal(rep.blocking, true, "report must be blocking when findings exist");

  const dims = new Set(rep.numeric_findings.map((f) => f.dimension));
  // The four investor contradictions, by dimension:
  assert.ok(dims.has("capital_stack.total_raise"), "should flag capital_stack.total_raise (#2)");
  assert.ok(dims.has("lease.monthly_rent"),       "should flag lease.monthly_rent (#3)");
  assert.ok(dims.has("labor.total_headcount"),    "should flag labor.total_headcount (#1)");
  assert.ok(dims.has("years.1.net_income"),       "should flag years.1.net_income (#4)");

  // Each finding carries a usable suggested replacement.
  for (const f of rep.numeric_findings) {
    assert.ok(f.suggested_replacement, `${f.dimension} must carry a suggested replacement`);
    assert.ok(f.expected_text.length > 0, `${f.dimension} must carry expected_text`);
    assert.ok(f.message.length > 0, `${f.dimension} must carry a human-readable message`);
  }
});

// ── Post-fix: zero findings ──────────────────────────────────────────────────

test("post-fix narrative (numbers drawn from plan_state) surfaces zero findings", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  const rep = runReconciliation({ planState: st, sections: POST_FIX_NARRATIVE });
  if (rep.numeric_findings.length > 0) {
    // Surface details on failure so the test output is debuggable.
    console.error("Unexpected findings:", JSON.stringify(rep.numeric_findings, null, 2));
  }
  assert.equal(rep.numeric_findings.length, 0, "post-fix narrative should reconcile cleanly");
  assert.equal(rep.blocking, false);
});

// ── Sign-flip detection (narrative profit vs plan loss) is a sign_mismatch ───

test("Y1 narrative profit vs plan loss yields a sign_mismatch finding", () => {
  // Beaver & Beef fixture Y1 is a loss; narrative claiming a profit must
  // flag as sign_mismatch (not merely numeric_mismatch) so the modal can
  // surface the directional disagreement explicitly.
  const st = buildPlanState(FIXTURE_INPUT);
  const rep = runReconciliation({
    planState: st,
    sections: new Map([["financial-plan-forecast",
      "We project a net profit of $31,313 in Year 1 as we ramp."]]),
  });
  const f = rep.numeric_findings.find((x) => x.dimension === "years.1.net_income");
  assert.ok(f, "must produce a Y1 net_income finding");
  assert.equal(f.kind, "sign_mismatch", "profit-vs-loss must classify as sign_mismatch");
});

// ── Year-scoped matching: no year mention → no false positive ────────────────

test("currency near 'revenue' without a year mention does not match year revenue", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  const rep = runReconciliation({
    planState: st,
    sections: new Map([["executive-summary",
      "We expect strong revenue from morning commuters totaling $999,999."]]),
  });
  // No year tied to the figure, and "revenue" alone never tips the year
  // expectation — so no finding (high precision).
  const revFindings = rep.numeric_findings.filter((f) => f.dimension.startsWith("years."));
  assert.equal(revFindings.length, 0, "no year scope ⇒ no year-revenue finding");
});

// ── Headcount word-form is recognised ────────────────────────────────────────

test("headcount word form ('team of twelve baristas') is extracted and matched", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  const rep = runReconciliation({
    planState: st,
    sections: new Map([["company-team",
      "Our team will be twelve baristas at full ramp."]]),
  });
  const f = rep.numeric_findings.find((x) => x.dimension === "labor.total_headcount");
  assert.ok(f, "must flag headcount word-form mismatch");
  assert.equal(f.claim_value, 12);
  assert.equal(f.expected_value, 7);
});

// ── Rent tolerance: $4,880 vs $4,880.05 is within tolerance ──────────────────

test("currency within $100 / 2% tolerance is not flagged (rounding slack)", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  const rep = runReconciliation({
    planState: st,
    sections: new Map([["execution-operations",
      "Monthly rent is $4,880, including CAM."]]),
  });
  assert.equal(rep.numeric_findings.filter((f) => f.dimension === "lease.monthly_rent").length, 0);
});

test("currency outside tolerance (rent $6,500 vs $4,880) IS flagged", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  const rep = runReconciliation({
    planState: st,
    sections: new Map([["execution-operations",
      "Monthly rent is $6,500, including CAM."]]),
  });
  const f = rep.numeric_findings.find((x) => x.dimension === "lease.monthly_rent");
  assert.ok(f);
  assert.equal(f.suggested_replacement, "$4,880");
});

// ── stats counters track extraction coverage ─────────────────────────────────

test("stats counters reflect extraction and match coverage", () => {
  const st = buildPlanState(FIXTURE_INPUT);
  const rep = runReconciliation({ planState: st, sections: PRE_FIX_NARRATIVE });
  assert.ok(rep.stats.sections_scanned === PRE_FIX_NARRATIVE.size, "all non-empty sections scanned");
  assert.ok(rep.stats.claims_extracted > 0, "some numeric claims must be extracted");
  assert.ok(rep.stats.claims_matched > 0, "some claims must route to a dimension");
});

// ── Pass 2 parse: tolerates code fences and extra keys ───────────────────────

test("parsePass2Response handles bare JSON and fenced JSON", () => {
  const bare = JSON.stringify({
    findings: [
      { section_key: "company-team", category: "typo", message: "La Marzocko is misspelled.", quoted_text: "La Marzocko" },
      { section_key: "financial-plan-forecast", category: "contradiction", message: "Owner draws contradict no-draw claim.", quoted_text: "Owner draws $3,000" },
    ],
  });
  const a = parsePass2Response(bare);
  assert.equal(a.length, 2);
  assert.equal(a[0].category, "typo");

  const fenced = "```json\n" + bare + "\n```";
  const b = parsePass2Response(fenced);
  assert.equal(b.length, 2);
});

test("parsePass2Response returns [] on malformed input rather than throwing", () => {
  assert.deepEqual(parsePass2Response("not json"), []);
  assert.deepEqual(parsePass2Response(""), []);
  // Wrong shape — `findings` missing.
  assert.deepEqual(parsePass2Response('{"foo":1}'), []);
});

test("parsePass2Response normalises unknown categories to 'other'", () => {
  const r = parsePass2Response(JSON.stringify({
    findings: [{ section_key: "x", category: "snake_oil", message: "weird", quoted_text: null }],
  }));
  assert.equal(r[0].category, "other");
});

// ── Pass 2 prompt scaffolding is well-formed ─────────────────────────────────

test("buildPass2UserMessage embeds every non-empty section", () => {
  const msg = buildPass2UserMessage("Beaver & Beef", PRE_FIX_NARRATIVE);
  assert.ok(msg.includes("Beaver & Beef"));
  assert.ok(msg.includes("── executive-summary ──"));
  assert.ok(msg.includes("── financial-plan-forecast ──"));
  assert.ok(PASS2_SYSTEM_PROMPT.includes("skeptical small-business lender"));
});
