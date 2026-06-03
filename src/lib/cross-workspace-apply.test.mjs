// TIM-1798: contract tests for the coordinated cross-workspace apply engine.
// Pins the build → recompute → parse loop the copilot stream route, CoPilotDrawer
// apply path, and AIReviewModal linked-recompute depend on.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CROSS_WORKSPACE_MIRRORS,
  EQUIPMENT_COST_FIELD_PREFIX,
  EQUIPMENT_PROVENANCE,
  buildEquipmentCostProposal,
  recomputeEquipmentLinked,
  parseEquipmentCostFieldId,
  isEquipmentCostChangeIntent,
} from "./cross-workspace-apply.ts";

const ITEMS = [
  { id: "espresso-1", name: "Espresso Machine", quantity: 1, unit_cost_cents: 900_000 },
  { id: "grinder-1", name: "Grinder", quantity: 2, unit_cost_cents: 120_000 },
];

// ── Intent gate (regression: the flagship prompt MUST match) ──────────────────

test("intent gate matches the flagship reprice prompts", () => {
  // The exact prompt that silently failed the old \b$ / \bcost\b regex on prod.
  assert.equal(
    isEquipmentCostChangeIntent(
      "In my equipment list, reprice the espresso machine to $11,000 and update my financials and startup costs to match.",
    ),
    true,
  );
  assert.equal(isEquipmentCostChangeIntent("make the espresso machine cost $11,000"), true);
  assert.equal(isEquipmentCostChangeIntent("lower the grinder cost to $1,200"), true);
  assert.equal(isEquipmentCostChangeIntent("set the espresso machine price to 9500 dollars"), true);
  assert.equal(isEquipmentCostChangeIntent("add a $5000 cold brew tank"), true);
  assert.equal(isEquipmentCostChangeIntent("buy a new espresso machine"), true);
});

test("intent gate does NOT fire on questions or unrelated asks", () => {
  assert.equal(isEquipmentCostChangeIntent("what's the espresso machine price?"), false);
  assert.equal(isEquipmentCostChangeIntent("how much does the grinder cost right now?"), false);
  assert.equal(isEquipmentCostChangeIntent("reorganize my equipment by station"), false);
  assert.equal(isEquipmentCostChangeIntent("write me a latte recipe"), false);
});

// ── Registry integrity ────────────────────────────────────────────────────────

test("mirror registry declares the equipment_cost mirror (shared source of truth)", () => {
  const m = CROSS_WORKSPACE_MIRRORS.find((x) => x.id === "equipment_cost");
  assert.ok(m, "equipment_cost mirror must exist");
  assert.equal(m.source.workspaceKey, "buildout_equipment");
  assert.equal(m.source.field, "unit_cost_cents");
  // Two Financials-derived figures: the line item and the total rollup.
  assert.equal(m.derived.length, 2);
  assert.ok(m.derived.every((d) => d.workspaceKey === "financials"));
});

// ── Reprice proposal ──────────────────────────────────────────────────────────

test("reprice produces one editable primary + two linked derived cards", () => {
  const { suggestions, context } = buildEquipmentCostProposal({
    change: {
      action: "reprice",
      item_id: "espresso-1",
      name: "Espresso Machine",
      quantity: 1,
      new_unit_cost_cents: 1_100_000,
    },
    currentItems: ITEMS,
  });

  assert.equal(suggestions.length, 3);
  assert.equal(context.workspace, "buildout_equipment");

  const [primary, line, total] = suggestions;

  // Primary: editable equipment write, no derived flag, carries recompute params.
  assert.equal(primary.workspaceKey, "buildout_equipment");
  assert.ok(!primary.derived);
  assert.ok(primary.fieldId.startsWith(EQUIPMENT_COST_FIELD_PREFIX));
  assert.equal(primary.originalValue, "$9,000");
  assert.equal(primary.proposedValue, "$11,000");
  assert.ok(primary.recompute);

  // Linked Financials line: derived, read-only (fieldId "derived"), provenance.
  assert.equal(line.workspaceKey, "financials");
  assert.equal(line.derived, true);
  assert.equal(line.fieldId, "derived");
  assert.equal(line.provenance, EQUIPMENT_PROVENANCE);
  assert.equal(line.originalValue, "$9,000");
  assert.equal(line.proposedValue, "$11,000");

  // Linked total: old 9,000 + (2 * 1,200) grinder = 11,400 -> new 11,000 + 2,400 = 13,400.
  assert.equal(total.derived, true);
  assert.equal(total.originalValue, "$11,400");
  assert.equal(total.proposedValue, "$13,400");
});

test("reprice with quantity > 1 multiplies the line and total correctly", () => {
  const { suggestions } = buildEquipmentCostProposal({
    change: {
      action: "reprice",
      item_id: "grinder-1",
      name: "Grinder",
      quantity: 2,
      new_unit_cost_cents: 150_000,
    },
    currentItems: ITEMS,
  });
  const [primary, line, total] = suggestions;
  assert.equal(primary.proposedValue, "$1,500"); // unit cost
  assert.equal(line.originalValue, "$2,400"); // 2 * 1,200
  assert.equal(line.proposedValue, "$3,000"); // 2 * 1,500
  // total old = 9,000 + 2,400 = 11,400; new = 9,000 + 3,000 = 12,000.
  assert.equal(total.originalValue, "$11,400");
  assert.equal(total.proposedValue, "$12,000");
});

test("reprice with no stated quantity preserves the existing item quantity", () => {
  // Mirrors the prod case: a $24,000 ×3 espresso machine repriced to $11,000 with
  // no quantity in the tool call must keep ×3 (line and total use the existing qty).
  const items = [
    { id: "esp", name: "Commercial Espresso Machine", quantity: 3, unit_cost_cents: 2_400_000 },
    { id: "g", name: "Grinder", quantity: 1, unit_cost_cents: 90_000 },
  ];
  const { suggestions } = buildEquipmentCostProposal({
    change: { action: "reprice", item_id: "esp", name: "Commercial Espresso Machine", new_unit_cost_cents: 1_100_000 },
    currentItems: items,
  });
  const [primary, line, total] = suggestions;
  assert.equal(primary.proposedValue, "$11,000"); // unit cost
  assert.equal(line.originalValue, "$72,000"); // 2,400,000 * 3
  assert.equal(line.proposedValue, "$33,000"); // 1,100,000 * 3  (NOT $11,000)
  // total old = 72,000 + 900 = 72,900 -> new = 33,000 + 900 = 33,900
  assert.equal(total.originalValue, "$72,900");
  assert.equal(total.proposedValue, "$33,900");
  // recompute params carry the preserved quantity (3).
  assert.equal(primary.recompute.quantity, 3);
});

// ── Add proposal ──────────────────────────────────────────────────────────────

test("add produces a primary with no existing value and grows the total", () => {
  const { suggestions, context } = buildEquipmentCostProposal({
    change: {
      action: "add",
      name: "Cold Brew Tank",
      category: "refrigeration",
      quantity: 1,
      new_unit_cost_cents: 200_000,
    },
    currentItems: ITEMS,
  });
  const [primary, line, total] = suggestions;
  assert.match(primary.fieldLabel, /Add Cold Brew Tank/);
  assert.equal(primary.originalValue, "Not on the list yet");
  assert.equal(primary.proposedValue, "$2,000");
  assert.equal(line.originalValue, "$0");
  assert.equal(line.proposedValue, "$2,000");
  // total old 11,400 -> new 13,400.
  assert.equal(total.originalValue, "$11,400");
  assert.equal(total.proposedValue, "$13,400");
  assert.match(context.section, /Adding Cold Brew Tank/);
});

// ── Live recompute (modal edits the primary price) ─────────────────────────────

test("recomputeEquipmentLinked recomputes line + total from an edited price", () => {
  const { suggestions } = buildEquipmentCostProposal({
    change: {
      action: "reprice",
      item_id: "espresso-1",
      name: "Espresso Machine",
      quantity: 1,
      new_unit_cost_cents: 1_100_000,
    },
    currentItems: ITEMS,
  });
  const primary = suggestions[0];
  // Owner edits the price down to $9,500.
  const updates = recomputeEquipmentLinked(primary.recompute, 950_000);
  const byId = new Map(updates.map((u) => [u.id, u.proposedValue]));
  assert.equal(byId.get(primary.recompute.lineDerivedId), "$9,500");
  // total = base (grinder 2,400) + 9,500 = 11,900.
  assert.equal(byId.get(primary.recompute.totalDerivedId), "$11,900");
});

// ── fieldId round-trip ─────────────────────────────────────────────────────────

test("parseEquipmentCostFieldId round-trips the apply metadata", () => {
  const { suggestions } = buildEquipmentCostProposal({
    change: {
      action: "reprice",
      item_id: "espresso-1",
      name: "Espresso Machine",
      quantity: 1,
      new_unit_cost_cents: 1_100_000,
    },
    currentItems: ITEMS,
  });
  const meta = parseEquipmentCostFieldId(suggestions[0].fieldId);
  assert.ok(meta);
  assert.equal(meta.action, "reprice");
  assert.equal(meta.item_id, "espresso-1");
  assert.equal(meta.quantity, 1);
  assert.equal(parseEquipmentCostFieldId("derived"), null);
  assert.equal(parseEquipmentCostFieldId("equipment-item:x:y:0"), null);
});

test("reprice falls back to name match when item_id is missing", () => {
  const { suggestions } = buildEquipmentCostProposal({
    change: {
      action: "reprice",
      item_id: null,
      name: "espresso machine", // case-insensitive
      quantity: 1,
      new_unit_cost_cents: 1_000_000,
    },
    currentItems: ITEMS,
  });
  const meta = parseEquipmentCostFieldId(suggestions[0].fieldId);
  assert.equal(meta.item_id, "espresso-1");
  assert.equal(suggestions[0].originalValue, "$9,000");
});
