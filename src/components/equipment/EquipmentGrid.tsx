"use client";

// TIM-1005: Spreadsheet-style equipment data entry (replaces expand-card).
// TIM-3329: Keyboard navigation, Tab flow, inline cell persistence.
// TIM-3331: Categories-as-sections layout with subtotals + grand total.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Plus, Trash2, Settings2, X, ChevronUp, ChevronDown as ChevronDownIcon } from "lucide-react";
import type {
  EquipmentItem,
  EquipmentCategory,
  FinancingMethod,
} from "@/app/(app)/workspace/financials/financials-workspace";
import { useCurrency } from "@/components/CurrencyProvider";
import { MoneyInput } from "@/components/ui/money-input";
import {
  TABLE_CELL_TEXT,
  TABLE_HEADER_TEXT,
  TABLE_ACTION_ICON_SIZE,
  TABLE_ROW_PADDING,
  TABLE_PRICE_CLS,
} from "@/lib/workspace-table";
import {
  SectionHeaderRow,
  SectionSubtotalRow,
  GrandTotalRow,
} from "@/lib/workspace-table-rows";

// ── Constants ──────────────────────────────────────────────────────────────────

const SECTION_COLLAPSE_KEY = "tcs-equipment-section-collapse";

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

const DEFAULT_CATEGORIES: EquipmentCategory[] = [
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

const NEW_FINANCING: FinancingMethod[] = [
  "cash",
  "in_house_financing",
  "loan",
  "lease",
  "credit_card",
  "other",
];

const FINANCING_LABELS: Record<string, string> = {
  cash: "Cash",
  in_house_financing: "In-House Financing",
  loan: "Loan",
  lease: "Lease",
  credit_card: "Credit Card",
  other: "Other",
  credit: "Credit",
};

const AUTOSAVE_DEBOUNCE_MS = 400;

// Editable columns in Tab order. Category is a section header, not a column.
const EDITABLE_COLS = [
  "name",
  "quantity",
  "unit_cost_cents",
  "vendor",
  "model",
  "supplier",
  "financing_method",
  "useful_life_years",
  "notes",
] as const;

type EditableCol = (typeof EDITABLE_COLS)[number];

const TOGGLEABLE_COLS: { id: EditableCol; label: string }[] = [
  { id: "vendor",            label: "Brand" },
  { id: "model",             label: "Model" },
  { id: "supplier",          label: "Supplier" },
  { id: "unit_cost_cents",   label: "Cost" },
  { id: "financing_method",  label: "Financing" },
  { id: "useful_life_years", label: "Useful Life" },
  { id: "notes",             label: "Notes" },
];

function loadColVisibility(): Record<EditableCol, boolean> {
  try {
    const raw = localStorage.getItem("tcs-equipment-col-visibility");
    if (raw) return JSON.parse(raw) as Record<EditableCol, boolean>;
  } catch { /* ignore */ }
  return {} as Record<EditableCol, boolean>;
}

function saveColVisibility(v: Record<EditableCol, boolean>) {
  try {
    localStorage.setItem("tcs-equipment-col-visibility", JSON.stringify(v));
  } catch { /* ignore */ }
}

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

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

function isFundRow(item: EquipmentItem): boolean {
  return FUND_CATEGORIES.includes(item.category as EquipmentCategory);
}

function newBlankItem(planId: string, position: number, category: string): EquipmentItem {
  return {
    id: `__new_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    plan_id: planId,
    position,
    section_id: null,
    name: "",
    // TIM-3329: must NOT default to a FUND category (ceramics/glassware/
    // to_go_ware/miscellaneous), or isFundRow() will hide vendor/model/
    // supplier/cost/useful_life cells and Tab from the name cell falls
    // through to <body> because the next column has no input to focus.
    category: (category || "furniture_fixtures") as EquipmentCategory,
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

function NumberCell({
  value,
  placeholder,
  min,
  max,
  step,
  disabled,
  onCommit,
  onKeyDown,
  inputRef,
}: {
  value: number;
  placeholder: string;
  min?: number;
  max?: number;
  step?: number;
  disabled: boolean;
  onCommit: (v: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.Ref<HTMLInputElement>;
}) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : "");
  useEffect(() => { setDraft(value > 0 ? String(value) : ""); }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
      onCommit(parseFloat(draft) || 0);
    }
    onKeyDown(e);
  };

  return (
    <input
      ref={inputRef}
      type="number"
      min={min}
      max={max}
      step={step}
      className="w-full h-full text-xs text-[var(--foreground)] bg-transparent outline-none border-0 p-0 placeholder-[var(--neutral-cool-400)]"
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(parseFloat(draft) || 0)}
      onKeyDown={handleKeyDown}
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

// ── Mobile card list ──────────────────────────────────────────────────────────

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
  onAdd: (category: string) => void;
}) {
  const { format, symbol } = useCurrency();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const active = items.filter((i) => !i.archived);
  const categoryOrder = Array.from(new Map(active.map((i) => [i.category, true])).keys());
  const grouped = categoryOrder.map((cat) => ({
    cat,
    items: active.filter((i) => i.category === cat),
  }));
  const grandTotal = active.reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0);

  return (
    <div className="space-y-4">
      {grouped.map(({ cat, items: catItems }) => {
        const subtotal = catItems.reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0);
        return (
          <div key={cat}>
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]">
                {getCategoryLabel(cat)}
              </span>
              <span className="text-[10px] font-semibold text-[var(--muted-foreground)]">
                {format(subtotal / 100)}
              </span>
            </div>
            <div className="space-y-2">
              {catItems.map((item) => {
                const fund = isFundRow(item);
                const total = item.unit_cost_cents * item.quantity;
                const open = expandedId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`border rounded-xl bg-white overflow-hidden ${
                      fund ? "border-[var(--teal-tint)]" : "border-[var(--border)]"
                    }`}
                  >
                    <div
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                      onClick={() => setExpandedId(open ? null : item.id)}
                    >
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
                          { label: "Name", key: "name" as const, placeholder: "Item name" },
                          ...(!fund ? [
                            { label: "Brand", key: "vendor" as const, placeholder: "Brand" },
                            { label: "Model", key: "model" as const, placeholder: "Model" },
                            { label: "Supplier", key: "supplier" as const, placeholder: "Supplier" },
                          ] : []),
                          { label: "Notes", key: "notes" as const, placeholder: "Notes" },
                        ].map(({ label, key, placeholder }) => (
                          <div key={key}>
                            <label className="block text-[10px] font-medium text-[var(--muted-foreground)] mb-0.5">{label}</label>
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
                          </div>
                        ))}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-medium text-[var(--muted-foreground)] mb-0.5">Qty</label>
                            <input
                              type="number"
                              min={1}
                              className="w-full text-xs border border-[var(--border-medium)] rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus:border-[var(--teal)]"
                              value={item.quantity}
                              disabled={!canEdit}
                              onChange={(e) =>
                                onUpdate(item.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })
                              }
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-[var(--muted-foreground)] mb-0.5">Unit Cost</label>
                            <MoneyInput
                              min={0}
                              className="w-full text-xs border border-[var(--border-medium)] rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus:border-[var(--teal)]"
                              value={item.unit_cost_cents > 0 ? item.unit_cost_cents / 100 : ""}
                              placeholder="0"
                              disabled={!canEdit}
                              onChange={(e) =>
                                onUpdate(item.id, { unit_cost_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                              }
                            />
                          </div>
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
                    )}
                  </div>
                );
              })}

              {canEdit && (
                <button
                  type="button"
                  onClick={() => onAdd(cat)}
                  className="flex items-center gap-2 text-sm font-medium text-[var(--teal)] border border-dashed border-[var(--teal-tint)] rounded-xl px-4 py-2 hover:bg-[var(--teal)]/5 transition-colors w-full justify-center"
                >
                  <Plus size={13} aria-hidden="true" />
                  Add {getCategoryLabel(cat)} item
                </button>
              )}
            </div>
          </div>
        );
      })}

      {active.length > 0 && (
        <div className="flex items-center justify-between border-t border-[var(--neutral-cool-200)] pt-3 px-1">
          <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wide">Grand Total</span>
          <span className="text-sm font-bold text-[var(--foreground)]">{format(grandTotal / 100)}</span>
        </div>
      )}
    </div>
  );
}

// ── Add Category Dialog ───────────────────────────────────────────────────────

function AddCategoryDialog({
  existingCategories,
  onAdd,
  onClose,
}: {
  existingCategories: string[];
  onAdd: (category: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"select" | "custom">("select");
  const [selected, setSelected] = useState("");
  const [custom, setCustom] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "custom" && inputRef.current) inputRef.current.focus();
  }, [mode]);

  const available = DEFAULT_CATEGORIES.filter((c) => !existingCategories.includes(c));

  function handleAdd() {
    const cat = mode === "custom" ? custom.trim() : selected;
    if (!cat) return;
    onAdd(cat);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Add Category</h3>
          <button type="button" onClick={onClose} className="text-[var(--neutral-cool-400)] hover:text-[var(--foreground)] p-1">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          {(["select", "custom"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`flex-1 text-xs rounded-lg py-1.5 font-medium border transition-colors ${
                mode === m
                  ? "bg-[var(--teal)] text-white border-[var(--teal)]"
                  : "border-[var(--border)] text-[var(--foreground)] hover:border-[var(--teal)]"
              }`}
              onClick={() => setMode(m)}
            >
              {m === "select" ? "Standard" : "Custom"}
            </button>
          ))}
        </div>

        {mode === "select" ? (
          available.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)] text-center py-3">
              All standard categories are already in use.
            </p>
          ) : (
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {available.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${
                    selected === cat
                      ? "bg-[var(--teal)] text-white"
                      : "hover:bg-[var(--background)] text-[var(--foreground)]"
                  }`}
                  onClick={() => setSelected(cat)}
                >
                  {getCategoryLabel(cat)}
                </button>
              ))}
            </div>
          )
        ) : (
          <input
            ref={inputRef}
            type="text"
            className="w-full text-xs border border-[var(--border-medium)] rounded-lg px-3 py-2 focus-visible:outline-none focus:border-[var(--teal)]"
            placeholder="e.g. Cold Brew Equipment"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          />
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--background)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={mode === "select" ? !selected : !custom.trim()}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--teal)] text-white font-medium hover:bg-[var(--teal-dark,var(--teal))] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add Category
          </button>
        </div>
      </div>
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

const TOTAL_COLS = 11; // name, qty, unitCost, total, brand, model, supplier, financing, usefulLife, notes, actions

export function EquipmentGrid({
  planId,
  canEdit,
  items,
  onItemsChange,
}: EquipmentGridProps) {
  const { format, symbol } = useCurrency();
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: EditableCol } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [colVisibility, setColVisibility] = useState<Record<EditableCol, boolean>>({} as Record<EditableCol, boolean>);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingPatches = useRef<Map<string, Partial<EquipmentItem>>>(new Map());
  const creatingRows = useRef<Set<string>>(new Set());
  const cellInputRefs = useRef<Map<string, HTMLElement | null>>(new Map());

  // TIM-3329: latest items snapshot for use inside async timer callbacks.
  const itemsRef = useRef<EquipmentItem[]>(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => { setCollapsed(loadCollapsed()); }, []);
  useEffect(() => { setColVisibility(loadColVisibility()); }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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

  // ── Derived sections ─────────────────────────────────────────────────────────

  const active = useMemo(() => items.filter((i) => !i.archived), [items]);

  const categoryOrder = useMemo(
    () => Array.from(new Map(active.map((i) => [i.category, true])).keys()),
    [active]
  );

  const sections = useMemo(
    () =>
      categoryOrder.map((cat) => ({
        cat,
        label: getCategoryLabel(cat),
        items: active.filter((i) => i.category === cat).sort((a, b) => a.position - b.position),
      })),
    [categoryOrder, active]
  );

  const grandTotal = useMemo(
    () => active.reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0),
    [active]
  );

  // Flat ordered list for Tab navigation (excludes collapsed sections)
  const flatVisibleItems = useMemo(
    () => sections.flatMap((s) => (collapsed[s.cat] ? [] : s.items)),
    [sections, collapsed]
  );

  // ── Section collapse ─────────────────────────────────────────────────────────

  function toggleSection(cat: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [cat]: !prev[cat] };
      saveCollapsed(next);
      return next;
    });
  }

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
            useful_life_years: item.useful_life_years,
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

  const patchRow = useCallback(
    async (id: string, patch: Partial<EquipmentItem>) => {
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
      } catch { /* silent */ }
    },
    [onItemsChange]
  );

  const deleteRow = useCallback(async (id: string) => {
    if (!id || id.startsWith("__new_")) return;
    try {
      await fetch(`/api/workspaces/financials/equipment/${id}`, { method: "DELETE" });
    } catch { /* silent */ }
  }, []);

  // ── Item mutation helpers ────────────────────────────────────────────────────

  const updateItemLocal = useCallback(
    (id: string, patch: Partial<EquipmentItem>) => {
      onItemsChange((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    },
    [onItemsChange]
  );

  const scheduleAutosave = useCallback(
    (id: string, patch: Partial<EquipmentItem>) => {
      if (!canEdit) return;

      const existing = pendingPatches.current.get(id) ?? {};
      pendingPatches.current.set(id, { ...existing, ...patch });

      // TIM-3329: if this tempId is mid-create, do NOT set a new timer.
      if (id.startsWith("__new_") && creatingRows.current.has(id)) return;

      const existingTimer = debounceTimers.current.get(id);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(async () => {
        const accumulated = pendingPatches.current.get(id);
        if (!accumulated) return;
        pendingPatches.current.delete(id);

        if (id.startsWith("__new_")) {
          const current = itemsRef.current.find((i) => i.id === id);
          if (!current) return;
          const created = await createRow(id, { ...current, ...accumulated });
          if (created) {
            onItemsChange((prev) =>
              prev.map((i) => (i.id === id ? { ...created, ...accumulated } : i))
            );
            // TIM-3329: re-point editingCell at the new server id so the next
            // cell stays mounted across the tempId → realId swap.
            setEditingCell((prev) =>
              prev && prev.rowId === id ? { rowId: created.id, colKey: prev.colKey } : prev
            );
            // Migrate cellInputRefs under new id.
            for (const col of EDITABLE_COLS) {
              const oldKey = `${id}:${col}`;
              const ref = cellInputRefs.current.get(oldKey);
              if (ref) {
                cellInputRefs.current.set(`${created.id}:${col}`, ref);
                cellInputRefs.current.delete(oldKey);
              }
            }
            const buffered = pendingPatches.current.get(id);
            if (buffered) {
              pendingPatches.current.delete(id);
              const existingReal = pendingPatches.current.get(created.id) ?? {};
              pendingPatches.current.set(created.id, { ...existingReal, ...buffered });
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
      } else if (colKey === "quantity") {
        patch = { quantity: Math.max(1, Math.round((rawValue as number) || 1)) };
      } else if (colKey === "useful_life_years") {
        patch = { useful_life_years: Math.max(1, Math.min(50, Math.round((rawValue as number) || 7))) };
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

  const addItem = useCallback(
    (category: string) => {
      if (!canEdit) return;
      let blankId = "";
      onItemsChange((prev) => {
        const blank = newBlankItem(planId, prev.filter((i) => !i.archived).length, category);
        blankId = blank.id;
        return [...prev, blank];
      });
      setTimeout(() => {
        if (blankId) focusCell(blankId, "name");
      }, 30);
      // Ensure section is expanded
      setCollapsed((prev) => {
        if (!prev[category]) return prev;
        const updated = { ...prev, [category]: false };
        saveCollapsed(updated);
        return updated;
      });
    },
    [canEdit, planId, onItemsChange, focusCell]
  );

  const addCategory = useCallback(
    (category: string) => {
      if (!canEdit) return;
      let blankId = "";
      onItemsChange((prev) => {
        const blank = newBlankItem(planId, prev.filter((i) => !i.archived).length, category);
        blankId = blank.id;
        return [...prev, blank];
      });
      setTimeout(() => {
        if (blankId) focusCell(blankId, "name");
      }, 30);
    },
    [canEdit, planId, onItemsChange, focusCell]
  );

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent, rowId: string, colKey: EditableCol) => {
      const rowIdx = flatVisibleItems.findIndex((i) => i.id === rowId);
      const item = flatVisibleItems[rowIdx];

      // TIM-3329: navigate only through VISIBLE editable columns.
      const visibleEditableCols = EDITABLE_COLS.filter((c) => colVisibility[c] !== false);
      if (visibleEditableCols.length === 0) return;

      if (e.key === "Tab") {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        const visIdx = visibleEditableCols.indexOf(colKey);
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

        if (nextRowIdx >= 0 && nextRowIdx < flatVisibleItems.length) {
          focusCell(flatVisibleItems[nextRowIdx].id, visibleEditableCols[nextVisIdx]);
        } else if (nextRowIdx >= flatVisibleItems.length && item) {
          addItem(item.category);
        }
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const nextRowIdx = rowIdx + 1;
        if (nextRowIdx < flatVisibleItems.length) {
          focusCell(flatVisibleItems[nextRowIdx].id, colKey);
        } else if (item) {
          addItem(item.category);
        }
      } else if (e.key === "Escape") {
        setEditingCell(null);
      }
    },
    [flatVisibleItems, colVisibility, focusCell, addItem]
  );

  // ── Delete row ───────────────────────────────────────────────────────────────

  const deleteSingleRow = useCallback(
    (id: string) => {
      onItemsChange((prev) => prev.filter((i) => i.id !== id));
      deleteRow(id);
    },
    [onItemsChange, deleteRow]
  );

  // ── Reorder within category ──────────────────────────────────────────────────

  const moveItem = useCallback(
    (id: string, direction: "up" | "down") => {
      if (!canEdit) return;
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      const catItems = itemsRef.current
        .filter((i) => !i.archived && i.category === item.category)
        .sort((a, b) => a.position - b.position);
      const idx = catItems.findIndex((i) => i.id === id);
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= catItems.length) return;
      const other = catItems[targetIdx];
      onItemsChange((prev) =>
        prev.map((i) => {
          if (i.id === id) return { ...i, position: other.position };
          if (i.id === other.id) return { ...i, position: item.position };
          return i;
        })
      );
      scheduleAutosave(id, { position: other.position });
      scheduleAutosave(other.id, { position: item.position });
    },
    [canEdit, onItemsChange, scheduleAutosave]
  );

  // ── Mobile ────────────────────────────────────────────────────────────────────

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
        onAdd={addItem}
      />
    );
  }

  // ── Spreadsheet ───────────────────────────────────────────────────────────────

  // TIM-3251: row padding from TABLE_ROW_PADDING (Menu ingredients-tab canon).
  const cellCls =
    `px-2.5 ${TABLE_ROW_PADDING} ${TABLE_CELL_TEXT} border-r border-[var(--neutral-cool-150)] last:border-r-0 align-middle`;
  const headerCellCls =
    `px-2.5 py-2.5 text-left ${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] border-r border-[var(--neutral-cool-150)] last:border-r-0 bg-[var(--background)] select-none`;

  function isColVisible(col: EditableCol): boolean {
    return colVisibility[col] !== false;
  }

  // Count visible columns for colSpan calculations
  const visibleColCount = (() => {
    // fixed: name(1) + qty(1) + cost(1) + total(1) + actions(1) = 5
    const toggleableVisible = TOGGLEABLE_COLS.filter((c) => isColVisible(c.id)).length;
    return 5 + toggleableVisible;
  })();

  function renderCell(item: EquipmentItem, colKey: EditableCol | "total") {
    const isActive = editingCell?.rowId === item.id && editingCell?.colKey === (colKey as EditableCol);
    const refKey = `${item.id}:${colKey}`;

    if (colKey === "name") {
      return isActive ? (
        <TextCell
          value={item.name}
          placeholder="Item name"
          disabled={!canEdit}
          onCommit={(v) => handleCellCommit(item.id, "name", v)}
          onKeyDown={(e) => handleCellKeyDown(e, item.id, "name")}
          inputRef={(el) => { cellInputRefs.current.set(refKey, el); }}
        />
      ) : (
        <div className="flex items-center gap-1.5 w-full">
          {item.source === "ai_suggested" && (
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-50 text-amber-600">
              AI
            </span>
          )}
          <span
            className="block truncate text-xs font-medium text-[var(--foreground)] cursor-text flex-1 min-w-0"
            onClick={() => canEdit && focusCell(item.id, "name")}
          >
            {item.name || <span className="font-normal text-[var(--neutral-cool-400)]">Name</span>}
          </span>
        </div>
      );
    }

    if (colKey === "quantity") {
      return isActive ? (
        <NumberCell
          value={item.quantity}
          placeholder="1"
          min={1}
          step={1}
          disabled={!canEdit}
          onCommit={(v) => handleCellCommit(item.id, "quantity", v)}
          onKeyDown={(e) => handleCellKeyDown(e, item.id, "quantity")}
          inputRef={(el) => { cellInputRefs.current.set(refKey, el as HTMLInputElement); }}
        />
      ) : (
        <span
          className="block text-xs text-[var(--foreground)] cursor-text"
          onClick={() => canEdit && focusCell(item.id, "quantity")}
        >
          {item.quantity}
        </span>
      );
    }

    if (colKey === "unit_cost_cents") {
      return isActive ? (
        <CostCell
          valueCents={item.unit_cost_cents}
          disabled={!canEdit}
          onCommit={(cents) => handleCellCommit(item.id, "unit_cost_cents", cents)}
          onKeyDown={(e) => handleCellKeyDown(e, item.id, "unit_cost_cents")}
          inputRef={(el) => { cellInputRefs.current.set(refKey, el as HTMLInputElement); }}
        />
      ) : (
        <span
          className={`block truncate ${TABLE_PRICE_CLS} cursor-text`}
          onClick={() => canEdit && focusCell(item.id, "unit_cost_cents")}
        >
          {item.unit_cost_cents > 0
            ? format(item.unit_cost_cents / 100)
            : <span className="text-[var(--neutral-cool-400)] font-normal">{symbol}0</span>
          }
        </span>
      );
    }

    if (colKey === "total") {
      const rowTotal = item.unit_cost_cents * item.quantity;
      return (
        <span className="block text-xs font-medium text-[var(--foreground)]">
          {rowTotal > 0
            ? format(rowTotal / 100)
            : <span className="text-[var(--neutral-cool-400)] font-normal">{symbol}0</span>
          }
        </span>
      );
    }

    if (colKey === "vendor") {
      return isActive ? (
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
    }

    if (colKey === "model") {
      return isActive ? (
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
    }

    if (colKey === "supplier") {
      return isActive ? (
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
    }

    if (colKey === "financing_method") {
      return isActive ? (
        <SelectCell
          value={item.financing_method}
          options={NEW_FINANCING.map((k) => ({ value: k, label: FINANCING_LABELS[k] }))}
          disabled={!canEdit}
          onCommit={(v) => handleCellCommit(item.id, "financing_method", v)}
          onKeyDown={(e) => handleCellKeyDown(e, item.id, "financing_method")}
          inputRef={(el) => { cellInputRefs.current.set(refKey, el as HTMLSelectElement); }}
        />
      ) : (
        <span
          className="block truncate text-xs text-[var(--foreground)] cursor-text"
          onClick={() => canEdit && focusCell(item.id, "financing_method")}
        >
          {FINANCING_LABELS[item.financing_method] ?? item.financing_method}
        </span>
      );
    }

    if (colKey === "useful_life_years") {
      return isActive ? (
        <UsefulLifeCell
          value={item.useful_life_years ?? 7}
          disabled={!canEdit}
          onCommit={(v) => handleCellCommit(item.id, "useful_life_years", v)}
          onKeyDown={(e) => handleCellKeyDown(e, item.id, "useful_life_years")}
          inputRef={(el) => { cellInputRefs.current.set(refKey, el as HTMLInputElement); }}
        />
      ) : (
        <span
          className="block text-xs text-[var(--foreground)] cursor-text"
          onClick={() => canEdit && focusCell(item.id, "useful_life_years")}
        >
          {item.useful_life_years ?? 7}yr
        </span>
      );
    }

    if (colKey === "notes") {
      return isActive ? (
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
    }

    return null;
  }

  return (
    <div className="space-y-3">
      {/* Stats bar + column picker */}
      <div className="flex items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
          {active.length > 0 && (
            <>
              <span>{active.length} item{active.length !== 1 ? "s" : ""}</span>
              <span className="text-[var(--border)]">|</span>
              <span>{sections.length} section{sections.length !== 1 ? "s" : ""}</span>
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
                const visible = colVisibility[col.id] !== false;
                return (
                  <label
                    key={col.id}
                    className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--background)] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="accent-[var(--teal)] cursor-pointer"
                      checked={visible}
                      onChange={() => {
                        setColVisibility((prev) => {
                          const next = { ...prev, [col.id]: !visible } as Record<EditableCol, boolean>;
                          saveColVisibility(next);
                          return next;
                        });
                      }}
                    />
                    {col.label}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sectioned table */}
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className={`w-full border-collapse min-w-[900px] ${TABLE_CELL_TEXT}`}
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: 190 }} />
              <col style={{ width: 55 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 100 }} />
              {isColVisible("vendor")            && <col style={{ width: 110 }} />}
              {isColVisible("model")             && <col style={{ width: 110 }} />}
              {isColVisible("supplier")          && <col style={{ width: 110 }} />}
              {isColVisible("financing_method")  && <col style={{ width: 110 }} />}
              {isColVisible("useful_life_years") && <col style={{ width: 72 }} />}
              {isColVisible("notes")             && <col style={{ width: 150 }} />}
              <col style={{ width: 68 }} />
            </colgroup>

            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[var(--neutral-cool-150)]">
                <th className={headerCellCls}>Item</th>
                <th className={headerCellCls}>Qty</th>
                <th className={headerCellCls}>Unit Cost</th>
                <th className={headerCellCls}>Total</th>
                {isColVisible("vendor")            && <th className={headerCellCls}>Brand</th>}
                {isColVisible("model")             && <th className={headerCellCls}>Model</th>}
                {isColVisible("supplier")          && <th className={headerCellCls}>Supplier</th>}
                {isColVisible("financing_method")  && <th className={headerCellCls}>Financing</th>}
                {isColVisible("useful_life_years") && <th className={headerCellCls}>Life</th>}
                {isColVisible("notes")             && <th className={headerCellCls}>Notes</th>}
                <th className={headerCellCls} />
              </tr>
            </thead>

            <tbody>
              {sections.length === 0 && (
                <tr>
                  <td colSpan={TOTAL_COLS} className="text-center py-10 text-sm text-[var(--dark-grey)]">
                    No equipment added yet.
                  </td>
                </tr>
              )}

              {sections.map(({ cat, label, items: catItems }) => {
                const isCollapsed = !!collapsed[cat];
                const subtotalCents = catItems.reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0);

                return (
                  <React.Fragment key={cat}>
                    <SectionHeaderRow
                      colSpan={visibleColCount}
                      title={label}
                      collapsed={isCollapsed}
                      onToggle={() => toggleSection(cat)}
                      onAddItem={() => addItem(cat)}
                      canEdit={canEdit}
                    />

                    {!isCollapsed && catItems.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-[var(--neutral-cool-100)] last:border-b-0 bg-white hover:bg-[var(--background)] transition-colors"
                      >
                        <td className={cellCls}>{renderCell(item, "name")}</td>
                        <td className={cellCls}>{renderCell(item, "quantity")}</td>
                        <td className={cellCls}>{renderCell(item, "unit_cost_cents")}</td>
                        <td className={cellCls}>{renderCell(item, "total")}</td>
                        {isColVisible("vendor")            && <td className={cellCls}>{renderCell(item, "vendor")}</td>}
                        {isColVisible("model")             && <td className={cellCls}>{renderCell(item, "model")}</td>}
                        {isColVisible("supplier")          && <td className={cellCls}>{renderCell(item, "supplier")}</td>}
                        {isColVisible("financing_method")  && <td className={cellCls}>{renderCell(item, "financing_method")}</td>}
                        {isColVisible("useful_life_years") && <td className={cellCls}>{renderCell(item, "useful_life_years")}</td>}
                        {isColVisible("notes")             && <td className={cellCls}>{renderCell(item, "notes")}</td>}
                        <td className={`${cellCls} !border-r-0`}>
                          <div className="flex items-center gap-0.5 justify-end">
                            {canEdit && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => moveItem(item.id, "up")}
                                  className="text-[var(--neutral-cool-300)] hover:text-[var(--muted-foreground)] p-0.5 transition-colors"
                                  aria-label="Move up"
                                >
                                  <ChevronUp size={TABLE_ACTION_ICON_SIZE} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveItem(item.id, "down")}
                                  className="text-[var(--neutral-cool-300)] hover:text-[var(--muted-foreground)] p-0.5 transition-colors"
                                  aria-label="Move down"
                                >
                                  <ChevronDownIcon size={TABLE_ACTION_ICON_SIZE} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteSingleRow(item.id)}
                                  className="text-[var(--neutral-cool-400)] hover:text-[var(--error)] p-0.5 transition-colors"
                                  aria-label="Delete row"
                                >
                                  <Trash2 size={TABLE_ACTION_ICON_SIZE} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}

                    {!isCollapsed && (
                      <SectionSubtotalRow
                        colSpan={visibleColCount}
                        label={`${label} Total`}
                        subtotalDisplay={format(subtotalCents / 100)}
                      />
                    )}
                  </React.Fragment>
                );
              })}

              {sections.length > 0 && (
                <GrandTotalRow
                  colSpan={visibleColCount}
                  label="Grand Total"
                  totalDisplay={format(grandTotal / 100)}
                />
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add category button */}
      {canEdit && (
        <button
          type="button"
          onClick={() => setShowAddCategory(true)}
          className="flex items-center gap-2 text-sm font-medium text-[var(--teal)] border border-dashed border-[var(--teal-tint)] rounded-xl px-4 py-2.5 hover:bg-[var(--teal)]/5 transition-colors w-full justify-center"
        >
          <Plus size={14} aria-hidden="true" />
          Add category
        </button>
      )}

      {showAddCategory && (
        <AddCategoryDialog
          existingCategories={categoryOrder}
          onAdd={addCategory}
          onClose={() => setShowAddCategory(false)}
        />
      )}
    </div>
  );
}
