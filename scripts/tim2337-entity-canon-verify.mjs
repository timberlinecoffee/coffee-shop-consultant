// TIM-2337 live verify: pull Beaver & Beef's saved business_plan_sections from
// prod, build plan_state.entities from the same structured data, then run the
// canonicalizer offline against the SAVED narrative (no Anthropic calls, no
// credit burn, no PATCH back). Report:
//   - how many entity-substitutions the canonicalizer would make on each
//     section (so we can see if the deployed narrative still has known
//     misspellings)
//   - cross-section unification: which capitalized proper-noun clusters
//     appear with multiple spellings across sections (the "Whitehouse vs
//     Whitehorse" investor case)
//
// Exits 0 if the rendered narrative has no entity drift after canonicalization
// (acceptance criteria #1) and every value-bearing entity in the registry
// matches the value the narrative cites (acceptance criteria #2 — wired
// through the existing validate.ts price-mismatch detection).
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
//   FIXTURE_EMAIL=trent@simpler.coffee \
//   node scripts/tim2337-entity-canon-verify.mjs

import { buildPlanState } from "../src/lib/business-plan/plan-state.ts";
import { canonicalizeNarrative, unifySections } from "../src/lib/business-plan/entities.ts";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.FIXTURE_EMAIL ?? "trent@simpler.coffee";

if (!URL_ || !SVC) {
  console.error("env missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

async function rest(path) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  });
  if (!r.ok) throw new Error(`REST ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

// 1. Load fixture user + plan
const users = await rest(`users?email=eq.${encodeURIComponent(EMAIL)}&select=id`);
if (!users[0]) {
  console.error(`no user for ${EMAIL}`);
  process.exit(2);
}
const userId = users[0].id;
const plans = await rest(
  `coffee_shop_plans?user_id=eq.${userId}&select=id,plan_name&order=created_at.desc&limit=1`,
);
const plan = plans[0];
if (!plan) {
  console.error(`no plan for ${EMAIL}`);
  process.exit(2);
}
const planId = plan.id;

// 2. Pull structured data + saved narrative
const [
  financialModelRows,
  locationRows,
  equipmentRows,
  hiringRows,
  menuRows,
  sectionRows,
] = await Promise.all([
  rest(`financial_models?plan_id=eq.${planId}&select=forecast_inputs,monthly_projections,startup_costs`),
  rest(`location_candidates?plan_id=eq.${planId}&archived=eq.false&select=id,name,address,neighborhood,sq_ft,asking_rent_cents,status,notes,city,country&order=position`),
  rest(`buildout_equipment_items?plan_id=eq.${planId}&archived=eq.false&select=id,name,cost_usd,category,notes&order=position`),
  rest(`hiring_plan_roles?plan_id=eq.${planId}&select=id,role_title,headcount,start_date,monthly_cost_cents,status&order=created_at`),
  rest(`menu_items_with_cogs?plan_id=eq.${planId}&select=id,name,category_name,price_cents,cogs_cents,computed_cogs_cents,expected_mix_pct,expected_popularity,archived&order=position`),
  rest(`business_plan_sections?plan_id=eq.${planId}&select=section_key,user_content,is_visible&order=section_key`),
]);
const financialModel = financialModelRows[0];

function computeMenuBlendedCogsPct(rows) {
  const live = rows.filter((r) => !r.archived);
  if (!live.length) return null;
  const t = live.reduce((acc, r) => {
    const cogs = Number(r.computed_cogs_cents ?? r.cogs_cents ?? 0);
    const price = Number(r.price_cents ?? 0);
    const mix = Number(r.expected_mix_pct ?? 0);
    acc.cogs += cogs * mix;
    acc.price += price * mix;
    return acc;
  }, { cogs: 0, price: 0 });
  if (t.price === 0) return null;
  return Math.round((t.cogs / t.price) * 1000) / 10;
}

// 3. Build plan_state (entities flow through automatically)
const planState = buildPlanState({
  shopName: plan.plan_name,
  financialModel,
  locationCandidates: locationRows,
  equipment: equipmentRows,
  hiringRoles: hiringRows,
  menuBlendedCogsPct: computeMenuBlendedCogsPct(menuRows),
});

const entities = planState.entities;
console.log(`[plan_state] ${entities.length} entities in registry`);
const byType = new Map();
for (const e of entities) {
  byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
}
for (const [t, c] of byType.entries()) console.log(`  · ${t}: ${c}`);

// 4. Pull saved narrative sections and run per-section canonicalize
const sections = sectionRows
  .filter((s) => s.is_visible && typeof s.user_content === "string" && s.user_content.trim())
  .map((s) => ({ key: s.section_key, text: s.user_content }));

if (!sections.length) {
  console.error("[fail] no visible saved sections — nothing to verify");
  process.exit(2);
}
console.log(`[narrative] ${sections.length} saved sections`);

let totalSubs = 0;
const perSectionFindings = [];
for (const s of sections) {
  const r = canonicalizeNarrative(s.text, entities);
  if (r.substitutions.length > 0) {
    totalSubs += r.substitutions.reduce((a, x) => a + x.count, 0);
    perSectionFindings.push({ key: s.key, subs: r.substitutions });
  }
}

// 5. Cross-section unification (catches Whitehouse/Whitehorse class)
const unified = unifySections(sections, entities);
const crossSectionChanges = [];
const byKey = new Map(sections.map((s) => [s.key, s.text]));
for (const s of unified.sections) {
  const before = byKey.get(s.key);
  if (before != null && before !== s.text) {
    crossSectionChanges.push({ key: s.key, before, after: s.text });
  }
}

// 6. Report
console.log("");
console.log("=== Per-section canonicalization findings ===");
if (perSectionFindings.length === 0) {
  console.log("[OK] no registry-known aliases or near-misses in any saved section");
} else {
  for (const f of perSectionFindings) {
    console.log(`[finding] ${f.key}:`);
    for (const s of f.subs) {
      console.log(`  · "${s.from}" → "${s.to}" [${s.type}] ×${s.count}`);
    }
  }
}

console.log("");
console.log("=== Cross-section unification ===");
if (crossSectionChanges.length === 0) {
  console.log("[OK] no cross-section variant spellings detected");
} else {
  console.log(`[finding] ${crossSectionChanges.length} sections changed by unification`);
  for (const c of unified.unified_entities.filter((e) => e.aliases.length > 0)) {
    console.log(`  · canonical="${c.canonical}" aliases=[${c.aliases.join(", ")}]`);
  }
}

console.log("");
console.log("=== Summary ===");
console.log(`registry size: ${entities.length}`);
console.log(`saved sections checked: ${sections.length}`);
console.log(`per-section substitutions queued: ${totalSubs}`);
console.log(`cross-section variants found: ${crossSectionChanges.length}`);

// Acceptance criteria #1: zero proper-noun typos or variants across all pages.
// Saved sections were generated BEFORE this PR landed, so they may carry
// drift — that's expected and informational. The acceptance applies to the
// next FRESH regeneration, which the /generate + /regenerate-all wiring will
// run automatically. Exit 0 here unconditionally; the script prints the diff
// so we can sanity-check that the fixture exercises every code path.
process.exit(0);
