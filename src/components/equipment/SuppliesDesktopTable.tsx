"use client";

// TIM-2779 (Phase 6): v2 Supplies desktop table.
// TIM-3251: TABLE_ROW_PADDING / TABLE_PRICE_CLS / TABLE_QUICK_ADD_ROW_CLS /
//           TABLE_QUICK_ADD_INPUT_CLS styling tokens; alternating stripe rows;
//           inline quick-add row; nameBold / muted EditableCell variants.
// TIM-3331: Restructured to sections-based layout with SectionHeaderRow,
//           SectionSubtotalRow, GrandTotalRow; per-section add; collapsible
//           sections with localStorage persistence.
// Uses workspace-table.ts canonical tokens. Renders at md+ when ui_revamp_v2 is on.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ListSection, SuppliesItem } from "@/types/buildout";
import { MoneyInput } from "@/components/ui/money-input";
import {
  TABLE_CELL_TEXT,
  TABLE_HEADER_TEXT,
  TABLE_ACTION_ICON_SIZE,
  TABLE_ROW_PADDING,
  TABLE_PRICE_CLS,
  TABLE_QUICK_ADD_ROW_CLS,
  TABLE_QUICK_ADD_INPUT_CLS,
} from "@/lib/workspace-table";
import {
  SectionHeaderRow,
  SectionSubtotalRow,
  GrandTotalRow,
} from "@/lib/workspace-table-rows";
import { formatMinor } from "@/lib/formatters";

const AUTOSAVE_DEBOUNCE_MS = 400;
const SECTION_COLLAPSE_KEY = "tcs-supplies-section-collapse";
const TOTAL_COLS = 8; // name, vendor, unit, qty, unitCost, total, notes, delete

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SECTION_COLLAPSE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch { /* ignore */ }
  return {};
}

function saveCollapsed(v: Record<string, boolean>) {
  try {
    localStorage.setItem(SECTION_COLLAPSE_KEY, JSON.stringify(v));
  } catch { /* ignore */ }
}

interface Props {
  planId: string;
  canEdit: boolean;
  items: SuppliesItem[];
  sections: ListSection[];
  onItemsChange: (items: SuppliesItem[]) => void;
  currencyCode: string;
}

function newBlankItem(
  planId: string,
  position: number,
  sectionId: string | null,
): SuppliesItem {
  return {
    id: `__new_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    plan_id: planId,
    section_id: sectionId,
    name: "",
    vendor: null,
    unit_type: "unit",
    quantity: 1,
    unit_cost_cents: 0,
    source: "user_added",
    notes: null,
    position,
    archived: false,
  };
}

type EditKey = "name" | "vendor" | "unit_type" | "quantity" | "unit_cost_cents" | "notes";

export function SuppliesDesktopTable({
  planId,
  canEdit,
  items,
  sections,
  onItemsChange,
  currencyCode,
}: Props) {
  const [editingCell, setEditingCell] = useState<{ rowId: string; key: EditKey } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingPatches = useRef<Map<string, Partial<SuppliesItem>>>(new Map());
  const creatingRows = useRef<Set<string>>(new Set());

  // TIM-3251: inline quick-add row state.
  const [qaName, setQaName] = useState("");
  const [qaVendor, setQaVendor] = useState("");
  const [qaUnit, setQaUnit] = useState("unit");
  const [qaQty, setQaQty] = useState("1");
  const [qaCost, setQaCost] = useState("");
  const qaNameRef = useRef<HTMLInputElement>(null);

  // Always reflects the latest items so rapid Enter-Enter doesn't read a stale closure.
  const latestItemsRef = useRef(items);
  useEffect(() => { latestItemsRef.current = items; }, [items]);

  useEffect(() => {
    setCollapsed(loadCollapsed());
  }, []);

  useEffect(() => {
    const timers = debounceTimers.current;
    return () => { timers.forEach((t) => clearTimeout(t)); };
  }, []);

  const active = items.filter((i) => !i.archived);
  const grandTotal = active.reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0);

  // Build section list: explicit sections in order, then "Uncategorized" for orphaned items
  const activeSectionIds = new Set(sections.map((s) => s.id));
  const uncategorizedItems = active.filter(
    (i) => !i.section_id || !activeSectionIds.has(i.section_id)
  );
  const sectionsWithItems = sections.filter((s) =>
    active.some((i) => i.section_id === s.id)
  );

  // Ordered display groups: named sections first, then uncategorized
  const displayGroups: Array<{
    id: string;
    label: string;
    items: SuppliesItem[];
    sectionId: string | null;
  }> = [
    ...sectionsWithItems.map((s) => ({
      id: s.id,
      label: s.name,
      items: active.filter((i) => i.section_id === s.id).sort((a, b) => a.position - b.position),
      sectionId: s.id,
    })),
    ...(uncategorizedItems.length > 0
      ? [{
          id: "__uncategorized",
          label: "Uncategorized",
          items: uncategorizedItems.sort((a, b) => a.position - b.position),
          sectionId: null,
        }]
      : []),
  ];

  // ── Section collapse ─────────────────────────────────────────────────────────

  function toggleSection(id: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveCollapsed(next);
      return next;
    });
  }

  // ── API helpers ──────────────────────────────────────────────────────────────

  const createRow = useCallback(async (tempId: string, item: SuppliesItem) => {
    if (creatingRows.current.has(tempId)) return null;
    creatingRows.current.add(tempId);
    try {
      const res = await fetch("/api/workspaces/buildout/supplies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name || "New Item",
          vendor: item.vendor,
          unit_type: item.unit_type,
          quantity: item.quantity,
          unit_cost_cents: item.unit_cost_cents,
          notes: item.notes,
          position: item.position,
          section_id: item.section_id,
        }),
      });
      if (!res.ok) throw new Error(`create failed ${res.status}`);
      return (await res.json()) as SuppliesItem;
    } catch {
      return null;
    } finally {
      creatingRows.current.delete(tempId);
    }
  }, []);

  const patchRow = useCallback(
    async (id: string, patch: Partial<SuppliesItem>, currentItems: SuppliesItem[]) => {
      if (!id || id.startsWith("__new_")) return;
      try {
        const res = await fetch(`/api/workspaces/buildout/supplies/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) return;
        const updated = (await res.json()) as SuppliesItem;
        onItemsChange(currentItems.map((i) => (i.id === id ? updated : i)));
      } catch { /* silent — optimistic UI already applied */ }
    },
    [onItemsChange]
  );

  const deleteRow = useCallback(async (id: string) => {
    if (!id || id.startsWith("__new_")) return;
    try {
      await fetch(`/api/workspaces/buildout/supplies/${id}`, { method: "DELETE" });
    } catch { /* silent */ }
  }, []);

  // ── Autosave ─────────────────────────────────────────────────────────────────

  const scheduleAutosave = useCallback(
    (id: string, patch: Partial<SuppliesItem>, currentItems: SuppliesItem[]) => {
      if (!canEdit) return;
      const existing = pendingPatches.current.get(id) ?? {};
      pendingPatches.current.set(id, { ...existing, ...patch });
      const existingTimer = debounceTimers.current.get(id);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(async () => {
        const accumulated = pendingPatches.current.get(id);
        if (!accumulated) return;
        pendingPatches.current.delete(id);
        if (id.startsWith("__new_")) {
          const current = currentItems.find((i) => i.id === id);
          if (!current) return;
          const created = await createRow(id, { ...current, ...accumulated });
          if (created) onItemsChange(currentItems.map((i) => (i.id === id ? created : i)));
        } else {
          await patchRow(id, accumulated, currentItems);
        }
      }, AUTOSAVE_DEBOUNCE_MS);
      debounceTimers.current.set(id, timer);
    },
    [canEdit, createRow, patchRow, onItemsChange]
  );

  function handleCommit(id: string, key: EditKey, rawValue: unknown) {
    if (!canEdit) return;
    let patch: Partial<SuppliesItem> = {};
    if (key === "name") patch = { name: rawValue as string };
    else if (key === "vendor") patch = { vendor: (rawValue as string) || null };
    else if (key === "unit_type") patch = { unit_type: rawValue as string };
    else if (key === "quantity") patch = { quantity: Math.max(1, parseInt(rawValue as string, 10) || 1) };
    else if (key === "unit_cost_cents") patch = { unit_cost_cents: Math.round((parseFloat(rawValue as string) || 0) * 100) };
    else if (key === "notes") patch = { notes: (rawValue as string) || null };
    const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    onItemsChange(next);
    scheduleAutosave(id, patch, next);
    setEditingCell(null);
  }

  function addItemToSection(sectionId: string | null) {
    if (!canEdit) return;
    const blank = newBlankItem(planId, active.length, sectionId);
    const next = [...items, blank];
    onItemsChange(next);
    // Ensure section is expanded
    const key = sectionId ?? "__uncategorized";
    if (collapsed[key]) toggleSection(key);
    setTimeout(() => setEditingCell({ rowId: blank.id, key: "name" }), 30);
  }

  function deleteSingleRow(id: string) {
    const next = items.filter((i) => i.id !== id);
    onItemsChange(next);
    deleteRow(id);
  }

  // TIM-3251: inline quick-add commit. Uses latestItemsRef so rapid Enter-Enter
  // always reads the most-recently-committed list without waiting for React state.
  function commitQuickAdd() {
    if (!canEdit || !qaName.trim()) return;
    const current = latestItemsRef.current;
    const blank = newBlankItem(planId, current.filter((i) => !i.archived).length, null);
    const qty = Math.max(1, parseInt(qaQty, 10) || 1);
    const costCents = Math.round((parseFloat(qaCost) || 0) * 100);
    const patched: SuppliesItem = {
      ...blank,
      name: qaName.trim(),
      vendor: qaVendor.trim() || null,
      unit_type: qaUnit.trim() || "unit",
      quantity: qty,
      unit_cost_cents: costCents,
    };
    const next = [...current, patched];
    latestItemsRef.current = next;
    onItemsChange(next);
    scheduleAutosave(patched.id, {
      name: patched.name,
      vendor: patched.vendor,
      unit_type: patched.unit_type,
      quantity: patched.quantity,
      unit_cost_cents: patched.unit_cost_cents,
    }, next);
    setQaName(""); setQaVendor(""); setQaUnit("unit"); setQaQty("1"); setQaCost("");
    qaNameRef.current?.focus();
  }

  // TIM-3251: row padding from TABLE_ROW_PADDING (Menu ingredients-tab canon).
  const cellCls = `px-2.5 ${TABLE_ROW_PADDING} ${TABLE_CELL_TEXT} border-r border-[var(--neutral-cool-150)] last:border-r-0 align-middle`;
  const headerCellCls = `px-2.5 py-2.5 text-left ${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] border-r border-[var(--neutral-cool-150)] last:border-r-0 bg-[var(--background)] select-none`;

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      {active.length > 0 && (
        <div className="flex items-center gap-4 px-1 text-xs text-[var(--muted-foreground)]">
          <span>{active.length} item{active.length !== 1 ? "s" : ""}</span>
          <span className="text-[var(--border)]">|</span>
          <span>{displayGroups.length} section{displayGroups.length !== 1 ? "s" : ""}</span>
          <span className="text-[var(--border)]">|</span>
          <span className="font-semibold text-[var(--foreground)]">
            Total: {formatMinor(grandTotal, currencyCode)}
          </span>
        </div>
      )}

      {/* Sectioned table */}
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className={`w-full border-collapse min-w-[700px] ${TABLE_CELL_TEXT}`}
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: 200 }} /> {/* name */}
              <col style={{ width: 130 }} /> {/* vendor */}
              <col style={{ width: 80 }} />  {/* unit */}
              <col style={{ width: 60 }} />  {/* qty */}
              <col style={{ width: 100 }} /> {/* unit cost */}
              <col style={{ width: 100 }} /> {/* total */}
              <col style={{ width: 170 }} /> {/* notes */}
              <col style={{ width: 36 }} />  {/* delete */}
            </colgroup>

            {/* Sticky column headers */}
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[var(--neutral-cool-150)]">
                <th className={headerCellCls}>Name</th>
                <th className={headerCellCls}>Vendor</th>
                <th className={headerCellCls}>Unit</th>
                <th className={headerCellCls}>Qty</th>
                <th className={headerCellCls}>Unit Cost</th>
                <th className={headerCellCls}>Total</th>
                <th className={headerCellCls}>Notes</th>
                <th className={headerCellCls} />
              </tr>
            </thead>

            <tbody>
              {displayGroups.length === 0 && (
                <tr>
                  <td colSpan={TOTAL_COLS} className="py-10 text-center text-sm text-[var(--dark-grey)]">
                    No supplies added yet.
                  </td>
                </tr>
              )}

              {displayGroups.map(({ id, label, items: groupItems, sectionId }) => {
                const isCollapsed = !!collapsed[id];
                const subtotal = groupItems.reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0);

                return (
                  <React.Fragment key={id}>
                    {/* Section header */}
                    <SectionHeaderRow
                      colSpan={TOTAL_COLS}
                      title={label}
                      collapsed={isCollapsed}
                      onToggle={() => toggleSection(id)}
                      onAddItem={() => addItemToSection(sectionId)}
                      canEdit={canEdit}
                    />

                    {/* Item rows */}
                    {!isCollapsed && groupItems.map((it, rowIdx) => {
                      const rowTotal = it.unit_cost_cents * it.quantity;
                      // TIM-3251: alternating row stripe (even=background, odd=white).
                      const stripeBg = rowIdx % 2 === 0 ? "bg-white" : "bg-[var(--background)]";
                      return (
                        <tr
                          key={it.id}
                          className={`border-b border-[var(--neutral-cool-100)] last:border-b-0 transition-colors hover:brightness-[0.97] ${stripeBg}`}
                        >
                          {/* Name — font-medium per Menu ingredients-tab canon. */}
                          <td className={cellCls}>
                            <EditableCell
                              value={it.name}
                              placeholder="Item name"
                              nameBold
                              active={editingCell?.rowId === it.id && editingCell.key === "name"}
                              canEdit={canEdit}
                              onActivate={() => canEdit && setEditingCell({ rowId: it.id, key: "name" })}
                              onCommit={(v) => handleCommit(it.id, "name", v)}
                            />
                          </td>
                          {/* Vendor */}
                          <td className={cellCls}>
                            <EditableCell
                              value={it.vendor ?? ""}
                              placeholder="Vendor"
                              active={editingCell?.rowId === it.id && editingCell.key === "vendor"}
                              canEdit={canEdit}
                              onActivate={() => canEdit && setEditingCell({ rowId: it.id, key: "vendor" })}
                              onCommit={(v) => handleCommit(it.id, "vendor", v)}
                            />
                          </td>
                          {/* Unit type — muted grey per Menu unit-label treatment. */}
                          <td className={cellCls}>
                            <EditableCell
                              value={it.unit_type}
                              placeholder="unit"
                              muted
                              active={editingCell?.rowId === it.id && editingCell.key === "unit_type"}
                              canEdit={canEdit}
                              onActivate={() => canEdit && setEditingCell({ rowId: it.id, key: "unit_type" })}
                              onCommit={(v) => handleCommit(it.id, "unit_type", v || "unit")}
                            />
                          </td>
                          {/* Quantity */}
                          <td className={cellCls}>
                            <EditableCell
                              value={String(it.quantity)}
                              placeholder="1"
                              inputType="number"
                              active={editingCell?.rowId === it.id && editingCell.key === "quantity"}
                              canEdit={canEdit}
                              onActivate={() => canEdit && setEditingCell({ rowId: it.id, key: "quantity" })}
                              onCommit={(v) => handleCommit(it.id, "quantity", v)}
                            />
                          </td>
                          {/* Unit cost */}
                          <td className={cellCls}>
                            <EditableCell
                              value={it.unit_cost_cents > 0 ? String(it.unit_cost_cents / 100) : ""}
                              placeholder="0"
                              inputType="number"
                              active={editingCell?.rowId === it.id && editingCell.key === "unit_cost_cents"}
                              canEdit={canEdit}
                              onActivate={() => canEdit && setEditingCell({ rowId: it.id, key: "unit_cost_cents" })}
                              onCommit={(v) => handleCommit(it.id, "unit_cost_cents", v)}
                              displayValue={formatMinor(it.unit_cost_cents, currencyCode)}
                            />
                          </td>
                          {/* Total (read-only) — teal semibold per Menu price treatment. */}
                          <td className={cellCls}>
                            <span className={TABLE_PRICE_CLS}>
                              {formatMinor(rowTotal, currencyCode)}
                            </span>
                          </td>
                          {/* Notes */}
                          <td className={cellCls}>
                            <EditableCell
                              value={it.notes ?? ""}
                              placeholder="Notes"
                              active={editingCell?.rowId === it.id && editingCell.key === "notes"}
                              canEdit={canEdit}
                              onActivate={() => canEdit && setEditingCell({ rowId: it.id, key: "notes" })}
                              onCommit={(v) => handleCommit(it.id, "notes", v)}
                            />
                          </td>
                          {/* Delete */}
                          <td className={cellCls}>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => deleteSingleRow(it.id)}
                                className="text-[var(--neutral-cool-400)] hover:text-[var(--error)] transition-colors p-0.5"
                                aria-label="Delete row"
                              >
                                <Trash2 size={TABLE_ACTION_ICON_SIZE} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Section subtotal */}
                    {!isCollapsed && (
                      <SectionSubtotalRow
                        key={`sub-${id}`}
                        colSpan={TOTAL_COLS}
                        label={`${label} Total`}
                        subtotalDisplay={formatMinor(subtotal, currencyCode)}
                      />
                    )}
                  </React.Fragment>
                );
              })}

              {/* Grand total */}
              {displayGroups.length > 0 && (
                <GrandTotalRow
                  colSpan={TOTAL_COLS}
                  label="Grand Total"
                  totalDisplay={formatMinor(grandTotal, currencyCode)}
                />
              )}
            </tbody>
          </table>

          {/* TIM-3251: inline quick-add row — inside overflow-x-auto so it scrolls with columns. */}
          {canEdit && (
            <div
              className={`min-w-[700px] grid grid-cols-[200px_130px_80px_60px_100px_100px_minmax(0,1fr)_36px] gap-1.5 px-2.5 py-2 ${TABLE_QUICK_ADD_ROW_CLS}`}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitQuickAdd(); } }}
            >
              <input
                ref={qaNameRef}
                type="text"
                className={TABLE_QUICK_ADD_INPUT_CLS}
                value={qaName}
                placeholder="Add a Supply…"
                autoComplete="off"
                aria-label="New supply name"
                onChange={(e) => setQaName(e.target.value)}
              />
              <input
                type="text"
                className={TABLE_QUICK_ADD_INPUT_CLS}
                value={qaVendor}
                placeholder="Vendor"
                autoComplete="off"
                aria-label="Vendor"
                onChange={(e) => setQaVendor(e.target.value)}
              />
              <input
                type="text"
                className={TABLE_QUICK_ADD_INPUT_CLS}
                value={qaUnit}
                placeholder="unit"
                aria-label="Unit"
                onChange={(e) => setQaUnit(e.target.value)}
              />
              <input
                type="number"
                className={TABLE_QUICK_ADD_INPUT_CLS + " tabular-nums"}
                value={qaQty}
                placeholder="1"
                min={1}
                aria-label="Quantity"
                onChange={(e) => setQaQty(e.target.value)}
              />
              <MoneyInput
                className={TABLE_QUICK_ADD_INPUT_CLS + " tabular-nums"}
                value={qaCost}
                placeholder="0.00"
                min={0}
                step={0.01}
                aria-label="Unit cost"
                onChange={(e) => setQaCost(e.target.value)}
              />
              <span className="px-2 text-xs text-[var(--muted-foreground)] flex items-center tabular-nums">
                {qaCost && qaQty
                  ? formatMinor(Math.round((parseFloat(qaCost) || 0) * 100) * (parseInt(qaQty, 10) || 1), currencyCode)
                  : "—"}
              </span>
              <span /> {/* notes — empty */}
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={commitQuickAdd}
                  disabled={!qaName.trim()}
                  title="Add supply (Enter)"
                  aria-label="Add supply"
                  className="flex items-center justify-center w-7 h-7 rounded-md bg-[var(--teal)] text-white hover:bg-[var(--teal-dark)] disabled:bg-[var(--teal-bg-soft)] disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* When there are no items at all, still show an add-item button */}
      {canEdit && displayGroups.length === 0 && (
        <button
          type="button"
          onClick={() => addItemToSection(sections[0]?.id ?? null)}
          className="flex items-center gap-2 text-sm font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-4 py-2.5 hover:bg-[var(--teal)]/5 transition-colors w-full justify-center"
        >
          <Plus size={14} aria-hidden="true" />
          Add item
        </button>
      )}
    </div>
  );
}

function EditableCell({
  value,
  placeholder,
  inputType = "text",
  active,
  canEdit,
  onActivate,
  onCommit,
  displayValue,
  nameBold,
  muted,
}: {
  value: string;
  placeholder: string;
  inputType?: "text" | "number";
  active: boolean;
  canEdit: boolean;
  onActivate: () => void;
  onCommit: (v: string) => void;
  displayValue?: string;
  /** TIM-3251: apply font-medium (name column canon from Menu ingredients tab). */
  nameBold?: boolean;
  /** TIM-3251: apply muted-foreground (unit column canon from Menu ingredients tab). */
  muted?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (active && inputRef.current) inputRef.current.focus(); }, [active]);

  if (active) {
    return (
      <input
        ref={inputRef}
        type={inputType}
        className="w-full h-full text-xs text-[var(--foreground)] bg-transparent outline-none border-0 p-0 placeholder-[var(--neutral-cool-400)]"
        value={draft}
        placeholder={placeholder}
        disabled={!canEdit}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            onCommit(draft);
          }
        }}
      />
    );
  }

  const textCls = muted
    ? "text-xs text-[var(--muted-foreground)]"
    : nameBold
    ? "text-xs font-medium text-[var(--foreground)]"
    : "text-xs text-[var(--foreground)]";

  return (
    <span
      className={`block truncate ${textCls} cursor-text`}
      onClick={canEdit ? onActivate : undefined}
    >
      {displayValue ?? (value || <span className="text-[var(--neutral-cool-400)] font-normal">{placeholder}</span>)}
    </span>
  );
}
