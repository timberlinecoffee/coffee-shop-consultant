// TIM-2337: entity registry + canonicalizer unit tests.
//
// Investor critique pinned three specific failures on the Beaver & Beef
// regenerated plan that this module exists to prevent:
//   - "Whitehouse Farms" page 3 vs "Whitehorse Farms" everywhere else
//   - "La Marzocko" page 4 vs "La Marzocco" everywhere else
//   - Equipment value $48,000 in two sections and $45,000 in another
//
// Each test below pins one of the prevention mechanisms.

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanStateEntities,
  builtInBrandVocab,
  canonicalizeNarrative,
  formatEntitiesForPrompt,
  levenshteinAtMost,
  normalizeForMatch,
  unifySections,
} from "./entities.ts";

// ── Levenshtein bound ───────────────────────────────────────────────────────

test("levenshteinAtMost — identical strings → 0", () => {
  assert.equal(levenshteinAtMost("la marzocco", "la marzocco", 2), 0);
});

test("levenshteinAtMost — single transposition (k→ck) is distance 2", () => {
  // "marzocko" vs "marzocco" -> swap 'k' for 'cc' = insert + substitute = 2.
  // Either way, ≤ 2 is what the canonicalizer relies on.
  assert.ok(levenshteinAtMost("la marzocko", "la marzocco", 2) <= 2);
});

test("levenshteinAtMost — distance > max short-circuits at max+1", () => {
  // "espresso" → "amazon" is way too far. Function returns max+1 (3 here).
  assert.equal(levenshteinAtMost("espresso", "amazon", 2), 3);
});

// ── Registry builder ─────────────────────────────────────────────────────────

const REGISTRY_FIXTURE = {
  shopName: "Beaver & Beef",
  locationCandidates: [
    { id: "L1", name: "488 Hyde Street", address: "488 Hyde St, San Francisco, CA",
      neighborhood: "Tenderloin", sq_ft: 1200, asking_rent_cents: 488000, status: "chosen", notes: null },
  ],
  equipment: [
    { id: "E1", name: "La Marzocco GB5",  cost_usd: 18500, category: "major", notes: null },
    { id: "E2", name: "Mahlkönig EK43",   cost_usd: 4200,  category: "major", notes: null },
    { id: "E3", name: "Bunn Brewer",      cost_usd: 1500,  category: "major", notes: null },
  ],
  hiringRoles: [
    { id: "R1", role_title: "Opening-Key Barista", headcount: 1, start_date: null, monthly_cost_cents: 600000, status: "open" },
  ],
  fundingSources: [
    { id: "F1", kind: "loan", label: "SBA 7(a) Loan" },
    { id: "F2", kind: "investor_equity", label: "Calgary Angel Network" },
  ],
};

test("buildPlanStateEntities — surfaces every structured source", () => {
  const ents = buildPlanStateEntities(REGISTRY_FIXTURE);
  const byType = new Map();
  for (const e of ents) {
    const arr = byType.get(e.type) ?? [];
    arr.push(e);
    byType.set(e.type, arr);
  }
  // Business name (shop).
  const businesses = byType.get("business") ?? [];
  assert.equal(businesses.length, 1);
  assert.equal(businesses[0].canonical, "Beaver & Beef");
  // Equipment: 3 items.
  const equip = byType.get("equipment") ?? [];
  assert.equal(equip.length, 3);
  // value_cents pinned so cross-section value checks work.
  const gb5 = equip.find((e) => e.canonical === "La Marzocco GB5");
  assert.ok(gb5);
  assert.equal(gb5.value_cents, 1850000);
  // Location: name + address are separate entities (model abbreviates "Street" inconsistently).
  const locs = byType.get("location") ?? [];
  assert.equal(locs.length, 2);
  // Hiring role title.
  const people = byType.get("person") ?? [];
  assert.equal(people.length, 1);
  assert.equal(people[0].canonical, "Opening-Key Barista");
  // Funding sources → lenders.
  const lenders = byType.get("lender") ?? [];
  assert.equal(lenders.length, 2);
  // Brand vocab always appended.
  const brands = byType.get("brand") ?? [];
  assert.ok(brands.length >= 5, `expected brand vocab to be appended, got ${brands.length}`);
});

test("buildPlanStateEntities — dedupes same canonical across sources", () => {
  // Equipment named "La Marzocco" + brand vocab "La Marzocco" → one entity, not two.
  const ents = buildPlanStateEntities({
    shopName: "Test",
    locationCandidates: [],
    equipment: [
      { id: "E1", name: "La Marzocco", cost_usd: 18500, category: null, notes: null },
    ],
    hiringRoles: [],
    fundingSources: [],
  });
  const marzoccos = ents.filter((e) => e.canonical.toLowerCase() === "la marzocco");
  assert.equal(marzoccos.length, 1, "should dedupe equipment vs brand-vocab La Marzocco");
});

test("builtInBrandVocab — La Marzocco + Mahlkönig present with known aliases", () => {
  const vocab = builtInBrandVocab();
  const lm = vocab.find((b) => b.canonical === "La Marzocco");
  assert.ok(lm);
  assert.ok(lm.aliases.includes("La Marzocko"), "La Marzocko alias must be present");
  const mk = vocab.find((b) => b.canonical === "Mahlkönig");
  assert.ok(mk);
  assert.ok(mk.aliases.includes("Mahlkonig"));
});

// ── Canonicalizer: alias hit ─────────────────────────────────────────────────

test("canonicalizeNarrative — rewrites known La Marzocko alias to La Marzocco", () => {
  const ents = builtInBrandVocab();
  const text = "We selected a La Marzocko Linea Mini for the espresso bar.";
  const r = canonicalizeNarrative(text, ents);
  // "La Marzocko" → "La Marzocco"; "Linea Mini" left intact (not registered).
  assert.match(r.text, /La Marzocco/);
  assert.doesNotMatch(r.text, /Marzocko/);
  assert.ok(r.substitutions.some((s) => s.from === "La Marzocko" && s.to === "La Marzocco"));
});

test("canonicalizeNarrative — rewrites Mahlkonig (ASCII) to Mahlkönig", () => {
  const ents = builtInBrandVocab();
  const text = "Grinder choice: the Mahlkonig EK43.";
  const r = canonicalizeNarrative(text, ents);
  assert.match(r.text, /Mahlkönig/);
});

// ── Canonicalizer: Levenshtein near-miss ─────────────────────────────────────

test("canonicalizeNarrative — fuzzy match within Levenshtein 2 against equipment", () => {
  // Equipment registered as "La Marzocco GB5" → narrative says "La Marzocco GB-5".
  // Hyphen change is one edit; should resolve.
  const ents = [
    { id: "E1", canonical: "La Marzocco GB5", type: "equipment", aliases: [], source: "test" },
  ];
  const r = canonicalizeNarrative("Our La Marzocco GB-5 sits behind the bar.", ents);
  assert.match(r.text, /La Marzocco GB5/);
});

test("canonicalizeNarrative — does NOT rewrite short common words via fuzzy", () => {
  // "Bunn" is in brand vocab. A common word like "Burn" is one char off but
  // shouldn't get rewritten because the MIN_TOKEN_LEN_FOR_FUZZY guard excludes
  // short tokens from fuzzy matching. Exact-alias hits still apply but "Burn"
  // is not an alias.
  const ents = builtInBrandVocab();
  const text = "Customers smell the burn of fresh roasting beans.";
  const r = canonicalizeNarrative(text, ents);
  assert.equal(r.text, text); // unchanged
});

// ── Canonicalizer: hierarchy preservation ────────────────────────────────────

test("canonicalizeNarrative — hierarchy preserved when both forms registered", () => {
  // Both "La Marzocco" and "La Marzocco Linea Mini" registered. Narrative
  // says "La Marzocco Linea Mini" — must NOT collapse to "La Marzocco".
  const ents = [
    { id: "B1", canonical: "La Marzocco", type: "brand", aliases: [], source: "test" },
    { id: "E1", canonical: "La Marzocco Linea Mini", type: "equipment", aliases: [], source: "test" },
  ];
  const text = "The bar runs a La Marzocco Linea Mini for production.";
  const r = canonicalizeNarrative(text, ents);
  assert.match(r.text, /La Marzocco Linea Mini/);
  // Bare "La Marzocco" should NOT have replaced the longer hit.
  assert.equal(
    (r.text.match(/La Marzocco/g) ?? []).length,
    1,
    "should only have ONE La Marzocco occurrence — the Linea Mini one",
  );
});

// ── Canonicalizer: leaves correct spellings untouched ────────────────────────

test("canonicalizeNarrative — no substitution when text already matches canonical", () => {
  const ents = builtInBrandVocab();
  const text = "La Marzocco Linea PB and Mahlkönig EK43 are the workhorses.";
  const r = canonicalizeNarrative(text, ents);
  assert.equal(r.text, text);
  assert.equal(r.substitutions.length, 0);
});

// ── Cross-section unification ────────────────────────────────────────────────

test("unifySections — invented supplier with two variants gets unified", () => {
  // Investor critique case: "Whitehouse Farms" page 3 vs "Whitehorse Farms"
  // everywhere else. Neither is in the structured registry. unifySections
  // should cluster the two near-misses and pick the more frequent variant.
  const registry = [
    { id: "shop", canonical: "Beaver & Beef", type: "business", aliases: [], source: "test" },
  ];
  const sections = [
    { key: "execution-operations",   text: "We source beans from Whitehorse Farms in Oregon." },
    { key: "executive-summary",      text: "Whitehorse Farms supplies our espresso program." },
    { key: "company-overview",       text: "Page 3 of the plan: Whitehouse Farms is our roaster partner." },
  ];
  const u = unifySections(sections, registry);
  // 2/3 variants are "Whitehorse" so that wins. The Whitehouse one should be rewritten.
  const overview = u.sections.find((s) => s.key === "company-overview");
  assert.ok(overview);
  assert.match(overview.text, /Whitehorse Farms/);
  assert.doesNotMatch(overview.text, /Whitehouse Farms/);
  // The newly-discovered entity is returned for persistence on plan_state.
  const farms = u.unified_entities.find((e) => /Whitehorse Farms/i.test(e.canonical));
  assert.ok(farms, "should surface the unified entity");
});

test("unifySections — registry hits still rewritten per section before unification", () => {
  const registry = builtInBrandVocab();
  const sections = [
    { key: "execution-operations", text: "La Marzocko on the espresso bar." },
    { key: "executive-summary",    text: "La Marzocco is the workhorse." },
  ];
  const u = unifySections(sections, registry);
  const ops = u.sections.find((s) => s.key === "execution-operations");
  assert.match(ops.text, /La Marzocco/);
  assert.doesNotMatch(ops.text, /Marzocko/);
});

// ── Prompt formatting ────────────────────────────────────────────────────────

test("formatEntitiesForPrompt — surfaces canonical forms with directive header", () => {
  const ents = buildPlanStateEntities(REGISTRY_FIXTURE);
  const block = formatEntitiesForPrompt(ents);
  assert.match(block, /Entity Registry/);
  assert.match(block, /Beaver & Beef/);
  assert.match(block, /La Marzocco GB5/);
  assert.match(block, /Opening-Key Barista/);
  assert.match(block, /SBA 7\(a\) Loan/);
  // Cost surfaces alongside equipment.
  assert.match(block, /\$18,500/);
  // Aliases are NOT in the prompt (canonicalizer handles them after generation).
  assert.doesNotMatch(block, /La Marzocko/);
});

// ── Real-world false-positive defenses (pinned from prod verify TIM-2337) ──

test("canonicalizeNarrative — does NOT rewrite lowercase mid-sentence common words", () => {
  // The Beaver & Beef prod verify caught these false positives before the
  // capitalized-first-char + canonical-length guards landed. Pinning them so
  // future registry changes can't regress.
  const ents = [
    { id: "B1", canonical: "Mazzer",  type: "brand", aliases: [], source: "test" },
    { id: "B2", canonical: "Probat",  type: "brand", aliases: [], source: "test" },
    { id: "B3", canonical: "Slayer",  type: "brand", aliases: [], source: "test" },
    { id: "B4", canonical: "Acaia",   type: "brand", aliases: [], source: "test" },
    { id: "B5", canonical: "Bar",     type: "equipment", aliases: [], source: "test" },
  ];
  const text =
    "It will matter how the team makes profit and stayed open. The board " +
    "agreed to wait for the bar to be ready again.";
  const r = canonicalizeNarrative(text, ents);
  assert.equal(r.text, text, `expected no rewrites, got substitutions: ${JSON.stringify(r.substitutions)}`);
});

test("canonicalizeNarrative — does NOT rewrite real coffee brand names to similar registry entries", () => {
  // "Hario" and "Fellow" are real coffee brands the model legitimately cites.
  // With short canonicals "Marco" + "Hello" in the registry they previously
  // fuzzy-collapsed to the wrong brand. The canonical-length floor blocks it.
  const ents = [
    { id: "B1", canonical: "Marco", type: "brand", aliases: [], source: "test" },
    { id: "B2", canonical: "Hello", type: "equipment", aliases: [], source: "test" },
  ];
  const text = "We brew on a Hario V60 and weigh shots on a Fellow scale.";
  const r = canonicalizeNarrative(text, ents);
  assert.equal(r.text, text);
});

test("unifySections — does NOT cluster singular/plural variants", () => {
  // Beaver & Beef verify hit this: "Part-Time Barista" (role title) and
  // "Part-Time Baristas" (group reference) carry different semantic load and
  // should remain distinct even though they're within Levenshtein 1.
  const sections = [
    { key: "company-team",         text: "Hire one Part-Time Barista in month two." },
    { key: "execution-operations", text: "Two Part-Time Baristas cover Saturday rush." },
  ];
  const u = unifySections(sections, []);
  // Neither section text should change.
  assert.equal(u.sections.find((s) => s.key === "company-team").text, sections[0].text);
  assert.equal(u.sections.find((s) => s.key === "execution-operations").text, sections[1].text);
});

// ── Normalization ────────────────────────────────────────────────────────────

test("normalizeForMatch — collapses whitespace and lowercases", () => {
  assert.equal(normalizeForMatch("  La  Marzocco  "), "la marzocco");
});

test("normalizeForMatch — strips leading/trailing punctuation", () => {
  assert.equal(normalizeForMatch('"La Marzocco."'), "la marzocco");
});
