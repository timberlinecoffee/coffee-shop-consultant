// TIM-2447: zod schemas + types for AI-extraction output.
//
// The pipeline asks Sonnet 4.6 to emit a JSON array of structured rows after
// web-searching a source URL. Every row is validated against ExtractedRowSchema
// before any DB insert (Rule 3). Anything that fails validation is counted
// into rows_rejected on the run log and skipped — never written.
//
// The model is told the exact metric keys it may use; we additionally enforce
// the allowlist here so the model can't smuggle in a new metric_key.

import { z } from "zod"

export const ExtractedReferenceRowSchema = z.object({
  /** Must match a metric_key from benchmark_metrics (validated against allowlist below). */
  metric_id: z.string().min(1),
  /** Optional cohort_key (validated against allowlist if non-null). */
  cohort_key: z.string().nullable().optional().default(null),
  value_type: z.enum(["percentile", "range"]),
  p25: z.number().nullable().optional().default(null),
  p50: z.number().nullable().optional().default(null),
  p75: z.number().nullable().optional().default(null),
  low: z.number().nullable().optional().default(null),
  high: z.number().nullable().optional().default(null),
  sample_size: z.number().int().positive().nullable().optional().default(null),
  /** Date the source was published (best-effort by LLM). YYYY-MM-DD or null. */
  source_publication_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
    .nullable()
    .optional()
    .default(null),
  extraction_confidence: z.enum(["high", "medium", "low"]).default("medium"),
  notes: z.string().max(2000).nullable().optional().default(null),
})

export const ExtractedBestPracticeRowSchema = z.object({
  metric_id: z.string().min(1),
  applicable_cohort_filter: z.record(z.string(), z.string()).nullable().optional().default(null),
  guideline_low: z.number().nullable().optional().default(null),
  guideline_high: z.number().nullable().optional().default(null),
  guideline_target: z.number().nullable().optional().default(null),
  rationale: z.string().min(1).max(2000),
  source_publication_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
    .nullable()
    .optional()
    .default(null),
})

export const ExtractionPayloadSchema = z.object({
  reference_values: z.array(ExtractedReferenceRowSchema).default([]),
  best_practices: z.array(ExtractedBestPracticeRowSchema).default([]),
})

export type ExtractedReferenceRow = z.infer<typeof ExtractedReferenceRowSchema>
export type ExtractedBestPracticeRow = z.infer<typeof ExtractedBestPracticeRowSchema>
export type ExtractionPayload = z.infer<typeof ExtractionPayloadSchema>

/**
 * Strip out rows that use a metric_key or cohort_key the catalog doesn't know
 * about. Returns the surviving subset + the count rejected. Rule 3: we never
 * trust the model to invent new keys.
 */
export function filterByAllowlist(
  payload: ExtractionPayload,
  allowedMetricKeys: ReadonlySet<string>,
  allowedCohortKeys: ReadonlySet<string>,
): { payload: ExtractionPayload; rejected: number } {
  let rejected = 0
  const reference_values = payload.reference_values.filter((row) => {
    if (!allowedMetricKeys.has(row.metric_id)) {
      rejected += 1
      return false
    }
    if (row.cohort_key && !allowedCohortKeys.has(row.cohort_key)) {
      rejected += 1
      return false
    }
    // At least one numeric field must be present.
    const hasValue =
      row.p25 !== null || row.p50 !== null || row.p75 !== null || row.low !== null || row.high !== null
    if (!hasValue) {
      rejected += 1
      return false
    }
    return true
  })
  const best_practices = payload.best_practices.filter((row) => {
    if (!allowedMetricKeys.has(row.metric_id)) {
      rejected += 1
      return false
    }
    const hasValue =
      row.guideline_low !== null || row.guideline_high !== null || row.guideline_target !== null
    if (!hasValue) {
      rejected += 1
      return false
    }
    return true
  })
  return { payload: { reference_values, best_practices }, rejected }
}
