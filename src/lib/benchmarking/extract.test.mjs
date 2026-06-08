// TIM-2447: tests for the pure-DI extraction core.
//
// In-memory deps stand in for the live LLM + Supabase. Each test asserts one
// invariant: parse → filter → upsert → log, with idempotency on (metric, cohort,
// source_url, extraction_date) handled by the dep mock.

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  extractJsonObject,
  mapPayloadToUpsertRows,
  parsePayload,
  runExtraction,
} from "./extract.ts"

const SAMPLE_SOURCE = {
  url: "https://example.com/source",
  source_name: "Example Source",
  metrics_covered: ["labor_pct_of_revenue"],
  extraction_prompt_key: "labor",
  cohort_filter: null,
}

function buildDeps(overrides = {}) {
  const writes = { reference: [], best: [], runs: [] }
  const deps = {
    listMetrics: async () => [{ metric_key: "labor_pct_of_revenue" }],
    listCohorts: async () => [{ cohort_key: "cafe_500_1500_top50_1_3y", id: "cohort-uuid-1" }],
    runLlm: async () => ({
      rawText: "```json\n" + JSON.stringify({
        reference_values: [
          {
            metric_id: "labor_pct_of_revenue",
            cohort_key: null,
            value_type: "range",
            low: 25,
            high: 30,
            extraction_confidence: "high",
          },
        ],
        best_practices: [],
      }) + "\n```",
      inputTokens: 100,
      outputTokens: 50,
      webSearchRequests: 1,
    }),
    buildPrompt: () => "PROMPT_BODY",
    computeCostUsd: () => 0.05,
    upsertReferenceValues: async (rows) => {
      writes.reference.push(...rows)
      return rows.length
    },
    upsertBestPractices: async (rows) => {
      writes.best.push(...rows)
      return rows.length
    },
    insertRunLog: async (row) => {
      writes.runs.push(row)
    },
    log: () => {},
    extractionDate: "2026-06-07",
    datasetVersion: "2026.Q2",
    modelUsed: "claude-sonnet-4-6",
    maxCostUsd: 5,
    ...overrides,
  }
  return { deps, writes }
}

// ── helpers ──────────────────────────────────────────────────────────────────

test("extractJsonObject finds a fenced json block", () => {
  const raw = "preamble\n```json\n{\"a\":1}\n```\nepilogue"
  assert.equal(extractJsonObject(raw), '{"a":1}')
})

test("extractJsonObject falls back to bare braces", () => {
  const raw = "preamble {\"a\":1} epilogue"
  assert.equal(extractJsonObject(raw), '{"a":1}')
})

test("extractJsonObject returns null when nothing found", () => {
  assert.equal(extractJsonObject("no json here"), null)
})

test("parsePayload throws on missing json", () => {
  assert.throws(() => parsePayload("nope"))
})

test("parsePayload validates and returns structured payload", () => {
  const raw = "```json\n" + JSON.stringify({
    reference_values: [
      { metric_id: "x", value_type: "range", low: 1, high: 2, extraction_confidence: "high" },
    ],
    best_practices: [],
  }) + "\n```"
  const parsed = parsePayload(raw)
  assert.equal(parsed.reference_values.length, 1)
})

test("mapPayloadToUpsertRows stamps every row with date + version + source", () => {
  const result = mapPayloadToUpsertRows({
    payload: {
      reference_values: [
        { metric_id: "labor_pct_of_revenue", cohort_key: "cafe_500_1500_top50_1_3y", value_type: "range", low: 25, high: 30, extraction_confidence: "high", p25: null, p50: null, p75: null, sample_size: null, source_publication_date: null, notes: null },
      ],
      best_practices: [],
    },
    source: SAMPLE_SOURCE,
    extractionDate: "2026-06-07",
    datasetVersion: "2026.Q2",
    cohortKeyToId: new Map([["cafe_500_1500_top50_1_3y", "cohort-uuid-1"]]),
  })
  assert.equal(result.reference.length, 1)
  assert.equal(result.reference[0].extraction_date, "2026-06-07")
  assert.equal(result.reference[0].dataset_version, "2026.Q2")
  assert.equal(result.reference[0].source_url, SAMPLE_SOURCE.url)
  assert.equal(result.reference[0].source_name, SAMPLE_SOURCE.source_name)
  assert.equal(result.reference[0].cohort_id, "cohort-uuid-1")
})

// ── runExtraction integration on in-memory deps ──────────────────────────────

test("runExtraction succeeds on a well-formed source", async () => {
  const { deps, writes } = buildDeps()
  const result = await runExtraction([SAMPLE_SOURCE], deps)
  assert.equal(result.sourcesProcessed, 1)
  assert.equal(result.totalRowsUpserted, 1)
  assert.equal(writes.reference.length, 1)
  assert.equal(writes.runs.length, 1)
  assert.equal(writes.runs[0].status, "succeeded")
  assert.equal(writes.runs[0].rows_upserted, 1)
})

test("runExtraction marks status:failed when LLM throws", async () => {
  const { deps, writes } = buildDeps({
    runLlm: async () => {
      throw new Error("network_timeout")
    },
  })
  const result = await runExtraction([SAMPLE_SOURCE], deps)
  assert.equal(result.perSourceStatuses[0].status, "failed")
  assert.equal(result.totalRowsUpserted, 0)
  assert.equal(writes.runs[0].status, "failed")
  assert.match(writes.runs[0].error_message, /network_timeout/)
})

test("runExtraction marks status:partial when zod drops some rows", async () => {
  const { deps, writes } = buildDeps({
    runLlm: async () => ({
      rawText: "```json\n" + JSON.stringify({
        reference_values: [
          { metric_id: "labor_pct_of_revenue", value_type: "range", low: 25, high: 30, extraction_confidence: "high" },
          { metric_id: "made_up_metric", value_type: "range", low: 5, high: 10, extraction_confidence: "high" },
        ],
        best_practices: [],
      }) + "\n```",
      inputTokens: 100,
      outputTokens: 50,
      webSearchRequests: 1,
    }),
  })
  const result = await runExtraction([SAMPLE_SOURCE], deps)
  assert.equal(result.totalRowsUpserted, 1)
  assert.equal(result.totalRowsRejected, 1)
  assert.equal(writes.runs[0].status, "partial")
})

test("runExtraction aborts when cost cap reached mid-loop", async () => {
  const { deps, writes } = buildDeps({ computeCostUsd: () => 4, maxCostUsd: 5 })
  const result = await runExtraction([SAMPLE_SOURCE, SAMPLE_SOURCE], deps)
  // First source costs 4 (under cap, processed), accumulator hits 4, second
  // source loop iteration sees totalCostUsd >= maxCostUsd? 4 < 5 so it
  // processes the second too, total 8, aborts on a third iteration.
  // With only two sources: both run, no abort. Test with three:
  const result2 = await runExtraction([SAMPLE_SOURCE, SAMPLE_SOURCE, SAMPLE_SOURCE], buildDeps({ computeCostUsd: () => 4, maxCostUsd: 5 }).deps)
  assert.equal(result2.aborted, true)
  assert.equal(result2.sourcesProcessed, 2) // 1st + 2nd ran, 3rd aborted before LLM call
  assert.equal(result.sourcesProcessed, 2)
  assert.ok(writes.runs.length >= 1)
})

test("runExtraction rejects when sources exceed MAX_SOURCES_PER_RUN", async () => {
  const { deps } = buildDeps()
  const tooMany = Array.from({ length: 100 }, () => SAMPLE_SOURCE)
  await assert.rejects(
    () => runExtraction(tooMany, deps),
    /too_many_sources/,
  )
})

test("runExtraction calls insertRunLog even when LLM fails", async () => {
  const { deps, writes } = buildDeps({
    runLlm: async () => {
      throw new Error("boom")
    },
  })
  await runExtraction([SAMPLE_SOURCE], deps)
  assert.equal(writes.runs.length, 1)
  assert.equal(writes.runs[0].status, "failed")
})
