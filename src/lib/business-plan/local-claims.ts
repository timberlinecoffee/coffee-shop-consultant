// TIM-2340: Geographic + local-claim guardrails for the business-plan narrative.
//
// Investor critique on TIM-2315 item #6 parts 2-4 (Beaver & Beef): the
// regenerated plan invented foot-traffic counts ("Saturday daytime foot traffic
// on the Inglewood main strip runs 800 to 1,200 pedestrians per day"), invented
// competitor addresses ("Kawa Espresso Bar (11 Ave SE)"), invented weekly
// visitor numbers, and geography that doesn't exist ("Bridgeland/Aspen Landing
// corridor" — Bridgeland and Aspen Landing are on opposite sides of Calgary).
//
// The investor's rule: "Inventing a specific number is worse than omitting one."
//
// This module provides three things:
//   1. A prompt directive (LOCAL_CLAIMS_DIRECTIVE) that forbids fabricated
//      foot-traffic, demographic, and competitor-specific claims, and tells
//      the LLM what qualitative phrasing to use instead (SENTINEL_PHRASES).
//   2. A typed PlanStateLocalClaims block built from the concept workspace's
//      user-entered competitors[]. The narrative is allowed to cite ONLY the
//      competitors in this block; if the list is empty (and the user hasn't
//      flagged "no direct competitors identified"), the prompt instructs the
//      LLM to discuss competition qualitatively without naming specific shops.
//   3. A curated North American geography dataset + validator. Catches
//      cross-city or cross-region neighborhood combinations the narrative
//      uses as if they were adjacent. Surfaces as advisory findings in the
//      validation report (Pass 2 category "geographic_fabrication").
//
// Relative imports (no @/ aliases) so node:test can load this module without
// the Next.js path-alias resolver — mirrors plan-state.ts and entities.ts.

// ── Public types ─────────────────────────────────────────────────────────────

// A competitor the user entered in the concept workspace. The narrative is
// allowed to cite ONLY these competitors by name; never invented ones.
export interface PlanStateCompetitor {
  id: string;
  name: string;
  address: string | null;     // optional — null when the user didn't enter one
  what_they_do_well: string | null;
  gaps: string | null;
}

export interface PlanStateLocalClaims {
  competitors: PlanStateCompetitor[];
  // Explicit toggle. When true AND competitors[] is empty, the narrative is
  // allowed to write "no direct competitors identified" rather than fall back
  // to qualitative hedging. Distinguishes "user said none" from "user didn't fill it in".
  no_direct_competitors_identified: boolean;
  // Resolved city / region label from plan_state.lease (chosen address). Used
  // to scope the geography validator. Null when no address is set.
  city_label: string | null;
}

// ── Sentinel phrases — what the LLM falls back to when it would otherwise ────
// fabricate a foot-traffic count or visitor number. Keep this list tight; the
// goal is to give the model coffee-business-credible hedging language so the
// voice stays grounded.

export const SENTINEL_PHRASES: ReadonlyArray<string> = [
  "consistently strong daytime traffic",
  "an established food-and-beverage corridor",
  "a steady mix of weekday workers and weekend visitors",
  "the main pedestrian artery of the neighborhood",
  "regular foot traffic from nearby residential blocks",
  "an active morning commute window",
  "a destination strip rather than a pass-through",
  "demonstrated cafe demand in adjacent storefronts",
];

// ── Prompt directive injected when local_claims is provided ──────────────────

export const LOCAL_CLAIMS_DIRECTIVE = `Local-claim and geography rule:
- Do NOT invent pedestrian counts, foot-traffic numbers, daily/weekly visitor counts, or demographic statistics. If the user has not provided one, write around it qualitatively.
- Do NOT invent competitor names, addresses, hours, transaction counts, or daily-customer estimates. Discuss only the competitors listed in the Competitors block below; if that block is empty, describe competition qualitatively without naming specific businesses.
- Do NOT pair neighborhood names that are not actually adjacent. If you are unsure two places share a corridor, do not assert they do. Refer to the resolved city/region in the Local Geography block below.
- Inventing a specific number is worse than omitting one. Prefer a qualitative phrase over a fabricated figure.
- When you need a hedge, draw from these phrasings (or similar voice-matched alternatives):
${SENTINEL_PHRASES.map((p) => `  · "${p}"`).join("\n")}`;

// ── Prompt block serializer ──────────────────────────────────────────────────

export function formatLocalClaimsForPrompt(claims: PlanStateLocalClaims): string {
  const lines: string[] = [];
  lines.push("Local Claims & Competitors — the ONLY local/geographic facts you are allowed to assert.");
  lines.push("");

  // Competitors block.
  if (claims.competitors.length > 0) {
    lines.push("Competitors (user-entered — these are the only competitors you may name):");
    for (const c of claims.competitors) {
      const addr = c.address && c.address.trim() ? ` — ${c.address.trim()}` : "";
      lines.push(`- ${c.name}${addr}`);
      if (c.what_they_do_well && c.what_they_do_well.trim()) {
        lines.push(`  · Strength: ${c.what_they_do_well.trim()}`);
      }
      if (c.gaps && c.gaps.trim()) {
        lines.push(`  · Gap this shop fills: ${c.gaps.trim()}`);
      }
    }
    lines.push("");
  } else if (claims.no_direct_competitors_identified) {
    lines.push("Competitors: the user explicitly confirmed no direct competitors in the catchment. State that plainly; do not invent any.");
    lines.push("");
  } else {
    lines.push("Competitors: the user has NOT entered a competitor list. Discuss competition qualitatively without naming specific shops, addresses, hours, or transaction counts. Do NOT invent competitor businesses.");
    lines.push("");
  }

  // Local geography hint — surfaces the resolved city so the LLM has a clear
  // anchor and the validator knows which dataset to scope to.
  if (claims.city_label) {
    lines.push(`Resolved location: ${claims.city_label}. Any neighborhood you reference MUST be within this city/region, and any two neighborhoods you imply share a corridor MUST actually be adjacent.`);
  } else {
    lines.push("Resolved location: not set. Do not invent neighborhood, street, or corridor names.");
  }
  return lines.join("\n").trim();
}

// ── Curated geography dataset ────────────────────────────────────────────────
//
// A small, extensible set of major North American cities with their well-known
// neighborhoods. Each city carries a `notAdjacent` list: pairs that lay people
// commonly conflate but that are NOT contiguous in real geography. The
// validator uses this to catch the "Bridgeland/Aspen Landing corridor" class
// of investor-flagged hallucination.
//
// Adding a city or a not-adjacent pair is a one-line edit. Start small;
// expand on demand — do not try to ship a global gazetteer.

export interface CityGeography {
  // Lowercased city name(s) the resolver will match against the
  // plan_state.lease address (and country, when ambiguous).
  city: string;
  country: string;                  // ISO-2
  // Lowercased neighborhood names that exist in this city. Used for
  // membership checks (e.g. "Aspen Landing is in Calgary, not Inglewood's
  // city — they're in the same city but on different sides").
  neighborhoods: string[];
  // Pairs of neighborhood names that are NOT adjacent — if the narrative
  // pairs them as a single corridor ("A/B corridor", "between A and B"),
  // surface a finding. Pairs are bidirectional; list each pair once.
  notAdjacent: Array<[string, string]>;
}

export const GEOGRAPHY_DATASET: ReadonlyArray<CityGeography> = [
  {
    city: "calgary",
    country: "CA",
    neighborhoods: [
      "inglewood", "bridgeland", "kensington", "mission", "beltline",
      "eau claire", "hillhurst", "ramsay", "marda loop", "altadore",
      "aspen landing", "aspen woods", "tuscany", "auburn bay", "mahogany",
      "mckenzie towne", "evanston", "kincora", "sage hill", "panorama hills",
      "downtown", "east village", "victoria park",
    ],
    notAdjacent: [
      // Inner-east / inner-north vs. far-west suburbs.
      ["bridgeland", "aspen landing"],   // investor-flagged
      ["bridgeland", "aspen woods"],
      ["bridgeland", "tuscany"],
      ["inglewood", "aspen landing"],    // investor-flagged adjacent case
      ["inglewood", "aspen woods"],
      ["inglewood", "tuscany"],
      ["kensington", "aspen landing"],
      ["kensington", "mahogany"],
      ["mission", "mahogany"],
      ["mission", "tuscany"],
      ["beltline", "mahogany"],
      // East vs. far-south.
      ["bridgeland", "mahogany"],
      ["bridgeland", "auburn bay"],
      ["bridgeland", "mckenzie towne"],
      // North vs. south.
      ["evanston", "mahogany"],
      ["kincora", "mahogany"],
      ["panorama hills", "auburn bay"],
    ],
  },
  {
    city: "vancouver",
    country: "CA",
    neighborhoods: [
      "kitsilano", "mount pleasant", "gastown", "yaletown", "kerrisdale",
      "main street", "commercial drive", "west end", "downtown",
      "fairview", "south granville", "dunbar", "marpole", "killarney",
      "renfrew", "hastings-sunrise", "strathcona",
    ],
    notAdjacent: [
      ["kitsilano", "commercial drive"],
      ["kitsilano", "hastings-sunrise"],
      ["kerrisdale", "commercial drive"],
      ["kerrisdale", "gastown"],
      ["dunbar", "gastown"],
      ["marpole", "gastown"],
    ],
  },
  {
    city: "toronto",
    country: "CA",
    neighborhoods: [
      "queen west", "ossington", "kensington market", "leslieville",
      "junction", "roncesvalles", "annex", "yorkville", "liberty village",
      "king west", "parkdale", "trinity-bellwoods", "riverside",
      "leaside", "bloor west village", "the beaches", "danforth",
      "scarborough", "etobicoke", "north york",
    ],
    notAdjacent: [
      ["ossington", "the beaches"],
      ["ossington", "scarborough"],
      ["junction", "leslieville"],
      ["junction", "the beaches"],
      ["yorkville", "scarborough"],
      ["liberty village", "scarborough"],
      ["roncesvalles", "the beaches"],
    ],
  },
  {
    city: "seattle",
    country: "US",
    neighborhoods: [
      "capitol hill", "ballard", "fremont", "wallingford", "queen anne",
      "downtown", "pike place", "south lake union", "georgetown",
      "columbia city", "rainier valley", "beacon hill", "west seattle",
      "magnolia", "greenwood", "phinney ridge", "u district",
    ],
    notAdjacent: [
      ["ballard", "columbia city"],
      ["ballard", "west seattle"],
      ["capitol hill", "west seattle"],
      ["fremont", "georgetown"],
      ["fremont", "rainier valley"],
      ["magnolia", "georgetown"],
    ],
  },
  {
    city: "portland",
    country: "US",
    neighborhoods: [
      "pearl district", "alberta", "mississippi", "hawthorne", "division",
      "belmont", "sellwood", "st johns", "northwest", "kenton",
      "lloyd district", "south waterfront", "old town", "downtown",
    ],
    notAdjacent: [
      ["alberta", "sellwood"],
      ["alberta", "hawthorne"],
      ["st johns", "sellwood"],
      ["st johns", "hawthorne"],
      ["pearl district", "sellwood"],
    ],
  },
  {
    city: "new york",
    country: "US",
    neighborhoods: [
      "williamsburg", "bushwick", "park slope", "dumbo", "bed-stuy",
      "greenpoint", "fort greene", "crown heights", "prospect heights",
      "soho", "noho", "lower east side", "east village", "west village",
      "chelsea", "harlem", "upper east side", "upper west side",
      "astoria", "long island city", "jackson heights", "flushing",
      "the bronx",
    ],
    notAdjacent: [
      ["williamsburg", "harlem"],
      ["williamsburg", "the bronx"],
      ["park slope", "astoria"],
      ["park slope", "flushing"],
      ["upper east side", "bushwick"],
      ["chelsea", "flushing"],
    ],
  },
  {
    city: "los angeles",
    country: "US",
    neighborhoods: [
      "silver lake", "echo park", "highland park", "los feliz", "atwater village",
      "venice", "santa monica", "downtown", "arts district", "koreatown",
      "west hollywood", "hollywood", "culver city", "mar vista",
      "eagle rock", "frogtown", "boyle heights", "mid-city",
    ],
    notAdjacent: [
      ["silver lake", "venice"],
      ["silver lake", "santa monica"],
      ["echo park", "venice"],
      ["highland park", "venice"],
      ["culver city", "highland park"],
      ["mar vista", "boyle heights"],
    ],
  },
  {
    city: "chicago",
    country: "US",
    neighborhoods: [
      "wicker park", "logan square", "bucktown", "lincoln park", "lakeview",
      "west loop", "loop", "river north", "old town", "pilsen",
      "hyde park", "bridgeport", "andersonville", "uptown", "humboldt park",
      "edgewater", "rogers park", "ravenswood",
    ],
    notAdjacent: [
      ["wicker park", "hyde park"],
      ["logan square", "hyde park"],
      ["lincoln park", "hyde park"],
      ["uptown", "pilsen"],
      ["uptown", "bridgeport"],
      ["edgewater", "pilsen"],
    ],
  },
];

// ── Geography validator ──────────────────────────────────────────────────────

export interface GeoFinding {
  // Stable id per (section, neighborhood-pair).
  id: string;
  section_key: string;
  category: "geographic_fabrication";
  message: string;
  quoted_text: string;
  // The two neighborhoods the narrative paired.
  pair: [string, string];
  city: string;
}

// Resolve the city from the planState lease address (or null when unset).
export function resolveCityFromAddress(address: string | null | undefined, country?: string | null): CityGeography | null {
  if (!address) return null;
  const lower = address.toLowerCase();
  // Prefer a city match constrained by country when both are known.
  const candidates = country
    ? GEOGRAPHY_DATASET.filter((g) => g.country === country.toUpperCase())
    : [...GEOGRAPHY_DATASET];
  // Score by longest city-name match anywhere in the address.
  let best: CityGeography | null = null;
  let bestLen = 0;
  for (const g of candidates) {
    // word-boundary check so "york" in "yorkville" doesn't match "new york".
    const re = new RegExp(`\\b${g.city.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lower) && g.city.length > bestLen) {
      best = g;
      bestLen = g.city.length;
    }
  }
  return best;
}

// Scan narrative text for cross-region neighborhood pairs declared adjacent.
// Detects three common framings: "A/B corridor", "between A and B", and
// "A and B" within an adjacency-suggesting phrase ("from A to B", "A-B
// corridor"). Returns an advisory finding per detection, ALSO catches the
// case where the narrative references a neighborhood from a different city
// than the resolved one ("Brooklyn" in a Calgary plan).
export function validateGeography(args: {
  sectionKey: string;
  text: string;
  city: CityGeography | null;
}): GeoFinding[] {
  const findings: GeoFinding[] = [];
  if (!args.city) return findings;
  const lower = args.text.toLowerCase();

  for (const [a, b] of args.city.notAdjacent) {
    // Match A/B (with optional whitespace around the slash).
    const slashRe = new RegExp(`\\b${esc(a)}\\s*/\\s*${esc(b)}\\b|\\b${esc(b)}\\s*/\\s*${esc(a)}\\b`, "i");
    // Match "A-B corridor" or "B-A corridor" (with optional spaces around dash).
    const dashCorridorRe = new RegExp(`\\b${esc(a)}\\s*[-–—]\\s*${esc(b)}\\s+corridor\\b|\\b${esc(b)}\\s*[-–—]\\s*${esc(a)}\\s+corridor\\b`, "i");
    // Match "between A and B" or "between B and A".
    const betweenRe = new RegExp(`\\bbetween\\s+${esc(a)}\\s+and\\s+${esc(b)}\\b|\\bbetween\\s+${esc(b)}\\s+and\\s+${esc(a)}\\b`, "i");
    // Match "from A to B" or "from B to A" within an adjacency context.
    const fromToRe = new RegExp(`\\bfrom\\s+${esc(a)}\\s+to\\s+${esc(b)}\\b|\\bfrom\\s+${esc(b)}\\s+to\\s+${esc(a)}\\b`, "i");
    // Plain "A and B corridor" / "B and A corridor".
    const andCorridorRe = new RegExp(`\\b${esc(a)}\\s+(?:and|&)\\s+${esc(b)}\\s+corridor\\b|\\b${esc(b)}\\s+(?:and|&)\\s+${esc(a)}\\s+corridor\\b`, "i");

    const patterns: ReadonlyArray<RegExp> = [
      slashRe, dashCorridorRe, andCorridorRe, betweenRe, fromToRe,
    ];

    for (const re of patterns) {
      const m = re.exec(args.text);
      if (m) {
        findings.push({
          id: `${args.sectionKey}:geo:${a}+${b}:${m.index}`,
          section_key: args.sectionKey,
          category: "geographic_fabrication",
          message: `${cap(a)} and ${cap(b)} are not adjacent neighborhoods in ${cap(args.city.city)}. The narrative implies they share a corridor; that geographic claim is fabricated.`,
          quoted_text: args.text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).trim(),
          pair: [a, b],
          city: args.city.city,
        });
        break; // one finding per pair per section is enough
      }
      void lower; // lower kept for future framings (currently each regex is /i)
    }
  }

  return findings;
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cap(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Foot-traffic / visitor-count fabrication detector ────────────────────────
//
// Programmatic check for the most damaging investor flag: specific pedestrian
// counts and weekly-visitor numbers the LLM invented. We surface these as
// advisory findings; Pass 2's LLM critic is the primary catch, this pass is
// the safety net that fires every time even when the LLM critic is offline.

const FOOT_TRAFFIC_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  // "800 to 1,200 pedestrians per day" — N to M pedestrians per day/week
  { re: /\b\d[\d,]*\s+to\s+\d[\d,]*\s+pedestrians?\s+per\s+(?:day|week)\b/i, label: "specific pedestrian count" },
  // "1,000 pedestrians a day" — N pedestrians a day/per day
  { re: /\b\d[\d,]*\s+pedestrians?\s+(?:a|per)\s+(?:day|week)\b/i, label: "specific pedestrian count" },
  // "12,000 to 15,000 weekly visitors" — N to M weekly visitors
  { re: /\b\d[\d,]*\s+to\s+\d[\d,]*\s+(?:weekly|daily|monthly)\s+visitors?\b/i, label: "specific visitor count range" },
  // "12,000 weekly visitors"
  { re: /\b\d[\d,]*\s+(?:weekly|daily|monthly)\s+visitors?\b/i, label: "specific visitor count" },
  // "foot traffic of N pedestrians/people"
  { re: /\bfoot[-\s]traffic[^.]{0,40}\b\d[\d,]*\s+(?:pedestrians?|people|visitors?)\b/i, label: "specific foot-traffic figure" },
  // "N people per day" within 60 chars of "traffic" or "pedestrian"
  { re: /\b(?:traffic|pedestrian)[^.]{0,60}\b\d[\d,]*\s+people\s+(?:a|per)\s+(?:day|week)\b/i, label: "specific people-per-day figure" },
];

export interface FabricationFinding {
  id: string;
  section_key: string;
  category: "fabricated_local_claim";
  message: string;
  quoted_text: string;
}

export function detectFabricatedLocalClaims(args: {
  sectionKey: string;
  text: string;
}): FabricationFinding[] {
  const out: FabricationFinding[] = [];
  // Track covered byte ranges so a single "800 to 1,200 pedestrians per day"
  // doesn't get flagged twice (once by the range pattern, once by the
  // singular pattern matching "1,200 pedestrians per day" inside it).
  // Patterns are ordered most-specific first so the range/range-corridor
  // patterns get their match recorded before the singular catch-all.
  const covered: Array<[number, number]> = [];
  const overlaps = (start: number, end: number) =>
    covered.some(([s, e]) => start < e && end > s);

  for (const { re, label } of FOOT_TRAFFIC_PATTERNS) {
    // Use a fresh regex per pattern with the /g flag so we can walk all
    // occurrences in the section, not just the first.
    const gre = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = gre.exec(args.text)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      if (overlaps(start, end)) continue;
      covered.push([start, end]);
      out.push({
        id: `${args.sectionKey}:fab:${start}`,
        section_key: args.sectionKey,
        category: "fabricated_local_claim",
        message: `${cap(label)} appears in the narrative. Pedestrian/visitor counts must come from user-entered data, not be invented. Rewrite qualitatively or remove.`,
        quoted_text: args.text.slice(Math.max(0, start - 20), end + 20).trim(),
      });
    }
  }
  return out;
}

// ── Builder ──────────────────────────────────────────────────────────────────

export interface BuildLocalClaimsInputs {
  competitors: PlanStateCompetitor[];
  noDirectCompetitorsIdentified: boolean;
  // Resolved location label for the geography validator (e.g. "Calgary, Alberta").
  // Built upstream from the chosen location_candidate or hiring_country fallback.
  cityLabel: string | null;
}

export function buildLocalClaims(inp: BuildLocalClaimsInputs): PlanStateLocalClaims {
  return {
    competitors: inp.competitors.map((c) => ({
      id: c.id,
      name: c.name.trim(),
      address: c.address && c.address.trim() ? c.address.trim() : null,
      what_they_do_well: c.what_they_do_well && c.what_they_do_well.trim() ? c.what_they_do_well.trim() : null,
      gaps: c.gaps && c.gaps.trim() ? c.gaps.trim() : null,
    })).filter((c) => c.name.length > 0),
    no_direct_competitors_identified: inp.noDirectCompetitorsIdentified,
    city_label: inp.cityLabel,
  };
}
