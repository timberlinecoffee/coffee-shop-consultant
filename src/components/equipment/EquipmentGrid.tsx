"use client";

// TIM-1005: Spreadsheet-style equipment data entry (replaces expand-card).
// TIM-1029: Column visibility toggle with localStorage persistence.
// Uses TanStack Table v8 for sort/filter/selection state; hand-rolled cell editors.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, Plus, Trash2, Settings2 } from "lucide-react";
import type {
  EquipmentItem,
  EquipmentCategory,
  FinancingMethod,
} from "@/app/workspace/financials/financials-workspace";
import { formatCurrency } from "@/lib/financial-projection";

const COL_VISIBILITY_KEY = "tcs-equipment-col-visibility";

const TOGGLEABLE_COLS: { id: string; label: string }[] = [
  { id: "vendor",             label: "Brand" },
  { id: "model",              label: "Model" },
  { id: "supplier",           label: "Supplier" },
  { id: "unit_cost_cents",    label: "Cost" },
  { id: "financing_method",   label: "Financing" },
  { id: "category",           label: "Category" },
  { id: "useful_life_years",  label: "Useful Life" },
  { id: "notes",              label: "Notes" },
];

function loadColVisibility(): VisibilityState {
  try {
    const raw = localStorage.getItem(COL_VISIBILITY_KEY);
    if (raw) return JSON.parse(raw) as VisibilityState;
  } catch { /* ignore */ }
  return {};
}

function saveColVisibility(v: VisibilityState) {
  try {
    localStorage.setItem(COL_VISIBILITY_KEY, JSON.stringify(v));
  } catch { /* ignore */ }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const FUND_CATEGORIES: EquipmentCategory[] = [
  "ceramics",
  "glassware",
  "to_go_ware",
  "miscellaneous",
];

const CATEGORY_LABELS: Record<string, string> = {
  espresso_station: "Espresso Station",
  espresso_platform: "Espresso Station",
  brew_platform: "Brew Platform",
  milk_beverage_prep: "Milk & Beverage Prep",
  refrigeration: "Refrigeration",
  plumbing_water: "Plumbing & Water",
  electrical: "Electrical",
  pos_tech: "POS & Technology",
  furniture_fixtures: "Furniture & Fixtures",
  signage_decor: "Signage & Décor",
  smallwares: "Smallwares",
  ceramics: "Ceramics",
  glassware: "Glassware",
  to_go_ware: "To-Go Ware",
  miscellaneous: "Miscellaneous",
  // legacy
  espresso: "Espresso",
  grinder: "Grinder",
  plumbing: "Plumbing",
  furniture: "Furniture",
  pos: "POS",
  signage: "Signage",
  other: "Other",
};

const NEW_CATEGORIES: EquipmentCategory[] = [
  "espresso_station",
  "brew_platform",
  "milk_beverage_prep",
  "refrigeration",
  "plumbing_water",
  "electrical",
  "pos_tech",
  "furniture_fixtures",
  "signage_decor",
  "smallwares",
  "ceramics",
  "glassware",
  "to_go_ware",
  "miscellaneous",
];

const FINANCING_LABELS: Record<string, string> = {
  cash: "Cash",
  in_house_financing: "In-House Financing",
  loan: "Loan",
  lease: "Lease",
  credit_card: "Credit Card",
  other: "Other",
  credit: "Credit", // legacy
};

const NEW_FINANCING: FinancingMethod[] = [
  "cash",
  "in_house_financing",
  "loan",
  "lease",
  "credit_card",
  "other",
];

const AUTOSAVE_DEBOUNCE_MS = 400;

// Returns sticky-positioning classes for the two frozen columns (select + name).
function getStickyColCls(columnId: string, bgCls: string): string {
  if (columnId === "select") return `sticky left-0 z-10 ${bgCls}`;
  if (columnId === "name") return `sticky left-[36px] z-10 ${bgCls}`;
  return "";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isFundRow(item: EquipmentItem): boolean {
  return FUND_CATEGORIES.includes(item.category as EquipmentCategory);
}

function newBlankItem(planId: string, position: number): EquipmentItem {
  return {
    id: `__new_${Date.now()}`,
    plan_id: planId,
    position,
    section_id: null,
    name: "",
    category: "miscellaneous",
    vendor: null,
    model: null,
    supplier: null,
    vendor_candidate_id: null,
    quantity: 1,
    unit_cost_cents: 0,
    priority_tier: "must_have",
    financing_method: "cash",
    source: "user_added",
    notes: null,
    archived: false,
    useful_life_years: 7,
    purchase_month: null,
  };
}

// The editable columns (in Tab order). Select and source/priority are not inline-edited.
const EDITABLE_COLS = [
  "name",
  "vendor",
  "model",
  "supplier",
  "unit_cost_cents",
  "financing_method",
  "category",
  "useful_life_years",
  "notes",
] as const;

type EditableCol = (typeof EDITABLE_COLS)[number];

// ── Cell editor components ────────────────────────────────────────────────────

function TextCell({
  value,
  placeholder,
  disabled,
  onCommit,
  onKeyDown,
  inputRef,
  multiline,
}: {
  value: string;
  placeholder: string;
  disabled: boolean;
  onCommit: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.Ref<HTMLInputElement | HTMLTextAreaElement>;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const cls =
    "w-full h-full text-xs text-[#1a1a1a] bg-transparent outline-none resize-none border-0 p-0 placeholder-[#c0c0c0]";

  if (multiline) {
    return (
      <textarea
        ref={inputRef as React.Ref<HTMLTextAreaElement>}
        className={cls}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <input
      ref={inputRef as React.Ref<HTMLInputElement>}
      type="text"
      className={cls}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={onKeyDown}
    />
  );
}

function CostCell({
  valueCents,
  disabled,
  onCommit,
  onKeyDown,
  inputRef,
}: {
  valueCents: number;
  disabled: boolean;
  onCommit: (cents: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.Ref<HTMLInputElement>;
}) {
  const [draft, setDraft] = useState(valueCents > 0 ? String(valueCents / 100) : "");

  useEffect(() => {
    setDraft(valueCents > 0 ? String(valueCents / 100) : "");
  }, [valueCents]);

  return (
    <input
      ref={inputRef}
      type="number"
      min={0}
      step={50}
      className="w-full h-full text-xs text-[#1a1a1a] bg-transparent outline-none border-0 p-0 placeholder-[#c0c0c0]"
      value={draft}
      placeholder="0"
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(Math.round((parseFloat(draft) || 0) * 100))}
      onKeyDown={onKeyDown}
    />
  );
}

function UsefulLifeCell({
  value,
  disabled,
  onCommit,
  onKeyDown,
  inputRef,
}: {
  value: number;
  disabled: boolean;
  onCommit: (years: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.Ref<HTMLInputElement>;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  return (
    <input
      ref={inputRef}
      type="number"
      min={1}
      max={50}
      step={1}
      className="w-full h-full text-xs text-[#1a1a1a] bg-transparent outline-none border-0 p-0"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(Math.max(1, Math.min(50, Math.round(parseFloat(draft) || 7))))}
      onKeyDown={onKeyDown}
    />
  );
}

function SelectCell({
  value,
  options,
  disabled,
  onCommit,
  onKeyDown,
  inputRef,
}: {
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onCommit: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.Ref<HTMLSelectElement>;
}) {
  return (
    <select
      ref={inputRef}
      className="w-full h-full text-xs text-[#1a1a1a] bg-transparent outline-none border-0 p-0 cursor-pointer"
      value={value}
      disabled={disabled}
      onChange={(e) => onCommit(e.target.value)}
      onKeyDown={onKeyDown}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── Mobile list fallback ──────────────────────────────────────────────────────

function MobileEquipmentList({
  items,
  canEdit,
  onUpdate,
  onRemove,
  onAdd,
}: {
  items: EquipmentItem[];
  canEdit: boolean;
  onUpdate: (id: string, patch: Partial<EquipmentItem>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#e0e0e0] py-10 text-center">
          <p className="text-sm text-[#afafaf]">No equipment added yet.</p>
        </div>
      )}

      {items.map((item) => {
        const fund = isFundRow(item);
        const total = item.unit_cost_cents * item.quantity;
        const open = expandedId === item.id;

        return (
          <div
            key={item.id}
            className={`border rounded-xl bg-white overflow-hidden ${
              fund ? "border-[#cfe0e1] bg-[#f4f9f8]/30" : "border-[#efefef]"
            }`}
          >
            <div
              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
              onClick={() => setExpandedId(open ? null : item.id)}
            >
              {fund && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#cfe0e1] text-[#155e63] shrink-0">
                  Fund
                </span>
              )}
              <span className="text-sm text-[#1a1a1a] flex-1 truncate font-medium">
                {item.name || <span className="text-[#afafaf] font-normal">Unnamed</span>}
              </span>
              <span className="text-xs font-semibold text-[#1a1a1a] shrink-0">
                {total > 0 ? formatCurrency(total / 100) : "$0"}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                  className="text-[#afafaf] hover:text-[#a13d3d] p-1 shrink-0"
                  aria-label="Delete"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            {open && (
              <div className="border-t border-[#efefef] px-3 py-3 space-y-2 bg-[#faf9f7]">
                {[
                  { label: "Name", key: "name" as const, type: "text", placeholder: "Item name" },
                  ...(!fund ? [
                    { label: "Brand", key: "vendor" as const, type: "text", placeholder: "Brand" },
                    { label: "Model", key: "model" as const, type: "text", placeholder: "Model" },
                    { label: "Supplier", key: "supplier" as const, type: "text", placeholder: "Supplier" },
                  ] : []),
                  { label: "Cost ($)", key: "unit_cost_cents" as const, type: "cost", placeholder: "0" },
                  { label: "Notes", key: "notes" as const, type: "text", placeholder: "Notes" },
                ].map(({ label, key, type, placeholder }) => (
                  <div key={key}>
                    <label className="block text-[10px] font-medium text-[#6b6b6b] mb-0.5">{label}</label>
                    {type === "cost" ? (
                      <input
                        type="number"
                        min={0}
                        className="w-full text-xs border border-[#e0e0e0] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#155e63]"
                        value={item.unit_cost_cents > 0 ? item.unit_cost_cents / 100 : ""}
                        placeholder={placeholder}
                        disabled={!canEdit}
                        onChange={(e) =>
                          onUpdate(item.id, { unit_cost_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                        }
                      />
                    ) : (
                      <input
                        type="text"
                        className="w-full text-xs border border-[#e0e0e0] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#155e63]"
                        value={(item[key] as string | null) ?? ""}
                        placeholder={placeholder}
                        disabled={!canEdit}
                        onChange={(e) =>
                          onUpdate(item.id, { [key]: e.target.value || null } as Partial<EquipmentItem>)
                        }
                      />
                    )}
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-[#6b6b6b] mb-0.5">Category</label>
                    <select
                      className="w-full text-xs border border-[#e0e0e0] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#155e63]"
                      value={item.category}
                      disabled={!canEdit}
                      onChange={(e) => onUpdate(item.id, { category: e.target.value as EquipmentCategory })}
                    >
                      {NEW_CATEGORIES.map((k) => (
                        <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-[#6b6b6b] mb-0.5">Financing</label>
                    <select
                      className="w-full text-xs border border-[#e0e0e0] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#155e63]"
                      value={item.financing_method}
                      disabled={!canEdit}
                      onChange={(e) => onUpdate(item.id, { financing_method: e.target.value as FinancingMethod })}
                    >
                      {NEW_FINANCING.map((k) => (
                        <option key={k} value={k}>{FINANCING_LABELS[k]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {canEdit && (
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-2 text-sm font-medium text-[#155e63] border border-[#cfe0e1] rounded-xl px-4 py-2.5 hover:bg-[#155e63]/5 transition-colors w-full justify-center"
        >
          <Plus size={14} aria-hidden="true" />
          Add item
        </button>
      )}
    </div>
  );
}

// ── Main grid ─────────────────────────────────────────────────────────────────

interface EquipmentGridProps {
  planId: string;
  canEdit: boolean;
  items: EquipmentItem[];
  onItemsChange: (items: EquipmentItem[]) => void;
}

export function EquipmentGrid({
  planId,
  canEdit,
  items,
  onItemsChange,
}: EquipmentGridProps) {
  // Editing cell: { rowId, colKey }
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: EditableCol } | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Load saved column visibility on mount
  useEffect(() => {
    setColumnVisibility(loadColVisibility());
  }, []);

  // Close column picker on outside click
  useEffect(() => {
    if (!colPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setColPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [colPickerOpen]);

  // Debounce timers per row
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Per-row pending patches (accumulated between debounce fires)
  const pendingPatches = useRef<Map<string, Partial<EquipmentItem>>>(new Map());

  // Row creation in-flight guard
  const creatingRows = useRef<Set<string>>(new Set());

  // Input refs for focus management
  const cellInputRefs = useRef<Map<string, HTMLElement | null>>(new Map());

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ── API helpers ──────────────────────────────────────────────────────────────

  const createRow = useCallback(
    async (tempId: string, item: EquipmentItem): Promise<EquipmentItem | null> => {
      if (creatingRows.current.has(tempId)) return null;
      creatingRows.current.add(tempId);
      try {
        const res = await fetch("/api/workspaces/financials/equipment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: item.name || "New Item",
            category: item.category,
            vendor: item.vendor,
            model: item.model,
            supplier: item.supplier,
            quantity: item.quantity,
            unit_cost_cents: item.unit_cost_cents,
            priority_tier: item.priority_tier,
            financing_method: item.financing_method,
            source: "user_added",
            notes: item.notes,
            position: item.position,
          }),
        });
        if (!res.ok) throw new Error(`create failed ${res.status}`);
        return (await res.json()) as EquipmentItem;
      } catch {
        return null;
      } finally {
        creatingRows.current.delete(tempId);
      }
    },
    []
  );

  const patchRow = useCallback(async (id: string, patch: Partial<EquipmentItem>) => {
    if (!id || id.startsWith("__new_")) return;
    try {
      const res = await fetch(`/api/workspaces/financials/equipment/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      const updated = (await res.json()) as EquipmentItem;
      onItemsChange(items.map((i) => (i.id === id ? updated : i)));
    } catch {
      // silent — optimistic UI already applied
    }
  }, [items, onItemsChange]);

  const deleteRow = useCallback(async (id: string) => {
    if (!id || id.startsWith("__new_")) return;
    try {
      await fetch(`/api/workspaces/financials/equipment/${id}`, { method: "DELETE" });
    } catch {
      // silent
    }
  }, []);

  // ── Item mutation helpers ────────────────────────────────────────────────────

  const updateItemLocal = useCallback(
    (id: string, patch: Partial<EquipmentItem>) => {
      onItemsChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    },
    [items, onItemsChange]
  );

  const scheduleAutosave = useCallback(
    (id: string, patch: Partial<EquipmentItem>) => {
      if (!canEdit) return;

      // Accumulate patch
      const existing = pendingPatches.current.get(id) ?? {};
      pendingPatches.current.set(id, { ...existing, ...patch });

      // Reset debounce
      const existing_timer = debounceTimers.current.get(id);
      if (existing_timer) clearTimeout(existing_timer);

      const timer = setTimeout(async () => {
        const accumulated = pendingPatches.current.get(id);
        if (!accumulated) return;
        pendingPatches.current.delete(id);

        if (id.startsWith("__new_")) {
          // Materialize the row
          const current = items.find((i) => i.id === id);
          if (!current) return;
          const created = await createRow(id, { ...current, ...accumulated });
          if (created) {
            onItemsChange(
              items.map((i) => (i.id === id ? created : i))
            );
          }
        } else {
          await patchRow(id, accumulated);
        }
      }, AUTOSAVE_DEBOUNCE_MS);

      debounceTimers.current.set(id, timer);
    },
    [canEdit, items, createRow, patchRow, onItemsChange]
  );

  const handleCellCommit = useCallback(
    (id: string, colKey: EditableCol, rawValue: unknown) => {
      if (!canEdit) return;

      let patch: Partial<EquipmentItem> = {};

      if (colKey === "unit_cost_cents") {
        patch = { unit_cost_cents: rawValue as number };
      } else if (colKey === "category") {
        patch = { category: rawValue as EquipmentCategory };
      } else if (colKey === "financing_method") {
        patch = { financing_method: rawValue as FinancingMethod };
      } else if (colKey === "vendor") {
        patch = { vendor: (rawValue as string) || null };
      } else if (colKey === "model") {
        patch = { model: (rawValue as string) || null };
      } else if (colKey === "supplier") {
        patch = { supplier: (rawValue as string) || null };
      } else if (colKey === "notes") {
        patch = { notes: (rawValue as string) || null };
      } else if (colKey === "name") {
        patch = { name: rawValue as string };
      } else if (colKey === "useful_life_years") {
        const v = Math.max(1, Math.min(50, Math.round((rawValue as number) || 7)));
        patch = { useful_life_years: v };
      }

      updateItemLocal(id, patch);
      scheduleAutosave(id, patch);
    },
    [canEdit, updateItemLocal, scheduleAutosave]
  );

  // ── Add row ──────────────────────────────────────────────────────────────────

  const addRow = useCallback(() => {
    if (!canEdit) return;
    const blank = newBlankItem(planId, items.length);
    onItemsChange([...items, blank]);
    // Focus name cell of new row after render
    setTimeout(() => {
      setEditingCell({ rowId: blank.id, colKey: "name" });
    }, 30);
  }, [canEdit, planId, items, onItemsChange]);

  // ── Delete selected rows ─────────────────────────────────────────────────────

  const deleteSelected = useCallback(() => {
    const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
    const toDelete = items.filter((i) => selectedIds.includes(i.id));
    onItemsChange(items.filter((i) => !selectedIds.includes(i.id)));
    toDelete.forEach((i) => deleteRow(i.id));
    setRowSelection({});
  }, [rowSelection, items, onItemsChange, deleteRow]);

  const deleteSingleRow = useCallback(
    (id: string) => {
      onItemsChange(items.filter((i) => i.id !== id));
      deleteRow(id);
    },
    [items, onItemsChange, deleteRow]
  );

  // ── Keyboard navigation ──────────────────────────────────────────────────────

  const focusCell = useCallback(
    (rowId: string, colKey: EditableCol) => {
      setEditingCell({ rowId, colKey });
      const key = `${rowId}:${colKey}`;
      setTimeout(() => {
        const el = cellInputRefs.current.get(key);
        if (el) (el as HTMLElement).focus();
      }, 20);
    },
    []
  );

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent, rowId: string, colKey: EditableCol) => {
      const sortedRows = table.getSortedRowModel().rows;
      const colIdx = EDITABLE_COLS.indexOf(colKey);
      const rowIdx = sortedRows.findIndex((r) => r.original.id === rowId);

      if (e.key === "Tab") {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        let nextColIdx = colIdx + dir;
        let nextRowIdx = rowIdx;

        if (nextColIdx >= EDITABLE_COLS.length) {
          nextColIdx = 0;
          nextRowIdx++;
        } else if (nextColIdx < 0) {
          nextColIdx = EDITABLE_COLS.length - 1;
          nextRowIdx--;
        }

        if (nextRowIdx >= 0 && nextRowIdx < sortedRows.length) {
          const nextRow = sortedRows[nextRowIdx];
          focusCell(nextRow.original.id, EDITABLE_COLS[nextColIdx]);
        } else if (nextRowIdx >= sortedRows.length) {
          addRow();
        }
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const nextRowIdx = rowIdx + 1;
        if (nextRowIdx < sortedRows.length) {
          const nextRow = sortedRows[nextRowIdx];
          focusCell(nextRow.original.id, colKey);
        } else {
          addRow();
        }
      } else if (e.key === "Escape") {
        setEditingCell(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusCell, addRow]
  );

  // ── Column definitions ────────────────────────────────────────────────────────

  const columnHelper = createColumnHelper<EquipmentItem>();

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "select",
        size: 36,
        enableSorting: false,
        enableColumnFilter: false,
        header: ({ table: t }) => (
          <input
            type="checkbox"
            className="accent-[#155e63] cursor-pointer"
            checked={t.getIsAllPageRowsSelected()}
            onChange={t.getToggleAllPageRowsSelectedHandler()}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="accent-[#155e63] cursor-pointer"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            aria-label="Select row"
          />
        ),
      }),
      columnHelper.accessor("name", {
        id: "name",
        header: "Name",
        size: 200,
        cell: ({ row }) => {
          const item = row.original;
          const active = editingCell?.rowId === item.id && editingCell?.colKey === "name";
          const refKey = `${item.id}:name`;
          return (
            <div className="flex items-center gap-1.5 w-full">
              {item.source === "ai_suggested" && (
                <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-50 text-amber-600">
                  AI
                </span>
              )}
              <div className="flex-1 min-w-0">
                {active ? (
                  <TextCell
                    value={item.name}
                    placeholder="Item name"
                    disabled={!canEdit}
                    onCommit={(v) => handleCellCommit(item.id, "name", v)}
                    onKeyDown={(e) => handleCellKeyDown(e, item.id, "name")}
                    inputRef={(el) => { cellInputRefs.current.set(refKey, el); }}
                  />
                ) : (
                  <span
                    className="block truncate text-xs text-[#1a1a1a] cursor-text"
                    onClick={() => canEdit && focusCell(item.id, "name")}
                  >
                    {item.name || <span className="text-[#c0c0c0]">Name</span>}
                  </span>
                )}
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor("vendor", {
        id: "vendor",
        header: "Brand",
        size: 130,
        cell: ({ row }) => {
          const item = row.original;
          const fund = isFundRow(item);
          const active = editingCell?.rowId === item.id && editingCell?.colKey === "vendor";
          const refKey = `${item.id}:vendor`;
          if (fund) return null;
          return active ? (
            <TextCell
              value={item.vendor ?? ""}
              placeholder="Brand"
              disabled={!canEdit}
              onCommit={(v) => handleCellCommit(item.id, "vendor", v)}
              onKeyDown={(e) => handleCellKeyDown(e, item.id, "vendor")}
              inputRef={(el) => { cellInputRefs.current.set(refKey, el); }}
            />
          ) : (
            <span
              className="block truncate text-xs text-[#1a1a1a] cursor-text"
              onClick={() => canEdit && focusCell(item.id, "vendor")}
            >
              {item.vendor || <span className="text-[#c0c0c0]">Brand</span>}
            </span>
          );
        },
      }),
      columnHelper.accessor("model", {
        id: "model",
        header: "Model",
        size: 130,
        cell: ({ row }) => {
          const item = row.original;
          const fund = isFundRow(item);
          const active = editingCell?.rowId === item.id && editingCell?.colKey === "model";
          const refKey = `${item.id}:model`;
          if (fund) return null;
          return active ? (
            <TextCell
              value={item.model ?? ""}
              placeholder="Model"
              disabled={!canEdit}
              onCommit={(v) => handleCellCommit(item.id, "model", v)}
              onKeyDown={(e) => handleCellKeyDown(e, item.id, "model")}
              inputRef={(el) => { cellInputRefs.current.set(refKey, el); }}
            />
          ) : (
            <span
              className="block truncate text-xs text-[#1a1a1a] cursor-text"
              onClick={() => canEdit && focusCell(item.id, "model")}
            >
              {item.model || <span className="text-[#c0c0c0]">Model</span>}
            </span>
          );
        },
      }),
      columnHelper.accessor("supplier", {
        id: "supplier",
        header: "Supplier",
        size: 130,
        cell: ({ row }) => {
          const item = row.original;
          const fund = isFundRow(item);
          const active = editingCell?.rowId === item.id && editingCell?.colKey === "supplier";
          const refKey = `${item.id}:supplier`;
          if (fund) return null;
          return active ? (
            <TextCell
              value={item.supplier ?? ""}
              placeholder="Supplier"
              disabled={!canEdit}
              onCommit={(v) => handleCellCommit(item.id, "supplier", v)}
              onKeyDown={(e) => handleCellKeyDown(e, item.id, "supplier")}
              inputRef={(el) => { cellInputRefs.current.set(refKey, el); }}
            />
          ) : (
            <span
              className="block truncate text-xs text-[#1a1a1a] cursor-text"
              onClick={() => canEdit && focusCell(item.id, "supplier")}
            >
              {item.supplier || <span className="text-[#c0c0c0]">Supplier</span>}
            </span>
          );
        },
      }),
      columnHelper.accessor("unit_cost_cents", {
        id: "unit_cost_cents",
        header: "Cost",
        size: 110,
        cell: ({ row }) => {
          const item = row.original;
          const active = editingCell?.rowId === item.id && editingCell?.colKey === "unit_cost_cents";
          const refKey = `${item.id}:unit_cost_cents`;
          return active ? (
            <CostCell
              valueCents={item.unit_cost_cents}
              disabled={!canEdit}
              onCommit={(cents) => handleCellCommit(item.id, "unit_cost_cents", cents)}
              onKeyDown={(e) => handleCellKeyDown(e, item.id, "unit_cost_cents")}
              inputRef={(el) => { cellInputRefs.current.set(refKey, el); }}
            />
          ) : (
            <span
              className="block truncate text-xs text-[#1a1a1a] cursor-text font-medium"
              onClick={() => canEdit && focusCell(item.id, "unit_cost_cents")}
            >
              {item.unit_cost_cents > 0
                ? formatCurrency(item.unit_cost_cents / 100)
                : <span className="text-[#c0c0c0] font-normal">$0</span>
              }
            </span>
          );
        },
      }),
      columnHelper.accessor("financing_method", {
        id: "financing_method",
        header: "Financing",
        size: 130,
        cell: ({ row }) => {
          const item = row.original;
          const active = editingCell?.rowId === item.id && editingCell?.colKey === "financing_method";
          const refKey = `${item.id}:financing_method`;
          return active ? (
            <SelectCell
              value={item.financing_method}
              options={NEW_FINANCING.map((k) => ({ value: k, label: FINANCING_LABELS[k] }))}
              disabled={!canEdit}
              onCommit={(v) => handleCellCommit(item.id, "financing_method", v)}
              onKeyDown={(e) => handleCellKeyDown(e, item.id, "financing_method")}
              inputRef={(el) => { cellInputRefs.current.set(refKey, el); }}
            />
          ) : (
            <span
              className="block truncate text-xs text-[#1a1a1a] cursor-text"
              onClick={() => canEdit && focusCell(item.id, "financing_method")}
            >
              {FINANCING_LABELS[item.financing_method] ?? item.financing_method}
            </span>
          );
        },
      }),
      columnHelper.accessor("category", {
        id: "category",
        header: "Category",
        size: 160,
        cell: ({ row }) => {
          const item = row.original;
          const fund = isFundRow(item);
          const active = editingCell?.rowId === item.id && editingCell?.colKey === "category";
          const refKey = `${item.id}:category`;
          return (
            <div className="flex items-center gap-1.5 w-full">
              {fund && (
                <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-[#cfe0e1] text-[#155e63]">
                  Fund
                </span>
              )}
              <div className="flex-1 min-w-0">
                {active ? (
                  <SelectCell
                    value={item.category}
                    options={NEW_CATEGORIES.map((k) => ({ value: k, label: CATEGORY_LABELS[k] }))}
                    disabled={!canEdit}
                    onCommit={(v) => handleCellCommit(item.id, "category", v)}
                    onKeyDown={(e) => handleCellKeyDown(e, item.id, "category")}
                    inputRef={(el) => { cellInputRefs.current.set(refKey, el); }}
                  />
                ) : (
                  <span
                    className="block truncate text-xs text-[#1a1a1a] cursor-text"
                    onClick={() => canEdit && focusCell(item.id, "category")}
                  >
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </span>
                )}
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor("useful_life_years", {
        id: "useful_life_years",
        header: "Useful Life",
        size: 90,
        cell: ({ row }) => {
          const item = row.original;
          const active = editingCell?.rowId === item.id && editingCell?.colKey === "useful_life_years";
          const refKey = `${item.id}:useful_life_years`;
          return active ? (
            <UsefulLifeCell
              value={item.useful_life_years ?? 7}
              disabled={!canEdit}
              onCommit={(v) => handleCellCommit(item.id, "useful_life_years", v)}
              onKeyDown={(e) => handleCellKeyDown(e, item.id, "useful_life_years")}
              inputRef={(el) => { cellInputRefs.current.set(refKey, el); }}
            />
          ) : (
            <span
              className="block truncate text-xs text-[#1a1a1a] cursor-text"
              onClick={() => canEdit && focusCell(item.id, "useful_life_years")}
            >
              {item.useful_life_years ?? 7}yr
            </span>
          );
        },
      }),
      columnHelper.accessor("notes", {
        id: "notes",
        header: "Notes",
        size: 180,
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          const active = editingCell?.rowId === item.id && editingCell?.colKey === "notes";
          const refKey = `${item.id}:notes`;
          return active ? (
            <TextCell
              value={item.notes ?? ""}
              placeholder="Notes"
              disabled={!canEdit}
              onCommit={(v) => handleCellCommit(item.id, "notes", v)}
              onKeyDown={(e) => handleCellKeyDown(e, item.id, "notes")}
              inputRef={(el) => { cellInputRefs.current.set(refKey, el); }}
              multiline
            />
          ) : (
            <span
              className="block truncate text-xs text-[#6b6b6b] cursor-text"
              onClick={() => canEdit && focusCell(item.id, "notes")}
            >
              {item.notes || <span className="text-[#c0c0c0]">Notes</span>}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        size: 36,
        enableSorting: false,
        enableColumnFilter: false,
        header: () => null,
        cell: ({ row }) => (
          canEdit ? (
            <button
              type="button"
              onClick={() => deleteSingleRow(row.original.id)}
              className="text-[#c0c0c0] hover:text-[#a13d3d] transition-colors p-0.5"
              aria-label="Delete row"
            >
              <Trash2 size={13} />
            </button>
          ) : null
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingCell, canEdit]
  );

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting, columnFilters, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: (updater) => {
      setColumnVisibility((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saveColVisibility(next);
        return next;
      });
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
    enableRowSelection: canEdit,
  });

  const selectedCount = Object.values(rowSelection).filter(Boolean).length;
  const totalCents = items.reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0);

  // ── Mobile fallback ──────────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <MobileEquipmentList
        items={items}
        canEdit={canEdit}
        onUpdate={(id, patch) => {
          updateItemLocal(id, patch);
          scheduleAutosave(id, patch);
        }}
        onRemove={deleteSingleRow}
        onAdd={addRow}
      />
    );
  }

  // ── Spreadsheet ───────────────────────────────────────────────────────────────

  const cellCls =
    "px-2.5 py-2 text-xs border-r border-[#f0f0f0] last:border-r-0 align-top";
  const headerCellCls =
    "px-2.5 py-2 text-left text-[10px] font-semibold text-[#6b6b6b] uppercase tracking-wide border-r border-[#f0f0f0] last:border-r-0 bg-[#faf9f7] select-none";

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-4 text-xs text-[#6b6b6b]">
          {items.length > 0 && (
            <>
              <span>{items.length} item{items.length !== 1 ? "s" : ""}</span>
              <span className="text-[#efefef]">|</span>
              <span className="font-semibold text-[#1a1a1a]">
                Total: {formatCurrency(totalCents / 100)}
              </span>
              {selectedCount > 0 && (
                <>
                  <span className="text-[#efefef]">|</span>
                  <button
                    type="button"
                    onClick={deleteSelected}
                    className="flex items-center gap-1 text-xs font-medium text-[#a13d3d] hover:text-[#7a2d2d] transition-colors"
                  >
                    <Trash2 size={12} />
                    Delete {selectedCount} selected
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* Column visibility picker */}
        <div className="relative flex-shrink-0" ref={colPickerRef}>
          <button
            type="button"
            onClick={() => setColPickerOpen((o) => !o)}
            title="Column settings"
            aria-label="Column settings"
            className="flex items-center gap-1.5 text-xs text-[#6b6b6b] hover:text-[#1a1a1a] border border-[#e8e8e8] rounded-lg px-2 py-1.5 hover:bg-[#f5f4f0] transition-colors"
          >
            <Settings2 size={12} />
            Columns
          </button>
          {colPickerOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-[#efefef] rounded-xl shadow-lg py-1 min-w-[160px]">
              <p className="px-3 py-1.5 text-[10px] font-semibold text-[#afafaf] uppercase tracking-wide">
                Show / hide columns
              </p>
              {TOGGLEABLE_COLS.map((col) => {
                const column = table.getColumn(col.id);
                if (!column) return null;
                const visible = column.getIsVisible();
                return (
                  <label
                    key={col.id}
                    className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-[#1a1a1a] hover:bg-[#faf9f7] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="accent-[#155e63] cursor-pointer"
                      checked={visible}
                      onChange={() => column.toggleVisibility(!visible)}
                    />
                    {col.label}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Spreadsheet table */}
      <div className="border border-[#efefef] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[900px]" style={{ tableLayout: "fixed" }}>
            <colgroup>
              {table.getAllColumns().map((col) => (
                <col key={col.id} style={{ width: col.getSize() }} />
              ))}
            </colgroup>

            {/* Filter row */}
            <thead>
              <tr className="border-b border-[#f0f0f0]">
                {table.getHeaderGroups()[0].headers.map((header) => {
                  const col = header.column;
                  const canSort = col.getCanSort();
                  const sortDir = col.getIsSorted();
                  return (
                    <th key={header.id} className={`${headerCellCls} ${getStickyColCls(header.id, "bg-[#faf9f7]")}`}>
                      <div
                        className={`flex items-center gap-1 ${canSort ? "cursor-pointer hover:text-[#1a1a1a]" : ""}`}
                        onClick={canSort ? col.getToggleSortingHandler() : undefined}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className="text-[#c0c0c0]">
                            {sortDir === "asc" ? (
                              <ArrowUp size={10} />
                            ) : sortDir === "desc" ? (
                              <ArrowDown size={10} />
                            ) : (
                              <ArrowUpDown size={10} />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
              {/* Filter inputs row */}
              <tr className="border-b border-[#e8e8e8]">
                {table.getHeaderGroups()[0].headers.map((header) => {
                  const col = header.column;
                  if (!col.getCanFilter()) {
                    return <td key={header.id} className={`px-2 py-1 bg-[#faf9f7] ${getStickyColCls(header.id, "bg-[#faf9f7]")}`} />;
                  }
                  return (
                    <td key={header.id} className={`px-2 py-1 bg-[#faf9f7] ${getStickyColCls(header.id, "bg-[#faf9f7]")}`}>
                      <input
                        type="text"
                        className="w-full text-[10px] bg-white border border-[#e8e8e8] rounded px-2 py-1 text-[#1a1a1a] placeholder-[#d0d0d0] focus:outline-none focus:border-[#155e63]"
                        placeholder="Filter…"
                        value={(col.getFilterValue() as string) ?? ""}
                        onChange={(e) => col.setFilterValue(e.target.value || undefined)}
                      />
                    </td>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="text-center py-10 text-sm text-[#afafaf]"
                  >
                    No equipment added yet.
                  </td>
                </tr>
              )}
              {table.getRowModel().rows.map((row) => {
                const item = row.original;
                const fund = isFundRow(item);
                const selected = row.getIsSelected();
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-[#f5f5f5] last:border-b-0 transition-colors ${
                      selected
                        ? "bg-[#f0f7f7]"
                        : fund
                        ? "bg-[#f4f9f8]/60"
                        : "bg-white hover:bg-[#faf9f7]"
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={`${cellCls} ${getStickyColCls(
                          cell.column.id,
                          selected ? "bg-[#f0f7f7]" : fund ? "bg-[#f4f9f8]" : "bg-white"
                        )}`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add row button */}
      {canEdit && (
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-2 text-sm font-medium text-[#155e63] border border-[#cfe0e1] rounded-xl px-4 py-2.5 hover:bg-[#155e63]/5 transition-colors w-full justify-center"
        >
          <Plus size={14} aria-hidden="true" />
          Add row
        </button>
      )}
    </div>
  );
}
