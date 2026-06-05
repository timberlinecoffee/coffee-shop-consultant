// TIM-2337: Controlled vocabulary for proper nouns in generated narrative.
//
// Investor critique on TIM-2315 item #5: regenerated Beaver & Beef plan had
// "Whitehouse Farms" (p3) vs "Whitehorse Farms" (everywhere else),
// "La Marzocko" (p4) vs "La Marzocco" (everywhere else). Each is a single
// typo; each kills credibility independently. A lender catches one and asks
// "what else is wrong?"
//
// Fix: canonical entity registry on plan_state. Every proper noun is entered
// once (via the structured workspaces) or registered via the well-known coffee
// brand vocabulary, canonicalized to one spelling, and used consistently
// everywhere in the generated plan.
//
// Two layers:
//   1. Build-time registry (PlanStateEntity[]) — equipment names, location
//      names/addresses, funding-source lenders, shop name. Surfaced into the
//      narrative prompt as a "use these spellings only" block.
//   2. Render-time canonicalizer — after the LLM returns a section, scan for
//      known aliases or near-misses (Levenshtein ≤ 2) against canonical names
//      and auto-replace. Hierarchical entities ("La Marzocco" vs
//      "La Marzocco Linea") are preserved when both are registered.
//
// Relative imports (not @/ aliases) so node:test can load this module without
// the Next.js path-alias resolver (mirrors plan-state.ts).

import type {
  BpLocationCandidate,
  BpEquipmentItem,
  BpHiringRole,
} from "../business-plan.ts";
import type { MonthlyProjections, FundingKind } from "../financial-projection.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export type PlanStateEntityType =
  | "equipment"
  | "supplier"
  | "brand"
  | "location"
  | "business"
  | "person"
  | "lender";

export interface PlanStateEntity {
  id: string;                 // stable id (often the source row id)
  canonical: string;          // the one spelling the narrative is allowed to use
  type: PlanStateEntityType;
  aliases: string[];          // known misspellings + reasonable variants
  source: string;             // workspace / source identifier for traceability
  // Optional quantitative attributes attached to the entity. When set, this is
  // the SINGLE value any section is allowed to cite for this entity. Investor
  // critique #5 mentioned equipment value $48,000 in two sections and $45,000
  // in another — same root cause as the name typos, prevented by pinning the
  // value here and only ever quoting it via plan_state.
  value_cents?: number;
}

// ── Built-in coffee-brand vocabulary ─────────────────────────────────────────
//
// A small curated list of well-known coffee equipment brands and roasters with
// their common misspellings. Used by the canonicalizer even when the brand
// isn't in the structured equipment list, so "La Marzocko" gets rewritten to
// "La Marzocco" anywhere it appears. Keep the list small and verifiable —
// adding a new brand here is a one-line edit and should only happen when a
// real plan surfaces a spelling we want to defend.

// Built-in coffee brand vocabulary. Aliases must be VARIANTS of the same
// scope — never include "Mahlkonig EK43" as an alias for "Mahlkönig", because
// the alias-rewrite is whole-phrase: it would collapse "Mahlkonig EK43" down
// to "Mahlkönig" and drop the model number. Single-token misspellings get
// fixed via the per-token alias hit during phrase scanning, so "Mahlkonig
// EK43" in text correctly becomes "Mahlkönig EK43" without us listing the
// 2-word variant.
const BUILT_IN_BRAND_VOCAB: ReadonlyArray<{ canonical: string; aliases: string[] }> = [
  // "La Marzocko" was the investor-flagged misspelling on TIM-2315 — explicit
  // alias so the substitution log shows the exact replacement we made.
  { canonical: "La Marzocco",  aliases: ["La Marzocko", "LaMarzocco", "Lamarzocco"] },
  { canonical: "Mahlkönig",    aliases: ["Mahlkonig", "Mahlkoenig", "Mahlköning"] },
  { canonical: "Synesso",      aliases: ["Synnesso"] },
  { canonical: "Victoria Arduino", aliases: ["Vittoria Arduino"] },
  { canonical: "Nuova Simonelli", aliases: ["Nuovo Simonelli"] },
  { canonical: "Mazzer",       aliases: ["Mazzar"] },
  { canonical: "Probat",       aliases: ["Probatt"] },
  { canonical: "Diedrich",     aliases: ["Deidrich", "Diedrick"] },
  { canonical: "Acaia",        aliases: ["Accaia"] },
  { canonical: "Intelligentsia", aliases: ["Intelligencia", "Intellegentsia"] },
  // Single-canonical entries (no aliases) so the prompt-time registry still
  // surfaces the correct spelling AND the canonicalizer can fuzzy-rewrite
  // misspellings via Levenshtein. Slayer/Mavam/Bunn/Curtis/Marco/Fetco have
  // common single-word names — Levenshtein fuzzy on the canonical form
  // catches close misspellings (≥ 5 chars).
  { canonical: "Slayer",       aliases: [] },
  { canonical: "Mavam",        aliases: [] },
  { canonical: "Bunn",         aliases: [] },
  { canonical: "Curtis",       aliases: [] },
  { canonical: "Marco",        aliases: [] },
  { canonical: "Fetco",        aliases: [] },
  { canonical: "Counter Culture Coffee", aliases: ["Counterculture Coffee"] },
  { canonical: "Stumptown",    aliases: ["Stump Town"] },
  { canonical: "Verve Coffee", aliases: [] },
  { canonical: "Blue Bottle",  aliases: ["Bluebottle"] },
];

// ── Public: built-in vocab access ────────────────────────────────────────────

export function builtInBrandVocab(): PlanStateEntity[] {
  return BUILT_IN_BRAND_VOCAB.map((b, idx) => ({
    id: `vocab:${idx}`,
    canonical: b.canonical,
    type: "brand",
    aliases: b.aliases,
    source: "built-in-vocab",
  }));
}

// ── Builder inputs ───────────────────────────────────────────────────────────

export interface BuildPlanStateEntitiesInputs {
  shopName: string;
  locationCandidates: BpLocationCandidate[];
  equipment: BpEquipmentItem[];
  hiringRoles: BpHiringRole[];
  // financial_models.monthly_projections.funding_sources (lenders / investors).
  fundingSources?: Array<{ id: string; kind: FundingKind; label: string }> | null;
}

// ── Builder ──────────────────────────────────────────────────────────────────

// Normalize a name for fuzzy-comparison: lowercase, collapse whitespace, strip
// leading/trailing punctuation. Aliases and canonical names are compared on
// this normalized form; the OUTPUT always uses the original canonical casing.
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s ]+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();
}

// Build the entity registry from the same structured sources plan_state reads
// for numeric ground truth. Every entity here is "trusted" — it came from a
// workspace the founder filled in (or from the built-in brand vocab).
export function buildPlanStateEntities(inp: BuildPlanStateEntitiesInputs): PlanStateEntity[] {
  const entities: PlanStateEntity[] = [];
  const seenCanon = new Set<string>();

  const push = (e: PlanStateEntity) => {
    // Dedupe on canonical name only (not type). A name is a name — if the
    // founder enters "La Marzocco" as an equipment item AND the built-in
    // brand vocab also lists it, we want ONE entity (the structured one
    // wins because it's pushed first and carries the cost_cents value).
    const key = normalizeForMatch(e.canonical);
    if (!key) return;
    if (seenCanon.has(key)) return;
    seenCanon.add(key);
    entities.push(e);
  };

  // 1. Business name — the shop itself. Most often misspelled by the model
  // when the founder uses a stylized name (apostrophes, ampersands, ALL CAPS).
  if (inp.shopName && inp.shopName.trim()) {
    push({
      id: "shop",
      canonical: inp.shopName.trim(),
      type: "business",
      aliases: [],
      source: "plan.plan_name",
    });
  }

  // 2. Equipment items — name + cost. value_cents pins the dollar figure so
  // the validator (TIM-2336) can flag any section that quotes a different
  // number for the same piece of equipment.
  for (const item of inp.equipment ?? []) {
    if (!item.name || !item.name.trim()) continue;
    push({
      id: `equipment:${item.id}`,
      canonical: item.name.trim(),
      type: "equipment",
      aliases: [],
      source: "buildout_equipment_items",
      ...(item.cost_usd != null
        ? { value_cents: Math.round(item.cost_usd * 100) }
        : {}),
    });
  }

  // 3. Locations — the candidate name AND address are both proper nouns the
  // narrative will quote across sections (Operations, Executive Summary,
  // Overview). Address goes in as its own entity because models love to
  // abbreviate "Street" / "Avenue" / etc. inconsistently across sections.
  for (const loc of inp.locationCandidates ?? []) {
    if (loc.name && loc.name.trim()) {
      push({
        id: `location:${loc.id}`,
        canonical: loc.name.trim(),
        type: "location",
        aliases: [],
        source: "location_candidates.name",
      });
    }
    if (loc.address && loc.address.trim()) {
      push({
        id: `address:${loc.id}`,
        canonical: loc.address.trim(),
        type: "location",
        aliases: [],
        source: "location_candidates.address",
      });
    }
  }

  // 4. Hiring roles — role TITLES, not people. We register the role title so
  // capitalization stays consistent ("opening-key barista" vs "Opening-Key
  // Barista" — the voice rules require title case for named roles).
  for (const role of inp.hiringRoles ?? []) {
    if (!role.role_title || !role.role_title.trim()) continue;
    push({
      id: `role:${role.id}`,
      canonical: role.role_title.trim(),
      type: "person",
      aliases: [],
      source: "hiring_plan_roles.role_title",
    });
  }

  // 5. Funding-source labels — lenders, investors, grant programs. These are
  // proper nouns the financing section will name explicitly ("SBA Loan",
  // "First National Bank", "Calgary Economic Development"). Region-aware
  // lender allowlist from TIM-2339 is enforced separately at prompt-time.
  for (const src of inp.fundingSources ?? []) {
    if (!src.label || !src.label.trim()) continue;
    push({
      id: `funding:${src.id}`,
      canonical: src.label.trim(),
      type: "lender",
      aliases: [],
      source: "funding_sources.label",
    });
  }

  // 6. Built-in coffee-brand vocabulary — always present so the canonicalizer
  // can defend well-known spellings even when the equipment workspace is empty
  // (the model still invents "La Marzocco GB5" from nothing in that case).
  for (const v of builtInBrandVocab()) push(v);

  return entities;
}

// Convenience: pull funding sources off a monthly_projections object so the
// /generate route can build entities without a second DB query.
export function extractFundingSourcesForEntities(
  mp: Pick<MonthlyProjections, "funding_sources"> | null | undefined,
): Array<{ id: string; kind: FundingKind; label: string }> {
  return (mp?.funding_sources ?? []).map((s) => ({
    id: s.id,
    kind: s.kind,
    label: s.label,
  }));
}

// ── Prompt block: surfaces the registry into the BP system prompt ────────────

export function formatEntitiesForPrompt(entities: PlanStateEntity[]): string {
  if (entities.length === 0) return "";
  const byType = new Map<PlanStateEntityType, PlanStateEntity[]>();
  for (const e of entities) {
    const arr = byType.get(e.type) ?? [];
    arr.push(e);
    byType.set(e.type, arr);
  }
  const lines: string[] = [];
  lines.push("Entity Registry — controlled vocabulary for proper nouns.");
  lines.push(
    "When you reference any business, equipment, brand, supplier, person, " +
    "location, or lender by name, use ONLY the canonical spellings below. " +
    "Do not invent variations. Do not abbreviate. Do not pluralize.",
  );
  lines.push("");

  const TYPE_LABEL: Record<PlanStateEntityType, string> = {
    business: "Business",
    equipment: "Equipment",
    brand: "Brand / Roaster",
    supplier: "Supplier",
    location: "Location & Address",
    person: "Role / Person",
    lender: "Lender / Investor",
  };

  const order: PlanStateEntityType[] = [
    "business", "location", "equipment", "lender", "person", "supplier", "brand",
  ];

  for (const t of order) {
    const arr = byType.get(t);
    if (!arr || arr.length === 0) continue;
    lines.push(`${TYPE_LABEL[t]}:`);
    for (const e of arr) {
      // Brand vocab entries — keep them dense; one line each. Suppress the
      // alias list here (it would balloon the prompt) — the canonicalizer
      // rewrites aliases AFTER generation, so the prompt only needs to know
      // the canonical form.
      const valueBits = e.value_cents != null
        ? ` (cost ${formatUsdShort(e.value_cents)})`
        : "";
      lines.push(`- ${e.canonical}${valueBits}`);
    }
    lines.push("");
  }

  lines.push(
    "If a section needs a proper noun that is NOT in this registry (e.g. a " +
    "supplier or advisor not entered in any workspace), invent it ONCE and " +
    "use the same spelling everywhere — never two variants. Prefer real, " +
    "verifiable names (a bean supplier from the founder's likely region) " +
    "over generic placeholders.",
  );

  return lines.join("\n").trim();
}

function formatUsdShort(cents: number): string {
  const dollars = cents / 100;
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}

// ── Canonicalizer ────────────────────────────────────────────────────────────
//
// After the LLM returns a section's markdown, scan the text for known aliases
// and near-misses (Levenshtein ≤ 2) against canonical names. Replace each
// match with the canonical form. The function is pure — it takes the text and
// the registry, returns the rewritten text plus a list of substitutions made
// (for the regression test and verify script).

export interface CanonicalizationResult {
  text: string;
  substitutions: Array<{ from: string; to: string; type: PlanStateEntityType; count: number }>;
}

// Levenshtein distance — small inputs, O(n*m) is fine. Cached short-circuit at
// max=2 since that's the only threshold the canonicalizer uses.
export function levenshteinAtMost(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  // Single-row DP, early-exit when min(row) > max.
  let prev = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    const curr = new Array(lb + 1);
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,         // deletion
        curr[j - 1] + 1,     // insertion
        prev[j - 1] + cost,  // substitution
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[lb];
}

// A phrase candidate is a sequence of 1..N tokens. We scan the text for
// multi-token phrases matching a registry entity's canonical or alias by
// (a) exact normalized equality, (b) alias hit, or (c) Levenshtein ≤ 2 on the
// joined normalized form. Hierarchy is preserved: if the text says "La
// Marzocco Linea" and BOTH "La Marzocco" and "La Marzocco Linea" are
// registered, the longer match wins and we don't truncate it to "La Marzocco".

interface CanonicalForm {
  canonical: string;
  type: PlanStateEntityType;
  normalized: string;
  tokenCount: number;
}

interface AliasForm {
  alias: string;
  canonical: string;
  type: PlanStateEntityType;
  normalized: string;
  tokenCount: number;
}

function tokenize(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

function buildCanonicalForms(entities: PlanStateEntity[]): {
  canonForms: CanonicalForm[];
  aliasForms: AliasForm[];
} {
  const canonForms: CanonicalForm[] = [];
  const aliasForms: AliasForm[] = [];
  for (const e of entities) {
    const cNorm = normalizeForMatch(e.canonical);
    if (!cNorm) continue;
    canonForms.push({
      canonical: e.canonical,
      type: e.type,
      normalized: cNorm,
      tokenCount: tokenize(cNorm).length,
    });
    for (const a of e.aliases) {
      const aNorm = normalizeForMatch(a);
      if (!aNorm || aNorm === cNorm) continue;
      aliasForms.push({
        alias: a,
        canonical: e.canonical,
        type: e.type,
        normalized: aNorm,
        tokenCount: tokenize(aNorm).length,
      });
    }
  }
  // Longest first so multi-word matches beat single-word matches when both
  // would otherwise hit (hierarchy preservation).
  canonForms.sort((a, b) => b.tokenCount - a.tokenCount || b.normalized.length - a.normalized.length);
  aliasForms.sort((a, b) => b.tokenCount - a.tokenCount || b.normalized.length - a.normalized.length);
  return { canonForms, aliasForms };
}

// Replace a single occurrence of a phrase (case-insensitive) in `text` at
// position `startCharIdx` with `replacement`. The text outside the matched
// span is preserved verbatim, including its original casing and punctuation.
function replaceSpan(text: string, startCharIdx: number, endCharIdx: number, replacement: string): string {
  return text.slice(0, startCharIdx) + replacement + text.slice(endCharIdx);
}

// Phrase-level scan: walk every whitespace-bounded run in `text`, attempt to
// match an N-token window (up to MAX_PHRASE_TOKENS) against the registry, and
// rewrite on hit. Returns the rewritten text plus a substitution log.
const MAX_PHRASE_TOKENS = 5;
const MAX_LEVENSHTEIN = 2;

// Tokens shorter than this length are excluded from Levenshtein matching to
// avoid rewriting common short words (e.g. "Bunn" ≤ 2 chars off from many
// 4-letter words). Exact-alias hits still apply regardless of length.
const MIN_TOKEN_LEN_FOR_FUZZY = 5;

// Canonical names shorter than this normalized-length are excluded from being
// fuzzy-match TARGETS. The Beaver & Beef verify exposed real damage from this:
// a 5-char canonical "Marco" matched "March", "Hello" matched "Fellow",
// "Hario" matched "Marco" — every 5-6 char capitalized English word ends up
// within Levenshtein 2 of something in a dense registry. 7 char floor lets
// "Mahlkönig" (9) keep fuzzy-defending typos like "Mahlkonig" while shutting
// down the false positives. Exact alias hits still apply at any length.
const MIN_CANONICAL_LEN_FOR_FUZZY = 7;

// Match-context guard: words around the candidate that suggest it's NOT a
// proper-noun mention. If any of these immediately precede the candidate, we
// skip the rewrite. (E.g. "in" or "from" before a place name is fine; "the"
// is fine. But mid-sentence prepositions don't tell us much, so this list is
// conservative.) Currently empty — left as a hook for future tightening.
const NEGATIVE_CONTEXT: ReadonlySet<string> = new Set<string>([]);

// Find a token-boundary-aware character index for a token offset within the
// original text. We re-derive token spans from `text` so casing/punctuation
// are preserved.
interface TokenSpan {
  raw: string;
  startChar: number;
  endChar: number;
  normalized: string;
}

function spanTokens(text: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  const re = /[\p{L}\p{N}][\p{L}\p{N}'\-]*/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    spans.push({
      raw: m[0],
      startChar: m.index,
      endChar: m.index + m[0].length,
      normalized: m[0].toLowerCase(),
    });
  }
  return spans;
}

function joinNorm(spans: TokenSpan[], i: number, n: number): string {
  return spans.slice(i, i + n).map((s) => s.normalized).join(" ");
}

export function canonicalizeNarrative(
  text: string,
  entities: PlanStateEntity[],
): CanonicalizationResult {
  if (!text || entities.length === 0) {
    return { text, substitutions: [] };
  }

  const { canonForms, aliasForms } = buildCanonicalForms(entities);
  const substitutionMap = new Map<string, { type: PlanStateEntityType; count: number }>();

  // Iterate replacement passes until the text stabilises (the most common
  // case is one pass, but if a longer match enables a shorter overlapping
  // one we want the engine to converge instead of leaving artifacts).
  let working = text;
  for (let pass = 0; pass < 4; pass++) {
    const tokens = spanTokens(working);
    if (tokens.length === 0) break;

    let didReplace = false;

    // Walk tokens left-to-right. For each i, try the longest phrase first
    // (MAX_PHRASE_TOKENS down to 1), preferring alias matches over fuzzy.
    let i = 0;
    while (i < tokens.length) {
      let matched: { startChar: number; endChar: number; canonical: string; type: PlanStateEntityType; from: string } | null = null;

      for (let n = Math.min(MAX_PHRASE_TOKENS, tokens.length - i); n >= 1; n--) {
        const window = joinNorm(tokens, i, n);
        const prevTok = i > 0 ? tokens[i - 1].normalized : "";
        if (NEGATIVE_CONTEXT.has(prevTok)) continue;

        // (a) Alias hit (exact) — always honored, no length floor.
        const aliasHit = aliasForms.find((a) => a.tokenCount === n && a.normalized === window);
        if (aliasHit) {
          const startChar = tokens[i].startChar;
          const endChar = tokens[i + n - 1].endChar;
          // Skip if the matched span is ALREADY the canonical form (so we
          // don't churn on the same text).
          if (working.slice(startChar, endChar).toLowerCase() !== aliasHit.canonical.toLowerCase()) {
            matched = {
              startChar,
              endChar,
              canonical: aliasHit.canonical,
              type: aliasHit.type,
              from: working.slice(startChar, endChar),
            };
            break;
          }
        }

        // (b) Canonical exact — already correct, skip (but mark consumed so
        // we don't run fuzzy on it and accidentally rewrite). We do this by
        // breaking out of the n-loop without replacement.
        const exactCanon = canonForms.find((c) => c.tokenCount === n && c.normalized === window);
        if (exactCanon) {
          // Advance past this phrase so we don't fuzzy-match a substring of it.
          i += n - 1;
          break;
        }

        // (c) Fuzzy: Levenshtein ≤ 2 against canonical or alias normalized
        // forms. Two guards prevent the registry from rewriting common English
        // words (we saw "matter" → "Mazzer", "profit" → "Probat", "stayed" →
        // "Slayer" on Beaver & Beef's saved narrative — these are common
        // 6-letter English words a small registry can never safely fuzzy-match):
        //   1. Proper-noun guard: the first character of the matched span
        //      MUST be uppercase. Common-noun usage is lowercase mid-sentence;
        //      proper nouns are capitalized. This is the load-bearing guard.
        //   2. Length floor on single-token: <5 chars has too little signal
        //      even when capitalized (sentence-start "Bar" etc.).
        const firstTokRaw = tokens[i].raw;
        const firstCharIsUpper = firstTokRaw.length > 0
          && firstTokRaw[0] === firstTokRaw[0].toUpperCase()
          && firstTokRaw[0] !== firstTokRaw[0].toLowerCase();
        if (!firstCharIsUpper) continue;
        if (n === 1) {
          const tk = tokens[i].normalized;
          if (tk.length < MIN_TOKEN_LEN_FOR_FUZZY) continue;
        }

        // Try canonical near-misses first (the registered "right" spelling
        // is what we want to canonicalize toward).
        let fuzzy: { canonical: string; type: PlanStateEntityType } | null = null;
        for (const c of canonForms) {
          if (c.tokenCount !== n) continue;
          // Skip targets shorter than the canonical floor — see comment on
          // MIN_CANONICAL_LEN_FOR_FUZZY. Multi-token canonical exempted (the
          // joined form has enough characters).
          if (n === 1 && c.normalized.length < MIN_CANONICAL_LEN_FOR_FUZZY) continue;
          // Same token count is required for fuzzy — we don't want to grow
          // or shrink the matched span across multi-token boundaries.
          const d = levenshteinAtMost(window, c.normalized, MAX_LEVENSHTEIN);
          if (d > 0 && d <= MAX_LEVENSHTEIN) {
            // Guard against false positives where the window is itself a
            // legitimate hierarchy entry (e.g. "La Marzocco Linea" should
            // NOT fuzzy-match to "La Marzocco" — but we already passed (b)
            // for exactCanon, and the longer matches were tried first).
            fuzzy = { canonical: c.canonical, type: c.type };
            break;
          }
        }
        if (!fuzzy) {
          for (const a of aliasForms) {
            if (a.tokenCount !== n) continue;
            if (n === 1 && a.normalized.length < MIN_CANONICAL_LEN_FOR_FUZZY) continue;
            const d = levenshteinAtMost(window, a.normalized, MAX_LEVENSHTEIN);
            if (d > 0 && d <= MAX_LEVENSHTEIN) {
              fuzzy = { canonical: a.canonical, type: a.type };
              break;
            }
          }
        }
        if (fuzzy) {
          const startChar = tokens[i].startChar;
          const endChar = tokens[i + n - 1].endChar;
          // Don't rewrite if the original span is ALREADY the canonical form
          // (case-insensitive). This can happen when fuzzy matches itself.
          if (working.slice(startChar, endChar).toLowerCase() !== fuzzy.canonical.toLowerCase()) {
            matched = {
              startChar,
              endChar,
              canonical: fuzzy.canonical,
              type: fuzzy.type,
              from: working.slice(startChar, endChar),
            };
            break;
          }
        }
      }

      if (matched) {
        const fromKey = `${matched.from}→${matched.canonical}`;
        const prev = substitutionMap.get(fromKey);
        substitutionMap.set(fromKey, {
          type: matched.type,
          count: (prev?.count ?? 0) + 1,
        });
        working = replaceSpan(working, matched.startChar, matched.endChar, matched.canonical);
        didReplace = true;
        // Restart from the start of the next iteration with re-tokenized text
        // since char offsets shifted.
        break;
      }

      i += 1;
    }

    if (!didReplace) break;
  }

  const substitutions = Array.from(substitutionMap.entries()).map(([key, v]) => {
    const [from, to] = key.split("→");
    return { from, to, type: v.type, count: v.count };
  });
  return { text: working, substitutions };
}

// ── Cross-section consistency ───────────────────────────────────────────────
//
// When the regenerate-all route emits N sections in one run, an entity the
// model invented (e.g. a supplier name not in the registry) might appear in
// section A spelled "Whitehorse Farms" and in section B spelled "Whitehouse
// Farms". The canonicalizer rewrites against the registry per-section but has
// no memory of what the OTHER sections said. unifySections() solves that.
//
// Strategy:
//   1. Per section, extract candidate proper-noun phrases (capitalized
//      runs not in the registry). These are "new" entities.
//   2. Group near-misses across sections (Levenshtein ≤ 2 on normalized
//      form). The first-seen variant wins as the cross-section canonical.
//   3. Rewrite each section to use the unified spelling, and return the set
//      of newly-canonicalized entities so the caller can persist them on
//      plan_state.entities for the next run.

export interface UnifiedEntitiesResult {
  sections: Array<{ key: string; text: string }>;
  unified_entities: PlanStateEntity[];
  unification_log: Array<{ from: string; to: string; sections: string[] }>;
}

// True when `a` and `b` differ only by a trailing English plural marker
// ('s' or 'es'). Used to keep singular/plural variants in separate clusters
// during cross-section unification — they encode different meanings even
// when within Levenshtein 2 of each other.
function isOnlyPluralDiff(a: string, b: string): boolean {
  if (a === b) return false;
  const stripPlural = (s: string): string => {
    if (s.endsWith("es") && s.length > 3) return s.slice(0, -2);
    if (s.endsWith("s") && s.length > 2) return s.slice(0, -1);
    return s;
  };
  return stripPlural(a) === stripPlural(b);
}

// Loose capitalized-phrase detector: a run of capitalized tokens (each token
// starts with an uppercase letter; allows internal apostrophes and hyphens),
// up to 4 tokens long. Filters out single-token phrases that are sentence-
// starters by requiring at least one token NOT at the start of a sentence —
// caller handles that via context.
function extractCapitalizedPhrases(text: string): Array<{ phrase: string; startChar: number }> {
  const out: Array<{ phrase: string; startChar: number }> = [];
  const re = /(?<![\.!?]\s)([A-Z][\p{L}'\-]+(?:\s+[A-Z&][\p{L}'\-]*){1,3})/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ phrase: m[1], startChar: m.index });
  }
  return out;
}

export function unifySections(
  sections: Array<{ key: string; text: string }>,
  registry: PlanStateEntity[],
): UnifiedEntitiesResult {
  // Step 1: per section, run canonicalize against the existing registry first.
  const canonicalized = sections.map((s) => {
    const r = canonicalizeNarrative(s.text, registry);
    return { key: s.key, text: r.text };
  });

  // Step 2: collect candidate phrases (capitalized runs that DON'T resolve to
  // a registry canonical OR alias). These are entities the model invented.
  const regNorms = new Set<string>();
  for (const e of registry) {
    regNorms.add(normalizeForMatch(e.canonical));
    for (const a of e.aliases) regNorms.add(normalizeForMatch(a));
  }
  // Stop list — capitalized words/phrases that are NOT proper nouns we care
  // about (sentence starters, common nouns frequently title-cased in plan
  // prose). Conservative — false negatives are fine; false positives create
  // spurious canonical names we then enforce across sections.
  const STOP_PHRASES = new Set<string>([
    "executive summary", "ground truth numbers", "year one", "year two", "year three",
    "year four", "year five", "monthly statements", "the team", "the owner",
    "specialty coffee", "third wave", "third place",
  ]);

  type Candidate = { norm: string; firstSeen: string; sections: Set<string> };
  const candidates = new Map<string, Candidate>();
  for (const { key, text } of canonicalized) {
    for (const { phrase } of extractCapitalizedPhrases(text)) {
      const norm = normalizeForMatch(phrase);
      if (!norm) continue;
      if (regNorms.has(norm)) continue;
      if (STOP_PHRASES.has(norm)) continue;
      // Cluster by EXACT normalized first; merging near-misses happens next.
      const existing = candidates.get(norm);
      if (existing) {
        existing.sections.add(key);
      } else {
        candidates.set(norm, { norm, firstSeen: phrase, sections: new Set([key]) });
      }
    }
  }

  // Step 3: cluster near-misses across candidates. For each candidate, look
  // for an existing cluster representative within Levenshtein ≤ 2 and merge.
  // Cluster representative = the longest-string variant (most specific).
  type Cluster = { canonical: string; norm: string; variants: Set<string>; sections: Set<string> };
  const clusters: Cluster[] = [];
  // Sort by frequency desc (entities seen in MORE sections are more likely to
  // be the real canonical) then by length desc to prefer longer forms.
  const orderedCandidates = Array.from(candidates.values()).sort((a, b) => {
    if (b.sections.size !== a.sections.size) return b.sections.size - a.sections.size;
    return b.firstSeen.length - a.firstSeen.length;
  });
  for (const cand of orderedCandidates) {
    // Find an existing cluster within fuzzy distance.
    let merged = false;
    for (const cl of clusters) {
      if (levenshteinAtMost(cand.norm, cl.norm, MAX_LEVENSHTEIN) > MAX_LEVENSHTEIN) continue;
      // Singular/plural variants are intentionally different and should not
      // collapse — "Part-Time Barista" (role title) vs "Part-Time Baristas"
      // (group of those roles) carry distinct semantic load, so never cluster
      // them. Detect the diff-is-only-trailing-s case and skip.
      if (isOnlyPluralDiff(cand.norm, cl.norm)) continue;
      cl.variants.add(cand.firstSeen);
      for (const s of cand.sections) cl.sections.add(s);
      // Prefer the more-frequent variant as canonical (we ordered by
      // frequency already, so existing canonical wins).
      merged = true;
      break;
    }
    if (!merged) {
      clusters.push({
        canonical: cand.firstSeen,
        norm: cand.norm,
        variants: new Set([cand.firstSeen]),
        sections: new Set(cand.sections),
      });
    }
  }

  // Step 4: build a "virtual" registry from clusters where the variants
  // differ, and re-canonicalize sections against it. Single-variant clusters
  // get registered too (so a future run sees them as known proper nouns).
  const newEntities: PlanStateEntity[] = [];
  const rewriteRegistry: PlanStateEntity[] = [...registry];
  let idx = 0;
  for (const cl of clusters) {
    const aliases = Array.from(cl.variants).filter((v) => v !== cl.canonical);
    const entity: PlanStateEntity = {
      id: `invented:${idx++}`,
      canonical: cl.canonical,
      type: "supplier", // best-effort default; the user can re-type later
      aliases,
      source: "narrative-discovered",
    };
    if (aliases.length > 0) rewriteRegistry.push(entity);
    newEntities.push(entity);
  }

  const finalSections: Array<{ key: string; text: string }> = [];
  const unificationLog: Array<{ from: string; to: string; sections: string[] }> = [];
  for (const s of canonicalized) {
    const r = canonicalizeNarrative(s.text, rewriteRegistry);
    finalSections.push({ key: s.key, text: r.text });
    for (const sub of r.substitutions) {
      unificationLog.push({ from: sub.from, to: sub.to, sections: [s.key] });
    }
  }

  return {
    sections: finalSections,
    unified_entities: newEntities,
    unification_log: unificationLog,
  };
}
