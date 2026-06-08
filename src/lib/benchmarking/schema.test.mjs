// TIM-2447: tests for extraction payload zod schema + allowlist filter.

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  ExtractionPayloadSchema,
  filterByAllowlist,
} from "./schema.ts"

test("ExtractionPayloadSchema accepts empty payload", () => {
  const parsed = ExtractionPayloadSchema.parse({})
  assert.deepEqual(parsed.reference_values, [])
  assert.deepEqual(parsed.best_practices, [])
})

test("ExtractionPayloadSchema parses a well-formed reference row", () => {
  const parsed = ExtractionPayloadSchema.parse({
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
  })
  assert.equal(parsed.reference_values.length, 1)
  assert.equal(parsed.reference_values[0].low, 25)
})

test("ExtractionPayloadSchema rejects bad value_type", () => {
  assert.throws(
    () =>
      ExtractionPayloadSchema.parse({
        reference_values: [
          { metric_id: "x", value_type: "average", low: 1, high: 2 },
        ],
      }),
  )
})

test("ExtractionPayloadSchema rejects bad publication_date format", () => {
  assert.throws(
    () =>
      ExtractionPayloadSchema.parse({
        reference_values: [
          {
            metric_id: "x",
            value_type: "range",
            low: 1,
            high: 2,
            source_publication_date: "2024",
          },
        ],
      }),
  )
})

test("filterByAllowlist drops unknown metric_keys", () => {
  const result = filterByAllowlist(
    {
      reference_values: [
        { metric_id: "labor_pct_of_revenue", cohort_key: null, value_type: "range", low: 25, high: 30, extraction_confidence: "high", p25: null, p50: null, p75: null, sample_size: null, source_publication_date: null, notes: null },
        { metric_id: "made_up_metric", cohort_key: null, value_type: "range", low: 5, high: 10, extraction_confidence: "high", p25: null, p50: null, p75: null, sample_size: null, source_publication_date: null, notes: null },
      ],
      best_practices: [],
    },
    new Set(["labor_pct_of_revenue"]),
    new Set(),
  )
  assert.equal(result.payload.reference_values.length, 1)
  assert.equal(result.rejected, 1)
})

test("filterByAllowlist drops unknown cohort_keys", () => {
  const result = filterByAllowlist(
    {
      reference_values: [
        { metric_id: "labor_pct_of_revenue", cohort_key: "made_up_cohort", value_type: "range", low: 25, high: 30, extraction_confidence: "high", p25: null, p50: null, p75: null, sample_size: null, source_publication_date: null, notes: null },
      ],
      best_practices: [],
    },
    new Set(["labor_pct_of_revenue"]),
    new Set(["other_cohort"]),
  )
  assert.equal(result.payload.reference_values.length, 0)
  assert.equal(result.rejected, 1)
})

test("filterByAllowlist drops reference rows with no numeric value", () => {
  const result = filterByAllowlist(
    {
      reference_values: [
        { metric_id: "labor_pct_of_revenue", cohort_key: null, value_type: "range", low: null, high: null, extraction_confidence: "high", p25: null, p50: null, p75: null, sample_size: null, source_publication_date: null, notes: null },
      ],
      best_practices: [],
    },
    new Set(["labor_pct_of_revenue"]),
    new Set(),
  )
  assert.equal(result.payload.reference_values.length, 0)
  assert.equal(result.rejected, 1)
})

test("filterByAllowlist drops best_practices rows with no guideline value", () => {
  const result = filterByAllowlist(
    {
      reference_values: [],
      best_practices: [
        {
          metric_id: "labor_pct_of_revenue",
          applicable_cohort_filter: null,
          guideline_low: null,
          guideline_high: null,
          guideline_target: null,
          rationale: "x",
          source_publication_date: null,
        },
      ],
    },
    new Set(["labor_pct_of_revenue"]),
    new Set(),
  )
  assert.equal(result.payload.best_practices.length, 0)
  assert.equal(result.rejected, 1)
})
