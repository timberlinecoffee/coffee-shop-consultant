// TIM-1002 / TIM-905: Title Case helper.
//
// Use at the API boundary for any AI- or seed-authored content that lands in a
// label-shaped slot (equipment names, role names, JD titles, drink/ingredient
// names, persona names, scorecard criteria, milestone names, suggestion bullet
// headers). Sentence-form copy stays in sentence case and should NOT be passed
// through this helper.
//
// Definition (AP style): capitalize every word EXCEPT articles, coordinating
// conjunctions, and short prepositions (≤ 3 letters) — unless the word is the
// first or last in the label.

const LOWERCASE_WORDS = new Set([
  // articles
  "a", "an", "the",
  // coordinating conjunctions
  "and", "but", "or", "nor", "yet", "so",
  // short prepositions (≤ 3 letters)
  "as", "at", "by", "for", "in", "of", "on", "to", "up", "via",
  // common short connectors
  "vs", "v",
]);

// Words that should retain a known casing regardless of position (acronyms,
// brand names). Lowercase key → preserved form.
//
// TIM-1175: coffee/equipment acronym set. Add one line per new acronym.
const PRESERVED_CASING: Record<string, string> = {
  // General / regulatory
  pos: "POS",
  hvac: "HVAC",
  led: "LED",
  ada: "ADA",
  abv: "ABV",
  llc: "LLC",
  faq: "FAQ",
  faqs: "FAQs",
  api: "API",
  ui: "UI",
  ux: "UX",
  nsf: "NSF",
  osha: "OSHA",
  sku: "SKU",
  upc: "UPC",
  btu: "BTU",
  // Coffee / espresso technique acronyms
  wdt: "WDT",       // Weiss Distribution Technique
  rdt: "RDT",       // Ross Droplet Technique
  pid: "PID",       // PID controller
  vst: "VST",       // VST precision filter baskets
  ims: "IMS",       // IMS precision filter baskets
  // Equipment model / brand names
  ek43: "EK43",         // Mahlkönig EK43 grinder
  puqpress: "PUQpress", // Espresso puck press brand
  // Units (lowercase preserved)
  oz: "oz",
  ml: "ml",
  kg: "kg",
  lb: "lb",
  lbs: "lbs",
};

function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function applyPreservedCasing(word: string): string | null {
  const lower = word.toLowerCase();
  if (lower in PRESERVED_CASING) return PRESERVED_CASING[lower];
  return null;
}

// Title-case a single "token" that contains no whitespace, but may contain
// hyphens, slashes, ampersands, or parentheses. Each segment is title-cased.
function titleCaseToken(token: string, isFirst: boolean, isLast: boolean): string {
  // Strip leading/trailing punctuation we treat as decoration (e.g. parentheses),
  // process the inside, then re-attach.
  const leading = token.match(/^[(\["'`]+/)?.[0] ?? "";
  const trailing = token.match(/[)\]"'`.,!?:;]+$/)?.[0] ?? "";
  const core = token.slice(leading.length, token.length - trailing.length);

  if (!core) return token;

  // Hyphenated / slashed / ampersand-joined compounds: title-case each part.
  if (/[-/&]/.test(core)) {
    const processed = core
      .split(/([-/&])/)
      .map((part) => {
        if (part === "-" || part === "/" || part === "&") return part;
        const preserved = applyPreservedCasing(part);
        if (preserved) return preserved;
        // In compounds, each sub-word is capitalized (no lowercase-particle exception
        // inside compounds — "Cold-Brew", "Bean-To-Cup").
        return capitalizeWord(part);
      })
      .join("");
    return leading + processed + trailing;
  }

  const preserved = applyPreservedCasing(core);
  if (preserved) return leading + preserved + trailing;

  const lower = core.toLowerCase();

  // Numeric/units stay as-is (e.g. "32oz" or "32").
  if (/^\d/.test(core)) return leading + core + trailing;

  if (!isFirst && !isLast && LOWERCASE_WORDS.has(lower)) {
    return leading + lower + trailing;
  }

  return leading + capitalizeWord(core) + trailing;
}

/**
 * Convert a label-shaped string to Title Case.
 *
 * - Lowercases articles, short prepositions, and conjunctions unless first/last.
 * - Capitalizes hyphenated compounds on both sides ("Cold-Brew", "White-Glove").
 * - Preserves known acronyms ("POS", "HVAC", "ADA") and unit suffixes ("32oz").
 * - Brand-name casing must be added to PRESERVED_CASING explicitly. Mixed-case
 *   input is normalized; we do not heuristically detect "iPad-style" branding.
 * - Leaves an empty / whitespace-only string untouched.
 *
 * Do NOT call on full sentences or paragraph copy.
 */
export function toTitleCase(input: string): string {
  if (!input) return input;
  const trimmed = input.trim();
  if (!trimmed) return input;

  const tokens = trimmed.split(/\s+/);
  const lastIdx = tokens.length - 1;
  const result = tokens
    .map((token, i) => titleCaseToken(token, i === 0, i === lastIdx))
    .join(" ");

  // Preserve original leading/trailing whitespace pattern.
  const leadingWs = input.match(/^\s*/)?.[0] ?? "";
  const trailingWs = input.match(/\s*$/)?.[0] ?? "";
  return leadingWs + result + trailingWs;
}

/**
 * Apply toTitleCase to specific string fields of an object. Returns a new
 * object — does not mutate the input. Fields whose value is `null` or
 * `undefined` are left untouched.
 *
 * Useful at API boundaries when you have AI-shaped JSON and only some fields
 * are label-shaped (names) while others are sentence copy (descriptions).
 */
export function titleCaseFields<T extends Record<string, unknown>>(
  obj: T,
  fields: ReadonlyArray<keyof T>
): T {
  const out: Record<string, unknown> = { ...obj };
  for (const f of fields) {
    const val = out[f as string];
    if (typeof val === "string") {
      out[f as string] = toTitleCase(val);
    }
  }
  return out as T;
}
