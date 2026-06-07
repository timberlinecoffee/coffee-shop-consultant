#!/usr/bin/env node
// TIM-2447: Benchmarking AI-extraction CLI.
//
// Wires the pure-DI runExtraction() core (src/lib/benchmarking/extract.ts) to
// the real Anthropic SDK + a service-role Supabase client. Reads source URL +
// secret env from .env.prod when --env=prod is passed, otherwise from
// .env.local.
//
// Usage:
//   node scripts/run-benchmark-extraction.mjs [--env=prod] [--source-filter=sca] \
//        [--metric-filter=labor_pct_of_revenue] [--max-cost-usd=5] [--dataset-version=2026.Q2]
//
// Cost cap (Rule 4): default $5 per run. Aborts cleanly when reached.
// Source cap: hard-coded MAX_SOURCES_PER_RUN=40 in sources.ts.
//
// Idempotency: re-running on the same day overwrites rows via the unique
// constraint on (metric_id, cohort_id, source_url, extraction_date).

import { config as loadDotenv } from "dotenv"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import { resolve } from "node:path"
import { BENCHMARK_SOURCES, filterSources } from "../src/lib/benchmarking/sources.ts"
import { buildExtractionPrompt } from "../src/lib/benchmarking/prompts.ts"
import { runExtraction } from "../src/lib/benchmarking/extract.ts"
import { datasetVersionForDate } from "../src/lib/benchmarking/version.ts"
import { computeTurnCostUsd } from "../src/lib/ai/models.ts"

const RESEARCH_AI_MODEL = "claude-sonnet-4-6"

function parseArgs(argv) {
  const out = {}
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([\w-]+)(?:=(.*))?$/)
    if (!m) continue
    out[m[1]] = m[2] ?? "true"
  }
  return out
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10)
}

async function main() {
  const args = parseArgs(process.argv)
  const env = args["env"] === "prod" ? ".env.prod" : ".env.local"
  loadDotenv({ path: resolve(process.cwd(), env) })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error(`[fatal] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in ${env}`)
    process.exit(1)
  }
  if (!anthropicKey) {
    console.error(`[fatal] ANTHROPIC_API_KEY not set in ${env}`)
    process.exit(1)
  }

  const maxCostUsd = Number(args["max-cost-usd"] ?? "5")
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) {
    console.error("[fatal] --max-cost-usd must be a positive number")
    process.exit(1)
  }

  const now = new Date()
  const datasetVersion = args["dataset-version"] ?? datasetVersionForDate(now)
  const extractionDate = fmtDate(now)

  const sources = filterSources({
    sourceNameContains: args["source-filter"],
    metric: args["metric-filter"],
  })

  if (sources.length === 0) {
    console.error(
      `[fatal] no sources matched the filter. catalog size=${BENCHMARK_SOURCES.length}`,
    )
    process.exit(1)
  }

  console.log(
    `[run-benchmark-extraction] env=${env} sources=${sources.length} datasetVersion=${datasetVersion} maxCostUsd=$${maxCostUsd}`,
  )

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })
  const anthropic = new Anthropic({ apiKey: anthropicKey })

  const deps = {
    async listMetrics() {
      const { data, error } = await supabase
        .from("benchmark_metrics")
        .select("metric_key")
      if (error) throw new Error(`listMetrics: ${error.message}`)
      return data ?? []
    },
    async listCohorts() {
      const { data, error } = await supabase
        .from("benchmark_cohorts")
        .select("cohort_key,id")
      if (error) throw new Error(`listCohorts: ${error.message}`)
      return data ?? []
    },
    async runLlm({ prompt }) {
      const message = await anthropic.messages.create({
        model: RESEARCH_AI_MODEL,
        max_tokens: 3000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
        messages: [{ role: "user", content: prompt }],
      })
      const text = message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
      const usage = message.usage ?? {}
      return {
        rawText: text,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreateTokens: usage.cache_creation_input_tokens ?? 0,
        webSearchRequests:
          usage.server_tool_use?.web_search_requests ?? 0,
      }
    },
    buildPrompt(source, allowedCohortKeys) {
      return buildExtractionPrompt(source.extraction_prompt_key, {
        sourceUrl: source.url,
        sourceName: source.source_name,
        metricsCovered: source.metrics_covered,
        allowedCohortKeys,
        cohortHint: source.cohort_filter,
      })
    },
    computeCostUsd(usage) {
      return computeTurnCostUsd({
        model: RESEARCH_AI_MODEL,
        inputTokens: usage.inputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheCreateTokens: usage.cacheCreateTokens,
        outputTokens: usage.outputTokens,
        webSearchRequests: usage.webSearchRequests,
      })
    },
    async upsertReferenceValues(rows) {
      const { error, count } = await supabase
        .from("benchmark_reference_values")
        .upsert(rows, { onConflict: "metric_id,cohort_id,source_url,extraction_date", count: "exact" })
      if (error) throw new Error(`upsertReferenceValues: ${error.message}`)
      return count ?? rows.length
    },
    async upsertBestPractices(rows) {
      const { error, count } = await supabase
        .from("benchmark_best_practices")
        .upsert(rows, {
          onConflict: "metric_id,applicable_cohort_filter,source_url,extraction_date",
          count: "exact",
        })
      if (error) throw new Error(`upsertBestPractices: ${error.message}`)
      return count ?? rows.length
    },
    async insertRunLog(row) {
      const { error } = await supabase
        .from("benchmark_extraction_runs")
        .insert({ ...row, ended_at: new Date().toISOString() })
      if (error) throw new Error(`insertRunLog: ${error.message}`)
    },
    log(level, message) {
      const prefix = level === "error" ? "[ERROR]" : level === "warn" ? "[WARN]" : "[INFO]"
      console.log(`${prefix} ${message}`)
    },
    extractionDate,
    datasetVersion,
    modelUsed: RESEARCH_AI_MODEL,
    maxCostUsd,
  }

  const result = await runExtraction(sources, deps)

  console.log("\n=== Summary ===")
  console.log(`Sources processed: ${result.sourcesProcessed}/${sources.length}`)
  console.log(`Rows upserted:     ${result.totalRowsUpserted}`)
  console.log(`Rows rejected:     ${result.totalRowsRejected}`)
  console.log(`Total cost USD:    $${result.totalCostUsd.toFixed(4)}`)
  if (result.aborted) {
    console.log("Aborted: cost cap reached.")
  }
  for (const s of result.perSourceStatuses) {
    console.log(
      ` - [${s.status}] ${s.source_name} — rows=${s.rows_upserted}${
        s.error_message ? ` error="${s.error_message}"` : ""
      }`,
    )
  }
}

main().catch((err) => {
  console.error("[fatal]", err instanceof Error ? err.message : err)
  process.exit(1)
})
