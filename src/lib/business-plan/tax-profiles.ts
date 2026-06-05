// TIM-2339: Region-aware tax + lender profiles for business plan generation.
//
// Background: investor critique on TIM-2315 (Beaver & Beef, Calgary) called out
// the regenerated plan applying a generic 25% income tax rate. CCPCs in Alberta
// pay roughly 11% combined federal + provincial on the first $500K of active
// business income — the right number for any new Canadian small business in AB.
// Worse, the plan referenced SBA financing, which doesn't exist in Canada.
//
// This module:
//   1. Resolves a Region from country + address text (city, province/state).
//   2. Looks up a TaxProfile (entity type, tiered rates, sales tax structure).
//   3. Looks up a LenderProfile (allowed/forbidden lender references — never SBA
//      in non-US plans).
//   4. Renders both as a narrative ground-truth block the LLM is forced to
//      quote verbatim so Canadian plans no longer say "SBA" and the income tax
//      rate matches the region.
//
// plan-state.ts uses (1) + (2) to OVERRIDE mp.income_tax_pct when the user
// is still on the engine default (25%), so the financial tables and narrative
// agree on a single, region-correct tax rate. (3) flows into the prompt only —
// the financial engine doesn't care which lender is cited; the narrative does.
//
// Conventions match plan-state.ts: relative imports (no @/ aliases) so
// node:test can load this module without the Next.js resolver.

// ── Public types ─────────────────────────────────────────────────────────────

export type CountryCode =
  | "CA"
  | "US"
  | "GB"
  | "AU"
  | "DE"
  | "FR"
  | "NL"
  | "ES"
  | "IT"
  | "PL";

export interface Region {
  country: CountryCode;
  country_name: string;
  // ISO 3166-2 subdivision (e.g. "AB" for Alberta, "WA" for Washington). Null
  // when we can't infer it from the address — the tax profile then falls back
  // to a country-level rate.
  state_or_province: string | null;
  state_or_province_name: string | null;
  city: string | null;
}

export type EntityType =
  | "CA-CCPC"
  | "CA-Corp"
  | "CA-Partnership"
  | "CA-SoleProp"
  | "US-CCorp"
  | "US-SCorp"
  | "US-LLC"
  | "US-SoleProp"
  | "UK-Ltd"
  | "UK-SoleTrader"
  | "EU-GmbH"
  | "EU-SARL"
  | "EU-BV"
  | "EU-SL"
  | "EU-Srl"
  | "EU-Spzoo";

export interface TaxProfile {
  entity_type: EntityType;
  entity_label: string;
  // Effective combined federal + state/provincial income tax rate that applies
  // to a typical year-1 small business. For tiered regimes (CCPC small-business
  // deduction, UK marginal relief), this is the low-band rate — that's the
  // rate most new businesses pay until they cross the threshold.
  small_business_rate_pct: number;
  // Rate that kicks in above the small-business threshold. Equal to
  // small_business_rate_pct when the region has no tier.
  general_rate_pct: number;
  // Active-business-income threshold (in CENTS) below which the small-business
  // rate applies. Null when the region has no tier (US, EU corp).
  small_business_threshold_cents: number | null;
  // Sales tax / VAT info (informational; pass-through, not on the P&L).
  sales_tax_name: string;
  sales_tax_pct: number;
  // Pass-through entities (US S-corp/LLC/sole-prop, UK sole trader) — owner
  // pays at personal rate, so the corporate rate above is informational only.
  pass_through: boolean;
  // Compact human label for the prompt block, e.g. "Alberta CCPC".
  region_label: string;
  // Optional narrative notes (e.g. "Add CRA registration", "GST registration
  // required above $30K revenue"). Surfaced verbatim in the prompt.
  notes: string[];
}

export interface LenderProfile {
  // The marquee small-business program in this region — what most narratives
  // should cite if they mention a primary debt source.
  primary_program: string | null;
  // Allowed lender references for narrative templates.
  allowed: string[];
  // Lender references the narrative must NOT use. Investor critique: a
  // Canadian plan that cites SBA is immediately disqualified.
  forbidden: string[];
}

// ── Region resolution ────────────────────────────────────────────────────────

// Canadian province codes (ISO 3166-2).
const CA_PROVINCE_CODES = new Set([
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
]);

const CA_PROVINCE_NAMES: Record<string, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

// Common Canadian cities → province. Heuristic — not exhaustive. The address
// regex catches most cases; this table covers the "city only" case.
const CA_CITY_TO_PROVINCE: Record<string, string> = {
  calgary: "AB",
  edmonton: "AB",
  "red deer": "AB",
  lethbridge: "AB",
  vancouver: "BC",
  victoria: "BC",
  burnaby: "BC",
  surrey: "BC",
  toronto: "ON",
  ottawa: "ON",
  mississauga: "ON",
  hamilton: "ON",
  london: "ON", // ambiguous w/ UK; UK plans should set country=GB
  montreal: "QC",
  "quebec city": "QC",
  laval: "QC",
  winnipeg: "MB",
  saskatoon: "SK",
  regina: "SK",
  halifax: "NS",
  fredericton: "NB",
  "st. john's": "NL",
  charlottetown: "PE",
  whitehorse: "YT",
  yellowknife: "NT",
  iqaluit: "NU",
};

const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

const US_CITY_TO_STATE: Record<string, string> = {
  seattle: "WA",
  spokane: "WA",
  portland: "OR",
  "san francisco": "CA",
  "los angeles": "CA",
  "san diego": "CA",
  oakland: "CA",
  sacramento: "CA",
  "new york": "NY",
  brooklyn: "NY",
  chicago: "IL",
  boston: "MA",
  austin: "TX",
  dallas: "TX",
  houston: "TX",
  denver: "CO",
  miami: "FL",
  atlanta: "GA",
  philadelphia: "PA",
  phoenix: "AZ",
  minneapolis: "MN",
  detroit: "MI",
  "washington": "DC",
};

// Normalize ISO country / hiring country to a CountryCode we know about.
function normalizeCountry(raw: string | null | undefined): CountryCode | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  // ISO-2 fast paths.
  if (s === "CA" || s === "US" || s === "GB" || s === "UK" || s === "AU" ||
      s === "DE" || s === "FR" || s === "NL" || s === "ES" || s === "IT" || s === "PL") {
    return (s === "UK" ? "GB" : s) as CountryCode;
  }
  // Common full-name variants.
  if (s === "CANADA") return "CA";
  if (s === "UNITED STATES" || s === "USA" || s === "U.S." || s === "U.S.A.") return "US";
  if (s === "UNITED KINGDOM" || s === "BRITAIN" || s === "GREAT BRITAIN" || s === "ENGLAND" || s === "SCOTLAND" || s === "WALES") return "GB";
  if (s === "AUSTRALIA") return "AU";
  if (s === "GERMANY" || s === "DEUTSCHLAND") return "DE";
  if (s === "FRANCE") return "FR";
  if (s === "NETHERLANDS" || s === "HOLLAND") return "NL";
  if (s === "SPAIN" || s === "ESPAÑA") return "ES";
  if (s === "ITALY" || s === "ITALIA") return "IT";
  if (s === "POLAND" || s === "POLSKA") return "PL";
  return null;
}

function countryName(code: CountryCode): string {
  return {
    CA: "Canada",
    US: "United States",
    GB: "United Kingdom",
    AU: "Australia",
    DE: "Germany",
    FR: "France",
    NL: "Netherlands",
    ES: "Spain",
    IT: "Italy",
    PL: "Poland",
  }[code];
}

// Extract a 2-letter subdivision code from a free-text address. Looks for
// patterns like ", AB ", ", WA 98101", ", Alberta,", etc. Returns null when
// nothing matches — caller falls back to the city table or country-only profile.
function extractSubdivision(
  address: string | null,
  country: CountryCode,
): string | null {
  if (!address) return null;
  const codes = country === "CA" ? CA_PROVINCE_CODES : country === "US" ? US_STATE_CODES : null;
  if (!codes) return null;
  // Match ", XX" or ", XX " or ", XX,". Use word boundary on right.
  const codeMatch = address.match(/[,\s]([A-Z]{2})(?=[\s,]|$)/g);
  if (codeMatch) {
    for (const raw of codeMatch) {
      const code = raw.replace(/[,\s]/g, "");
      if (codes.has(code)) return code;
    }
  }
  // Full-name fallback for Canada/US (e.g. "Alberta", "Washington").
  const names = country === "CA" ? CA_PROVINCE_NAMES : US_STATE_NAMES;
  const lower = address.toLowerCase();
  for (const [code, name] of Object.entries(names)) {
    // Word-boundary match on the lower-cased name. e.g. "Alberta" matches
    // "488 Hyde St, Calgary, Alberta T2P 1B5".
    const re = new RegExp(`\\b${name.toLowerCase().replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`);
    if (re.test(lower)) return code;
  }
  return null;
}

function subdivisionFromCity(city: string | null, country: CountryCode): string | null {
  if (!city) return null;
  const key = city.trim().toLowerCase();
  if (country === "CA") return CA_CITY_TO_PROVINCE[key] ?? null;
  if (country === "US") return US_CITY_TO_STATE[key] ?? null;
  return null;
}

export function resolveRegion(input: {
  country: string | null;
  city: string | null;
  address: string | null;
}): Region | null {
  const code = normalizeCountry(input.country);
  if (!code) return null;

  let sub: string | null = null;
  let subName: string | null = null;
  if (code === "CA" || code === "US") {
    sub = extractSubdivision(input.address, code)
      ?? subdivisionFromCity(input.city, code);
    if (sub) {
      subName = code === "CA" ? CA_PROVINCE_NAMES[sub] ?? null : US_STATE_NAMES[sub] ?? null;
    }
  }

  return {
    country: code,
    country_name: countryName(code),
    state_or_province: sub,
    state_or_province_name: subName,
    city: input.city ? input.city.trim() : null,
  };
}

// ── Tax profiles ─────────────────────────────────────────────────────────────

// Canada CCPC small-business rates (federal 9% + provincial small-business rate)
// for the first $500K of active business income, combined effective rate. Rates
// reflect 2026 published rates. General rates are federal 15% + provincial.
const CA_CCPC_BY_PROVINCE: Record<string, { sbr: number; gen: number; salesName: string; salesPct: number }> = {
  AB: { sbr: 11, gen: 23, salesName: "GST", salesPct: 5 },
  BC: { sbr: 11, gen: 27, salesName: "GST+PST", salesPct: 12 },
  MB: { sbr: 9,  gen: 27, salesName: "GST+RST", salesPct: 12 },
  NB: { sbr: 11.5, gen: 29, salesName: "HST", salesPct: 15 },
  NL: { sbr: 12, gen: 30, salesName: "HST", salesPct: 15 },
  NS: { sbr: 11.5, gen: 29, salesName: "HST", salesPct: 15 },
  NT: { sbr: 11, gen: 26.5, salesName: "GST", salesPct: 5 },
  NU: { sbr: 12, gen: 27, salesName: "GST", salesPct: 5 },
  ON: { sbr: 12.2, gen: 26.5, salesName: "HST", salesPct: 13 },
  PE: { sbr: 10, gen: 31, salesName: "HST", salesPct: 15 },
  QC: { sbr: 12.2, gen: 26.5, salesName: "GST+QST", salesPct: 14.975 },
  SK: { sbr: 10, gen: 27, salesName: "GST+PST", salesPct: 11 },
  YT: { sbr: 9, gen: 27, salesName: "GST", salesPct: 5 },
};

// US state corporate-income-tax add-ons (top rate). Federal C-corp rate is 21%
// flat. State rates are illustrative — accurate enough for narrative ground
// truth on the small subset of states most early shops target.
const US_STATE_CORP_RATE: Record<string, { rate: number; salesPct: number; salesName: string }> = {
  WA:  { rate: 0,   salesPct: 10.25, salesName: "Sales tax" }, // no corporate income tax; B&O instead — narrative note
  OR:  { rate: 7.6, salesPct: 0,     salesName: "Sales tax" }, // no sales tax
  CA:  { rate: 8.84, salesPct: 8.625, salesName: "Sales tax" },
  NY:  { rate: 7.25, salesPct: 8.875, salesName: "Sales tax" },
  TX:  { rate: 0,   salesPct: 8.25,  salesName: "Sales tax" }, // no corporate income tax; franchise tax separate
  FL:  { rate: 5.5, salesPct: 7,     salesName: "Sales tax" },
  IL:  { rate: 9.5, salesPct: 8.75,  salesName: "Sales tax" },
  MA:  { rate: 8,   salesPct: 6.25,  salesName: "Sales tax" },
  CO:  { rate: 4.4, salesPct: 7.65,  salesName: "Sales tax" },
  GA:  { rate: 5.75, salesPct: 7.4,  salesName: "Sales tax" },
  PA:  { rate: 8.99, salesPct: 6,    salesName: "Sales tax" },
  AZ:  { rate: 4.9, salesPct: 8.6,   salesName: "Sales tax" },
  MN:  { rate: 9.8, salesPct: 7.875, salesName: "Sales tax" },
  MI:  { rate: 6,   salesPct: 6,     salesName: "Sales tax" },
  NJ:  { rate: 9,   salesPct: 6.625, salesName: "Sales tax" },
  NC:  { rate: 2.5, salesPct: 6.98,  salesName: "Sales tax" },
  DC:  { rate: 8.25, salesPct: 6,    salesName: "Sales tax" },
};

// EU per-country baseline corporate rates.
const EU_CORP_BY_COUNTRY: Record<string, { rate: number; salesName: string; salesPct: number; entity: EntityType; entityLabel: string }> = {
  DE: { rate: 30,  salesName: "VAT (MwSt.)", salesPct: 19,  entity: "EU-GmbH",  entityLabel: "GmbH" },
  FR: { rate: 25,  salesName: "VAT (TVA)",   salesPct: 20,  entity: "EU-SARL",  entityLabel: "SARL" },
  NL: { rate: 25.8, salesName: "VAT (BTW)",  salesPct: 21,  entity: "EU-BV",    entityLabel: "BV" },
  ES: { rate: 25,  salesName: "VAT (IVA)",   salesPct: 21,  entity: "EU-SL",    entityLabel: "Sociedad Limitada" },
  IT: { rate: 27.9, salesName: "VAT (IVA)",  salesPct: 22,  entity: "EU-Srl",   entityLabel: "Srl" },
  PL: { rate: 19,  salesName: "VAT (PTU)",   salesPct: 23,  entity: "EU-Spzoo", entityLabel: "Sp. z o.o." },
};

// Returns the closest tax profile for a region. Always returns a profile —
// even when no state/province is set, falls back to a country-level baseline
// so the prompt has something to quote.
export function getTaxProfile(region: Region): TaxProfile {
  if (region.country === "CA") {
    const prov = region.state_or_province;
    const data = prov ? CA_CCPC_BY_PROVINCE[prov] : null;
    // Default to AB rates if province is unknown — we can't know better.
    // Investor saw the "blanket 25%" problem; an Alberta-style baseline is
    // closer to right than 25% for any Canadian small business.
    const ratesData = data ?? { sbr: 11, gen: 27, salesName: "GST", salesPct: 5 };
    return {
      entity_type: "CA-CCPC",
      entity_label: "Canadian-Controlled Private Corporation (CCPC)",
      small_business_rate_pct: ratesData.sbr,
      general_rate_pct: ratesData.gen,
      small_business_threshold_cents: 50_000_000, // $500,000 active business income → 50_000_000 cents
      sales_tax_name: ratesData.salesName,
      sales_tax_pct: ratesData.salesPct,
      pass_through: false,
      region_label: prov
        ? `${region.state_or_province_name ?? prov} CCPC`
        : "Canadian CCPC",
      notes: [
        "Canadian-Controlled Private Corporation eligible for the federal Small Business Deduction (SBD) on the first $500,000 of active business income.",
        prov
          ? `Combined federal + ${region.state_or_province_name ?? prov} small-business rate: ${ratesData.sbr}%. General corporate rate above the SBD limit: ${ratesData.gen}%.`
          : `Use the small-business rate of ${ratesData.sbr}% for Y1; above the SBD limit, the general rate is ${ratesData.gen}%.`,
        `Sales tax: ${ratesData.salesName} at ${ratesData.salesPct}% (collected from customers; not on the P&L).`,
      ],
    };
  }

  if (region.country === "US") {
    const st = region.state_or_province;
    const stData = st ? US_STATE_CORP_RATE[st] : null;
    const federal = 21;
    const stateRate = stData?.rate ?? 5; // ~median state corporate rate fallback
    const combined = Math.round((federal + stateRate) * 10) / 10;
    return {
      entity_type: "US-CCorp",
      entity_label: "US C-corporation",
      small_business_rate_pct: combined,
      general_rate_pct: combined,
      small_business_threshold_cents: null,
      sales_tax_name: stData?.salesName ?? "Sales tax",
      sales_tax_pct: stData?.salesPct ?? 0,
      pass_through: false,
      region_label: st
        ? `${region.state_or_province_name ?? st} US C-corp`
        : "US C-corp",
      notes: [
        `Federal corporate tax: ${federal}% flat. State corporate tax (${region.state_or_province_name ?? st ?? "state-level"}): ${stateRate}%. Combined effective: ${combined}%.`,
        st === "WA"
          ? "Washington has no state corporate income tax but levies B&O tax on gross receipts; consult a CPA for the exact rate by NAICS classification."
          : st === "TX"
          ? "Texas has no state corporate income tax but levies a franchise (margin) tax; consult a CPA."
          : st === "OR"
          ? "Oregon has no state sales tax."
          : `Sales tax: ${stData?.salesName ?? "state + local sales tax"} at ${stData?.salesPct ?? 0}% (collected from customers; not on the P&L).`,
        "Alternative structures (S-corp, LLC taxed as partnership) pass income through to owners and are taxed at personal rates — note in the narrative when relevant.",
      ],
    };
  }

  if (region.country === "GB") {
    return {
      entity_type: "UK-Ltd",
      entity_label: "UK Private Limited Company (Ltd)",
      small_business_rate_pct: 19,
      general_rate_pct: 25,
      small_business_threshold_cents: 5_000_000, // £50,000 small-profits ceiling → 5_000_000 pence
      sales_tax_name: "VAT",
      sales_tax_pct: 20,
      pass_through: false,
      region_label: "UK Ltd",
      notes: [
        "UK corporation tax: 19% small-profits rate on profits up to £50,000; 25% main rate on profits above £250,000; marginal relief between.",
        "VAT registration is mandatory at £90,000 turnover. Standard VAT rate 20% (most food/drink sold for consumption on premises is standard-rated; cold takeaway food is zero-rated).",
        "Reference: HMRC corporation-tax-rates page.",
      ],
    };
  }

  if (region.country === "AU") {
    return {
      entity_type: "CA-Corp", // reuse generic
      entity_label: "Australian Pty Ltd (base-rate entity)",
      small_business_rate_pct: 25,
      general_rate_pct: 30,
      small_business_threshold_cents: 5_000_000_000, // A$50M aggregated turnover ceiling → 5_000_000_000 cents
      sales_tax_name: "GST",
      sales_tax_pct: 10,
      pass_through: false,
      region_label: "Australia Pty Ltd",
      notes: [
        "Australian companies with aggregated turnover below A$50M pay the base-rate company tax of 25%; the general company rate is 30%.",
        "GST registration is required at A$75,000 turnover; standard rate 10%.",
      ],
    };
  }

  if (region.country === "DE" || region.country === "FR" || region.country === "NL" ||
      region.country === "ES" || region.country === "IT" || region.country === "PL") {
    const data = EU_CORP_BY_COUNTRY[region.country];
    return {
      entity_type: data.entity,
      entity_label: data.entityLabel,
      small_business_rate_pct: data.rate,
      general_rate_pct: data.rate,
      small_business_threshold_cents: null,
      sales_tax_name: data.salesName,
      sales_tax_pct: data.salesPct,
      pass_through: false,
      region_label: `${region.country_name} ${data.entityLabel}`,
      notes: [
        `${region.country_name} corporate income tax: ~${data.rate}% (combined national + local where applicable).`,
        `${data.salesName} standard rate ${data.salesPct}% on hospitality sales (verify reduced rates with a local accountant).`,
      ],
    };
  }

  // Unreachable — exhaustiveness check.
  const _exhaustive: never = region.country;
  void _exhaustive;
  throw new Error(`Unsupported country: ${String(region.country)}`);
}

// ── Lender profiles ──────────────────────────────────────────────────────────

export function getLenderProfile(region: Region): LenderProfile {
  switch (region.country) {
    case "CA":
      return {
        primary_program: "BDC Small Business Loan",
        allowed: [
          "BDC (Business Development Bank of Canada)",
          "RBC Royal Bank — Commercial Banking",
          "BMO Bank of Montreal — Business Banking",
          "TD Canada Trust — Small Business",
          "Scotiabank — Small Business",
          "CIBC — Small Business",
          "Canada Small Business Financing Program (CSBFP) through chartered banks",
          "ATB Financial (Alberta)",
          "Desjardins (Quebec)",
        ],
        forbidden: [
          "SBA (Small Business Administration — US only)",
          "SBA 7(a)",
          "SBA 504",
          "SBA microloan",
        ],
      };
    case "US":
      return {
        primary_program: "SBA 7(a) loan",
        allowed: [
          "SBA 7(a) loan",
          "SBA 504 loan",
          "SBA Microloan program",
          "Local community bank — commercial lending",
          "Credit-union small-business loan",
          "Kiva U.S. (microlender)",
          "CDFI loan funds",
        ],
        forbidden: [
          "BDC (Canadian-only program)",
          "Canada Small Business Financing Program",
          "British Business Bank (UK only)",
        ],
      };
    case "GB":
      return {
        primary_program: "Start Up Loans (British Business Bank)",
        allowed: [
          "Start Up Loans Company (British Business Bank)",
          "British Business Bank — Recovery Loan Scheme",
          "NatWest Commercial Banking",
          "Lloyds Bank — Business",
          "Barclays — Business Banking",
          "HSBC UK — Business Banking",
          "Funding Circle (P2P)",
          "Iwoca",
        ],
        forbidden: [
          "SBA (Small Business Administration — US only)",
          "SBA 7(a)",
          "BDC (Canadian-only program)",
        ],
      };
    case "AU":
      return {
        primary_program: "NAB QuickBiz / business loan",
        allowed: [
          "NAB Business",
          "Commonwealth Bank Business Banking",
          "ANZ Business Banking",
          "Westpac Business",
          "Judo Bank",
          "Prospa",
        ],
        forbidden: [
          "SBA (US only)",
          "BDC (Canadian-only program)",
        ],
      };
    case "DE":
      return {
        primary_program: "KfW StartGeld",
        allowed: ["KfW Bankengruppe", "Sparkasse Geschäftskunden", "Volksbank", "Commerzbank Mittelstand"],
        forbidden: ["SBA (US only)", "BDC (Canadian-only program)"],
      };
    case "FR":
      return {
        primary_program: "Bpifrance Prêt Création",
        allowed: ["Bpifrance", "BNP Paribas Entreprises", "Crédit Agricole — Pro", "Société Générale — Pro"],
        forbidden: ["SBA (US only)", "BDC (Canadian-only program)"],
      };
    case "NL":
      return {
        primary_program: "Qredits microcrediet",
        allowed: ["Qredits", "ING Zakelijk", "ABN AMRO Zakelijk", "Rabobank Bedrijven"],
        forbidden: ["SBA (US only)", "BDC (Canadian-only program)"],
      };
    case "ES":
      return {
        primary_program: "ICO empresas y emprendedores",
        allowed: ["ICO (Instituto de Crédito Oficial)", "Banco Santander — Negocios", "BBVA — Negocios", "CaixaBank — Negocios"],
        forbidden: ["SBA (US only)", "BDC (Canadian-only program)"],
      };
    case "IT":
      return {
        primary_program: "Fondo di Garanzia per le PMI",
        allowed: ["Fondo di Garanzia per le PMI", "Intesa Sanpaolo Imprese", "UniCredit Business", "BPER Banca Imprese"],
        forbidden: ["SBA (US only)", "BDC (Canadian-only program)"],
      };
    case "PL":
      return {
        primary_program: "BGK — Bank Gospodarstwa Krajowego",
        allowed: ["BGK (Bank Gospodarstwa Krajowego)", "PKO Bank Polski — Firmy", "ING Bank Śląski — Biznes", "mBank — Firma"],
        forbidden: ["SBA (US only)", "BDC (Canadian-only program)"],
      };
  }
}

// ── Effective income tax rate the financial engine should use ────────────────

// Returns the rate the engine should apply to operating profit. For tiered
// regimes (CCPC, UK Ltd) the small-business rate applies until projected
// income crosses the threshold. We use the projected Y1 net profit (cents)
// to decide which tier dominates. For pass-through entities, we return the
// small-business rate (which equals general_rate_pct) so the corporate line
// shows zero — owner taxes are handled outside this engine.
export function effectiveIncomeTaxPct(profile: TaxProfile, projectedY1IncomeCents: number): number {
  if (profile.pass_through) return 0;
  if (profile.small_business_threshold_cents == null) return profile.general_rate_pct;
  // If projected income is fully under the threshold, use the small-business rate.
  if (projectedY1IncomeCents <= profile.small_business_threshold_cents) {
    return profile.small_business_rate_pct;
  }
  // Above threshold — most new coffee shops will not be here in Y1. Use the
  // general rate as the headline; a real tiered calc would weight the two
  // bands. This is intentionally simple; the LLM is forbidden from inventing
  // additional precision the engine can't justify.
  return profile.general_rate_pct;
}

// ── Prompt rendering ─────────────────────────────────────────────────────────

export function formatRegionForPrompt(
  region: Region,
  tax: TaxProfile,
  lender: LenderProfile,
): string {
  const lines: string[] = [];
  lines.push(`Region and Tax Profile — REQUIRED for any narrative that references jurisdiction, tax rate, or lender.`);
  lines.push("");
  lines.push(`Jurisdiction: ${region.country_name}${region.state_or_province_name ? `, ${region.state_or_province_name}` : ""}${region.city ? ` (${region.city})` : ""}`);
  lines.push(`Entity type: ${tax.entity_label}`);
  lines.push(`Region label: ${tax.region_label}`);
  lines.push(`Income tax (small-business / Y1 rate): ${tax.small_business_rate_pct}%`);
  if (tax.small_business_threshold_cents != null) {
    const thrUsd = Math.round(tax.small_business_threshold_cents / 100).toLocaleString("en-US");
    lines.push(`Income tax (general rate above small-business threshold of ${thrUsd}): ${tax.general_rate_pct}%`);
  } else {
    lines.push(`Income tax (single rate): ${tax.general_rate_pct}%`);
  }
  lines.push(`Sales tax (pass-through, not on P&L): ${tax.sales_tax_name} at ${tax.sales_tax_pct}%`);
  for (const n of tax.notes) {
    lines.push(`- ${n}`);
  }
  lines.push("");
  lines.push(`Lender references — narrative may cite the following programs/lenders only:`);
  if (lender.primary_program) {
    lines.push(`- Primary program for ${region.country_name}: ${lender.primary_program}`);
  }
  for (const a of lender.allowed) {
    lines.push(`- Allowed: ${a}`);
  }
  if (lender.forbidden.length > 0) {
    lines.push(`The narrative MUST NOT reference these programs (they do not exist in ${region.country_name}):`);
    for (const f of lender.forbidden) {
      lines.push(`- Forbidden: ${f}`);
    }
  }
  return lines.join("\n").trim();
}
