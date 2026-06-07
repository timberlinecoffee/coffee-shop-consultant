// TIM-2426: Cross-Suite Conflict Resolver — shared types.
//
// Built from the TIM-2425 UX spec §6 "Component Architecture". The shell
// (Modal zones 1, 2, 5) is identical across every pair the consistency engine
// already detects; only zones 3 (benchmark) and 4 (paths) vary per pair. So
// every detector emits the same CrossSuiteConflict shape and the same modal
// renders it.

import type { SuggestionPayload } from "@/components/ai-assist/AIReviewModal";

// kind:
//   - "numeric": two suites disagree on the same number (hiring↔financials
//     headcount/payroll, equipment↔buildout cost, menu↔ticket COGS rate).
//   - "coverage": one suite implies labor/time another cannot satisfy
//     (operating hours↔staffing).
//   - "temporal": one suite's timeline contradicts a dependency in another
//     suite (launch plan↔hiring start dates).
export type CrossSuiteConflictKind = "numeric" | "coverage" | "temporal";

// One side of the conflict — snapshot the modal renders in zone 2.
export interface CrossSuiteSnapshot {
  // Slug of the workspace this fact lives in. Matches the audit's source.workspace
  // values (hiring, financials, buildout-equipment, menu-pricing, launch-plan,
  // location-lease) so deep-links and route handlers share a vocabulary.
  suiteKey: string;
  // Display label for the suite, e.g. "Hiring & Onboarding".
  suiteLabel: string;
  // Field-level label rendered above the value, e.g. "People planned".
  fieldLabel: string;
  // Human-formatted value the modal shows. Detector decides the format so the
  // shell never has to know units.
  displayValue: string;
  // Optional secondary line under the value (e.g. monthly payroll subtotal).
  displaySubvalue?: string;
  // Deep link to the source-of-truth field in the workspace, if known.
  deepLinkHref?: string;
}

// Optional benchmark context the modal renders in zone 3. Detector returns null
// when no public-industry benchmark applies to this pair — modal hides zone 3
// rather than inventing one.
export interface CrossSuiteBenchmark {
  label: string;                // "Specialty shops at your revenue level typically spend"
  rangeLabel: string;           // "28% to 35%"
  rangeMin: number;             // numeric floor in the benchmark's unit (e.g. 0.28)
  rangeMax: number;             // numeric ceiling (e.g. 0.35)
  currentValue: number;         // where the user's plan sits (e.g. 0.398)
  currentLabel: string;         // "Your plan: 39.8%"
  // Concrete dollar/count anchors so the modal can render the band as
  // "$14,560 – $18,200" instead of just percentages.
  anchorMinLabel?: string;      // "$14,560/month"
  anchorMaxLabel?: string;      // "$18,200/month"
  source: string;               // e.g. "Specialty Coffee Association cafe benchmarking"
}

// Severity for a single downstream effect row. Matches the existing
// ValidationFinding.severity vocabulary so visual treatment carries over.
export type DownstreamEffectRisk = "info" | "warn" | "block";

export interface DownstreamEffect {
  suite: string;                // human label of the affected suite
  field: string;                // human label of the affected field
  from: string;                 // formatted current value
  to: string;                   // formatted proposed value
  risk?: DownstreamEffectRisk;  // optional flag
  note?: string;                // optional short reason ("outside benchmark range")
}

// One resolution option. The shell renders a card per path. Acceptance routes
// through the existing AIReviewModal — no path writes directly (standing rule
// per ai_never_auto_apply feedback memory).
export interface ResolutionPath {
  id: string;
  label: string;                // "Trim the hiring plan to match your budget"
  summary: string;              // one-sentence description
  downstreamEffects: DownstreamEffect[];
  // SuggestionPayload[] handed to AIReviewModal when the user accepts this
  // path. These carry the per-field originalValue/proposedValue diffs the
  // owner accepts or rejects card-by-card. fieldId conventions:
  //   - "cross_suite:<conflictId>:<pathId>:<suiteKey>:<recordId>:<column>"
  //     so the apply route can decode where to write.
  suggestions: SuggestionPayload[];
}

// The fully-formed conflict the modal renders. One object per conflict; an
// API response is CrossSuiteConflict[].
export interface CrossSuiteConflict {
  id: string;                   // stable id, e.g. "hiring_financials_headcount"
  kind: CrossSuiteConflictKind;
  // Plain-language statement (zone 1). Voice mandate: no em dashes, no
  // "leverage/unlock/elevate", leads with the owner's situation.
  statement: string;
  suiteA: CrossSuiteSnapshot;
  suiteB: CrossSuiteSnapshot;
  // Optional third snapshot for three-way conflicts (spec §9 edge case). Most
  // pairs only set suiteA/suiteB.
  suiteC?: CrossSuiteSnapshot;
  // Optional gap summary, e.g. "Gap: $6,100/month over budget".
  gapLabel?: string;
  // Optional headline-grade alert surfaced above the snapshots. Used when a
  // benchmark band breach exists and would otherwise read as exonerated by a
  // dollar-slack gap label. Voice: leads with the problem, names the source.
  bandBreachAlert?: string;
  benchmark: CrossSuiteBenchmark | null;
  paths: ResolutionPath[];
  // id of the path the modal marks "Recommended". MUST match a paths[].id.
  recommendedPathId: string;
}

// API response shape.
export interface CrossSuiteConflictsResponse {
  conflicts: CrossSuiteConflict[];
}
