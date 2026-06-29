"use client";

// TIM-3331: Equipment categories-as-sections layout with subtotals + grand total.
// Replaces the TanStack Table flat layout with a sectioned hand-rolled table.
// Shared section row primitives from workspace-table-rows.tsx per EM scope expansion.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Plus, Trash2, ChevronUp, ChevronDown as ChevronDownIcon, X } from "lucide-react";
import type {
  EquipmentItem,
  EquipmentCategory,
  FinancingMethod,
} from "@/app/(app)/workspace/financials/financials-workspace";
import { useCurrency } from "@/components/CurrencyProvider";
import {
  TABLE_CELL_TEXT,
  TABLE_HEADER_TEXT,
  TABLE_ACTION_ICON_SIZE,
} from "@/lib/workspace-table";
import {
  SectionHeaderRow,
  SectionSubtotalRow,
  GrandTotalRow,
} from "@/lib/workspace-table-rows";

// ── Constants ──────────────────────────────────────────────────────────────────

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

const FINANCING_LABELS: Record<string, string> = {
  cash: "Cash",
  in_house_financing: "In-House Financing",
  loan: "Loan",
  lease: "Lease",
  credit_card: "Credit Card",
  other: "Other",
  credit: "Credit",
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
const SECTION_COLLAPSE_KEY = "tcs-equipment-section-collapse";

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

function newBlankItem(
  planId: string,
  position: number,
  category: string,
): EquipmentItem {
  return {
    id: `__new_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    plan_id: planId,
    position,
    section_id: null,
    name: "",
    category: category as EquipmentCategory,
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
  inputRef,
}: {
  value: string;
  placeholder: string;
  disabled: boolean;
  onCommit: (v: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <input
      ref={inputRef}
      type="text"
      className="w-full h-full text-xs text-[var(--foreground)] bg-transparent outline-none border-0 p-0 placeholder-[var(--neutral-cool-400)]"
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); onCommit(draft); }
        if (e.key === "Escape") { setDraft(value); onCommit(value); }
      }}
    />
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
  inputRef,
}: {
  value: number;
  placeholder: string;
  min?: number;
  max?: number;
  step?: number;
  disabled: boolean;
  onCommit: (v: number) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : "");
  useEffect(() => { setDraft(value > 0 ? String(value) : ""); }, [value]);
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
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(parseFloat(draft) || 0)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); onCommit(parseFloat(draft) || 0); }
        if (e.key === "Escape") { setDraft(String(value)); }
      }}
    />
  );
}

function SelectCell({
  value,
  options,
  disabled,
  onCommit,
}: {
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onCommit: (v: string) => void;
}) {
  return (
    <select
      className="w-full h-full text-xs text-[var(--foreground)] bg-transparent outline-none border-0 p-0 cursor-pointer"
      value={value}
      disabled={disabled}
      onChange={(e) => onCommit(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
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
  format,
  symbol,
}: {
  items: EquipmentItem[];
  canEdit: boolean;
  onUpdate: (id: string, patch: Partial<EquipmentItem>) => void;
  onRemove: (id: string) => void;
  onAdd: (category: string) => void;
  format: (n: number) => string;
  symbol: string;
}) {
  // Group by category for mobile too
  const active = items.filter((i) => !i.archived);
  const categoryOrder = Array.from(
    new Map(active.map((i) => [i.category, true])).keys()
  );
  const grouped = categoryOrder.map((cat) => ({
    cat,
    items: active.filter((i) => i.category === cat),
  }));

  const grandTotal = active.reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
                const total = item.unit_cost_cents * item.quantity;
                const open = expandedId === item.id;
                return (
                  <div
                    key={item.id}
                    className="border border-[var(--border)] rounded-xl bg-white overflow-hidden"
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
                        {([
                          { label: "Name", key: "name" as const, type: "text", placeholder: "Item name" },
                          { label: "Brand", key: "vendor" as const, type: "text", placeholder: "Brand" },
                          { label: "Notes", key: "notes" as const, type: "text", placeholder: "Notes" },
                        ] as const).map(({ label, key, placeholder }) => (
                          <div key={key}>
                            <label className="block text-[10px] font-medium text-[var(--muted-foreground)] mb-0.5">{label}</label>
                            <input
                              type="text"
                              className="w-full text-xs border border-[var(--border-medium)] rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus:border-[var(--teal)]"
                              value={(item[key] as string | null) ?? ""}
                              placeholder={placeholder}
                              disabled={!canEdit}
                              onChange={(e) => onUpdate(item.id, { [key]: e.target.value || null } as Partial<EquipmentItem>)}
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
                              onChange={(e) => onUpdate(item.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-[var(--muted-foreground)] mb-0.5">Unit Cost ($)</label>
                            <input
                              type="number"
                              min={0}
                              className="w-full text-xs border border-[var(--border-medium)] rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus:border-[var(--teal)]"
                              value={item.unit_cost_cents > 0 ? item.unit_cost_cents / 100 : ""}
                              placeholder="0"
                              disabled={!canEdit}
                              onChange={(e) => onUpdate(item.id, { unit_cost_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })}
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
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--neutral-cool-400)] hover:text-[var(--foreground)] p-1"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            className={`flex-1 text-xs rounded-lg py-1.5 font-medium border transition-colors ${
              mode === "select"
                ? "bg-[var(--teal)] text-white border-[var(--teal)]"
                : "border-[var(--border)] text-[var(--foreground)] hover:border-[var(--teal)]"
            }`}
            onClick={() => setMode("select")}
          >
            Standard
          </button>
          <button
            type="button"
            className={`flex-1 text-xs rounded-lg py-1.5 font-medium border transition-colors ${
              mode === "custom"
                ? "bg-[var(--teal)] text-white border-[var(--teal)]"
                : "border-[var(--border)] text-[var(--foreground)] hover:border-[var(--teal)]"
            }`}
            onClick={() => setMode("custom")}
          >
            Custom
          </button>
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
  onItemsChange: (items: EquipmentItem[]) => void;
}

const TOTAL_COLS = 11; // name, qty, unitCost, total, brand, model, supplier, financing, usefulLife, notes, delete

export function EquipmentGrid({
  planId,
  canEdit,
  items,
  onItemsChange,
}: EquipmentGridProps) {
  const { format } = useCurrency();
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingPatches = useRef<Map<string, Partial<EquipmentItem>>>(new Map());
  const creatingRows = useRef<Set<string>>(new Set());

  useEffect(() => {
    setCollapsed(loadCollapsed());
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const timers = debounceTimers.current;
    return () => { timers.forEach((t) => clearTimeout(t)); };
  }, []);

  // ── Derived section order ────────────────────────────────────────────────────

  const active = items.filter((i) => !i.archived);

  // Preserve category order: first occurrence order in items, then any defaults with items
  const categoryOrder = Array.from(
    new Map(active.map((i) => [i.category, true])).keys()
  );

  const sections = categoryOrder.map((cat) => ({
    cat,
    label: getCategoryLabel(cat),
    items: active
      .filter((i) => i.category === cat)
      .sort((a, b) => a.position - b.position),
  }));

  const grandTotal = active.reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0);

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

  const patchRow = useCallback(async (id: string, patch: Partial<EquipmentItem>, currentItems: EquipmentItem[]) => {
    if (!id || id.startsWith("__new_")) return;
    try {
      const res = await fetch(`/api/workspaces/financials/equipment/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      const updated = (await res.json()) as EquipmentItem;
      onItemsChange(currentItems.map((i) => (i.id === id ? updated : i)));
    } catch { /* silent */ }
  }, [onItemsChange]);

  const deleteRow = useCallback(async (id: string) => {
    if (!id || id.startsWith("__new_")) return;
    try {
      await fetch(`/api/workspaces/financials/equipment/${id}`, { method: "DELETE" });
    } catch { /* silent */ }
  }, []);

  // ── Item mutation helpers ────────────────────────────────────────────────────

  const scheduleAutosave = useCallback(
    (id: string, patch: Partial<EquipmentItem>, currentItems: EquipmentItem[]) => {
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
          if (created) {
            onItemsChange(currentItems.map((i) => (i.id === id ? created : i)));
          }
        } else {
          await patchRow(id, accumulated, currentItems);
        }
      }, AUTOSAVE_DEBOUNCE_MS);
      debounceTimers.current.set(id, timer);
    },
    [canEdit, createRow, patchRow, onItemsChange]
  );

  const handleCommit = useCallback(
    (id: string, colKey: string, rawValue: unknown) => {
      if (!canEdit) return;
      let patch: Partial<EquipmentItem> = {};
      if (colKey === "name") patch = { name: rawValue as string };
      else if (colKey === "quantity") patch = { quantity: Math.max(1, Math.round((rawValue as number) || 1)) };
      else if (colKey === "unit_cost_cents") patch = { unit_cost_cents: Math.round(((rawValue as number) || 0) * 100) };
      else if (colKey === "vendor") patch = { vendor: (rawValue as string) || null };
      else if (colKey === "model") patch = { model: (rawValue as string) || null };
      else if (colKey === "supplier") patch = { supplier: (rawValue as string) || null };
      else if (colKey === "financing_method") patch = { financing_method: rawValue as FinancingMethod };
      else if (colKey === "useful_life_years") patch = { useful_life_years: Math.max(1, Math.min(50, Math.round((rawValue as number) || 7))) };
      else if (colKey === "notes") patch = { notes: (rawValue as string) || null };

      const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
      onItemsChange(next);
      scheduleAutosave(id, patch, next);
      setEditingCell(null);
    },
    [canEdit, items, onItemsChange, scheduleAutosave]
  );

  // ── Add item ─────────────────────────────────────────────────────────────────

  const addItem = useCallback(
    (category: string) => {
      if (!canEdit) return;
      const activeItems = items.filter((i) => !i.archived);
      const blank = newBlankItem(planId, activeItems.length, category);
      const next = [...items, blank];
      onItemsChange(next);
      setTimeout(() => setEditingCell({ rowId: blank.id, colKey: "name" }), 30);
      // Ensure section is expanded
      setCollapsed((prev) => {
        if (!prev[category]) return prev;
        const updated = { ...prev, [category]: false };
        saveCollapsed(updated);
        return updated;
      });
    },
    [canEdit, planId, items, onItemsChange]
  );

  // ── Add category ─────────────────────────────────────────────────────────────

  const addCategory = useCallback(
    (category: string) => {
      if (!canEdit) return;
      const activeItems = items.filter((i) => !i.archived);
      const blank = newBlankItem(planId, activeItems.length, category);
      const next = [...items, blank];
      onItemsChange(next);
      setTimeout(() => setEditingCell({ rowId: blank.id, colKey: "name" }), 30);
    },
    [canEdit, planId, items, onItemsChange]
  );

  // ── Delete row ───────────────────────────────────────────────────────────────

  const deleteSingleRow = useCallback(
    (id: string) => {
      const next = items.filter((i) => i.id !== id);
      onItemsChange(next);
      deleteRow(id);
    },
    [items, onItemsChange, deleteRow]
  );

  // ── Reorder within category ──────────────────────────────────────────────────

  const moveItem = useCallback(
    (id: string, direction: "up" | "down") => {
      if (!canEdit) return;
      const item = items.find((i) => i.id === id);
      if (!item) return;
      const catItems = items
        .filter((i) => !i.archived && i.category === item.category)
        .sort((a, b) => a.position - b.position);
      const idx = catItems.findIndex((i) => i.id === id);
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= catItems.length) return;
      const other = catItems[targetIdx];
      // Swap positions
      const next = items.map((i) => {
        if (i.id === id) return { ...i, position: other.position };
        if (i.id === other.id) return { ...i, position: item.position };
        return i;
      });
      onItemsChange(next);
      scheduleAutosave(id, { position: other.position }, next);
      scheduleAutosave(other.id, { position: item.position }, next);
    },
    [canEdit, items, onItemsChange, scheduleAutosave]
  );

  // ── Mobile ────────────────────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <MobileEquipmentList
        items={items}
        canEdit={canEdit}
        onUpdate={(id, patch) => {
          const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
          onItemsChange(next);
          scheduleAutosave(id, patch, next);
        }}
        onRemove={deleteSingleRow}
        onAdd={addItem}
        format={format}
        symbol="$"
      />
    );
  }

  // ── Spreadsheet ───────────────────────────────────────────────────────────────

  const cellCls = `px-2.5 py-2 ${TABLE_CELL_TEXT} border-r border-[var(--neutral-cool-150)] last:border-r-0 align-middle`;
  const headerCellCls = `px-2.5 py-2 text-left ${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] border-r border-[var(--neutral-cool-150)] last:border-r-0 bg-[var(--background)] select-none`;

  function renderCell(item: EquipmentItem, colKey: string) {
    const active = editingCell?.rowId === item.id && editingCell?.colKey === colKey;
    const rowTotal = item.unit_cost_cents * item.quantity;

    if (colKey === "name") {
      return active ? (
        <TextCell
          value={item.name}
          placeholder="Item name"
          disabled={!canEdit}
          onCommit={(v) => handleCommit(item.id, "name", v)}
        />
      ) : (
        <span
          className="block truncate text-xs text-[var(--foreground)] cursor-text"
          onClick={() => canEdit && setEditingCell({ rowId: item.id, colKey: "name" })}
        >
          {item.name || <span className="text-[var(--neutral-cool-400)]">Name</span>}
        </span>
      );
    }

    if (colKey === "quantity") {
      return active ? (
        <NumberCell
          value={item.quantity}
          placeholder="1"
          min={1}
          step={1}
          disabled={!canEdit}
          onCommit={(v) => handleCommit(item.id, "quantity", Math.max(1, Math.round(v)))}
        />
      ) : (
        <span
          className="block text-xs text-[var(--foreground)] cursor-text"
          onClick={() => canEdit && setEditingCell({ rowId: item.id, colKey: "quantity" })}
        >
          {item.quantity}
        </span>
      );
    }

    if (colKey === "unit_cost_cents") {
      return active ? (
        <NumberCell
          value={item.unit_cost_cents / 100}
          placeholder="0"
          min={0}
          step={50}
          disabled={!canEdit}
          onCommit={(v) => handleCommit(item.id, "unit_cost_cents", v)}
        />
      ) : (
        <span
          className="block text-xs text-[var(--foreground)] cursor-text font-medium"
          onClick={() => canEdit && setEditingCell({ rowId: item.id, colKey: "unit_cost_cents" })}
        >
          {item.unit_cost_cents > 0
            ? format(item.unit_cost_cents / 100)
            : <span className="text-[var(--neutral-cool-400)] font-normal">$0</span>
          }
        </span>
      );
    }

    if (colKey === "total") {
      return (
        <span className="block text-xs font-medium text-[var(--foreground)]">
          {rowTotal > 0 ? format(rowTotal / 100) : <span className="text-[var(--neutral-cool-400)] font-normal">$0</span>}
        </span>
      );
    }

    if (colKey === "vendor") {
      return active ? (
        <TextCell value={item.vendor ?? ""} placeholder="Brand" disabled={!canEdit}
          onCommit={(v) => handleCommit(item.id, "vendor", v)} />
      ) : (
        <span className="block truncate text-xs text-[var(--foreground)] cursor-text"
          onClick={() => canEdit && setEditingCell({ rowId: item.id, colKey: "vendor" })}>
          {item.vendor || <span className="text-[var(--neutral-cool-400)]">Brand</span>}
        </span>
      );
    }

    if (colKey === "model") {
      return active ? (
        <TextCell value={item.model ?? ""} placeholder="Model" disabled={!canEdit}
          onCommit={(v) => handleCommit(item.id, "model", v)} />
      ) : (
        <span className="block truncate text-xs text-[var(--foreground)] cursor-text"
          onClick={() => canEdit && setEditingCell({ rowId: item.id, colKey: "model" })}>
          {item.model || <span className="text-[var(--neutral-cool-400)]">Model</span>}
        </span>
      );
    }

    if (colKey === "supplier") {
      return active ? (
        <TextCell value={item.supplier ?? ""} placeholder="Supplier" disabled={!canEdit}
          onCommit={(v) => handleCommit(item.id, "supplier", v)} />
      ) : (
        <span className="block truncate text-xs text-[var(--foreground)] cursor-text"
          onClick={() => canEdit && setEditingCell({ rowId: item.id, colKey: "supplier" })}>
          {item.supplier || <span className="text-[var(--neutral-cool-400)]">Supplier</span>}
        </span>
      );
    }

    if (colKey === "financing_method") {
      return active ? (
        <SelectCell
          value={item.financing_method}
          options={NEW_FINANCING.map((k) => ({ value: k, label: FINANCING_LABELS[k] }))}
          disabled={!canEdit}
          onCommit={(v) => handleCommit(item.id, "financing_method", v)}
        />
      ) : (
        <span className="block truncate text-xs text-[var(--foreground)] cursor-text"
          onClick={() => canEdit && setEditingCell({ rowId: item.id, colKey: "financing_method" })}>
          {FINANCING_LABELS[item.financing_method] ?? item.financing_method}
        </span>
      );
    }

    if (colKey === "useful_life_years") {
      return active ? (
        <NumberCell
          value={item.useful_life_years ?? 7}
          placeholder="7"
          min={1}
          max={50}
          step={1}
          disabled={!canEdit}
          onCommit={(v) => handleCommit(item.id, "useful_life_years", v)}
        />
      ) : (
        <span className="block text-xs text-[var(--foreground)] cursor-text"
          onClick={() => canEdit && setEditingCell({ rowId: item.id, colKey: "useful_life_years" })}>
          {item.useful_life_years ?? 7}yr
        </span>
      );
    }

    if (colKey === "notes") {
      return active ? (
        <TextCell value={item.notes ?? ""} placeholder="Notes" disabled={!canEdit}
          onCommit={(v) => handleCommit(item.id, "notes", v)} />
      ) : (
        <span className="block truncate text-xs text-[var(--muted-foreground)] cursor-text"
          onClick={() => canEdit && setEditingCell({ rowId: item.id, colKey: "notes" })}>
          {item.notes || <span className="text-[var(--neutral-cool-400)]">Notes</span>}
        </span>
      );
    }

    return null;
  }

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      {active.length > 0 && (
        <div className="flex items-center gap-4 px-1 text-xs text-[var(--muted-foreground)]">
          <span>{active.length} item{active.length !== 1 ? "s" : ""}</span>
          <span className="text-[var(--border)]">|</span>
          <span>{sections.length} section{sections.length !== 1 ? "s" : ""}</span>
        </div>
      )}

      {/* Sectioned table */}
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className={`w-full border-collapse min-w-[1100px] ${TABLE_CELL_TEXT}`}
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: 190 }} /> {/* name */}
              <col style={{ width: 55 }} />  {/* qty */}
              <col style={{ width: 100 }} /> {/* unit cost */}
              <col style={{ width: 100 }} /> {/* total */}
              <col style={{ width: 110 }} /> {/* brand */}
              <col style={{ width: 110 }} /> {/* model */}
              <col style={{ width: 110 }} /> {/* supplier */}
              <col style={{ width: 110 }} /> {/* financing */}
              <col style={{ width: 72 }} />  {/* useful life */}
              <col style={{ width: 150 }} /> {/* notes */}
              <col style={{ width: 60 }} />  {/* move + delete */}
            </colgroup>

            {/* Sticky column headers */}
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[var(--neutral-cool-150)]">
                <th className={headerCellCls}>Item</th>
                <th className={headerCellCls}>Qty</th>
                <th className={headerCellCls}>Unit Cost</th>
                <th className={headerCellCls}>Total</th>
                <th className={headerCellCls}>Brand</th>
                <th className={headerCellCls}>Model</th>
                <th className={headerCellCls}>Supplier</th>
                <th className={headerCellCls}>Financing</th>
                <th className={headerCellCls}>Life</th>
                <th className={headerCellCls}>Notes</th>
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
                  <>
                    {/* Section header */}
                    <SectionHeaderRow
                      key={`hdr-${cat}`}
                      colSpan={TOTAL_COLS}
                      title={label}
                      collapsed={isCollapsed}
                      onToggle={() => toggleSection(cat)}
                      onAddItem={() => addItem(cat)}
                      canEdit={canEdit}
                    />

                    {/* Item rows */}
                    {!isCollapsed && catItems.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-[var(--neutral-cool-100)] last:border-b-0 bg-white hover:bg-[var(--background)] transition-colors"
                      >
                        <td className={cellCls}>{renderCell(item, "name")}</td>
                        <td className={cellCls}>{renderCell(item, "quantity")}</td>
                        <td className={cellCls}>{renderCell(item, "unit_cost_cents")}</td>
                        <td className={cellCls}>{renderCell(item, "total")}</td>
                        <td className={cellCls}>{renderCell(item, "vendor")}</td>
                        <td className={cellCls}>{renderCell(item, "model")}</td>
                        <td className={cellCls}>{renderCell(item, "supplier")}</td>
                        <td className={cellCls}>{renderCell(item, "financing_method")}</td>
                        <td className={cellCls}>{renderCell(item, "useful_life_years")}</td>
                        <td className={cellCls}>{renderCell(item, "notes")}</td>
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

                    {/* Section subtotal */}
                    {!isCollapsed && (
                      <SectionSubtotalRow
                        key={`sub-${cat}`}
                        colSpan={TOTAL_COLS}
                        label={`${label} Total`}
                        subtotalDisplay={format(subtotalCents / 100)}
                      />
                    )}
                  </>
                );
              })}

              {/* Grand total */}
              {sections.length > 0 && (
                <GrandTotalRow
                  colSpan={TOTAL_COLS}
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
