// TIM-2447: Pure-DI core of the Benchmarking AI-extraction pipeline.
//
// Inputs come in via the ExtractDeps interface — that lets the test suite swap
// the LLM call + the Supabase writer for in-memory fakes (Node 22 can run the
// tests under --experimental-strip-types without pulling Anthropic/Supabase
// into the test import graph).
//
// The CLI wires the real LLM call + the service-role Supabase client. See
// scripts/run-benchmark-extraction.mjs.

import { ExtractionPayloadSchema, filterByAllowlist } from "./schema.ts"
import type {
  ExtractedBestPracticeRow,
  ExtractedReferenceRow,
  ExtractionPayload,
} from "./schema.ts"
import { MAX_SOURCES_PER_RUN } from "./sources.ts"
import type { BenchmarkSource } from "./sources.ts"

// ── Types injected at runtime ────────────────────────────────────────────────

export interface CohortKeyRow {
  cohort_key: string
  id: string
}

export interface MetricKeyRow {
  metric_key: string
}

export interface LlmExtractInput {
  prompt: string
  /** Source URL passed through for logging only. */
  sourceUrl: string
}

export interface LlmExtractResult {
  /** Raw text of the model's final message. */
  rawText: string
  /** Anthropic usage block flattened for cost estimation. */
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreateTokens?: number
  webSearchRequests: number
}

export interface ReferenceUpsertRow {
  metric_id: string
  cohort_id: string | null
  value_type: "percentile" | "range"
  p25: number | null
  p50: number | null
  p75: number | null
  low: number | null
  high: number | null
  sample_size: number | null
  source_url: string
  source_name: string
  source_publication_date: string | null
  extraction_date: string // YYYY-MM-DD
  extraction_confidence: "high" | "medium" | "low"
  dataset_version: string
  notes: string | null
}

export interface BestPracticeUpsertRow {
  metric_id: string
  applicable_cohort_filter: Record<string, string> | null
  guideline_low: number | null
  guideline_high: number | null
  guideline_target: number | null
  rationale: string
  source_url: string
  source_name: string
  source_publication_date: string | null
  extraction_date: string // YYYY-MM-DD
  dataset_version: string
}

export interface ExtractionRunLogRow {
  dataset_version: string
  source_url: string
  source_name: string
  model_used: string
  status: "started" | "succeeded" | "partial" | "failed"
  rows_upserted: number
  rows_rejected: number
  error_message: string | null
  cost_usd_estimate: number
  web_search_requests: number
}

export interface ExtractDeps {
  /** Returns all rows currently in benchmark_metrics. */
  listMetrics(): Promise<MetricKeyRow[]>
  /** Returns all rows currently in benchmark_cohorts. */
  listCohorts(): Promise<CohortKeyRow[]>
  /** Calls the LLM with the built prompt + web_search tool. */
  runLlm(input: LlmExtractInput): Promise<LlmExtractResult>
  /** Builds the prompt text for one source. */
  buildPrompt(source: BenchmarkSource, allowedCohortKeys: string[]): string
  /** Computes USD cost for the LLM turn. */
  computeCostUsd(usage: LlmExtractResult): number
  /** Upserts reference rows; returns rows_upserted. */
  upsertReferenceValues(rows: ReferenceUpsertRow[]): Promise<number>
  /** Upserts best-practices rows; returns rows_upserted. */
  upsertBestPractices(rows: BestPracticeUpsertRow[]): Promise<number>
  /** Inserts one row into benchmark_extraction_runs. */
  insertRunLog(row: ExtractionRunLogRow): Promise<void>
  /** Logger for CLI output (info / warn). */
  log(level: "info" | "warn" | "error", message: string): void
  /** ISO date the run is stamping (YYYY-MM-DD); injected for testability. */
  extractionDate: string
  /** Dataset version stamped on every row. */
  datasetVersion: string
  /** Anthropic model id used (logged into run rows). */
  modelUsed: string
  /** Hard cost cap for the run in USD; aborts when exceeded. */
  maxCostUsd: number
}

export interface ExtractionRunResult {
  sourcesProcessed: number
  totalRowsUpserted: number
  totalRowsRejected: number
  totalCostUsd: number
  perSourceStatuses: Array<{
    source_url: string
    source_name: string
    status: ExtractionRunLogRow["status"]
    rows_upserted: number
    error_message: string | null
  }>
  aborted: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the first balanced JSON object from raw model output. */
export function extractJsonObject(raw: string): string | null {
  // Look for a fenced code block first; fall back to a bare {...} scan.
  const fence = raw.match(/```json\s*([\s\S]*?)```/i)
  if (fence) return fence[1].trim()
  const bare = raw.match(/\{[\s\S]*\}/)
  return bare ? bare[0] : null
}

/** Parse + zod-validate the raw model output into a structured payload. */
export function parsePayload(raw: string): ExtractionPayload {
  const json = extractJsonObject(raw)
  if (!json) {
    throw new Error("no_json_in_output")
  }
  const parsed = JSON.parse(json)
  return ExtractionPayloadSchema.parse(parsed)
}

interface MapRowsToUpsertInput {
  payload: ExtractionPayload
  source: BenchmarkSource
  extractionDate: string
  datasetVersion: string
  cohortKeyToId: Map<string, string>
}

interface MappedUpsertRows {
  reference: ReferenceUpsertRow[]
  best: BestPracticeUpsertRow[]
}

/** Map filtered payload rows into the shape the DB expects. */
export function mapPayloadToUpsertRows(input: MapRowsToUpsertInput): MappedUpsertRows {
  const reference: ReferenceUpsertRow[] = input.payload.reference_values.map(
    (row: ExtractedReferenceRow) => ({
      metric_id: row.metric_id,
      cohort_id: row.cohort_key ? input.cohortKeyToId.get(row.cohort_key) ?? null : null,
      value_type: row.value_type,
      p25: row.p25 ?? null,
      p50: row.p50 ?? null,
      p75: row.p75 ?? null,
      low: row.low ?? null,
      high: row.high ?? null,
      sample_size: row.sample_size ?? null,
      source_url: input.source.url,
      source_name: input.source.source_name,
      source_publication_date: row.source_publication_date ?? null,
      extraction_date: input.extractionDate,
      extraction_confidence: row.extraction_confidence ?? "medium",
      dataset_version: input.datasetVersion,
      notes: row.notes ?? null,
    }),
  )
  const best: BestPracticeUpsertRow[] = input.payload.best_practices.map(
    (row: ExtractedBestPracticeRow) => ({
      metric_id: row.metric_id,
      applicable_cohort_filter: row.applicable_cohort_filter ?? null,
      guideline_low: row.guideline_low ?? null,
      guideline_high: row.guideline_high ?? null,
      guideline_target: row.guideline_target ?? null,
      rationale: row.rationale,
      source_url: input.source.url,
      source_name: input.source.source_name,
      source_publication_date: row.source_publication_date ?? null,
      extraction_date: input.extractionDate,
      dataset_version: input.datasetVersion,
    }),
  )
  return { reference, best }
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function runExtraction(
  sources: BenchmarkSource[],
  deps: ExtractDeps,
): Promise<ExtractionRunResult> {
  if (sources.length > MAX_SOURCES_PER_RUN) {
    throw new Error(`too_many_sources: ${sources.length} > ${MAX_SOURCES_PER_RUN}`)
  }

  const [metrics, cohorts] = await Promise.all([deps.listMetrics(), deps.listCohorts()])
  const allowedMetricKeys = new Set(metrics.map((m) => m.metric_key))
  const cohortKeyToId = new Map(cohorts.map((c) => [c.cohort_key, c.id]))
  const allowedCohortKeys = new Set(cohorts.map((c) => c.cohort_key))

  const perSourceStatuses: ExtractionRunResult["perSourceStatuses"] = []
  let totalRowsUpserted = 0
  let totalRowsRejected = 0
  let totalCostUsd = 0
  let aborted = false

  for (const source of sources) {
    if (totalCostUsd >= deps.maxCostUsd) {
      deps.log("warn", `Cost cap reached (${totalCostUsd.toFixed(4)} >= ${deps.maxCostUsd}); aborting.`)
      aborted = true
      break
    }

    const allowedCohortKeysForPrompt = [...allowedCohortKeys]
    const prompt = deps.buildPrompt(source, allowedCohortKeysForPrompt)
    let rowsUpserted = 0
    let rowsRejected = 0
    let status: ExtractionRunLogRow["status"] = "started"
    let errorMessage: string | null = null
    let costUsd = 0
    let webSearchRequests = 0

    try {
      const llmResult = await deps.runLlm({ prompt, sourceUrl: source.url })
      webSearchRequests = llmResult.webSearchRequests
      costUsd = deps.computeCostUsd(llmResult)
      totalCostUsd += costUsd

      const parsed = parsePayload(llmResult.rawText)
      const filtered = filterByAllowlist(parsed, allowedMetricKeys, allowedCohortKeys)
      rowsRejected = filtered.rejected
      const { reference, best } = mapPayloadToUpsertRows({
        payload: filtered.payload,
        source,
        extractionDate: deps.extractionDate,
        datasetVersion: deps.datasetVersion,
        cohortKeyToId,
      })

      if (reference.length === 0 && best.length === 0) {
        status = filtered.rejected > 0 ? "partial" : "succeeded"
        deps.log("info", `[${source.source_name}] no usable rows (rejected=${filtered.rejected}).`)
      } else {
        const refUpserted = reference.length > 0 ? await deps.upsertReferenceValues(reference) : 0
        const bpUpserted = best.length > 0 ? await deps.upsertBestPractices(best) : 0
        rowsUpserted = refUpserted + bpUpserted
        status = filtered.rejected > 0 ? "partial" : "succeeded"
        deps.log(
          "info",
          `[${source.source_name}] upserted ${rowsUpserted} (rejected ${filtered.rejected}), cost $${costUsd.toFixed(4)}.`,
        )
      }
    } catch (err) {
      status = "failed"
      errorMessage = err instanceof Error ? err.message : String(err)
      deps.log("error", `[${source.source_name}] failed: ${errorMessage}`)
    }

    totalRowsUpserted += rowsUpserted
    totalRowsRejected += rowsRejected

    try {
      await deps.insertRunLog({
        dataset_version: deps.datasetVersion,
        source_url: source.url,
        source_name: source.source_name,
        model_used: deps.modelUsed,
        status,
        rows_upserted: rowsUpserted,
        rows_rejected: rowsRejected,
        error_message: errorMessage,
        cost_usd_estimate: costUsd,
        web_search_requests: webSearchRequests,
      })
    } catch (logErr) {
      deps.log(
        "warn",
        `Failed to write run log for ${source.source_name}: ${logErr instanceof Error ? logErr.message : String(logErr)}`,
      )
    }

    perSourceStatuses.push({
      source_url: source.url,
      source_name: source.source_name,
      status,
      rows_upserted: rowsUpserted,
      error_message: errorMessage,
    })
  }

  return {
    sourcesProcessed: perSourceStatuses.length,
    totalRowsUpserted,
    totalRowsRejected,
    totalCostUsd,
    perSourceStatuses,
    aborted,
  }
}
