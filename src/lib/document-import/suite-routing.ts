// TIM-2434: Suite routing — translates the extracted JSON from the LLM into
// SuggestionPayload[] shaped for the unified AIReviewModal (TIM-1561).
//
// Pure function — no IO. Caller passes the raw extraction output (validated
// shape from extract-schema.ts) and an existing-values map so the modal can
// render the "Currently: X" strikethrough row when overwriting manual input.
//
// Per the UX spec on TIM-2433: changes are grouped by suite (business_plan,
// financials, concept_brand). The AIReviewModal already groups cards by
// `workspaceLabel` so we set that field instead of building a custom UI.
//
// Source provenance (TIM-1798): we set `provenance: "From: <fileName>"` and
// rely on the modal's existing Link2 badge to render it inline. Low-confidence
// extractions get an amber `[low confidence]` prefix on the field label so the
// reviewer sees the signal without us inventing a new chrome.

export type ExtractionSuite = "business_plan" | "financials" | "concept_brand";
export type ExtractionConfidence = "high" | "medium" | "low";

export interface ExtractedChange {
  suite: ExtractionSuite;
  fieldKey: string;
  fieldLabel: string;
  proposedValue: string;
  sourceFileName: string;
  confidence: ExtractionConfidence;
}

export interface RoutedSuggestion {
  id: string;
  fieldId: string;
  fieldLabel: string;
  originalValue: string;
  proposedValue: string;
  workspaceLabel: string;
  provenance: string;
}

const SUITE_LABEL: Record<ExtractionSuite, string> = {
  business_plan: "Business Plan",
  financials: "Financials",
  concept_brand: "Concept & Brand",
};

export interface SuiteRoutingInput {
  changes: ExtractedChange[];
  /** Existing values keyed by `${suite}:${fieldKey}`. */
  existingValues?: Record<string, string>;
  /** Stable suffix for SuggestionPayload.id — typically the importId. */
  idPrefix?: string;
}

export function routeExtractedChanges(
  input: SuiteRoutingInput,
): RoutedSuggestion[] {
  const { changes, existingValues = {}, idPrefix = "import" } = input;
  return changes.map((c, idx) => {
    const key = `${c.suite}:${c.fieldKey}`;
    const original = existingValues[key] ?? "";
    const labelPrefix = c.confidence === "low" ? "[low confidence] " : "";
    return {
      id: `${idPrefix}-${idx}-${c.suite}-${c.fieldKey}`,
      fieldId: key,
      fieldLabel: `${labelPrefix}${c.fieldLabel}`,
      originalValue: original,
      proposedValue: c.proposedValue,
      workspaceLabel: SUITE_LABEL[c.suite],
      provenance: `From: ${c.sourceFileName}`,
    };
  });
}

/** Group counts per suite, for the review modal's tab badges. */
export function countBySuite(
  changes: ExtractedChange[],
): Record<ExtractionSuite, number> {
  const out: Record<ExtractionSuite, number> = {
    business_plan: 0,
    financials: 0,
    concept_brand: 0,
  };
  for (const c of changes) out[c.suite] += 1;
  return out;
}
