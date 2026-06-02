// TIM-1798: Coordinated cross-workspace apply.
//
// When the owner asks Scout — from one workspace — to make a change that spans
// suites (e.g. repricing the espresso machine in Equipment & Supplies, which
// also moves the Financials equipment line and the startup-cost total), Scout
// must surface the FULL set of changes across workspaces in ONE review proposal
// and apply them coherently on confirm. Never auto-applied (per
// [[feedback_ai_never_auto_apply]]): the owner reviews every change first.
//
// ── Shared mirror registry (the TIM-1638 / TIM-1688 guardrail) ────────────────
// CROSS_WORKSPACE_MIRRORS is the single declaration of WHICH fields mirror each
// other across workspaces, so the consistency engine (src/lib/cross-workspace-
// sync.ts) and this cross-workspace apply path agree on one source of truth.
//
// For equipment cost the relationship is one-way DERIVED (TIM-1253, see
// docs/CROSS-COMPONENT-SYNC.md §1): the equipment item's unit cost is the single
// writable home; the Financials equipment capex line and the total equipment
// capex are COMPUTED from it at load time. So a coordinated proposal carries ONE
// editable primary change (the equipment item) plus the dependent Financials
// figures as LINKED, read-only cards that update together with it.
//
// This module is PURE — no DB, no I/O, no React. The stream route reads current
// equipment state and calls buildEquipmentCostProposal; CoPilotDrawer applies
// the accepted primary via the existing equipment write endpoint; AIReviewModal
// renders the cards and recomputes the linked figures (recomputeEquipmentLinked)
// when the owner edits the primary price.

import { formatFactValue } from "./cross-workspace-sync.ts";

// ── Workspace identity ────────────────────────────────────────────────────────

export const EQUIPMENT_WORKSPACE_KEY = "buildout_equipment";
export const FINANCIALS_WORKSPACE_KEY = "financials";
export const EQUIPMENT_WORKSPACE_LABEL = "Equipment & Supplies";
export const FINANCIALS_WORKSPACE_LABEL = "Financials";

// ── Mirror registry ───────────────────────────────────────────────────────────

export interface CrossWorkspaceMirror {
  id: string;
  label: string;
  // The workspace + field that owns the writable value.
  source: { workspaceKey: string; workspaceLabel: string; field: string };
  // Workspaces that DERIVE from the source (one-way, recomputed on load). These
  // are surfaced in review as linked figures; they are never written directly.
  derived: Array<{ workspaceKey: string; workspaceLabel: string; field: string }>;
}

export const CROSS_WORKSPACE_MIRRORS: CrossWorkspaceMirror[] = [
  {
    id: "equipment_cost",
    label: "Equipment Cost",
    source: {
      workspaceKey: EQUIPMENT_WORKSPACE_KEY,
      workspaceLabel: EQUIPMENT_WORKSPACE_LABEL,
      field: "unit_cost_cents",
    },
    derived: [
      // Financials capex synthetic line for this item (TIM-1253).
      { workspaceKey: FINANCIALS_WORKSPACE_KEY, workspaceLabel: FINANCIALS_WORKSPACE_LABEL, field: "equipment_capex_line" },
      // Total equipment capex / startup equipment cost rollup.
      { workspaceKey: FINANCIALS_WORKSPACE_KEY, workspaceLabel: FINANCIALS_WORKSPACE_LABEL, field: "total_equipment_capex" },
    ],
  },
];

// Provenance label shown on every derived card — matches the platform standard
// in docs/CROSS-COMPONENT-SYNC.md ("Synced from <source>").
export const EQUIPMENT_PROVENANCE = "Synced from Equipment";

// ── Inputs ────────────────────────────────────────────────────────────────────

// Minimal equipment row needed to compute the derived figures. The data layer
// (stream route) supplies the plan's current non-archived items.
export interface EquipmentCostItem {
  id: string;
  name: string;
  quantity: number;
  unit_cost_cents: number;
}

export type EquipmentCostAction = "reprice" | "add";

// The change Scout's propose_equipment_change tool produced.
export interface EquipmentCostChange {
  action: EquipmentCostAction;
  // reprice: the existing item being changed; add: null.
  item_id?: string | null;
  name: string;
  // add only: equipment category for the new item.
  category?: string | null;
  quantity: number;
  new_unit_cost_cents: number;
}

// ── Output card shape ─────────────────────────────────────────────────────────

// Machine-readable params carried on the primary card so the modal can recompute
// the linked Financials figures client-side when the owner edits the price —
// no server round-trip, fully serializable.
export interface EquipmentRecomputeParams {
  quantity: number;
  // Total equipment capex EXCLUDING the item being changed. new total =
  // baseTotalCents + newUnitCost * quantity.
  baseTotalCents: number;
  lineDerivedId: string;
  totalDerivedId: string;
}

// Superset of AIReviewModal's SuggestionPayload: adds the target workspace and
// the linked/derived treatment. Backward-compatible — the extra fields are
// optional, so single-workspace proposals keep working unchanged.
export interface CrossWorkspaceSuggestion {
  id: string;
  fieldId: string;
  fieldLabel: string;
  originalValue: string;
  proposedValue: string;
  isStructured?: boolean;
  workspaceKey: string;
  workspaceLabel: string;
  // true = linked figure, recomputed from the primary, not separately editable.
  derived?: boolean;
  // shown on derived cards (e.g. "Synced from Equipment").
  provenance?: string;
  // present only on the editable primary card.
  recompute?: EquipmentRecomputeParams;
}

// fieldId prefix the apply handler keys on to route the write to the equipment
// API. The remainder is JSON metadata — parse with slice, not split, because the
// JSON itself contains colons.
export const EQUIPMENT_COST_FIELD_PREFIX = "equipment-cost:";

export interface EquipmentCostApplyMeta {
  action: EquipmentCostAction;
  item_id: string | null;
  name: string;
  category: string | null;
  quantity: number;
}

function lineValueCents(unitCostCents: number, quantity: number): number {
  return Math.max(0, Math.round(unitCostCents)) * Math.max(1, Math.round(quantity));
}

// ── Proposal builder ──────────────────────────────────────────────────────────

// Build the coordinated set of cross-workspace changes for an equipment-cost
// change. Returns the editable primary equipment card plus the linked Financials
// line + total cards. Pure: no I/O.
export function buildEquipmentCostProposal(args: {
  change: EquipmentCostChange;
  currentItems: EquipmentCostItem[];
}): { suggestions: CrossWorkspaceSuggestion[]; context: { workspace: string; section?: string } } {
  const { change, currentItems } = args;
  const quantity = Math.max(1, Math.round(change.quantity || 1));
  const newUnitCost = Math.max(0, Math.round(change.new_unit_cost_cents));

  // Existing item (reprice) — match by id, fall back to name (model may pass the
  // index-resolved id; name is the resilient backstop).
  const existing =
    change.action === "reprice"
      ? currentItems.find((i) => i.id === change.item_id) ??
        currentItems.find((i) => i.name.trim().toLowerCase() === change.name.trim().toLowerCase())
      : undefined;

  const itemId = existing?.id ?? null;
  const oldUnitCost = existing ? existing.unit_cost_cents : 0;
  const oldQty = existing ? existing.quantity : quantity;
  const oldLineCents = existing ? lineValueCents(oldUnitCost, oldQty) : 0;
  const newLineCents = lineValueCents(newUnitCost, quantity);

  // Old total equipment capex across all current items.
  const oldTotalCents = currentItems.reduce(
    (sum, i) => sum + lineValueCents(i.unit_cost_cents, i.quantity),
    0,
  );
  // Base total excludes the item being changed; the new total re-adds it at the
  // proposed price. For an add, the item isn't in currentItems so base == old.
  const baseTotalCents = oldTotalCents - oldLineCents;
  const newTotalCents = baseTotalCents + newLineCents;

  const idSuffix = itemId ?? "new";
  const lineDerivedId = `eq-cost-fin-line-${idSuffix}`;
  const totalDerivedId = `eq-cost-fin-total`;

  const meta: EquipmentCostApplyMeta = {
    action: change.action,
    item_id: itemId,
    name: change.name,
    category: change.category ?? null,
    quantity,
  };

  const fmt = (cents: number) => formatFactValue("currency_cents", cents);

  // 1. Primary equipment change — editable (the owner can adjust the price).
  const primary: CrossWorkspaceSuggestion = {
    id: `eq-cost-${idSuffix}`,
    fieldId: EQUIPMENT_COST_FIELD_PREFIX + JSON.stringify(meta),
    fieldLabel:
      change.action === "add"
        ? `Add ${change.name} (Unit Cost)`
        : `${change.name} Unit Cost`,
    originalValue: existing ? fmt(oldUnitCost) : "Not on the list yet",
    proposedValue: fmt(newUnitCost),
    isStructured: false,
    workspaceKey: EQUIPMENT_WORKSPACE_KEY,
    workspaceLabel: EQUIPMENT_WORKSPACE_LABEL,
    recompute: { quantity, baseTotalCents, lineDerivedId, totalDerivedId },
  };

  // 2. Derived Financials equipment line for this item (linked, read-only).
  const linkedLine: CrossWorkspaceSuggestion = {
    id: lineDerivedId,
    fieldId: "derived",
    fieldLabel: `${change.name} Equipment Line`,
    originalValue: fmt(oldLineCents),
    proposedValue: fmt(newLineCents),
    isStructured: false,
    workspaceKey: FINANCIALS_WORKSPACE_KEY,
    workspaceLabel: FINANCIALS_WORKSPACE_LABEL,
    derived: true,
    provenance: EQUIPMENT_PROVENANCE,
  };

  // 3. Derived total equipment capex / startup equipment cost (linked, read-only).
  const linkedTotal: CrossWorkspaceSuggestion = {
    id: totalDerivedId,
    fieldId: "derived",
    fieldLabel: "Total Equipment Cost (Startup)",
    originalValue: fmt(oldTotalCents),
    proposedValue: fmt(newTotalCents),
    isStructured: false,
    workspaceKey: FINANCIALS_WORKSPACE_KEY,
    workspaceLabel: FINANCIALS_WORKSPACE_LABEL,
    derived: true,
    provenance: EQUIPMENT_PROVENANCE,
  };

  return {
    suggestions: [primary, linkedLine, linkedTotal],
    context: {
      workspace: EQUIPMENT_WORKSPACE_KEY,
      section:
        change.action === "add"
          ? `Adding ${change.name} across Equipment & Financials`
          : `Repricing ${change.name} across Equipment & Financials`,
    },
  };
}

// ── Client-side recompute of linked figures ───────────────────────────────────

// Given the recompute params from the primary card and a new unit cost (cents),
// return the updated proposed values for the linked Financials cards. Pure and
// serializable — used by AIReviewModal when the owner edits the primary price so
// the dependent figures stay coherent. Returns one entry per linked card id.
export function recomputeEquipmentLinked(
  params: EquipmentRecomputeParams,
  newUnitCostCents: number,
): Array<{ id: string; proposedValue: string }> {
  const newUnitCost = Math.max(0, Math.round(newUnitCostCents));
  const newLineCents = lineValueCents(newUnitCost, params.quantity);
  const newTotalCents = params.baseTotalCents + newLineCents;
  const fmt = (cents: number) => formatFactValue("currency_cents", cents);
  return [
    { id: params.lineDerivedId, proposedValue: fmt(newLineCents) },
    { id: params.totalDerivedId, proposedValue: fmt(newTotalCents) },
  ];
}

// Parse the apply metadata back out of a primary card's fieldId. Returns null
// when the fieldId is not an equipment-cost change.
export function parseEquipmentCostFieldId(fieldId: string): EquipmentCostApplyMeta | null {
  if (!fieldId.startsWith(EQUIPMENT_COST_FIELD_PREFIX)) return null;
  try {
    return JSON.parse(fieldId.slice(EQUIPMENT_COST_FIELD_PREFIX.length)) as EquipmentCostApplyMeta;
  } catch {
    return null;
  }
}
