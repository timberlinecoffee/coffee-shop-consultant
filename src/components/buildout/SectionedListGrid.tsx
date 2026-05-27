"use client";

// TIM-1038: Sectioned spreadsheet grid for Equipment and Supplies lists.
// Supports: workstation sections, drag-drop within/between sections,
// resizable columns (pointer events), per-section totals, grand total,
// column visibility toggle (localStorage), collapsible sections.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Plus,
  Trash2,
  Settings2,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import type { EquipmentItem, EquipmentCategory, FinancingMethod } from "@/app/workspace/financials/financials-workspace";
import type { ListSection, SuppliesItem } from "@/types/buildout";
import { formatCurrency } from "@/lib/financial-projection";

// ── Column definitions ────────────────────────────────────────────────────────

type ColDef = {
  id: string;
  label: string;
  defaultWidth: number;
  resizable: boolean;
  toggleable: boolean;
  costClass?: boolean;
};

const EQUIPMENT_COLS: ColDef[] = [
  { id: "drag",             label: "",          defaultWidth: 28,  resizable: false, toggleable: false },
  { id: "name",             label: "Name",      defaultWidth: 200, resizable: true,  toggleable: false },
  { id: "vendor",           label: "Brand",     defaultWidth: 130, resizable: true,  toggleable: true  },
  { id: "model",            label: "Model",     defaultWidth: 130, resizable: true,  toggleable: true  },
  { id: "supplier",         label: "Supplier",  defaultWidth: 130, resizable: true,  toggleable: true  },
  { id: "unit_cost_cents",  label: "Cost",      defaultWidth: 110, resizable: true,  toggleable: true,  costClass: true },
  { id: "financing_method", label: "Financing", defaultWidth: 130, resizable: true,  toggleable: true  },
  { id: "category",         label: "Category",  defaultWidth: 160, resizable: true,  toggleable: true  },
  { id: "notes",            label: "Notes",     defaultWidth: 180, resizable: true,  toggleable: true  },
  { id: "actions",          label: "",          defaultWidth: 32,  resizable: false, toggleable: false },
];

const SUPPLIES_COLS: ColDef[] = [
  { id: "drag",            label: "",          defaultWidth: 28,  resizable: false, toggleable: false },
  { id: "name",            label: "Name",      defaultWidth: 220, resizable: true,  toggleable: false },
  { id: "vendor",          label: "Vendor",    defaultWidth: 130, resizable: true,  toggleable: true  },
  { id: "unit_type",       label: "Unit",      defaultWidth: 100, resizable: true,  toggleable: true  },
  { id: "unit_cost_cents", label: "Cost",      defaultWidth: 110, resizable: true,  toggleable: true,  costClass: true },
  { id: "notes",           label: "Notes",     defaultWidth: 180, resizable: true,  toggleable: true  },
  { id: "actions",         label: "",          defaultWidth: 32,  resizable: false, toggleable: false },
];

const CATEGORY_LABELS: Record<string, string> = {
  espresso_station: "Espresso Station", espresso_platform: "Espresso Station", brew_platform: "Brew Platform",
  milk_beverage_prep: "Milk & Beverage Prep", refrigeration: "Refrigeration",
  plumbing_water: "Plumbing & Water", electrical: "Electrical",
  pos_tech: "POS & Technology", furniture_fixtures: "Furniture & Fixtures",
  signage_decor: "Signage & Decor", smallwares: "Smallwares",
  ceramics: "Ceramics", glassware: "Glassware", to_go_ware: "To-Go Ware",
  miscellaneous: "Miscellaneous",
  espresso: "Espresso", grinder: "Grinder", plumbing: "Plumbing",
  furniture: "Furniture", pos: "POS", signage: "Signage", other: "Other",
};

const FINANCING_LABELS: Record<string, string> = {
  cash: "Cash", in_house_financing: "In-House Financing", loan: "Loan",
  lease: "Lease", credit_card: "Credit Card", other: "Other", credit: "Credit",
};

const EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
  "espresso_station", "brew_platform", "milk_beverage_prep", "refrigeration",
  "plumbing_water", "electrical", "pos_tech", "furniture_fixtures",
  "signage_decor", "smallwares", "ceramics", "glassware", "to_go_ware", "miscellaneous",
];

const FINANCING_OPTIONS: FinancingMethod[] = [
  "cash", "in_house_financing", "loan", "lease", "credit_card", "other",
];

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadColWidths(listType: string, cols: ColDef[]): Map<string, number> {
  const key = `tcs-${listType}-col-widths`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>;
      return new Map(cols.map((c) => [c.id, parsed[c.id] ?? c.defaultWidth]));
    }
  } catch { /* ignore */ }
  return new Map(cols.map((c) => [c.id, c.defaultWidth]));
}

function saveColWidths(listType: string, widths: Map<string, number>) {
  const key = `tcs-${listType}-col-widths`;
  try {
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(widths)));
  } catch { /* ignore */ }
}

function loadColVisibility(listType: string): Set<string> {
  const key = `tcs-${listType}-col-visibility`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      return new Set(Object.entries(parsed).filter(([, v]) => !v).map(([k]) => k));
    }
  } catch { /* ignore */ }
  return new Set<string>();
}

function saveColVisibility(listType: string, hidden: Set<string>) {
  const key = `tcs-${listType}-col-visibility`;
  try {
    const obj: Record<string, boolean> = {};
    for (const id of hidden) obj[id] = false;
    localStorage.setItem(key, JSON.stringify(obj));
  } catch { /* ignore */ }
}

// ── Generic row type ──────────────────────────────────────────────────────────

type AnyItem = EquipmentItem | SuppliesItem;

function getItemSectionId(item: AnyItem): string | null {
  return item.section_id ?? null;
}

function getItemCost(item: AnyItem): number {
  return item.unit_cost_cents * item.quantity;
}

// ── Cell editors ──────────────────────────────────────────────────────────────

function TextInput({
  value, placeholder, disabled, onCommit,
}: { value: string; placeholder: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <input
      type="text"
      className="w-full h-full text-xs text-[#1a1a1a] bg-transparent outline-none border-0 p-0 placeholder-[#c0c0c0]"
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

function CostInput({
  valueCents, disabled, onCommit,
}: { valueCents: number; disabled: boolean; onCommit: (cents: number) => void }) {
  const [draft, setDraft] = useState(valueCents > 0 ? String(valueCents / 100) : "");
  useEffect(() => { setDraft(valueCents > 0 ? String(valueCents / 100) : ""); }, [valueCents]);
  return (
    <input
      type="number"
      min={0}
      step={50}
      className="w-full h-full text-xs text-[#1a1a1a] bg-transparent outline-none border-0 p-0 placeholder-[#c0c0c0]"
      value={draft}
      placeholder="0"
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(Math.round((parseFloat(draft) || 0) * 100))}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

function SelectInput({
  value, options, disabled, onCommit,
}: { value: string; options: { value: string; label: string }[]; disabled: boolean; onCommit: (v: string) => void }) {
  return (
    <select
      className="w-full h-full text-xs text-[#1a1a1a] bg-transparent outline-none border-0 p-0 cursor-pointer"
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

// ── Sortable row ──────────────────────────────────────────────────────────────

function SortableRow({
  item,
  listType,
  canEdit,
  visibleCols,
  colWidths,
  onUpdate,
  onDelete,
  isDragOverlay,
}: {
  item: AnyItem;
  listType: "equipment" | "supplies";
  canEdit: boolean;
  visibleCols: ColDef[];
  colWidths: Map<string, number>;
  onUpdate: (id: string, patch: Partial<AnyItem>) => void;
  onDelete: (id: string) => void;
  isDragOverlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canEdit || isDragOverlay });

  const style = isDragOverlay
    ? {}
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      };

  const eq = listType === "equipment" ? (item as EquipmentItem) : null;
  const sup = listType === "supplies" ? (item as SuppliesItem) : null;

  const cellCls = "px-2 py-1.5 border-r border-[#f0f0f0] last:border-r-0 align-middle text-xs";

  function renderCell(col: ColDef) {
    switch (col.id) {
      case "drag":
        return (
          <td key="drag" className={`${cellCls} text-[#d0d0d0]`} style={{ width: colWidths.get("drag") }}>
            {canEdit && (
              <button
                type="button"
                className="cursor-grab active:cursor-grabbing touch-none p-0.5 text-[#c0c0c0] hover:text-[#888] transition-colors"
                {...attributes}
                {...listeners}
                aria-label="Drag to reorder"
              >
                <GripVertical size={14} />
              </button>
            )}
          </td>
        );

      case "name":
        return (
          <td key="name" className={`${cellCls} sticky left-[0px] z-10 bg-white`} style={{ width: colWidths.get("name") }}>
            <div className="flex items-center gap-1.5">
              {item.source === "ai_suggested" && (
                <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-50 text-amber-600">AI</span>
              )}
              <TextInput
                value={item.name}
                placeholder="Item name"
                disabled={!canEdit}
                onCommit={(v) => onUpdate(item.id, { name: v } as Partial<AnyItem>)}
              />
            </div>
          </td>
        );

      case "vendor":
        return (
          <td key="vendor" className={cellCls} style={{ width: colWidths.get("vendor") }}>
            <TextInput
              value={(item as { vendor?: string | null }).vendor ?? ""}
              placeholder="Vendor"
              disabled={!canEdit}
              onCommit={(v) => onUpdate(item.id, { vendor: v || null } as Partial<AnyItem>)}
            />
          </td>
        );

      case "model":
        return eq ? (
          <td key="model" className={cellCls} style={{ width: colWidths.get("model") }}>
            <TextInput
              value={eq.model ?? ""}
              placeholder="Model"
              disabled={!canEdit}
              onCommit={(v) => onUpdate(item.id, { model: v || null } as Partial<AnyItem>)}
            />
          </td>
        ) : null;

      case "supplier":
        return eq ? (
          <td key="supplier" className={cellCls} style={{ width: colWidths.get("supplier") }}>
            <TextInput
              value={eq.supplier ?? ""}
              placeholder="Supplier"
              disabled={!canEdit}
              onCommit={(v) => onUpdate(item.id, { supplier: v || null } as Partial<AnyItem>)}
            />
          </td>
        ) : null;

      case "unit_type":
        return sup ? (
          <td key="unit_type" className={cellCls} style={{ width: colWidths.get("unit_type") }}>
            <TextInput
              value={sup.unit_type}
              placeholder="e.g. lb, case"
              disabled={!canEdit}
              onCommit={(v) => onUpdate(item.id, { unit_type: v || "unit" } as Partial<AnyItem>)}
            />
          </td>
        ) : null;

      case "unit_cost_cents":
        return (
          <td key="unit_cost_cents" className={`${cellCls} font-medium`} style={{ width: colWidths.get("unit_cost_cents") }}>
            <CostInput
              valueCents={item.unit_cost_cents}
              disabled={!canEdit}
              onCommit={(cents) => onUpdate(item.id, { unit_cost_cents: cents } as Partial<AnyItem>)}
            />
          </td>
        );

      case "financing_method":
        return eq ? (
          <td key="financing_method" className={cellCls} style={{ width: colWidths.get("financing_method") }}>
            <SelectInput
              value={eq.financing_method}
              options={FINANCING_OPTIONS.map((k) => ({ value: k, label: FINANCING_LABELS[k] }))}
              disabled={!canEdit}
              onCommit={(v) => onUpdate(item.id, { financing_method: v as FinancingMethod } as Partial<AnyItem>)}
            />
          </td>
        ) : null;

      case "category":
        return eq ? (
          <td key="category" className={cellCls} style={{ width: colWidths.get("category") }}>
            <SelectInput
              value={eq.category}
              options={EQUIPMENT_CATEGORIES.map((k) => ({ value: k, label: CATEGORY_LABELS[k] }))}
              disabled={!canEdit}
              onCommit={(v) => onUpdate(item.id, { category: v as EquipmentCategory } as Partial<AnyItem>)}
            />
          </td>
        ) : null;

      case "notes":
        return (
          <td key="notes" className={cellCls} style={{ width: colWidths.get("notes") }}>
            <TextInput
              value={item.notes ?? ""}
              placeholder="Notes"
              disabled={!canEdit}
              onCommit={(v) => onUpdate(item.id, { notes: v || null } as Partial<AnyItem>)}
            />
          </td>
        );

      case "actions":
        return (
          <td key="actions" className={`${cellCls} text-center`} style={{ width: colWidths.get("actions") }}>
            {canEdit && (
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                className="text-[#c0c0c0] hover:text-[#a13d3d] transition-colors p-0.5"
                aria-label="Delete row"
              >
                <Trash2 size={12} />
              </button>
            )}
          </td>
        );

      default:
        return null;
    }
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-[#f5f5f5] bg-white hover:bg-[#faf9f7] transition-colors ${isDragOverlay ? "shadow-lg rounded opacity-90" : ""}`}
    >
      {visibleCols.map((col) => renderCell(col))}
    </tr>
  );
}

// ── Section row ───────────────────────────────────────────────────────────────

function SectionHeader({
  section,
  colCount,
  sectionTotal,
  costVisible,
  canEdit,
  onToggleCollapse,
  onRename,
  onDelete,
  onAddItem,
}: {
  section: ListSection;
  colCount: number;
  sectionTotal: number;
  costVisible: boolean;
  canEdit: boolean;
  onToggleCollapse: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddItem: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.name);
  const inputRef = useRef<HTMLInputElement>(null);

  function commitRename() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== section.name) onRename(draft.trim());
    else setDraft(section.name);
  }

  useEffect(() => { setDraft(section.name); }, [section.name]);

  return (
    <tr className="bg-[#f4f9f8] border-b border-[#e4eded]">
      <td colSpan={colCount} className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors shrink-0"
            aria-label={section.collapsed ? "Expand section" : "Collapse section"}
          >
            {section.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>

          {editing ? (
            <input
              ref={inputRef}
              type="text"
              value={draft}
              autoFocus
              className="text-xs font-semibold text-[#1a1a1a] bg-white border border-[#cfe0e1] rounded px-2 py-0.5 outline-none focus:border-[#155e63] min-w-[160px]"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setEditing(false); setDraft(section.name); }
              }}
            />
          ) : (
            <span
              className="text-xs font-semibold text-[#1a1a1a] cursor-text hover:underline decoration-dotted"
              onDoubleClick={() => canEdit && setEditing(true)}
              title={canEdit ? "Double-click to rename" : undefined}
            >
              {section.name}
            </span>
          )}

          <div className="flex-1" />

          {costVisible && sectionTotal > 0 && (
            <span className="text-xs font-semibold text-[#155e63]">
              {formatCurrency(sectionTotal / 100)}
            </span>
          )}

          {canEdit && (
            <>
              <button
                type="button"
                onClick={onAddItem}
                className="text-[#155e63] hover:text-[#0e4448] transition-colors"
                aria-label="Add item to section"
                title="Add item"
              >
                <Plus size={13} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="text-[#c0c0c0] hover:text-[#a13d3d] transition-colors"
                aria-label="Delete section"
                title="Delete section"
              >
                <X size={13} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface SectionedListGridProps {
  listType: "equipment" | "supplies";
  planId: string;
  canEdit: boolean;
  sections: ListSection[];
  items: AnyItem[];
  onItemsChange: (items: AnyItem[]) => void;
  onSectionsChange: (sections: ListSection[]) => void;
}

const AUTOSAVE_MS = 400;

export function SectionedListGrid({
  listType,
  planId,
  canEdit,
  sections,
  items,
  onItemsChange,
  onSectionsChange,
}: SectionedListGridProps) {
  const cols = listType === "equipment" ? EQUIPMENT_COLS : SUPPLIES_COLS;

  // Column widths
  const [colWidths, setColWidths] = useState<Map<string, number>>(() => new Map(cols.map((c) => [c.id, c.defaultWidth])));
  useEffect(() => {
    setColWidths(loadColWidths(listType, cols));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listType]);

  // Column visibility (hidden col IDs)
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => new Set<string>());
  useEffect(() => {
    setHiddenCols(loadColVisibility(listType));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listType]);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Resize state
  const resizeRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);

  // Autosave timers
  const itemDebounce = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const sectionDebounce = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingItemPatches = useRef<Map<string, Record<string, unknown>>>(new Map());
  const creatingItems = useRef<Set<string>>(new Set());

  const visibleCols = useMemo(
    () => cols.filter((c) => !c.toggleable || !hiddenCols.has(c.id)),
    [cols, hiddenCols]
  );

  const costVisible = useMemo(
    () => visibleCols.some((c) => c.costClass),
    [visibleCols]
  );

  // Close col picker on outside click
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

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function findItemSectionId(itemId: string): string | null {
    return items.find((i) => i.id === itemId)?.section_id ?? null;
  }

  // ── API helpers ──────────────────────────────────────────────────────────────

  const itemApiBase = listType === "equipment"
    ? "/api/workspaces/financials/equipment"
    : "/api/workspaces/buildout/supplies";

  async function apiCreateItem(tempId: string, item: AnyItem) {
    if (creatingItems.current.has(tempId)) return null;
    creatingItems.current.add(tempId);
    try {
      const body: Record<string, unknown> = {
        name: item.name || "New Item",
        section_id: item.section_id,
        quantity: item.quantity,
        unit_cost_cents: item.unit_cost_cents,
        source: "user_added",
        notes: item.notes,
        position: item.position,
      };
      if (listType === "equipment") {
        const eq = item as EquipmentItem;
        body.category = eq.category;
        body.vendor = eq.vendor;
        body.model = eq.model;
        body.supplier = eq.supplier;
        body.priority_tier = eq.priority_tier;
        body.financing_method = eq.financing_method;
      } else {
        const sup = item as SuppliesItem;
        body.vendor = sup.vendor;
        body.unit_type = sup.unit_type;
      }
      const res = await fetch(itemApiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      return (await res.json()) as AnyItem;
    } catch {
      return null;
    } finally {
      creatingItems.current.delete(tempId);
    }
  }

  async function apiPatchItem(id: string, patch: Record<string, unknown>) {
    if (!id || id.startsWith("__new_")) return;
    try {
      await fetch(`${itemApiBase}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch { /* silent */ }
  }

  async function apiDeleteItem(id: string) {
    if (!id || id.startsWith("__new_")) return;
    try {
      await fetch(`${itemApiBase}/${id}`, { method: "DELETE" });
    } catch { /* silent */ }
  }

  async function apiPatchSection(id: string, patch: Record<string, unknown>) {
    try {
      await fetch(`/api/workspaces/buildout/sections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch { /* silent */ }
  }

  async function apiDeleteSection(id: string) {
    try {
      await fetch(`/api/workspaces/buildout/sections/${id}`, { method: "DELETE" });
    } catch { /* silent */ }
  }

  async function apiCreateSection(name: string, position: number): Promise<ListSection | null> {
    try {
      const res = await fetch("/api/workspaces/buildout/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list_type: listType, name, position }),
      });
      if (!res.ok) return null;
      return (await res.json()) as ListSection;
    } catch {
      return null;
    }
  }

  // ── Item mutations ───────────────────────────────────────────────────────────

  const scheduleItemSave = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      if (!canEdit) return;
      const existing = pendingItemPatches.current.get(id) ?? {};
      pendingItemPatches.current.set(id, { ...existing, ...patch });
      const t = itemDebounce.current.get(id);
      if (t) clearTimeout(t);
      const timer = setTimeout(async () => {
        const acc = pendingItemPatches.current.get(id);
        if (!acc) return;
        pendingItemPatches.current.delete(id);

        if (id.startsWith("__new_")) {
          const current = items.find((i) => i.id === id);
          if (!current) return;
          const created = await apiCreateItem(id, { ...current, ...acc } as AnyItem);
          if (created) {
            onItemsChange(items.map((i) => (i.id === id ? created : i)));
          }
        } else {
          await apiPatchItem(id, acc);
        }
      }, AUTOSAVE_MS);
      itemDebounce.current.set(id, timer);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, items, onItemsChange]
  );

  function updateItem(id: string, patch: Partial<AnyItem>) {
    onItemsChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    scheduleItemSave(id, patch as Record<string, unknown>);
  }

  function deleteItem(id: string) {
    if (!confirm("Delete this item?")) return;
    onItemsChange(items.filter((i) => i.id !== id));
    apiDeleteItem(id);
  }

  function addItemToSection(sectionId: string | null) {
    if (!canEdit) return;
    const sectionItems = items.filter((i) => i.section_id === sectionId);
    const position = sectionItems.length;
    const tempId = `__new_${Date.now()}`;

    const base = {
      id: tempId,
      plan_id: planId,
      section_id: sectionId,
      name: "",
      source: "user_added" as const,
      notes: null,
      position,
      archived: false,
      unit_cost_cents: 0,
      quantity: 1,
    };

    let newItem: AnyItem;
    if (listType === "equipment") {
      newItem = {
        ...base,
        category: "miscellaneous" as EquipmentCategory,
        vendor: null,
        model: null,
        supplier: null,
        priority_tier: "must_have",
        financing_method: "cash" as FinancingMethod,
      } as EquipmentItem;
    } else {
      newItem = {
        ...base,
        vendor: null,
        unit_type: "unit",
      } as SuppliesItem;
    }

    onItemsChange([...items, newItem]);
  }

  // ── Section mutations ────────────────────────────────────────────────────────

  function toggleCollapse(sectionId: string) {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const updated = sections.map((s) =>
      s.id === sectionId ? { ...s, collapsed: !s.collapsed } : s
    );
    onSectionsChange(updated);
    // debounce-persist collapse state
    const t = sectionDebounce.current.get(sectionId);
    if (t) clearTimeout(t);
    sectionDebounce.current.set(
      sectionId,
      setTimeout(() => { apiPatchSection(sectionId, { collapsed: !section.collapsed }); }, 300)
    );
  }

  function renameSection(sectionId: string, name: string) {
    onSectionsChange(sections.map((s) => (s.id === sectionId ? { ...s, name } : s)));
    apiPatchSection(sectionId, { name });
  }

  async function addSection() {
    if (!canEdit) return;
    const position = sections.length;
    const tempId = `__new_sec_${Date.now()}`;
    const tempSection: ListSection = {
      id: tempId,
      plan_id: planId,
      list_type: listType,
      name: "New Section",
      position,
      collapsed: false,
    };
    onSectionsChange([...sections, tempSection]);
    const created = await apiCreateSection("New Section", position);
    if (created) {
      onSectionsChange([...sections.filter((s) => s.id !== tempId), created]);
      // Also update items that may have gotten the temp section id (unlikely but safe)
    }
  }

  async function deleteSection(sectionId: string) {
    const sectionItems = items.filter((i) => i.section_id === sectionId);
    const confirmMsg = sectionItems.length > 0
      ? `Delete this section and move ${sectionItems.length} item${sectionItems.length !== 1 ? "s" : ""} to General?`
      : "Delete this empty section?";
    if (!confirm(confirmMsg)) return;

    // Move items to null section (unsectioned)
    onItemsChange(items.map((i) => (i.section_id === sectionId ? { ...i, section_id: null } : i)));
    onSectionsChange(sections.filter((s) => s.id !== sectionId));
    await apiDeleteSection(sectionId);
  }

  // ── Drag-and-drop ────────────────────────────────────────────────────────────

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeItemId = active.id as string;
    const overId = over.id as string;

    const activeSectionId = findItemSectionId(activeItemId);

    // Determine target section: either from an item or a section header droppable
    let targetSectionId: string | null = null;
    const overItem = items.find((i) => i.id === overId);
    if (overItem) {
      targetSectionId = overItem.section_id;
    } else {
      // over is a section id or "unsectioned"
      const overSection = sections.find((s) => s.id === overId);
      if (overSection) targetSectionId = overSection.id;
      else if (overId === "__unsectioned__") targetSectionId = null;
    }

    if (activeSectionId === targetSectionId) return; // same section — sortable handles it

    // Move active item to target section
    const updated = items.map((i) =>
      i.id === activeItemId ? { ...i, section_id: targetSectionId } : i
    );
    onItemsChange(updated);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;

    const activeItemId = active.id as string;
    const overId = over.id as string;

    // Determine final section and index
    const targetSectionId = (() => {
      const overItem = items.find((i) => i.id === overId);
      if (overItem) return overItem.section_id;
      const overSection = sections.find((s) => s.id === overId);
      if (overSection) return overSection.id;
      if (overId === "__unsectioned__") return null;
      return findItemSectionId(activeItemId);
    })();

    // Reorder within the target section
    const sectionItems = items.filter((i) => i.section_id === targetSectionId && !i.archived);
    const activeIndex = sectionItems.findIndex((i) => i.id === activeItemId);
    const overIndex = sectionItems.findIndex((i) => i.id === overId);

    if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) {
      // Still persist the section change (cross-section move with no reorder)
      const patch: Record<string, unknown> = { section_id: targetSectionId };
      scheduleItemSave(activeItemId, patch);
      return;
    }

    // Reorder
    const reordered = [...sectionItems];
    const [moved] = reordered.splice(activeIndex, 1);
    reordered.splice(overIndex, 0, moved);

    const updatedItems = items.map((i) => {
      if (i.section_id !== targetSectionId) return i;
      const idx = reordered.findIndex((r) => r.id === i.id);
      return idx >= 0 ? { ...reordered[idx], position: idx } : i;
    });

    onItemsChange(updatedItems);

    // Persist reorder
    reordered.forEach((item, idx) => {
      const patch: Record<string, unknown> = { position: idx, section_id: targetSectionId };
      scheduleItemSave(item.id, patch);
    });
  }

  // ── Column resize ────────────────────────────────────────────────────────────

  function onResizeStart(e: React.PointerEvent, colId: string) {
    e.preventDefault();
    resizeRef.current = { colId, startX: e.clientX, startWidth: colWidths.get(colId) ?? 100 };
    document.addEventListener("pointermove", onResizeMove);
    document.addEventListener("pointerup", onResizeEnd);
  }

  function onResizeMove(e: PointerEvent) {
    if (!resizeRef.current) return;
    const { colId, startX, startWidth } = resizeRef.current;
    const delta = e.clientX - startX;
    const newWidth = Math.max(50, startWidth + delta);
    setColWidths((prev) => {
      const next = new Map(prev);
      next.set(colId, newWidth);
      return next;
    });
  }

  function onResizeEnd() {
    document.removeEventListener("pointermove", onResizeMove);
    document.removeEventListener("pointerup", onResizeEnd);
    if (resizeRef.current) {
      setColWidths((prev) => {
        saveColWidths(listType, prev);
        return prev;
      });
      resizeRef.current = null;
    }
  }

  // ── Compute totals ───────────────────────────────────────────────────────────

  function sectionTotal(sectionId: string | null): number {
    return items
      .filter((i) => i.section_id === sectionId && !i.archived)
      .reduce((s, i) => s + getItemCost(i), 0);
  }

  const grandTotal = useMemo(
    () => items.filter((i) => !i.archived).reduce((s, i) => s + getItemCost(i), 0),
    [items]
  );

  const unsectionedItems = useMemo(
    () => items.filter((i) => !i.section_id && !i.archived),
    [items]
  );

  const activeItem = useMemo(
    () => (activeId ? items.find((i) => i.id === activeId) ?? null : null),
    [activeId, items]
  );

  // ── Collapse all / expand all ────────────────────────────────────────────────

  function collapseAll() {
    const updated = sections.map((s) => ({ ...s, collapsed: true }));
    onSectionsChange(updated);
    updated.forEach((s) => apiPatchSection(s.id, { collapsed: true }));
  }

  function expandAll() {
    const updated = sections.map((s) => ({ ...s, collapsed: false }));
    onSectionsChange(updated);
    updated.forEach((s) => apiPatchSection(s.id, { collapsed: false }));
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const headerCellCls = "px-2 py-2 text-left text-[10px] font-semibold text-[#6b6b6b] uppercase tracking-wide border-r border-[#f0f0f0] last:border-r-0 bg-[#faf9f7] select-none relative";

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex items-center gap-3 text-xs text-[#6b6b6b]">
          {items.filter((i) => !i.archived).length > 0 && (
            <>
              <span>{items.filter((i) => !i.archived).length} item{items.filter((i) => !i.archived).length !== 1 ? "s" : ""}</span>
              {costVisible && grandTotal > 0 && (
                <>
                  <span className="text-[#efefef]">|</span>
                  <span className="font-semibold text-[#1a1a1a]">Total: {formatCurrency(grandTotal / 100)}</span>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Collapse/expand all */}
        {sections.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={expandAll}
              className="text-xs text-[#6b6b6b] hover:text-[#1a1a1a] border border-[#e8e8e8] rounded px-2 py-1 hover:bg-[#f5f4f0] transition-colors"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="text-xs text-[#6b6b6b] hover:text-[#1a1a1a] border border-[#e8e8e8] rounded px-2 py-1 hover:bg-[#f5f4f0] transition-colors"
            >
              Collapse all
            </button>
          </div>
        )}

        {/* Column visibility picker */}
        <div className="relative flex-shrink-0" ref={colPickerRef}>
          <button
            type="button"
            onClick={() => setColPickerOpen((o) => !o)}
            aria-label="Column settings"
            className="flex items-center gap-1.5 text-xs text-[#6b6b6b] hover:text-[#1a1a1a] border border-[#e8e8e8] rounded-lg px-2 py-1.5 hover:bg-[#f5f4f0] transition-colors"
          >
            <Settings2 size={12} />
            Columns
          </button>
          {colPickerOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-[#efefef] rounded-xl shadow-lg py-1 min-w-[160px]">
              <p className="px-3 py-1.5 text-[10px] font-semibold text-[#afafaf] uppercase tracking-wide">Show / Hide Columns</p>
              {cols.filter((c) => c.toggleable).map((col) => {
                const hidden = hiddenCols.has(col.id);
                return (
                  <label
                    key={col.id}
                    className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-[#1a1a1a] hover:bg-[#faf9f7] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="accent-[#155e63] cursor-pointer"
                      checked={!hidden}
                      onChange={() => {
                        setHiddenCols((prev) => {
                          const next = new Set(prev);
                          if (hidden) next.delete(col.id);
                          else next.add(col.id);
                          saveColVisibility(listType, next);
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

      {/* Table */}
      <div className="border border-[#efefef] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
            <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: visibleCols.reduce((s, c) => s + (colWidths.get(c.id) ?? c.defaultWidth), 0) }}>
              <colgroup>
                {visibleCols.map((col) => (
                  <col key={col.id} style={{ width: colWidths.get(col.id) ?? col.defaultWidth }} />
                ))}
              </colgroup>

              <thead>
                <tr className="border-b border-[#f0f0f0]">
                  {visibleCols.map((col) => (
                    <th key={col.id} className={headerCellCls}>
                      <span>{col.label}</span>
                      {col.resizable && (
                        <span
                          className="absolute right-0 top-0 h-full w-[10px] cursor-col-resize hover:bg-[#155e63]/30 transition-colors"
                          onPointerDown={(e) => onResizeStart(e, col.id)}
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {/* Sections */}
                {sections.map((section) => {
                  const sectionItems = items
                    .filter((i) => i.section_id === section.id && !i.archived)
                    .sort((a, b) => a.position - b.position);
                  const total = sectionTotal(section.id);

                  return (
                    <SortableContext
                      key={section.id}
                      id={section.id}
                      items={sectionItems.map((i) => i.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <SectionHeader
                        section={section}
                        colCount={visibleCols.length}
                        sectionTotal={total}
                        costVisible={costVisible}
                        canEdit={canEdit}
                        onToggleCollapse={() => toggleCollapse(section.id)}
                        onRename={(name) => renameSection(section.id, name)}
                        onDelete={() => deleteSection(section.id)}
                        onAddItem={() => addItemToSection(section.id)}
                      />
                      {!section.collapsed && (
                        <>
                          {sectionItems.length === 0 && (
                            <tr>
                              <td colSpan={visibleCols.length} className="py-2 px-6 text-xs text-[#c0c0c0] italic">
                                No items — click + to add
                              </td>
                            </tr>
                          )}
                          {sectionItems.map((item) => (
                            <SortableRow
                              key={item.id}
                              item={item}
                              listType={listType}
                              canEdit={canEdit}
                              visibleCols={visibleCols}
                              colWidths={colWidths}
                              onUpdate={updateItem}
                              onDelete={deleteItem}
                            />
                          ))}
                          {costVisible && sectionItems.length > 0 && (() => {
                            const costIdx = visibleCols.findIndex((c) => c.id === "unit_cost_cents");
                            if (costIdx < 0) return null;
                            const afterSpan = visibleCols.length - costIdx - 1;
                            return (
                              <tr className="border-t-2 border-[#cfe0e1] bg-[#f4f9f8]">
                                {costIdx > 0 && (
                                  <td colSpan={costIdx} className="px-3 py-1.5 text-right text-[10px] font-semibold text-[#6b6b6b] uppercase tracking-wide">
                                    Section total
                                  </td>
                                )}
                                <td className="px-2 py-1.5 text-xs font-bold text-[#155e63] text-right">
                                  {formatCurrency(total / 100)}
                                </td>
                                {afterSpan > 0 && <td colSpan={afterSpan} className="bg-[#f4f9f8]" />}
                              </tr>
                            );
                          })()}
                        </>
                      )}
                    </SortableContext>
                  );
                })}

                {/* Unsectioned items */}
                <SortableContext
                  id="__unsectioned__"
                  items={unsectionedItems.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {unsectionedItems.length > 0 && (
                    <tr className="bg-[#faf9f7] border-b border-[#e4eded]">
                      <td colSpan={visibleCols.length} className="px-3 py-1.5">
                        <span className="text-xs font-semibold text-[#afafaf]">Unsectioned</span>
                      </td>
                    </tr>
                  )}
                  {unsectionedItems.map((item) => (
                    <SortableRow
                      key={item.id}
                      item={item}
                      listType={listType}
                      canEdit={canEdit}
                      visibleCols={visibleCols}
                      colWidths={colWidths}
                      onUpdate={updateItem}
                      onDelete={deleteItem}
                    />
                  ))}
                </SortableContext>

                {/* Empty state */}
                {items.filter((i) => !i.archived).length === 0 && sections.length === 0 && (
                  <tr>
                    <td colSpan={visibleCols.length} className="text-center py-10 text-sm text-[#afafaf]">
                      No items yet. Add a section or use a starter list.
                    </td>
                  </tr>
                )}

                {/* Grand total */}
                {costVisible && grandTotal > 0 && (() => {
                  const costIdx = visibleCols.findIndex((c) => c.id === "unit_cost_cents");
                  if (costIdx < 0) return null;
                  const afterSpan = visibleCols.length - costIdx - 1;
                  return (
                    <tr className="bg-[#f4f9f8] border-t-2 border-[#155e63]">
                      {costIdx > 0 && (
                        <td colSpan={costIdx} className="px-3 py-2.5 text-right text-xs font-bold text-[#1a1a1a] uppercase tracking-wide">
                          Grand total
                        </td>
                      )}
                      <td className="px-2 py-2.5 text-sm font-bold text-[#155e63] text-right">
                        {formatCurrency(grandTotal / 100)}
                      </td>
                      {afterSpan > 0 && <td colSpan={afterSpan} className="bg-[#f4f9f8]" />}
                    </tr>
                  );
                })()}
              </tbody>
            </table>

            <DragOverlay>
              {activeItem && (
                <table className="w-full" style={{ tableLayout: "fixed" }}>
                  <colgroup>
                    {visibleCols.map((col) => (
                      <col key={col.id} style={{ width: colWidths.get(col.id) ?? col.defaultWidth }} />
                    ))}
                  </colgroup>
                  <tbody>
                    <SortableRow
                      item={activeItem}
                      listType={listType}
                      canEdit={canEdit}
                      visibleCols={visibleCols}
                      colWidths={colWidths}
                      onUpdate={() => {}}
                      onDelete={() => {}}
                      isDragOverlay
                    />
                  </tbody>
                </table>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {/* Add section + add unsectioned item */}
      {canEdit && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={addSection}
            className="flex items-center gap-2 text-sm font-medium text-[#155e63] border border-[#cfe0e1] rounded-xl px-4 py-2.5 hover:bg-[#155e63]/5 transition-colors"
          >
            <Plus size={14} aria-hidden="true" />
            Add section
          </button>
          <button
            type="button"
            onClick={() => addItemToSection(null)}
            className="flex items-center gap-2 text-sm font-medium text-[#6b6b6b] border border-[#e8e8e8] rounded-xl px-4 py-2.5 hover:bg-[#faf9f7] transition-colors"
          >
            <Plus size={14} aria-hidden="true" />
            Add item
          </button>
        </div>
      )}
    </div>
  );
}
