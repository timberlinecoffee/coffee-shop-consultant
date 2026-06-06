// TIM-2356: Plan Quality Check — audit engine.
//
// The audit aggregates every validator already in the system (TIM-2336 numeric
// reconciliation, Pass 2 qualitative critic, TIM-2340 local-claims, TIM-2342
// estimate-class claims, TIM-2343 self-consistency contradictions) and emits a
// single normalized `AuditFinding` shape the report UI can render directly.
//
// Severity collapse — the UX spec uses three levels keyed to owner outcomes:
//   critical → "Fix Before Launch"  (blocking numeric/sign mismatches)
//   warning  → "Worth a Look"        (Pass 2 contradictions/credibility,
//                                     fabricated local claims, self-consistency)
//   info     → "Heads-Up"            (typos, boilerplate, estimate-class claims)
//
// Per Rule 3: every string field that goes into a user-facing surface MUST go
// through stripFindingTags() before render. The route applies it once on
// `raw_message` and `quoted_text` so downstream surfaces don't need to re-sanitize.
//
// Relative imports / no @/ aliases — node:test loads this module without the
// Next.js resolver, matching plan-state.ts / validate.ts conventions.

import type {
  NumericFinding,
  QualitativeFinding,
  ValidationEstimatedClaim,
  ValidationReport,
} from "./validate.ts";
import type { SelfConsistencyContradiction } from "./self-consistency.ts";
import { stripFindingTags } from "./sanitize-finding-text.ts";

// ── Public types ─────────────────────────────────────────────────────────────

export type AuditSeverity = "critical" | "warning" | "info";

export type AuditRuleId =
  | "numeric_mismatch"
  | "sign_mismatch"
  | "contradiction"
  | "credibility"
  | "typo"
  | "boilerplate"
  | "missing_section"
  | "fabricated_local_claim"
  | "geographic_fabrication"
  | "self_consistency"
  | "estimated_claim"
  // TIM-2394 Plan Quality Check v2 — source-suite-only rules.
  | "cross_suite_mismatch"
  | "benchmark_out_of_range";

export interface AuditSourceRef {
  // Canonical workspace key (matches the URL slug in /workspace/*).
  workspace: string;
  // Canonical display name (Equipment, Financials, Business Plan, …).
  workspace_label: string;
  // Optional field reference inside that workspace. For business-plan findings
  // we use the section_key (e.g. "executive-summary"); for cross-workspace
  // mismatches we use the dimension dotted-path (e.g. "lease.monthly_rent").
  field: string | null;
  field_label: string | null;
}

export interface AuditFinding {
  // Stable id reused for cache/dismissal. Hash-friendly + readable.
  id: string;
  rule_id: AuditRuleId;
  severity: AuditSeverity;
  // Source of truth for the validator-emitted message. Always tag-stripped.
  raw_message: string;
  // Verbatim text the narrative used, when relevant. Tag-stripped.
  quoted_text: string | null;
  // The unit the validator used internally — drives synthesis prompt tone.
  units: "currency" | "count" | "percent" | "text" | null;
  // What plan_state expected. Tag-stripped pre-formatted string.
  expected_text: string | null;
  // For numeric findings the validator can sometimes propose a single
  // one-click replacement. Surfaces an "Apply suggestion" button in the UI.
  // null when no clean replacement exists.
  suggested_replacement: string | null;
  // Where this finding originated — drives "Go to source" deep-link.
  source: AuditSourceRef;
  // Where the owner should apply the fix. For most findings source==target
  // (e.g. fix the rent in the Lease workspace). For numeric mismatches the
  // source is the business-plan section but the target is the workspace
  // whose data the narrative misquotes.
  target: AuditSourceRef;
  // Plain-language synthesis fields (populated by audit-synthesis.ts; null
  // until the LLM pass completes — the UI renders raw_message as fallback).
  issue: string | null;
  why_it_matters: string | null;
  suggested_fix: string | null;
}

export interface AuditReport {
  generated_at: string;     // ISO timestamp the report was assembled.
  state_hash: string;        // sha256 of normalized plan-state + section text.
  findings: AuditFinding[];  // Sorted: critical → warning → info, stable within.
  stats: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
}

// ── Workspace / field mapping ────────────────────────────────────────────────

// Maps a plan_state dotted-dim into the workspace + label the owner should open.
// Order matters: longer prefix wins. The fallback is the Financials workspace
// since most quantitative dimensions live there.
const DIM_TO_WORKSPACE: ReadonlyArray<readonly [string, AuditSourceRef]> = [
  ["lease.", { workspace: "real-estate", workspace_label: "Location", field: null, field_label: null }],
  ["capital_stack.", { workspace: "financials", workspace_label: "Financials", field: "capital_stack", field_label: "Capital stack" }],
  ["use_of_funds.", { workspace: "financials", workspace_label: "Financials", field: "use_of_funds", field_label: "Use of funds" }],
  ["opex.", { workspace: "financials", workspace_label: "Financials", field: "opex", field_label: "Operating expenses" }],
  ["labor.", { workspace: "labor", workspace_label: "Labor", field: null, field_label: null }],
  ["year_", { workspace: "financials", workspace_label: "Financials", field: "annual_projections", field_label: "Annual projections" }],
];

// Maps a business-plan section_key to a friendly label for "Go to source".
const SECTION_LABELS: Readonly<Record<string, string>> = {
  "executive-summary": "Executive Summary",
  "opportunity-problem-solution": "Opportunity: Problem & Solution",
  "opportunity-target-market": "Opportunity: Target Market",
  "opportunity-competition": "Opportunity: Competition",
  "execution-marketing-sales": "Execution: Marketing & Sales",
  "execution-operations": "Execution: Operations",
  "execution-milestones-metrics": "Execution: Milestones & Metrics",
  "company-overview": "Company Overview",
  "company-team": "Company: Team",
  "financial-plan-forecast": "Financial Plan: Forecast",
  "financial-plan-financing": "Financial Plan: Financing",
  "financial-plan-statements": "Financial Plan: Statements",
  "appendix-monthly-statements": "Appendix: Monthly Statements",
};

function sourceFromSection(sectionKey: string): AuditSourceRef {
  return {
    workspace: "business-plan",
    workspace_label: "Business Plan",
    field: sectionKey,
    field_label: SECTION_LABELS[sectionKey] ?? sectionKey,
  };
}

function targetFromDimension(dim: string, fallbackSection: string): AuditSourceRef {
  for (const [prefix, target] of DIM_TO_WORKSPACE) {
    if (dim.startsWith(prefix)) return target;
  }
  // Default — point the owner back at the narrative section. Most contradiction
  // fixes are an edit to the prose itself.
  return sourceFromSection(fallbackSection);
}

// Pretty units mapping for synthesis (the prompt uses these labels).
function unitsFromNumeric(units: NumericFinding["units"]): AuditFinding["units"] {
  if (units === "currency" || units === "count" || units === "percent") return units;
  return null;
}

// ── Normalization (one entry point per source validator) ─────────────────────

export function fromNumericFinding(f: NumericFinding): AuditFinding {
  // Numeric and sign mismatches are blocking per validate.ts — they're the
  // ones lenders will catch. Map both to critical.
  const severity: AuditSeverity = "critical";
  const ruleId: AuditRuleId = f.kind === "sign_mismatch" ? "sign_mismatch" : "numeric_mismatch";

  return {
    id: `audit:${f.id}`,
    rule_id: ruleId,
    severity,
    raw_message: stripFindingTags(f.message),
    quoted_text: f.quoted_text ? stripFindingTags(f.quoted_text) : null,
    units: unitsFromNumeric(f.units),
    expected_text: f.expected_text ? stripFindingTags(f.expected_text) : null,
    suggested_replacement: f.suggested_replacement ? stripFindingTags(f.suggested_replacement) : null,
    source: sourceFromSection(f.section_key),
    target: targetFromDimension(f.dimension, f.section_key),
    issue: null,
    why_it_matters: null,
    suggested_fix: null,
  };
}

// Pass 2 qualitative findings map to warning/info based on category. The
// validator never returns severity=blocking here (advisory by spec).
const QUALITATIVE_SEVERITY: Readonly<Record<QualitativeFinding["category"], AuditSeverity>> = {
  contradiction: "warning",
  missing_section: "warning",
  credibility: "warning",
  fabricated_local_claim: "warning",
  geographic_fabrication: "warning",
  boilerplate: "info",
  typo: "info",
  other: "info",
};

const QUALITATIVE_RULE_ID: Readonly<Record<QualitativeFinding["category"], AuditRuleId>> = {
  contradiction: "contradiction",
  missing_section: "missing_section",
  credibility: "credibility",
  fabricated_local_claim: "fabricated_local_claim",
  geographic_fabrication: "geographic_fabrication",
  boilerplate: "boilerplate",
  typo: "typo",
  other: "credibility",
};

export function fromQualitativeFinding(f: QualitativeFinding): AuditFinding {
  const severity = QUALITATIVE_SEVERITY[f.category] ?? "info";
  const ruleId = QUALITATIVE_RULE_ID[f.category] ?? "credibility";
  return {
    id: `audit:${f.id}`,
    rule_id: ruleId,
    severity,
    raw_message: stripFindingTags(f.message),
    quoted_text: f.quoted_text ? stripFindingTags(f.quoted_text) : null,
    units: "text",
    expected_text: null,
    suggested_replacement: null,
    source: sourceFromSection(f.section_key),
    target: sourceFromSection(f.section_key),
    issue: null,
    why_it_matters: null,
    suggested_fix: null,
  };
}

export function fromSelfConsistencyContradiction(
  c: SelfConsistencyContradiction,
): AuditFinding {
  // Self-consistency is always advisory (within-narrative, not vs plan_state).
  // Bump numerical kinds to warning (they can affect lender perception) and
  // categorical/temporal to info.
  const severity: AuditSeverity = c.kind === "numerical" ? "warning" : "info";
  const explanation = stripFindingTags(c.explanation);
  const a = stripFindingTags(c.claim_a);
  const b = stripFindingTags(c.claim_b);
  return {
    id: `audit:${c.id}`,
    rule_id: "self_consistency",
    severity,
    raw_message: `${explanation} You wrote: "${a}" and "${b}".`,
    quoted_text: `"${a}" vs "${b}"`,
    units: "text",
    expected_text: null,
    suggested_replacement: null,
    source: sourceFromSection(c.section_key),
    target: sourceFromSection(c.section_key),
    issue: null,
    why_it_matters: null,
    suggested_fix: null,
  };
}

export function fromEstimatedClaim(c: ValidationEstimatedClaim): AuditFinding {
  const content = stripFindingTags(c.content);
  const hedge = stripFindingTags(c.hedge);
  const surrounding = stripFindingTags(c.surrounding_sentence);
  return {
    id: `audit:${c.id}`,
    rule_id: "estimated_claim",
    severity: "info",
    raw_message: `The narrative hedged "${hedge} ${content}" — no source backs this number. Lenders may flag it as a guess.`,
    quoted_text: surrounding,
    units: "text",
    expected_text: null,
    suggested_replacement: null,
    source: sourceFromSection(c.section_key),
    target: sourceFromSection(c.section_key),
    issue: null,
    why_it_matters: null,
    suggested_fix: null,
  };
}

// ── Top-level builder ────────────────────────────────────────────────────────

export interface BuildAuditFindingsInput {
  report: ValidationReport;
  selfConsistencyContradictions: SelfConsistencyContradiction[];
}

const SEVERITY_ORDER: Readonly<Record<AuditSeverity, number>> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function buildAuditFindings(input: BuildAuditFindingsInput): AuditFinding[] {
  const merged: AuditFinding[] = [];
  for (const f of input.report.numeric_findings) merged.push(fromNumericFinding(f));
  for (const f of input.report.qualitative_findings) merged.push(fromQualitativeFinding(f));
  for (const c of input.selfConsistencyContradictions) merged.push(fromSelfConsistencyContradiction(c));
  for (const c of input.report.estimated_claims ?? []) merged.push(fromEstimatedClaim(c));

  // Stable sort: severity bucket then original order so repeat audits with the
  // same input produce byte-identical output (cache stability).
  return merged
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      const s = SEVERITY_ORDER[a.f.severity] - SEVERITY_ORDER[b.f.severity];
      return s !== 0 ? s : a.i - b.i;
    })
    .map((x) => x.f);
}

export function statsFromFindings(findings: AuditFinding[]): AuditReport["stats"] {
  let critical = 0, warning = 0, info = 0;
  for (const f of findings) {
    if (f.severity === "critical") critical++;
    else if (f.severity === "warning") warning++;
    else info++;
  }
  return { critical, warning, info, total: findings.length };
}

// ── Deterministic fallback synthesis ─────────────────────────────────────────
//
// When the Haiku synthesis pass fails or is skipped (budget cap, network
// abort, rate limit), this fallback fills the three plain-language fields
// from the structured AuditFinding so every card the UI renders has issue +
// why_it_matters + suggested_fix populated. The QA gate requires it.
//
// The phrasing is intentionally generic but specific to the rule_id — it
// gets the user moving even if the LLM step was unavailable.

const RULE_FALLBACK_WHY: Readonly<Record<AuditRuleId, string>> = {
  numeric_mismatch:
    "A number in the narrative does not match what your workspace data shows. Lenders cross-check these and a mismatch erodes trust.",
  sign_mismatch:
    "Your narrative says one direction (profit or loss) but your financials show the other. This is the kind of contradiction a lender will catch on first read.",
  contradiction:
    "Two parts of your plan say different things. A reader can only follow one of them, and either way it weakens your case.",
  credibility:
    "This claim reads as a guess. Investors and lenders skim for sourced numbers; an unbacked one stops them.",
  typo:
    "Small surface issues add up. A few typos make the plan feel rushed.",
  boilerplate:
    "This section reads like a template. Specific, local detail is what makes a plan persuasive.",
  missing_section:
    "Lenders expect this section to be present. Leaving it blank looks like the analysis was not done.",
  fabricated_local_claim:
    "A claim about the local market does not appear to be supported. A lender who knows the area will notice and lose confidence.",
  geographic_fabrication:
    "A neighborhood or address detail does not check out. Lenders local to your market will catch it on first read.",
  self_consistency:
    "Two statements in the same section contradict each other. Either one alone is fine; together they make the plan look hasty.",
  estimated_claim:
    "This number is the generator's estimate, not yours. Replace it with a sourced figure before showing the plan to anyone outside your circle.",
  cross_suite_mismatch:
    "Two of your workspaces describe the same fact differently. Lenders cross-check across the plan and a mismatch reads as carelessness.",
  benchmark_out_of_range:
    "Your number sits outside the industry-typical range a lender expects. They will not always reject it, but they will ask you to defend it.",
};

const RULE_FALLBACK_FIX: Readonly<Record<AuditRuleId, (f: AuditFinding) => string>> = {
  numeric_mismatch: (f) =>
    `Open the ${f.target.workspace_label} workspace, confirm the actual ${f.target.field_label ?? "value"}, then go back to the ${f.source.workspace_label} and fix the ${f.source.field_label ?? "wording"} to match.`,
  sign_mismatch: (f) =>
    `Compare what your ${f.target.workspace_label} workspace shows against the narrative in ${f.source.field_label ?? f.source.workspace_label}. Update whichever side is wrong.`,
  contradiction: (f) =>
    `Re-read the ${f.source.field_label ?? f.source.workspace_label} section and pick one consistent answer. Edit the wording so both parts agree.`,
  credibility: (f) =>
    `Open the ${f.source.field_label ?? f.source.workspace_label} section and either back the claim with a source or remove it.`,
  typo: (f) =>
    `Open the ${f.source.field_label ?? f.source.workspace_label} section and clean up the wording.`,
  boilerplate: (f) =>
    `Open the ${f.source.field_label ?? f.source.workspace_label} section and replace generic language with details specific to your shop and your block.`,
  missing_section: (f) =>
    `Open the ${f.source.field_label ?? f.source.workspace_label} section and fill in the answer based on your own plan.`,
  fabricated_local_claim: (f) =>
    `Open the ${f.source.field_label ?? f.source.workspace_label} section and replace the claim with a specific local detail you can stand behind.`,
  geographic_fabrication: (f) =>
    `Open the ${f.source.field_label ?? f.source.workspace_label} section and fix the address or neighborhood reference so it matches the real map.`,
  self_consistency: (f) =>
    `Open the ${f.source.field_label ?? f.source.workspace_label} section and pick the version that is true. Edit the other line to match.`,
  estimated_claim: (f) =>
    `Open the ${f.source.field_label ?? f.source.workspace_label} section and replace the estimate with a sourced number, or your own.`,
  cross_suite_mismatch: (f) =>
    `Open the ${f.source.workspace_label} workspace, decide which value is correct, then update the ${f.target.workspace_label} workspace so both agree.`,
  benchmark_out_of_range: (f) =>
    `Open the ${f.source.workspace_label} workspace, review the ${f.source.field_label ?? "value"}, and either adjust it or be ready to explain why this plan sits outside the typical range.`,
};

// applyFallbackSynthesis fills issue/why_it_matters/suggested_fix for findings
// whose synthesis pass did not run or returned null. Idempotent — does nothing
// when all three fields are already populated.
export function applyFallbackSynthesis(finding: AuditFinding): void {
  if (finding.issue && finding.why_it_matters && finding.suggested_fix) return;
  if (!finding.issue) finding.issue = finding.raw_message;
  if (!finding.why_it_matters) {
    finding.why_it_matters = RULE_FALLBACK_WHY[finding.rule_id]
      ?? "This is the kind of detail a careful reader of your plan will notice.";
  }
  if (!finding.suggested_fix) {
    const builder = RULE_FALLBACK_FIX[finding.rule_id];
    finding.suggested_fix = builder
      ? builder(finding)
      : `Open the ${finding.source.workspace_label} workspace and review the ${finding.source.field_label ?? "relevant section"}.`;
  }
}
