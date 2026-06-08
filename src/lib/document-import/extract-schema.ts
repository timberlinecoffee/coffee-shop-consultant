// TIM-2434: zod schemas for the extraction layer.
// Single source of truth for what the LLM is allowed to emit and what shape the
// suite-routing layer consumes downstream. Rule 3 — validate at the boundary.

import { z } from "zod";

export const ExtractedChangeSchema = z.object({
  suite: z.enum(["business_plan", "financials", "concept_brand"]),
  fieldKey: z.string().min(1).max(120),
  fieldLabel: z.string().min(1).max(160),
  proposedValue: z.string().min(1).max(8000),
  sourceFileName: z.string().min(1).max(240),
  confidence: z.enum(["high", "medium", "low"]),
});

export const ExtractedDocumentSchema = z.object({
  proposedChanges: z.array(ExtractedChangeSchema).max(200),
});

export type ExtractedDocument = z.infer<typeof ExtractedDocumentSchema>;
export type ExtractedChange = z.infer<typeof ExtractedChangeSchema>;
