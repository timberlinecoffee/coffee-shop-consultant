// TIM-4101 (T1-A): the one place a conflict — from either detector — is turned
// into something Home can render, and the one place we decide whether a plan
// is actually known to be clean.
//
// Split out of plan-overview.ts on purpose: everything here is pure, so it is
// directly unit-testable under `npm test` (node:test + --experimental-strip-
// types cannot load plan-overview.ts, which pulls in the supabase client).
//
// Background. Before this change Home derived "Your plan looks good" from a
// cached business-plan self-consistency report, while each workspace ran a
// separate set of live cross-suite detectors behind its amber "Resolve plan
// conflict" badge. Both were individually correct and neither included the
// other, so Home could render a green all-clear at the same moment Financials
// showed a conflict. Both now flow through this module.

import type { CrossSuiteConflict } from "@/lib/cross-suite/types";

// Where a conflict was found. "plan_sections" is the cached business-plan
// self-consistency report; "cross_suite" is the live detector set that also
// powers the in-workspace badge.
export type ConflictSource = "plan_sections" | "cross_suite";

export interface ConflictItem {
  id: string;
  sectionLabel: string;
  description: string;
  suggestion: string;
  href: string | null;
  // Human-readable name of the screen the conflict lives on, e.g.
  // "Financials". Home uses this to name the destination instead of sending
  // the owner off to hunt for it.
  workspace: string;
  source: ConflictSource;
}

// The health card is three-state, not two. A plan that has never been checked
// is NOT healthy, and must not render the green all-clear.
//   - "unchecked": no conflict check has produced a usable result yet.
//   - "clean":     a check ran and found nothing.
//   - "conflicts": at least one conflict from either detector.
export type ConflictCheckState = "unchecked" | "clean" | "conflicts";

export const AUDIT_WORKSPACE_HREF: Record<string, string> = {
  "financials": "/workspace/financials",
  "real-estate": "/workspace/location-lease",
  "labor": "/workspace/hiring",
  "hiring": "/workspace/hiring",
  "buildout-equipment": "/workspace/buildout-equipment",
  "menu-pricing": "/workspace/menu-pricing",
  "launch-plan": "/workspace/launch-plan",
  "business-plan": "/workspace/business-plan",
  "location-lease": "/workspace/location-lease",
};

export function hrefForAuditWorkspace(workspace: string): string | null {
  return AUDIT_WORKSPACE_HREF[workspace] ?? null;
}

// Map a live cross-suite conflict onto the same ConflictItem shape Home
// already renders. The detector's own suiteA is the screen the owner should
// open first — it is the side the recommended fix edits.
export function crossSuiteToConflict(
  conflict: CrossSuiteConflict
): ConflictItem {
  const primary = conflict.suiteA;
  const other = conflict.suiteB;
  const recommended =
    conflict.paths.find((p) => p.id === conflict.recommendedPathId) ??
    conflict.paths[0] ??
    null;
  const href =
    primary.deepLinkHref ??
    hrefForAuditWorkspace(primary.suiteKey) ??
    other.deepLinkHref ??
    hrefForAuditWorkspace(other.suiteKey);
  const description = conflict.gapLabel
    ? `${conflict.statement} (${conflict.gapLabel})`
    : conflict.statement;
  return {
    // Namespaced so a cross-suite id can never collide with an audit finding id.
    id: `cross_suite:${conflict.id}`,
    sectionLabel: `${primary.suiteLabel} vs ${other.suiteLabel}`,
    description,
    suggestion:
      recommended?.summary ??
      recommended?.label ??
      `Open ${primary.suiteLabel} to reconcile these two numbers.`,
    href,
    workspace: primary.suiteLabel,
    source: "cross_suite",
  };
}

// The three-state rule, isolated so it is directly testable. checkRan is false
// when no cached self-consistency report exists AND the live cross-suite pass
// could not be completed — in that case we genuinely do not know the plan is
// clean, so we must not claim it is.
export function deriveConflictCheckState(
  conflictCount: number,
  checkRan: boolean
): ConflictCheckState {
  if (conflictCount > 0) return "conflicts";
  return checkRan ? "clean" : "unchecked";
}
