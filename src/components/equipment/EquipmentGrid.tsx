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
} from "@/app/(app)/workspace/financials/financials-workspace";
import { formatCurrency } from "@/lib/financial-projection";
import { useCurrency } from "@/components/CurrencyProvider";
import { MoneyInput } from "@/components/ui/money-input";
import {
  TABLE_CELL_TEXT,
  TABLE_HEADER_TEXT,
  TABLE_ACTION_ICON_SIZE,
} from "@/lib/workspace-table";

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
    // TIM-3329: must NOT default to a FUND category (ceramics/glassware/
    // to_go_ware/miscellaneous), or isFundRow() will hide vendor/model/
    // supplier/cost/useful_life cells and Tab from the name cell falls
    // through to <body> because the next column has no input to focus.
    // Users can change the category in-place after typing the name.
    category: "furniture_fixtures",
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

  // TIM-3329: Tab/Enter unmounts this input via parent's setEditingCell,
  // and onBlur on an unmounting element is unreliable. Flush draft FIRST,
  // then delegate to parent for navigation.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
      onCommit(draft);
    }
    onKeyDown(e);
  };

  const cls =
    "w-full h-full text-xs text-[var(--foreground)] bg-transparent outline-none resize-none border-0 p-0 placeholder-[var(--neutral-cool-400)]";

  if (multiline) {
    return (
      <textarea
        ref={inputRef as React.Ref<HTMLTextAreaElement>}
        className={cls}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={handleKeyDown}
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
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={handleKeyDown}
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
  const { symbol } = useCurrency();
  const [draft, setDraft] = useState(valueCents > 0 ? String(valueCents / 100) : "");

  useEffect(() => {
    setDraft(valueCents > 0 ? String(valueCents / 100) : "");
  }, [valueCents]);

  // TIM-3329: flush draft on Tab/Enter before parent navigates (see TextCell).
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
      onCommit(Math.round((parseFloat(draft) || 0) * 100));
    }
    onKeyDown(e);
  };

  return (
    <div className="flex items-center gap-0.5 w-full h-full">
      <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{symbol}</span>
      <input
        ref={inputRef}
        type="number"
        min={0}
        step={50}
        className="w-full h-full text-xs text-[var(--foreground)] bg-transparent outline-none border-0 p-0 placeholder-[var(--neutral-cool-400)]"
        value={draft}
        placeholder="0"
        disabled={disabled}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(Math.round((parseFloat(draft) || 0) * 100))}
        onKeyDown={handleKeyDown}
      />
    </div>
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
  // TIM-3329: flush draft on Tab/Enter before parent navigates (see TextCell).
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
      onCommit(Math.max(1, Math.min(50, Math.round(parseFloat(draft) || 7))));
    }
    onKeyDown(e);
  };
  return (
    <input
      ref={inputRef}
      type="number"
      min={1}
      max={50}
      step={1}
      className="w-full h-full text-xs text-[var(--foreground)] bg-transparent outline-none border-0 p-0"
      value={draft}
      disabled={disabled}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(Math.max(1, Math.min(50, Math.round(parseFloat(draft) || 7))))}
      onKeyDown={handleKeyDown}
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
      className="w-full h-full text-xs text-[var(--foreground)] bg-transparent outline-none border-0 p-0 cursor-pointer"
      value={value}
      disabled={disabled}
      autoFocus
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
  const { format, symbol } = useCurrency();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border-medium)] py-10 text-center">
          <p className="text-sm text-[var(--dark-grey)]">No equipment added yet.</p>
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
              fund ? "border-[var(--teal-tint)] bg-[var(--teal-tint-500)]/30" : "border-[var(--border)]"
            }`}
          >
            <div
              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
              onClick={() => setExpandedId(open ? null : item.id)}
            >
              {fund && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--teal-tint)] text-[var(--teal)] shrink-0">
                  Fund
                </span>
              )}
              <span className="text-sm text-[var(--foreground)] flex-1 truncate font-medium">
                {item.name || <span className="text-[var(--dark-grey)] font-normal">Unnamed</span>}
              </span>
              <span className="text-xs font-semibold text-[var(--foreground)] shrink-0">
                {total > 0 ? format(total / 100) : `${symbol}0`}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                  className="text-[var(--dark-grey)] hover:text-[var(--error)] p-1 shrink-0"
                  aria-label="Delete"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            {open && (
              <div className="border-t border-[var(--border)] px-3 py-3 space-y-2 bg-[var(--background)]">
                {[
                  { label: "Name", key: "name" as const, type: "text", placeholder: "Item name" },
                  ...(!fund ? [
                    { label: "Brand", key: "vendor" as const, type: "text", placeholder: "Brand" },
                    { label: "Model", key: "model" as const, type: "text", placeholder: "Model" },
                    { label: "Supplier", key: "supplier" as const, type: "text", placeholder: "Supplier" },
                  ] : []),
                  { label: "Cost", key: "unit_cost_cents" as const, type: "cost", placeholder: "0" },
                  { label: "Notes", key: "notes" as const, type: "text", placeholder: "Notes" },
                ].map(({ label, key, type, placeholder }) => (
                  <div key={key}>
                    <label className="block text-[10px] font-medium text-[var(--muted-foreground)] mb-0.5">{label}</label>
                    {type === "cost" ? (
                      <MoneyInput
                        min={0}
                        className="w-full text-xs border border-[var(--border-medium)] rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus:border-[var(--teal)]"
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
                        className="w-full text-xs border border-[var(--border-medium)] rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus:border-[var(--teal)]"
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
                    <label className="block text-[10px] font-medium text-[var(--muted-foreground)] mb-0.5">Category</label>
                    <select
                      className="w-full text-xs border border-[var(--border-medium)] rounded-lg px-2 py-1.5 focus-visible:outline-none focus:border-[var(--teal)]"
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
                    <label className="block text-[10px] font-medium text-[var(--muted-foreground)] mb-0.5">Financing</label>
                    <select
                      className="w-full text-xs border border-[var(--border-medium)] rounded-lg px-2 py-1.5 focus-visible:outline-none focus:border-[var(--teal)]"
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
          className="flex items-center gap-2 text-sm font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-4 py-2.5 hover:bg-[var(--teal)]/5 transition-colors w-full justify-center"
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
  // TIM-3329: accept functional updater so synchronous multi-update sequences
  // (commit-on-Tab + addRow) compose correctly.
  onItemsChange: (
    next: EquipmentItem[] | ((prev: EquipmentItem[]) => EquipmentItem[])
  ) => void;
}

export function EquipmentGrid({
  planId,
  canEdit,
  items,
  onItemsChange,
}: EquipmentGridProps) {
  const { format, symbol } = useCurrency();
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

  // TIM-3329: latest items snapshot for use inside async timer callbacks.
  // Without this, scheduleAutosave closes over a stale `items` array; when the
  // debounced createRow/patchRow timer fires after the user has moved on to
  // edit OTHER rows, the closure's `items.map(...)` overwrites those rows
  // with stale state.
  const itemsRef = useRef<EquipmentItem[]>(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

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

  // TIM-3329: read items from itemsRef (latest) to avoid stale-closure overwrites.
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
      onItemsChange((prev) => prev.map((i) => (i.id === id ? updated : i)));
    } catch {
      // silent — optimistic UI already applied
    }
  }, [onItemsChange]);

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
      // TIM-3329: functional updater so this composes with other state updates
      // (e.g. an addRow in the same Tab-keydown handler) without overwriting.
      onItemsChange((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...patch } : i))
      );
    },
    [onItemsChange]
  );

  const scheduleAutosave = useCallback(
    (id: string, patch: Partial<EquipmentItem>) => {
      if (!canEdit) return;

      // Accumulate patch (always — even mid-create, so we don't lose keystrokes)
      const existing = pendingPatches.current.get(id) ?? {};
      pendingPatches.current.set(id, { ...existing, ...patch });

      // TIM-3329: if this tempId is mid-create, do NOT set a new timer.
      // The in-flight createRow will drain pendingPatches under the real id
      // when it returns. Otherwise we'd either lose patches (creatingRows
      // guard returns null) or POST a duplicate row.
      if (id.startsWith("__new_") && creatingRows.current.has(id)) return;

      // Reset debounce
      const existing_timer = debounceTimers.current.get(id);
      if (existing_timer) clearTimeout(existing_timer);

      const timer = setTimeout(async () => {
        const accumulated = pendingPatches.current.get(id);
        if (!accumulated) return;
        pendingPatches.current.delete(id);

        if (id.startsWith("__new_")) {
          // Materialize the row
          const current = itemsRef.current.find((i) => i.id === id);
          if (!current) return;
          const created = await createRow(id, { ...current, ...accumulated });
          if (created) {
            // Swap tempId → real id using functional updater so concurrent
            // edits to OTHER rows aren't overwritten by a stale snapshot.
            onItemsChange((prev) =>
              prev.map((i) => (i.id === id ? { ...created, ...accumulated } : i))
            );
            // Drain any patches that accumulated during the in-flight POST.
            const buffered = pendingPatches.current.get(id);
            if (buffered) {
              pendingPatches.current.delete(id);
              const existingReal = pendingPatches.current.get(created.id) ?? {};
              pendingPatches.current.set(created.id, { ...existingReal, ...buffered });
              // Flush buffered patches against the real id via patchRow.
              await patchRow(created.id, pendingPatches.current.get(created.id)!);
              pendingPatches.current.delete(created.id);
            }
          }
        } else {
          await patchRow(id, accumulated);
        }
      }, AUTOSAVE_DEBOUNCE_MS);

      debounceTimers.current.set(id, timer);
    },
    [canEdit, createRow, patchRow, onItemsChange]
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

  // ── Add row ──────────────────────────────────────────────────────────────────

  const addRow = useCallback(() => {
    if (!canEdit) return;
    // TIM-3329: functional updater — composes with any commit-on-Tab from the
    // cell that's blurring synchronously in the same handler.
    let blankId = "";
    onItemsChange((prev) => {
      const blank = newBlankItem(planId, prev.length);
      blankId = blank.id;
      return [...prev, blank];
    });
    // TIM-3329: focus the new row's name input (not just set editingCell) so
    // the user can start typing immediately — true both for the Add-row button
    // path AND for the Tab-past-last-column path, where this is the only way
    // the directive's "5 items in a row using only Tab" flow can land data.
    setTimeout(() => {
      if (blankId) focusCell(blankId, "name");
    }, 30);
  }, [canEdit, planId, onItemsChange, focusCell]);

  // ── Delete selected rows ─────────────────────────────────────────────────────

  const deleteSelected = useCallback(() => {
    const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
    const toDelete = items.filter((i) => selectedIds.includes(i.id));
    onItemsChange((prev) => prev.filter((i) => !selectedIds.includes(i.id)));
    toDelete.forEach((i) => deleteRow(i.id));
    setRowSelection({});
  }, [rowSelection, items, onItemsChange, deleteRow]);

  const deleteSingleRow = useCallback(
    (id: string) => {
      onItemsChange((prev) => prev.filter((i) => i.id !== id));
      deleteRow(id);
    },
    [onItemsChange, deleteRow]
  );

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent, rowId: string, colKey: EditableCol) => {
      const sortedRows = table.getSortedRowModel().rows;
      const rowIdx = sortedRows.findIndex((r) => r.original.id === rowId);

      if (e.key === "Tab") {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;

        // TIM-3329: navigate only through VISIBLE editable columns. If the
        // user has hidden e.g. Brand or Cost via the column picker, Tab
        // would otherwise land on a column whose <td> doesn't render and
        // autoFocus has no input to grab, dropping focus to <body>.
        const visibleEditableCols = EDITABLE_COLS.filter(
          (c) => columnVisibility[c] !== false,
        );
        if (visibleEditableCols.length === 0) return;
        const visIdx = visibleEditableCols.indexOf(colKey);
        // If current cell isn't in the visible set (shouldn't happen, but
        // defensive), start from position 0.
        const fromIdx = visIdx === -1 ? 0 : visIdx;
        let nextVisIdx = fromIdx + dir;
        let nextRowIdx = rowIdx;

        if (nextVisIdx >= visibleEditableCols.length) {
          nextVisIdx = 0;
          nextRowIdx++;
        } else if (nextVisIdx < 0) {
          nextVisIdx = visibleEditableCols.length - 1;
          nextRowIdx--;
        }

        if (nextRowIdx >= 0 && nextRowIdx < sortedRows.length) {
          const nextRow = sortedRows[nextRowIdx];
          focusCell(nextRow.original.id, visibleEditableCols[nextVisIdx]);
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
    [focusCell, addRow, columnVisibility]
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
            className="accent-[var(--teal)] cursor-pointer"
            checked={t.getIsAllPageRowsSelected()}
            onChange={t.getToggleAllPageRowsSelectedHandler()}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="accent-[var(--teal)] cursor-pointer"
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
                    className="block truncate text-xs text-[var(--foreground)] cursor-text"
                    onClick={() => canEdit && focusCell(item.id, "name")}
                  >
                    {item.name || <span className="text-[var(--neutral-cool-400)]">Name</span>}
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
              className="block truncate text-xs text-[var(--foreground)] cursor-text"
              onClick={() => canEdit && focusCell(item.id, "vendor")}
            >
              {item.vendor || <span className="text-[var(--neutral-cool-400)]">Brand</span>}
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
              className="block truncate text-xs text-[var(--foreground)] cursor-text"
              onClick={() => canEdit && focusCell(item.id, "model")}
            >
              {item.model || <span className="text-[var(--neutral-cool-400)]">Model</span>}
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
              className="block truncate text-xs text-[var(--foreground)] cursor-text"
              onClick={() => canEdit && focusCell(item.id, "supplier")}
            >
              {item.supplier || <span className="text-[var(--neutral-cool-400)]">Supplier</span>}
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
              className="block truncate text-xs text-[var(--foreground)] cursor-text font-medium"
              onClick={() => canEdit && focusCell(item.id, "unit_cost_cents")}
            >
              {item.unit_cost_cents > 0
                ? format(item.unit_cost_cents / 100)
                : <span className="text-[var(--neutral-cool-400)] font-normal">{symbol}0</span>
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
              className="block truncate text-xs text-[var(--foreground)] cursor-text"
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
                <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-[var(--teal-tint)] text-[var(--teal)]">
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
                    className="block truncate text-xs text-[var(--foreground)] cursor-text"
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
              className="block truncate text-xs text-[var(--foreground)] cursor-text"
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
              className="block truncate text-xs text-[var(--muted-foreground)] cursor-text"
              onClick={() => canEdit && focusCell(item.id, "notes")}
            >
              {item.notes || <span className="text-[var(--neutral-cool-400)]">Notes</span>}
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
              className="text-[var(--neutral-cool-400)] hover:text-[var(--error)] transition-colors p-0.5"
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
    `px-2.5 py-2 ${TABLE_CELL_TEXT} border-r border-[var(--neutral-cool-150)] last:border-r-0 align-top`;
  const headerCellCls =
    `px-2.5 py-2 text-left ${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] border-r border-[var(--neutral-cool-150)] last:border-r-0 bg-[var(--background)] select-none`;

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-4 text-xs text-[var(--muted-foreground)]">
          {items.length > 0 && (
            <>
              <span>{items.length} item{items.length !== 1 ? "s" : ""}</span>
              <span className="text-[var(--border)]">|</span>
              <span className="font-semibold text-[var(--foreground)]">
                Total: {format(totalCents / 100)}
              </span>
              {selectedCount > 0 && (
                <>
                  <span className="text-[var(--border)]">|</span>
                  <button
                    type="button"
                    onClick={deleteSelected}
                    className="flex items-center gap-1 text-xs font-medium text-[var(--error)] hover:text-[var(--error-dark)] transition-colors"
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
            className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--neutral-cool-200)] rounded-lg px-2 py-1.5 hover:bg-[var(--surface-warm-100)] transition-colors"
          >
            <Settings2 size={12} />
            Columns
          </button>
          {colPickerOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-[var(--border)] rounded-xl shadow-lg py-1 min-w-[160px]">
              <p className="px-3 py-1.5 text-[10px] font-semibold text-[var(--dark-grey)] uppercase tracking-wide">
                Show / hide columns
              </p>
              {TOGGLEABLE_COLS.map((col) => {
                const column = table.getColumn(col.id);
                if (!column) return null;
                const visible = column.getIsVisible();
                return (
                  <label
                    key={col.id}
                    className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--background)] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="accent-[var(--teal)] cursor-pointer"
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
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[900px]" style={{ tableLayout: "fixed" }}>
            <colgroup>
              {table.getAllColumns().map((col) => (
                <col key={col.id} style={{ width: col.getSize() }} />
              ))}
            </colgroup>

            {/* Filter row */}
            <thead>
              <tr className="border-b border-[var(--neutral-cool-150)]">
                {table.getHeaderGroups()[0].headers.map((header) => {
                  const col = header.column;
                  const canSort = col.getCanSort();
                  const sortDir = col.getIsSorted();
                  return (
                    <th key={header.id} className={`${headerCellCls} ${getStickyColCls(header.id, "bg-[var(--background)]")}`}>
                      <div
                        className={`flex items-center gap-1 ${canSort ? "cursor-pointer hover:text-[var(--foreground)]" : ""}`}
                        onClick={canSort ? col.getToggleSortingHandler() : undefined}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className="text-[var(--neutral-cool-400)]">
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
              <tr className="border-b border-[var(--neutral-cool-200)]">
                {table.getHeaderGroups()[0].headers.map((header) => {
                  const col = header.column;
                  if (!col.getCanFilter()) {
                    return <td key={header.id} className={`px-2 py-1 bg-[var(--background)] ${getStickyColCls(header.id, "bg-[var(--background)]")}`} />;
                  }
                  return (
                    <td key={header.id} className={`px-2 py-1 bg-[var(--background)] ${getStickyColCls(header.id, "bg-[var(--background)]")}`}>
                      <input
                        type="text"
                        className="w-full text-[10px] bg-white border border-[var(--neutral-cool-200)] rounded px-2 py-1 text-[var(--foreground)] placeholder-[var(--neutral-cool-350)] focus-visible:outline-none focus:border-[var(--teal)]"
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
                    className="text-center py-10 text-sm text-[var(--dark-grey)]"
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
                    className={`border-b border-[var(--neutral-cool-100)] last:border-b-0 transition-colors ${
                      selected
                        ? "bg-[var(--teal-bg-pale)]"
                        : fund
                        ? "bg-[var(--teal-tint-500)]/60"
                        : "bg-white hover:bg-[var(--background)]"
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={`${cellCls} ${getStickyColCls(
                          cell.column.id,
                          selected ? "bg-[var(--teal-bg-pale)]" : fund ? "bg-[var(--teal-tint-500)]" : "bg-white"
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
          className="flex items-center gap-2 text-sm font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-4 py-2.5 hover:bg-[var(--teal)]/5 transition-colors w-full justify-center"
        >
          <Plus size={14} aria-hidden="true" />
          Add row
        </button>
      )}
    </div>
  );
}
