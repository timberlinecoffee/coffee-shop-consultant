// TIM-2447: Source catalog for the Benchmarking AI-extraction pipeline.
//
// Each entry is one (URL, source_name, metrics_covered, extraction_prompt_key,
// cohort_filter) tuple. The pipeline iterates this array, runs Sonnet 4.6 with
// the web_search tool, validates the extracted JSON against zod, and upserts
// into benchmark_reference_values / benchmark_best_practices.
//
// "Code, not DB" — same approach as src/lib/menu-pricing/industry-benchmarks.ts
// (TIM-1698). Adding / removing a source is a one-line code change reviewed by
// diff. Operator runbook: docs/benchmarking/adding-sources.md.
//
// extraction_prompt_key selects the per-pillar prompt template from prompts.ts.
// A single source can cover multiple metrics across pillars; each metric uses
// its pillar's prompt and the same source URL as a fetch hint.
//
// cohort_filter is a partial jsonb axes match — NULL means "national /
// unbucketed". Only used when the source explicitly publishes a cohort
// breakdown; otherwise the LLM is instructed to return value_type:"range"
// without a cohort.
//
// Phase 0 scope: pillars 1-4 only (revenue/traffic, COGS, labor, real-estate).

export type ExtractionPromptKey =
  | "revenue_traffic"
  | "cogs"
  | "labor"
  | "real_estate_fitout"
  | "best_practices_only"

export interface BenchmarkSource {
  /** Canonical URL the LLM is asked to fetch + extract from. */
  url: string
  /** Human source name written to source_name on every row. */
  source_name: string
  /** Subset of public.benchmark_metrics.metric_key this source can supply. */
  metrics_covered: string[]
  /** Which extraction prompt template to run against this source. */
  extraction_prompt_key: ExtractionPromptKey
  /**
   * Cohort filter to apply to extracted rows when the source's audience is
   * cohort-specific. NULL = national / unbucketed.
   */
  cohort_filter: Record<string, string> | null
  /**
   * Free-text note shown in the run log when an operator audits a partial
   * extraction. Not used at query time.
   */
  notes?: string
}

export const BENCHMARK_SOURCES: BenchmarkSource[] = [
  // ── Industry bodies ──────────────────────────────────────────────────────
  {
    url: "https://sca.coffee/research",
    source_name: "Specialty Coffee Association — Research portal",
    metrics_covered: ["labor_pct_of_revenue", "beverage_cogs_pct", "total_cogs_pct"],
    extraction_prompt_key: "best_practices_only",
    cohort_filter: null,
    notes: "SCA Operators Guide excerpts + free articles on labor / COGS targets.",
  },
  {
    url: "https://www.ncausa.org/Industry-Resources",
    source_name: "National Coffee Association — Industry Resources",
    metrics_covered: ["avg_ticket_usd", "transactions_per_day", "total_cogs_pct"],
    extraction_prompt_key: "revenue_traffic",
    cohort_filter: null,
    notes: "NCA NCDT 2024 press releases and free portions of the annual market report.",
  },
  {
    url: "https://restaurant.org/research-and-media/research/industry-statistics/",
    source_name: "National Restaurant Association — Industry Statistics",
    metrics_covered: ["rent_pct_of_revenue", "labor_pct_of_revenue", "turnover_pct_annual"],
    extraction_prompt_key: "best_practices_only",
    cohort_filter: null,
    notes: "NRA published guidelines (free-tier).",
  },

  // ── Government / public statistical ──────────────────────────────────────
  {
    url: "https://www.bls.gov/oes/current/oes353023.htm",
    source_name: "BLS OEWS — Baristas (SOC 35-3023)",
    metrics_covered: ["wage_rate_usd_hour"],
    extraction_prompt_key: "labor",
    cohort_filter: null,
    notes: "BLS national wage data for baristas — median + p25/p75 by metro.",
  },
  {
    url: "https://www.bls.gov/iag/tgs/iag7224.htm",
    source_name: "BLS Industry at a Glance — Limited-Service Restaurants",
    metrics_covered: ["wage_rate_usd_hour", "turnover_pct_annual"],
    extraction_prompt_key: "labor",
    cohort_filter: null,
    notes: "BLS limited-service industry rollup.",
  },

  // ── Public corporate filings (SEC EDGAR — upper-bound reference cohort) ──
  {
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000829224&type=10-K&dateb=&owner=include&count=40",
    source_name: "SEC EDGAR — Starbucks 10-K filings",
    metrics_covered: ["auv_usd", "labor_pct_of_revenue", "rent_pct_of_revenue"],
    extraction_prompt_key: "revenue_traffic",
    cohort_filter: { model: "multi_location" },
    notes: "Upper-bound reference; Starbucks AUV is a ceiling, not a typical-shop value.",
  },
  {
    url: "https://investors.dutchbros.com/financials/sec-filings",
    source_name: "SEC EDGAR — Dutch Bros 10-K / 10-Q filings",
    metrics_covered: ["auv_usd", "avg_ticket_usd", "labor_pct_of_revenue"],
    extraction_prompt_key: "revenue_traffic",
    cohort_filter: { model: "drive_thru" },
    notes: "Drive-thru chain reference — closest public proxy for drive-thru AUV.",
  },

  // ── Trade press (free articles) ──────────────────────────────────────────
  {
    url: "https://dailycoffeenews.com/category/business/",
    source_name: "Daily Coffee News — Business category",
    metrics_covered: ["fitout_per_sqft_usd", "rent_per_sqft_annual_usd", "auv_usd"],
    extraction_prompt_key: "real_estate_fitout",
    cohort_filter: null,
    notes: "Trade-press operator profiles often include build cost + rent disclosures.",
  },
  {
    url: "https://www.qsrmagazine.com/news/segments/coffee",
    source_name: "QSR Magazine — Coffee segment",
    metrics_covered: ["avg_ticket_usd", "transactions_per_day", "labor_pct_of_revenue"],
    extraction_prompt_key: "revenue_traffic",
    cohort_filter: null,
    notes: "QSR Magazine coffee-segment annual rollups.",
  },
  {
    url: "https://www.modernrestaurantmanagement.com/?s=coffee",
    source_name: "Modern Restaurant Management — Coffee coverage",
    metrics_covered: ["labor_pct_of_revenue", "total_cogs_pct", "turnover_pct_annual"],
    extraction_prompt_key: "labor",
    cohort_filter: null,
    notes: "Operator commentary and trend pieces.",
  },

  // ── Operator content (specialty-cafe owner content) ──────────────────────
  {
    url: "https://www.sprudge.com/?s=unit+economics",
    source_name: "Sprudge — Unit economics coverage",
    metrics_covered: ["auv_usd", "avg_ticket_usd", "fitout_per_sqft_usd"],
    extraction_prompt_key: "revenue_traffic",
    cohort_filter: { concept: "third_wave_specialty" },
    notes: "Third-wave specialty operator interviews with explicit cost/revenue disclosures.",
  },
]

/** Convenience filter used by the CLI's --source-filter flag. */
export function filterSources(
  filter: { sourceNameContains?: string; metric?: string } = {},
): BenchmarkSource[] {
  return BENCHMARK_SOURCES.filter((s) => {
    if (filter.sourceNameContains && !s.source_name.toLowerCase().includes(filter.sourceNameContains.toLowerCase())) {
      return false
    }
    if (filter.metric && !s.metrics_covered.includes(filter.metric)) {
      return false
    }
    return true
  })
}

/** Hard cap on number of sources processed in a single run (Rule 4 — blast radius bound). */
export const MAX_SOURCES_PER_RUN = 40
