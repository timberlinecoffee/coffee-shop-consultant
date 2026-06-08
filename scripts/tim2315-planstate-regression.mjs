// TIM-2334: plan_state regression — extract numeric claims from the saved
// narrative for a live plan and assert every claim round-trips against the
// canonical plan_state numbers (the same numbers the financial tables show).
// Catches the contradiction class investor flagged on TIM-2315
// (Beaver & Beef regenerated plan): narrative said 7 staff / table 1+2,
// narrative said raise $280K / sources $250K / uses $244K, narrative said
// rent $4,880/mo / P&L $0, narrative Y1 -$59,825 / table +$31,313.
//
// Usage (live, prod):
//   SUPABASE_URL=https://ltmcttjftxzpgynhnrpg.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   FIXTURE_EMAIL=trent@simpler.coffee \
//   node scripts/tim2315-planstate-regression.mjs
//
// CI mode: if env is missing, exits 0 (skip). Intentional — this script
// requires a live fixture and is not a hermetic unit test. Unit coverage
// for the builder itself lives at src/lib/business-plan/plan-state.test.mjs.

import { buildPlanState } from "../src/lib/business-plan/plan-state.ts";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.FIXTURE_EMAIL || "trent@simpler.coffee";
const TOLERANCE_CENTS = Number(process.env.PLAN_STATE_TOLERANCE_CENTS || 100);

if (!SUPABASE_URL || !SERVICE) {
  console.log("[skip] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping live regression");
  process.exit(0);
}

const headers = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
};

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`REST ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

// 1. Look up the fixture user
const users = await rest(`users?email=eq.${encodeURIComponent(EMAIL)}&select=id,email`);
if (!users.length) {
  console.error(`[fail] no user with email ${EMAIL}`);
  process.exit(2);
}
const userId = users[0].id;
console.log(`[user] ${EMAIL} (${userId})`);

// 2. Latest plan
const plans = await rest(`coffee_shop_plans?user_id=eq.${userId}&select=id,plan_name&order=created_at.desc&limit=1`);
if (!plans.length) {
  console.error(`[fail] no plan for ${EMAIL}`);
  process.exit(2);
}
const plan = plans[0];
console.log(`[plan] ${plan.plan_name} (${plan.id})`);

// 3. Pull all the same inputs the /generate route loads
const planId = plan.id;
const [
  financialModelRows,
  locationRows,
  equipmentRows,
  menuRows,
  hiringRows,
  sectionsRows,
] = await Promise.all([
  rest(`financial_models?plan_id=eq.${planId}&select=forecast_inputs,monthly_projections,startup_costs`),
  rest(`location_candidates?plan_id=eq.${planId}&archived=eq.false&select=id,name,address,neighborhood,sq_ft,asking_rent_cents,status,notes&order=position`),
  rest(`buildout_equipment_items?plan_id=eq.${planId}&archived=eq.false&select=id,name,cost_usd,category,notes&order=position`),
  rest(`menu_items_with_cogs?plan_id=eq.${planId}&select=id,name,category_name,price_cents,cogs_cents,computed_cogs_cents,expected_mix_pct,expected_popularity,archived&order=position`),
  rest(`hiring_plan_roles?plan_id=eq.${planId}&select=id,role_title,headcount,start_date,monthly_cost_cents,status&order=created_at`),
  rest(`business_plan_sections?plan_id=eq.${planId}&select=section_key,user_content,is_visible`),
]);

const financialModel = financialModelRows[0] ?? null;
if (!financialModel) {
  console.error(`[fail] no financial_models row for plan ${planId}`);
  process.exit(2);
}

// 4. Recompute blended menu COGS pct (mirrors /generate)
function computeMenuBlendedCogsPct(rows) {
  const live = rows.filter((r) => !r.archived);
  if (!live.length) return null;
  const totals = live.reduce(
    (acc, r) => {
      const cogs = Number(r.computed_cogs_cents ?? r.cogs_cents ?? 0);
      const price = Number(r.price_cents ?? 0);
      const mix = Number(r.expected_mix_pct ?? 0);
      acc.cogs += cogs * mix;
      acc.price += price * mix;
      return acc;
    },
    { cogs: 0, price: 0 }
  );
  if (totals.price === 0) return null;
  return Math.round((totals.cogs / totals.price) * 1000) / 10;
}
const menuBlendedCogsPct = computeMenuBlendedCogsPct(menuRows);

// 5. Build plan_state — single source of truth
const planState = buildPlanState({
  shopName: plan.plan_name ?? "this coffee shop",
  financialModel,
  locationCandidates: locationRows,
  equipment: equipmentRows,
  hiringRoles: hiringRows,
  menuBlendedCogsPct,
});

// 6. Stitch saved narrative across every regenerable section
const narrative = sectionsRows
  .filter((s) => s.is_visible !== false && s.user_content)
  .map((s) => `# ${s.section_key}\n${s.user_content}`)
  .join("\n\n");

if (!narrative.trim()) {
  console.error(`[fail] no saved narrative sections for plan ${planId} — regenerate the plan first`);
  process.exit(2);
}

// 7. Build the set of ground-truth numeric claims from plan_state
const claims = [];

function addClaim(label, cents) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return;
  claims.push({ label, dollars: cents / 100 });
}

// Capital stack
addClaim("capital_stack.total_raise", planState.capital_stack.total_raise_cents);
addClaim("capital_stack.equity",       planState.capital_stack.equity_cents);
addClaim("capital_stack.debt",         planState.capital_stack.debt_cents);
addClaim("capital_stack.founder_equity", planState.capital_stack.founder_equity_cents);
addClaim("capital_stack.investor_equity", planState.capital_stack.investor_equity_cents);
addClaim("capital_stack.grants",       planState.capital_stack.grants_cents);
for (const s of planState.capital_stack.sources) {
  addClaim(`capital_source.${s.label}`, s.amount_cents);
}

// Use of funds
addClaim("use_of_funds.total", planState.use_of_funds.total_cents);
for (const l of planState.use_of_funds.lines) {
  addClaim(`use_of_funds.${l.key}`, l.amount_cents);
}

// Revenue / lease / capex / labor
addClaim("revenue.avg_ticket", planState.revenue.avg_ticket_cents);
addClaim("lease.monthly_rent", planState.lease.monthly_rent_cents);
addClaim("labor.monthly_loaded_cost", planState.labor.monthly_loaded_cost_cents);
addClaim("labor.cogs_monthly",     planState.labor.cogs_monthly_cents);
addClaim("labor.overhead_monthly", planState.labor.overhead_monthly_cents);
addClaim("capex.total", planState.capex.total_cents);

// Opex by line
for (const l of planState.opex.lines) {
  addClaim(`opex.${l.key}`, l.monthly_cents);
}

// 5-year P&L
for (const y of planState.years) {
  addClaim(`y${y.year}.revenue`,          y.revenue_cents);
  addClaim(`y${y.year}.cogs`,             y.cogs_cents);
  addClaim(`y${y.year}.gross_profit`,     y.gross_profit_cents);
  addClaim(`y${y.year}.operating_income`, y.operating_income_cents);
  addClaim(`y${y.year}.net_income`,       y.net_income_cents);
  addClaim(`y${y.year}.ending_cash`,      y.ending_cash_cents);
}

console.log(`[claims] ${claims.length} canonical numeric facts in plan_state`);
if (claims.length < 20) {
  console.error(`[fail] expected ≥20 claims (acceptance #2), got ${claims.length}`);
  process.exit(2);
}

// 8. Extract every dollar figure from the narrative
const narrativeDollars = [];
const dollarRegex = /\$\s*([0-9][\d,]*(?:\.\d+)?)\s*(K|k|M|m|million|thousand)?/g;
let match;
while ((match = dollarRegex.exec(narrative)) !== null) {
  let n = parseFloat(match[1].replace(/,/g, ""));
  const unit = (match[2] || "").toLowerCase();
  if (unit === "k" || unit === "thousand") n *= 1000;
  if (unit === "m" || unit === "million")  n *= 1_000_000;
  narrativeDollars.push({ raw: match[0], value: n });
}

console.log(`[narrative] ${narrativeDollars.length} dollar figures extracted from saved narrative`);

// 9. For every narrative dollar figure, find the NEAREST plan_state claim and
// check whether the absolute drift exceeds tolerance. We don't expect every
// narrative figure to have an exact peer — copy-edits drop pennies, mention
// industry medians, etc. — but every narrative figure should land within
// tolerance of SOME plan_state claim, or within 5% relative tolerance for
// the larger figures (industry-comparison numbers like "$1.2M industry avg").

const RELATIVE_TOLERANCE = 0.05; // 5%
const drifts = [];
for (const nd of narrativeDollars) {
  if (nd.value < 100) continue; // skip pennies / coffee prices
  let best = null;
  for (const c of claims) {
    const drift = Math.abs(nd.value - c.dollars);
    if (best === null || drift < best.drift) best = { ...c, drift };
  }
  if (!best) continue;
  const dollarsTol = TOLERANCE_CENTS / 100;
  const relTol = Math.max(best.dollars, nd.value) * RELATIVE_TOLERANCE;
  const tol = Math.max(dollarsTol, relTol);
  if (best.drift > tol) {
    drifts.push({ narrative: nd.raw, value: nd.value, nearest: best.label, expected: best.dollars, drift: best.drift });
  }
}

if (drifts.length > 0) {
  console.error(`[fail] ${drifts.length} narrative dollar figures drift from plan_state beyond tolerance:`);
  for (const d of drifts.slice(0, 25)) {
    console.error(`  · narrative ${d.narrative} (=$${d.value}) closest=${d.nearest} ($${d.expected}) drift=$${d.drift.toFixed(2)}`);
  }
  if (drifts.length > 25) console.error(`  · …and ${drifts.length - 25} more`);
  process.exit(1);
}

console.log(`[pass] every narrative dollar figure within tolerance of plan_state`);

// 10. Total headcount cross-check: extract integers preceded by phrases like
// "staff", "headcount", "people", "team of N"
const headcountClaims = [];
const headRegex = /(?:team of|hire|hiring|staff of|headcount of|with)\s+(\d+)\s+(?:full[- ]?time\s+)?(?:staff|baristas?|people|team\s+members?)/gi;
while ((match = headRegex.exec(narrative)) !== null) {
  headcountClaims.push(parseInt(match[1], 10));
}
for (const hc of headcountClaims) {
  if (hc !== planState.labor.total_headcount) {
    console.error(`[fail] narrative cites headcount ${hc} but plan_state total_headcount=${planState.labor.total_headcount}`);
    process.exit(1);
  }
}
if (headcountClaims.length) {
  console.log(`[pass] ${headcountClaims.length} narrative headcount claims match plan_state.labor.total_headcount=${planState.labor.total_headcount}`);
}

console.log(`[done] plan_state regression PASS — narrative ↔ plan_state ↔ financial tables`);
