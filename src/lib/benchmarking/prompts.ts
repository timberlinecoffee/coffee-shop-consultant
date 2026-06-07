// TIM-2447: Per-pillar extraction prompts for the Benchmarking AI pipeline.
//
// Each prompt is given to Sonnet 4.6 alongside the web_search tool. The model
// is told to fetch the source URL, extract structured rows matching the
// payload schema in src/lib/benchmarking/schema.ts, and emit ONLY a JSON code
// block at the end. No prose around the JSON — the pipeline regex-extracts
// the first {...} block and zod-validates it.
//
// Allowed metric_keys are injected at call time so the model is constrained
// to the active catalog. Cohort keys are similarly listed.

import type { ExtractionPromptKey } from "./sources.ts"

interface BuildPromptInput {
  sourceUrl: string
  sourceName: string
  metricsCovered: string[]
  /** All cohort keys the model is allowed to attribute rows to. */
  allowedCohortKeys: string[]
  /** Optional partial cohort filter — narrows the cohort guess for cohort-specific sources. */
  cohortHint: Record<string, string> | null
}

const PAYLOAD_SHAPE_HINT = `
Return ONLY a single JSON object inside a fenced \`\`\`json code block. Shape:

\`\`\`json
{
  "reference_values": [
    {
      "metric_id": "labor_pct_of_revenue",     // MUST be from the allowed metrics list
      "cohort_key": null,                       // null OR a key from the allowed cohort list
      "value_type": "range",                    // "percentile" | "range"
      "p25": null, "p50": null, "p75": null,    // numeric or null (percentile rows)
      "low": 25, "high": 30,                    // numeric or null (range rows)
      "sample_size": null,                      // integer or null
      "source_publication_date": "2024-01-15",  // YYYY-MM-DD or null
      "extraction_confidence": "high",          // "high" | "medium" | "low"
      "notes": "drive-thru annex"               // short string or null
    }
  ],
  "best_practices": [
    {
      "metric_id": "labor_pct_of_revenue",
      "applicable_cohort_filter": { "model": "drive_thru" }, // partial axes or null
      "guideline_low": 22, "guideline_high": 27, "guideline_target": 25,
      "rationale": "Drive-thru annex of the SCA Operators Guide recommends 22-27% labor.",
      "source_publication_date": "2024-01-15"
    }
  ]
}
\`\`\`

Rules:
- Use ONLY metric_id values from the allowed list. Do not invent new keys.
- Use ONLY cohort_key values from the allowed list, or null.
- Percentages must be raw numbers (e.g. 28, NOT 0.28 and NOT "28%").
- Currency must be the unit shown for the metric in the allowed list (USD year, USD, USD/sqft/year, etc).
- If the source does NOT explicitly state a number for a metric, OMIT that row. Do not fabricate.
- If unsure between "percentile" and "range", use "range" with low/high.
- extraction_confidence: "high" only when the source publishes a clean numeric range or percentile table. "low" when you're inferring from prose.
- If the source page is unreachable, you do not have to use it — emit an empty arrays object instead.
`.trim()

function commonHeader(input: BuildPromptInput): string {
  const metricList = input.metricsCovered.map((k) => `  - ${k}`).join("\n")
  const cohortList =
    input.allowedCohortKeys.length === 0
      ? "  (none — emit cohort_key:null for every row)"
      : input.allowedCohortKeys.map((k) => `  - ${k}`).join("\n")
  const cohortHintLine = input.cohortHint
    ? `\nCohort hint for this source: ${JSON.stringify(input.cohortHint)}. Apply this cohort_filter to best_practices rows when applicable; pick the closest allowed cohort_key for reference_values when the source breakdown matches.`
    : ""
  return [
    `You are extracting benchmark values for an independent coffee-shop reference dataset.`,
    ``,
    `Source URL: ${input.sourceUrl}`,
    `Source name: ${input.sourceName}`,
    ``,
    `Allowed metric_id values (use ONLY these):`,
    metricList,
    ``,
    `Allowed cohort_key values:`,
    cohortList,
    cohortHintLine,
    ``,
  ].join("\n")
}

const PILLAR_FOCUS: Record<ExtractionPromptKey, string> = {
  revenue_traffic: `
Focus on revenue, traffic, and ticket-size metrics. Look for: AUV (annual unit volume),
average ticket, daily transactions, revenue per sqft. SEC 10-K filings often state
"system-wide AUV" or "comparable store sales" — pull those as reference_values with
cohort_key reflecting the operator's model when applicable.
`.trim(),
  cogs: `
Focus on cost-of-goods metrics. Look for: total COGS %, beverage COGS %, food COGS %,
waste %. NCA and trade press often publish target ranges. Report as range value_type
unless the source gives explicit percentiles.
`.trim(),
  labor: `
Focus on labor metrics. Look for: labor % of revenue, sales per labor hour, turnover %,
wage rate. BLS sources will give wage percentiles directly — those are value_type:"percentile"
rows. SCA / NRA guidelines are best_practices rows with a guideline_low / guideline_high.
`.trim(),
  real_estate_fitout: `
Focus on real-estate and fit-out metrics. Look for: rent % of revenue, rent per sqft per year,
fit-out cost per sqft, lease term length. Trade-press operator profiles are the richest source
of fit-out cost ranges.
`.trim(),
  best_practices_only: `
You are extracting industry GUIDELINES (best-practices) only, not cohort observations.
Skip reference_values; populate best_practices with the published target range + rationale.
This source (SCA / NRA / NCA guideline material) is a guideline reference, not a cohort
observation source.
`.trim(),
}

export function buildExtractionPrompt(
  key: ExtractionPromptKey,
  input: BuildPromptInput,
): string {
  return [commonHeader(input), PILLAR_FOCUS[key], "", PAYLOAD_SHAPE_HINT].join("\n")
}
