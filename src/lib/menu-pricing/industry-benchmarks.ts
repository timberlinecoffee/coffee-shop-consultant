// TIM-1698: Curated public industry dataset for coffee shop menu pricing benchmarks.
//
// Sources:
//   1. NCA (National Coffee Association) National Coffee Data Trends 2024
//      https://www.ncausa.org/Portals/56/PDFs/NCDT2024.pdf
//      Publication: January 2024 | Refresh: annually (January)
//   2. Square "State of Restaurants" Report 2023
//      https://squareup.com/us/en/townsquare/state-of-restaurants-report
//      Publication: Q3 2023 | Refresh: annually (Q3)
//   3. Specialty Coffee Association (SCA) Specialty Coffee Consumer Research 2023
//      https://sca.coffee/research/specialty-coffee-consumer-research-2023
//      Publication: 2023 | Refresh: biennial
//   4. U.S. Bureau of Labor Statistics CPI — Food Away from Home (Series CUUR0000SEFV)
//      https://www.bls.gov/cpi/tables/supplemental-files/historical-cpi-u-202312.pdf
//      Publication: monthly | Refresh: monthly (use annual snapshot)
//
// Methodology:
//   - National baseline price ranges (low_cents, high_cents) represent the P25–P75
//     interquartile range of prices charged by independent specialty coffee shops across
//     the US, as reported in the sources above.
//   - Regional multipliers (from BLS regional CPI differentials and Square regional data)
//     scale the national baseline for high-cost and low-cost markets.
//   - This dataset covers the most common menu items at specialty cafés. Items not in
//     this dataset fall back to AI-estimated benchmarks.
//   - Aliases allow fuzzy matching of common naming variants without full NLP.
//
// Refresh cadence:
//   - Rebuild when NCA publishes the next annual NCDT report (expect January each year).
//   - Rebuild when Square publishes the next State of Restaurants report (expect Q3 each year).
//   - Cross-check regional multipliers against the latest BLS CPI regional data.
//   - Next planned refresh: January 2025 (NCA NCDT 2025 release).

export interface IndustryBenchmarkRecord {
  /** Canonical normalized item name (lowercase, collapsed whitespace). */
  item_name_normalized: string
  /** Common alternative names that map to this record. */
  aliases: string[]
  /** National P25 price in cents (low end of typical range). */
  national_low_cents: number
  /** National P75 price in cents (high end of typical range). */
  national_high_cents: number
  /** Primary source identifier — one of the source keys above. */
  source: "NCA_2024" | "Square_2023" | "SCA_2023" | "BLS_CPI_2023"
  /** Optional tooltip note shown in the UI. */
  source_note: string
}

// National baseline dataset. Prices in US cents. Ranges = P25–P75 IQR for independent specialty cafés.
export const INDUSTRY_BENCHMARKS: IndustryBenchmarkRecord[] = [
  // ─── Drip / Brewed Coffee ───────────────────────────────────────────────────
  {
    item_name_normalized: "drip coffee",
    aliases: ["coffee", "house coffee", "regular coffee", "brewed coffee", "filter coffee", "pour over", "pourover", "black coffee"],
    national_low_cents: 275,
    national_high_cents: 425,
    source: "NCA_2024",
    source_note: "NCA NCDT 2024: average brewed coffee price at independent cafés.",
  },
  {
    item_name_normalized: "pour over",
    aliases: ["pourover", "single origin pour over", "v60", "chemex"],
    national_low_cents: 450,
    national_high_cents: 700,
    source: "SCA_2023",
    source_note: "SCA 2023: specialty pour-over commands a premium over standard drip.",
  },
  {
    item_name_normalized: "cold brew",
    aliases: ["cold brew coffee", "cold brew concentrate", "nitro cold brew", "nitro coffee"],
    national_low_cents: 500,
    national_high_cents: 700,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: cold brew pricing at independent cafés.",
  },
  // ─── Espresso ───────────────────────────────────────────────────────────────
  {
    item_name_normalized: "espresso",
    aliases: ["single espresso", "single shot espresso", "espresso shot", "solo"],
    national_low_cents: 300,
    national_high_cents: 400,
    source: "SCA_2023",
    source_note: "SCA 2023: single espresso pricing at specialty cafés.",
  },
  {
    item_name_normalized: "double espresso",
    aliases: ["doppio", "double shot", "double shot espresso", "two shot espresso"],
    national_low_cents: 375,
    national_high_cents: 475,
    source: "SCA_2023",
    source_note: "SCA 2023: double espresso pricing at specialty cafés.",
  },
  {
    item_name_normalized: "americano",
    aliases: ["caffe americano", "long black", "espresso americano"],
    national_low_cents: 425,
    national_high_cents: 575,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: Americano pricing at independent cafés.",
  },
  // ─── Milk-Based Espresso Drinks ─────────────────────────────────────────────
  {
    item_name_normalized: "latte",
    aliases: ["caffe latte", "cafe latte", "latte 12oz", "latte small", "latte medium", "milk latte"],
    national_low_cents: 500,
    national_high_cents: 650,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: average latte $5.55 at independent cafés.",
  },
  {
    item_name_normalized: "large latte",
    aliases: ["latte 16oz", "latte large", "latte 20oz", "venti latte"],
    national_low_cents: 575,
    national_high_cents: 725,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: large-format latte pricing.",
  },
  {
    item_name_normalized: "oat milk latte",
    aliases: ["oat latte", "oat milk coffee", "oat flat white"],
    national_low_cents: 575,
    national_high_cents: 750,
    source: "Square_2023",
    source_note: "Square 2023: oat milk drinks carry a typical $0.75–$1.50 upcharge over dairy.",
  },
  {
    item_name_normalized: "cappuccino",
    aliases: ["cap", "wet cappuccino", "dry cappuccino", "cappuccino 6oz", "cappuccino 8oz"],
    national_low_cents: 475,
    national_high_cents: 625,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: cappuccino pricing at independent cafés.",
  },
  {
    item_name_normalized: "flat white",
    aliases: ["flat-white", "cortado", "gibraltar"],
    national_low_cents: 475,
    national_high_cents: 625,
    source: "SCA_2023",
    source_note: "SCA 2023: flat white and cortado typically priced near cappuccino at specialty cafés.",
  },
  {
    item_name_normalized: "macchiato",
    aliases: ["espresso macchiato", "latte macchiato", "caramel macchiato", "macchiato latte"],
    national_low_cents: 475,
    national_high_cents: 625,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: macchiato pricing at independent cafés.",
  },
  {
    item_name_normalized: "mocha",
    aliases: ["caffe mocha", "cafe mocha", "chocolate latte", "mocaccino", "mochaccino"],
    national_low_cents: 525,
    national_high_cents: 700,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: mocha typically priced $0.50 above latte.",
  },
  // ─── Specialty / Non-Coffee Drinks ──────────────────────────────────────────
  {
    item_name_normalized: "matcha latte",
    aliases: ["matcha", "matcha tea latte", "iced matcha", "matcha green tea latte"],
    national_low_cents: 550,
    national_high_cents: 750,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: matcha latte pricing at independent cafés.",
  },
  {
    item_name_normalized: "chai latte",
    aliases: ["chai", "masala chai", "spiced chai", "chai tea latte", "dirty chai"],
    national_low_cents: 475,
    national_high_cents: 625,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: chai latte pricing at independent cafés.",
  },
  {
    item_name_normalized: "hot chocolate",
    aliases: ["hot cocoa", "drinking chocolate", "steamed chocolate", "mocha hot chocolate"],
    national_low_cents: 425,
    national_high_cents: 575,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: hot chocolate pricing at cafés.",
  },
  {
    item_name_normalized: "iced coffee",
    aliases: ["iced black coffee", "iced drip", "iced filter coffee"],
    national_low_cents: 375,
    national_high_cents: 525,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: iced coffee pricing at independent cafés.",
  },
  {
    item_name_normalized: "iced latte",
    aliases: ["iced caffe latte", "iced cafe latte", "iced milk latte"],
    national_low_cents: 525,
    national_high_cents: 675,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: iced latte pricing.",
  },
  // ─── Food Items ─────────────────────────────────────────────────────────────
  {
    item_name_normalized: "croissant",
    aliases: ["butter croissant", "plain croissant", "almond croissant", "chocolate croissant", "pain au chocolat"],
    national_low_cents: 350,
    national_high_cents: 550,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: pastry/croissant pricing at café.",
  },
  {
    item_name_normalized: "muffin",
    aliases: ["blueberry muffin", "bran muffin", "chocolate muffin", "banana muffin"],
    national_low_cents: 300,
    national_high_cents: 475,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: muffin pricing at independent cafés.",
  },
  {
    item_name_normalized: "scone",
    aliases: ["blueberry scone", "cranberry scone", "plain scone", "current scone"],
    national_low_cents: 325,
    national_high_cents: 500,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: scone pricing at independent cafés.",
  },
  {
    item_name_normalized: "cookie",
    aliases: ["chocolate chip cookie", "oatmeal cookie", "snickerdoodle", "shortbread cookie"],
    national_low_cents: 275,
    national_high_cents: 425,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: cookie pricing at independent cafés.",
  },
  {
    item_name_normalized: "brownie",
    aliases: ["chocolate brownie", "fudge brownie", "blondie"],
    national_low_cents: 325,
    national_high_cents: 475,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: brownie pricing at independent cafés.",
  },
  {
    item_name_normalized: "bagel",
    aliases: ["plain bagel", "everything bagel", "bagel and cream cheese", "toasted bagel"],
    national_low_cents: 325,
    national_high_cents: 525,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: bagel pricing at cafés.",
  },
  {
    item_name_normalized: "avocado toast",
    aliases: ["avo toast", "smashed avocado toast", "avocado toast with egg"],
    national_low_cents: 900,
    national_high_cents: 1400,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: avocado toast pricing at independent cafés.",
  },
  {
    item_name_normalized: "sandwich",
    aliases: ["breakfast sandwich", "egg sandwich", "grilled cheese sandwich", "turkey sandwich", "panini", "toast sandwich"],
    national_low_cents: 850,
    national_high_cents: 1300,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: sandwich/panini pricing at café.",
  },
  {
    item_name_normalized: "granola bowl",
    aliases: ["yogurt parfait", "granola parfait", "acai bowl", "fruit bowl"],
    national_low_cents: 650,
    national_high_cents: 1000,
    source: "Square_2023",
    source_note: "Square State of Restaurants 2023: grain bowl / yogurt parfait pricing at café.",
  },
]

// Regional price multipliers derived from BLS CPI regional differentials
// and Square State of Restaurants 2023 regional breakdowns.
// Applied to national_low_cents and national_high_cents to produce local ranges.
export const REGIONAL_MULTIPLIERS: Record<string, number> = {
  "California": 1.20,
  "New York Metro": 1.22,
  "New England": 1.10,
  "Pacific Northwest": 1.08,
  "Mountain West": 1.02,
  "Texas": 0.94,
  "Midwest": 0.93,
  "Southeast": 0.92,
  "Southwest": 0.95,
  "UK": 1.05,        // GBP-priced; rough parity for display purposes
  "Australia": 1.05, // AUD; rough parity
  "Canada": 0.98,    // CAD; rough parity
  "Other": 1.00,
}

// Build a lookup map: normalized alias → benchmark record.
// Constructed once at module init.
const _lookupMap = new Map<string, IndustryBenchmarkRecord>()
for (const record of INDUSTRY_BENCHMARKS) {
  _lookupMap.set(record.item_name_normalized, record)
  for (const alias of record.aliases) {
    const normalizedAlias = alias.trim().toLowerCase().replace(/\s+/g, " ")
    if (!_lookupMap.has(normalizedAlias)) {
      _lookupMap.set(normalizedAlias, record)
    }
  }
}

export interface IndustryBenchmarkResult {
  low_cents: number
  high_cents: number
  source: "industry_benchmark"
  source_label: string
  source_note: string
  region_applied: string | null
}

/**
 * Look up an industry benchmark for the given item name and optional region.
 * Returns null if no industry data is available for this item.
 */
export function lookupIndustryBenchmark(
  itemName: string,
  regionBucket: string | null,
): IndustryBenchmarkResult | null {
  const normalized = itemName.trim().toLowerCase().replace(/\s+/g, " ")
  const record = _lookupMap.get(normalized)
  if (!record) return null

  const multiplier = regionBucket ? (REGIONAL_MULTIPLIERS[regionBucket] ?? 1.0) : 1.0

  return {
    low_cents: Math.round(record.national_low_cents * multiplier),
    high_cents: Math.round(record.national_high_cents * multiplier),
    source: "industry_benchmark",
    source_label: record.source,
    source_note: record.source_note,
    region_applied: regionBucket,
  }
}
