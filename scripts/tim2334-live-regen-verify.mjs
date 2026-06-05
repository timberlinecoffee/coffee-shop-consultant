// TIM-2334 live e2e verify: drive /api/business-plan/regenerate-all on prod as
// the fixture user, capture every section:complete draft IN MEMORY (no PATCH
// to business_plan_sections — Trent's saved narrative is untouched), then
// compare the FRESH drafts against plan_state. If the new pipeline works,
// every numeric claim in the fresh narrative round-trips against plan_state.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   PROD_URL=https://groundwork.cafe \
//   FIXTURE_EMAIL=trent@simpler.coffee \
//   node scripts/tim2334-live-regen-verify.mjs

import { buildPlanState } from "../src/lib/business-plan/plan-state.ts";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROD = process.env.PROD_URL ?? "https://coffee-shop-consultant.vercel.app";
const EMAIL = process.env.FIXTURE_EMAIL ?? "trent@simpler.coffee";

if (!URL_ || !SVC || !ANON) {
  console.error("env missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(2);
}

// 1. Mint a session for the fixture
const link = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
}).then((r) => r.json());
const tokenHash = link.properties?.hashed_token ?? link.hashed_token;
if (!tokenHash) {
  console.error("generate_link failed", link);
  process.exit(2);
}
const verify = await fetch(`${URL_}/auth/v1/verify`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
}).then((r) => r.json());
const accessToken = verify.access_token;
const refreshToken = verify.refresh_token;
if (!accessToken) {
  console.error("verify failed", verify);
  process.exit(2);
}
console.log(`[auth] minted access token for ${EMAIL}`);

// 2. Build Set-Cookie header for prod (Supabase SSR uses sb-<ref>-auth-token cookie)
const ref = URL_.match(/https:\/\/([^.]+)\./)[1];
const sessionPayload = encodeURIComponent(JSON.stringify({
  access_token: accessToken,
  refresh_token: refreshToken,
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: verify.user,
}));
const cookieHeader = `sb-${ref}-auth-token=${sessionPayload}`;

// 3. Hit regenerate-all SSE endpoint
console.log(`[regen] POST ${PROD}/api/business-plan/regenerate-all`);
const sseRes = await fetch(`${PROD}/api/business-plan/regenerate-all`, {
  method: "POST",
  headers: { Cookie: cookieHeader, Accept: "text/event-stream" },
});
if (!sseRes.ok) {
  console.error(`regen request failed: ${sseRes.status} ${await sseRes.text()}`);
  process.exit(2);
}

// 4. Stream SSE events
const drafts = []; // { sectionKey, sectionTitle, draft }
const reader = sseRes.body.getReader();
const decoder = new TextDecoder();
let buf = "";
let estimateEvent = null;
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const events = buf.split("\n\n");
  buf = events.pop() ?? "";
  for (const ev of events) {
    const lines = ev.split("\n");
    let evType = null;
    let dataStr = "";
    for (const l of lines) {
      if (l.startsWith("event:")) evType = l.slice(6).trim();
      else if (l.startsWith("data:")) dataStr += l.slice(5).trim();
    }
    if (!evType) continue;
    try {
      const data = dataStr ? JSON.parse(dataStr) : {};
      if (evType === "estimate") {
        estimateEvent = data;
        console.log(`[estimate] ${data.sections?.length ?? 0} sections, ${data.estimated_credits} credits`);
      } else if (evType === "section:complete") {
        drafts.push({ sectionKey: data.sectionKey, sectionTitle: data.sectionTitle, draft: data.draft });
        console.log(`[section:complete] ${data.sectionKey} — ${data.draft.length} chars, credits left ${data.credits_remaining}`);
      } else if (evType === "section:error") {
        console.error(`[section:error] ${data.sectionKey}: ${data.message}`);
      } else if (evType === "done") {
        console.log(`[done] completed=${data.completed_count} failed=${data.failed_count}`);
      }
    } catch (e) {
      // Ignore heartbeats and malformed events
    }
  }
}

if (drafts.length === 0) {
  console.error("[fail] no section:complete drafts received");
  process.exit(2);
}
console.log(`[drafts] received ${drafts.length} fresh drafts`);

// 5. Build plan_state from current platform data (anything plan-state needs)
async function rest(path) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  if (!r.ok) throw new Error(`REST ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
const users = await rest(`users?email=eq.${encodeURIComponent(EMAIL)}&select=id`);
const userId = users[0].id;
const plans = await rest(`coffee_shop_plans?user_id=eq.${userId}&select=id,plan_name&order=created_at.desc&limit=1`);
const plan = plans[0];
const planId = plan.id;
const [financialModelRows, locationRows, equipmentRows, menuRows, hiringRows] = await Promise.all([
  rest(`financial_models?plan_id=eq.${planId}&select=forecast_inputs,monthly_projections,startup_costs`),
  rest(`location_candidates?plan_id=eq.${planId}&archived=eq.false&select=id,name,address,neighborhood,sq_ft,asking_rent_cents,status,notes&order=position`),
  rest(`buildout_equipment_items?plan_id=eq.${planId}&archived=eq.false&select=id,name,cost_usd,category,notes&order=position`),
  rest(`menu_items_with_cogs?plan_id=eq.${planId}&select=id,name,category_name,price_cents,cogs_cents,computed_cogs_cents,expected_mix_pct,expected_popularity,archived&order=position`),
  rest(`hiring_plan_roles?plan_id=eq.${planId}&select=id,role_title,headcount,start_date,monthly_cost_cents,status&order=created_at`),
]);
const financialModel = financialModelRows[0];

function computeMenuBlendedCogsPct(rows) {
  const live = rows.filter((r) => !r.archived);
  if (!live.length) return null;
  const t = live.reduce((acc, r) => {
    const cogs = Number(r.computed_cogs_cents ?? r.cogs_cents ?? 0);
    const price = Number(r.price_cents ?? 0);
    const mix = Number(r.expected_mix_pct ?? 0);
    acc.cogs += cogs * mix; acc.price += price * mix; return acc;
  }, { cogs: 0, price: 0 });
  if (t.price === 0) return null;
  return Math.round((t.cogs / t.price) * 1000) / 10;
}

const planState = buildPlanState({
  shopName: plan.plan_name,
  financialModel,
  locationCandidates: locationRows,
  equipment: equipmentRows,
  hiringRoles: hiringRows,
  menuBlendedCogsPct: computeMenuBlendedCogsPct(menuRows),
});

// 6. Collect plan_state claims
const claims = [];
function addClaim(label, cents) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return;
  claims.push({ label, dollars: cents / 100 });
}
addClaim("capital_stack.total_raise", planState.capital_stack.total_raise_cents);
addClaim("capital_stack.equity", planState.capital_stack.equity_cents);
addClaim("capital_stack.debt", planState.capital_stack.debt_cents);
addClaim("capital_stack.founder_equity", planState.capital_stack.founder_equity_cents);
addClaim("capital_stack.investor_equity", planState.capital_stack.investor_equity_cents);
addClaim("capital_stack.grants", planState.capital_stack.grants_cents);
for (const s of planState.capital_stack.sources) addClaim(`source.${s.label}`, s.amount_cents);
addClaim("use_of_funds.total", planState.use_of_funds.total_cents);
for (const l of planState.use_of_funds.lines) addClaim(`use.${l.key}`, l.amount_cents);
addClaim("revenue.avg_ticket", planState.revenue.avg_ticket_cents);
addClaim("lease.monthly_rent", planState.lease.monthly_rent_cents);
addClaim("labor.monthly_loaded", planState.labor.monthly_loaded_cost_cents);
addClaim("labor.cogs_monthly", planState.labor.cogs_monthly_cents);
addClaim("labor.overhead_monthly", planState.labor.overhead_monthly_cents);
addClaim("capex.total", planState.capex.total_cents);
for (const l of planState.opex.lines) addClaim(`opex.${l.key}`, l.monthly_cents);
for (const y of planState.years) {
  addClaim(`y${y.year}.revenue`, y.revenue_cents);
  addClaim(`y${y.year}.cogs`, y.cogs_cents);
  addClaim(`y${y.year}.gross_profit`, y.gross_profit_cents);
  addClaim(`y${y.year}.operating_income`, y.operating_income_cents);
  addClaim(`y${y.year}.net_income`, y.net_income_cents);
  addClaim(`y${y.year}.ending_cash`, y.ending_cash_cents);
}

console.log(`[plan_state] ${claims.length} ground-truth claims`);
console.log(`[plan_state] total_raise=$${planState.capital_stack.total_raise_cents/100}, headcount=${planState.labor.total_headcount}, rent=$${planState.lease.monthly_rent_cents/100}/mo`);
if (planState.years[0]) {
  console.log(`[plan_state] Y1 revenue=$${planState.years[0].revenue_cents/100}, net_income=$${(planState.years[0].net_income_cents/100).toFixed(2)}, ending_cash=$${(planState.years[0].ending_cash_cents/100).toFixed(2)}`);
}

// 7. Compare each FRESH draft's dollar figures to plan_state
const TOL_CENTS = Number(process.env.PLAN_STATE_TOLERANCE_CENTS || 200);
const REL_TOL = 0.05;
const dollarRx = /\$\s*([0-9][\d,]*(?:\.\d+)?)\s*(K|k|M|m|million|thousand)?/g;
const allDrifts = [];
const narrativeAll = drafts.map((d) => `# ${d.sectionTitle}\n${d.draft}`).join("\n\n");
let m;
const dollars = [];
while ((m = dollarRx.exec(narrativeAll)) !== null) {
  let n = parseFloat(m[1].replace(/,/g, ""));
  const u = (m[2] || "").toLowerCase();
  if (u === "k" || u === "thousand") n *= 1000;
  if (u === "m" || u === "million") n *= 1_000_000;
  dollars.push({ raw: m[0], value: n });
}
console.log(`[narrative] ${dollars.length} dollar figures extracted from FRESH drafts`);

for (const nd of dollars) {
  if (nd.value < 100) continue;
  let best = null;
  for (const c of claims) {
    const d = Math.abs(nd.value - c.dollars);
    if (best === null || d < best.drift) best = { ...c, drift: d };
  }
  if (!best) continue;
  const dollarsTol = TOL_CENTS / 100;
  const relTol = Math.max(best.dollars, nd.value) * REL_TOL;
  const tol = Math.max(dollarsTol, relTol);
  if (best.drift > tol) {
    allDrifts.push({ ...nd, nearest: best.label, expected: best.dollars, drift: best.drift });
  }
}

// Headcount
const headRx = /(?:team of|hire|hiring|staff of|headcount of|with)\s+(\d+)\s+(?:full[- ]?time\s+)?(?:staff|baristas?|people|team\s+members?)/gi;
const headcountDrifts = [];
while ((m = headRx.exec(narrativeAll)) !== null) {
  const hc = parseInt(m[1], 10);
  if (hc !== planState.labor.total_headcount) headcountDrifts.push({ stated: hc, expected: planState.labor.total_headcount });
}

if (allDrifts.length === 0 && headcountDrifts.length === 0) {
  console.log("[PASS] every fresh dollar + headcount claim within tolerance of plan_state");
  process.exit(0);
}

console.error(`[FAIL] ${allDrifts.length} drifts + ${headcountDrifts.length} headcount mismatches`);
for (const d of allDrifts.slice(0, 25)) {
  console.error(`  · narrative ${d.raw} (=$${d.value}) closest=${d.nearest} ($${d.expected}) drift=$${d.drift.toFixed(2)}`);
}
for (const h of headcountDrifts) {
  console.error(`  · narrative cites ${h.stated} staff; plan_state total_headcount=${h.expected}`);
}
process.exit(1);
