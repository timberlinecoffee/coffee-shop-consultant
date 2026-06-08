// TIM-2453: map an AuditFinding emitted by Plan Quality Check v2 (Check mode)
// to the cross-suite conflict id the resolver uses, so a Check-mode card can
// open CrossSuiteConflictResolverModal on the same conflict the workspace
// badges in Hiring/Financials point at.
//
// Per spec: only pairs the resolver actually registers today are mapped here.
// Findings with no resolver entry return null — the Check-mode card keeps its
// existing Apply / Go-to-source behavior and there is no "default conflict"
// fallback. As more resolvers register (TIM-2426 §11 follow-ups for menu↔
// financials, equipment↔buildout, hiring start↔opening), add their (audit-id
// → conflict-id) pairs to this table alongside the resolver registration.
//
// Relative imports / no @/ aliases — node:test loads this module without the
// Next.js resolver, matching plan-state.ts / audit.ts conventions.
//
// Resolver registry today: src/app/api/copilot/cross-suite-resolver/route.ts
//   - hiring_financials_headcount  ← detectHiringFinancialsConflict()
//   - menu_ticket_mismatch         ← detectMenuTicketMismatch() (TIM-2482)
//   - equipment_mismatch           ← detectEquipmentMismatch()  (TIM-2481)

import type { AuditFinding } from "../business-plan/audit.ts";

// Audit-finding id → resolver conflict id. Keyed by AuditFinding.id so the
// match is byte-stable across runs and survives wording edits to messages.
const AUDIT_FINDING_TO_CONFLICT_ID: Readonly<Record<string, string>> = {
  "src:headcount_mismatch": "hiring_financials_headcount",
  // TIM-2482 (F13): menu blended ticket drifts from Forecast Inputs avg ticket.
  // This is the BLEND mismatch (popularity-weighted vs forecast), not the
  // structural range checks src:menu_ticket_below_min / above_basket — those
  // remain Apply / Go-to-source only (no resolver, no entry here).
  "src:menu_ticket_blend_mismatch": "menu_ticket_mismatch",
  // TIM-2481 (F12): buildout grid total vs Financials startup_costs.equipment.
  // The audit emits src:capex_equipment_mismatch (source-suite-checks Check 2)
  // when the per-item equipment list and the lump-sum capex line disagree by
  // more than max($100, 1% of capex). The resolver shows side-by-side totals
  // and offers a sync path.
  "src:capex_equipment_mismatch": "equipment_mismatch",
};

export function crossSuiteConflictIdForAuditFinding(
  finding: Pick<AuditFinding, "id" | "rule_id">,
): string | null {
  if (finding.rule_id !== "cross_suite_mismatch") return null;
  return AUDIT_FINDING_TO_CONFLICT_ID[finding.id] ?? null;
}
