"use client";

// TIM-1038: Sectioned spreadsheet grid for Equipment and Supplies lists.
// Supports: workstation sections, drag-drop within/between sections,
// resizable columns (pointer events), per-section totals, grand total,
// column visibility toggle (localStorage), collapsible sections.
// TIM-1174: Vendor column links to Suppliers & Vendors workspace.
// TIM-1179: AI equipment recommendations + referral disclosure cards.
// TIM-1214: Section I — drag between sections/stations with droppable headers,
//   empty-section drop zones, and live-recomputing totals.
// TIM-1215: Section J — reorderable columns in Columns picker (up/down buttons +
//   mouse drag with GripHorizontal, distinct from row GripVertical handles).
//   Default order puts Cost closer to Name. Column order persisted server-side.
// TIM-1328: Section O — drag column headers left/right to reorder in-place (raw
//   pointer events, separate from row dnd-kit context). Non-toggleable columns
//   (drag handle, name, actions) stay fixed. Arrow-key keyboard alternative.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  getFirstCollision,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DroppableContainer,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  GripHorizontal,
  Plus,
  Trash2,
  Settings2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  X,
} from "lucide-react";
import type { EquipmentItem, EquipmentCategory, FinancingMethod } from "@/app/workspace/financials/financials-workspace";
import type { ListSection, SuppliesItem } from "@/types/buildout";
import type { EquipmentRecommendation } from "@/types/referral";
import { formatCurrencyAmount } from "@/lib/currency";
import { type VendorCandidate, VENDOR_CATEGORY_LABELS } from "@/lib/suppliers";
import { EquipmentRecommendationCard } from "@/components/buildout/EquipmentRecommendationCard";

// ── Column definitions ────────────────────────────────────────────────────────

type ColDef = {
  id: string;
  label: string;
  defaultWidth: number;
  resizable: boolean;
  toggleable: boolean;
  costClass?: boolean;
};

// TIM-1215: default order puts Cost right after Name/Model so name→attrs→price reads naturally.
// TIM-1327: useful_life_years column added — editable per item, shows inline annual depreciation.
const EQUIPMENT_COLS: ColDef[] = [
  { id: "drag",               label: "",            defaultWidth: 28,  resizable: false, toggleable: false },
  { id: "name",               label: "Name",        defaultWidth: 200, resizable: true,  toggleable: false },
  { id: "vendor",             label: "Brand",       defaultWidth: 130, resizable: true,  toggleable: true  },
  { id: "model",              label: "Model",       defaultWidth: 130, resizable: true,  toggleable: true  },
  { id: "unit_cost_cents",    label: "Cost",        defaultWidth: 110, resizable: true,  toggleable: true,  costClass: true },
  { id: "useful_life_years",  label: "Life (yr)",   defaultWidth: 110, resizable: true,  toggleable: true  },
  { id: "financing_method",   label: "Financing",   defaultWidth: 130, resizable: true,  toggleable: true  },
  { id: "category",           label: "Category",    defaultWidth: 160, resizable: true,  toggleable: true  },
  { id: "supplier",           label: "Vendor",      defaultWidth: 150, resizable: true,  toggleable: true  },
  { id: "notes",              label: "Notes",       defaultWidth: 180, resizable: true,  toggleable: true  },
  { id: "actions",            label: "",            defaultWidth: 32,  resizable: false, toggleable: false },
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

// ── Column order (server-side + localStorage fallback) ────────────────────────

function loadColOrderLocal(listType: string, defaultOrder: string[]): string[] {
  const key = `tcs-${listType}-col-order`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      // Validate: must include all default ids (guards against stale data)
      if (Array.isArray(parsed) && defaultOrder.every((id) => parsed.includes(id))) {
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return defaultOrder;
}

function saveColOrderLocal(listType: string, order: string[]) {
  try {
    localStorage.setItem(`tcs-${listType}-col-order`, JSON.stringify(order));
  } catch { /* ignore */ }
}

async function fetchColOrderServer(listType: string): Promise<string[] | null> {
  try {
    const res = await fetch(`/api/ui-prefs/col-order-${listType}`);
    if (!res.ok) return null;
    const json = await res.json() as { data: string[] | null };
    if (Array.isArray(json.data)) return json.data;
  } catch { /* ignore */ }
  return null;
}

let saveOrderTimer: ReturnType<typeof setTimeout> | null = null;
function saveColOrderServer(listType: string, order: string[]) {
  if (saveOrderTimer) clearTimeout(saveOrderTimer);
  saveOrderTimer = setTimeout(() => {
    fetch(`/api/ui-prefs/col-order-${listType}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    }).catch(() => {});
  }, 600);
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
      className="w-full h-full text-xs text-[var(--foreground)] bg-transparent outline-none border-0 p-0 placeholder-[var(--neutral-cool-400)]"
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
      className="w-full h-full text-xs text-[var(--foreground)] bg-transparent outline-none border-0 p-0 placeholder-[var(--neutral-cool-400)]"
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

// TIM-1327: editable useful-life field with inline annual-depreciation badge.
function UsefulLifeInput({
  years, totalCostCents, disabled, onCommit,
}: { years: number; totalCostCents: number; disabled: boolean; onCommit: (years: number) => void }) {
  const [draft, setDraft] = useState(String(years));
  useEffect(() => { setDraft(String(years)); }, [years]);

  function commit() {
    const parsed = parseInt(draft, 10);
    const clamped = isNaN(parsed) ? 7 : Math.min(50, Math.max(1, parsed));
    setDraft(String(clamped));
    onCommit(clamped);
  }

  const annualDepreciation =
    totalCostCents > 0 && years > 0
      ? Math.round(totalCostCents / 100 / years)
      : 0;

  return (
    <div className="flex flex-col gap-0.5">
      <input
        type="number"
        min={1}
        max={50}
        step={1}
        className="w-full text-xs text-[#1a1a1a] bg-transparent outline-none border-0 p-0 placeholder-[#c0c0c0]"
        value={draft}
        placeholder="7"
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
      />
      {annualDepreciation > 0 && (
        <span className="text-[10px] text-[#afafaf] leading-tight whitespace-nowrap">
          ${annualDepreciation.toLocaleString()}/yr
        </span>
      )}
    </div>
  );
}

// ── Vendor linked input (TIM-1174) ────────────────────────────────────────────

function VendorLinkedInput({
  name,
  candidateId,
  candidates,
  disabled,
  onCommit,
}: {
  name: string;
  candidateId: string | null;
  candidates: VendorCandidate[];
  disabled: boolean;
  onCommit: (name: string, candidateId: string | null) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [showDropdown, setShowDropdown] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(name); }, [name]);

  const filtered = useMemo(() => {
    if (!draft.trim()) return candidates;
    const q = draft.toLowerCase();
    return candidates.filter((c) => c.name.toLowerCase().includes(q));
  }, [candidates, draft]);

  const exactMatch = candidates.find(
    (c) => c.name.toLowerCase() === draft.toLowerCase().trim()
  );

  function handleSelect(candidate: VendorCandidate) {
    setEditing(false);
    setShowDropdown(false);
    setDraft(candidate.name);
    onCommit(candidate.name, candidate.id);
  }

  async function handleCreate() {
    if (!draft.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/workspaces/suppliers/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.trim(),
          category: "other",
          status: "researching",
          source: "user_added",
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as VendorCandidate;
        onCommit(created.name, created.id);
        setDraft(created.name);
      } else {
        onCommit(draft.trim(), null);
      }
    } catch {
      onCommit(draft.trim(), null);
    }
    setCreating(false);
    setEditing(false);
    setShowDropdown(false);
  }

  function handleBlur() {
    setTimeout(() => {
      setEditing(false);
      setShowDropdown(false);
      if (draft.trim() !== name) {
        onCommit(draft.trim() || "", exactMatch ? exactMatch.id : null);
      }
    }, 150);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1 w-full min-w-0">
        {name ? (
          candidateId ? (
            <button
              type="button"
              className="text-xs text-[var(--teal)] underline decoration-dotted hover:no-underline truncate text-left"
              onClick={() => router.push("/workspace/suppliers")}
              title="Open in Suppliers & Vendors"
            >
              {name}
            </button>
          ) : (
            <span
              className="block truncate text-xs text-[var(--foreground)] cursor-text flex-1"
              onClick={() => !disabled && setEditing(true)}
            >
              {name}
            </span>
          )
        ) : (
          <span
            className="block truncate text-xs text-[var(--neutral-cool-400)] cursor-text flex-1"
            onClick={() => !disabled && setEditing(true)}
          >
            Vendor
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        autoFocus
        className="w-full h-full text-xs text-[var(--foreground)] bg-transparent outline-none border-0 p-0 placeholder-[var(--neutral-cool-400)]"
        value={draft}
        placeholder="Search or add vendor..."
        onChange={(e) => { setDraft(e.target.value); setShowDropdown(true); }}
        onFocus={() => setShowDropdown(true)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setEditing(false); setShowDropdown(false); setDraft(name); }
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtered.length > 0 && exactMatch) handleSelect(exactMatch);
            else if (filtered.length > 0) handleSelect(filtered[0]);
            else if (draft.trim()) void handleCreate();
          }
        }}
      />
      {showDropdown && (filtered.length > 0 || (!exactMatch && draft.trim())) && (
        <div className="absolute left-0 top-full mt-0.5 z-30 bg-white border border-[var(--neutral-cool-200)] rounded-lg shadow-md min-w-[200px] max-h-[180px] overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--teal-tint-500)] flex items-center gap-2"
              onMouseDown={() => handleSelect(c)}
            >
              <span className="truncate flex-1">{c.name}</span>
              <span className="text-[10px] text-[var(--dark-grey)] shrink-0">
                {VENDOR_CATEGORY_LABELS[c.category as keyof typeof VENDOR_CATEGORY_LABELS] ?? c.category}
              </span>
            </button>
          ))}
          {!exactMatch && draft.trim() && (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs text-[var(--teal)] hover:bg-[var(--teal-tint-500)] font-medium border-t border-[var(--neutral-cool-150)]"
              onMouseDown={() => void handleCreate()}
              disabled={creating}
            >
              {creating ? "Adding..." : `Add "${draft.trim()}" to Suppliers`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Column picker row (TIM-1215) ──────────────────────────────────────────────
// Rendered inside the Columns dropdown. Uses GripHorizontal (horizontal grip)
// so it is visually distinct from the row-reorder GripVertical handles in the table body.

function ColPickerRow({
  col,
  hidden,
  isFirst,
  isLast,
  isDragging,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  col: ColDef;
  hidden: boolean;
  isFirst: boolean;
  isLast: boolean;
  isDragging: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: col.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 px-2 py-1.5 hover:bg-[var(--background)] group"
      role="listitem"
    >
      {/* Drag handle — horizontal grip distinguishes column reorder from row reorder */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none text-[var(--neutral-cool-400)] hover:text-[var(--neutral-cool-600)] shrink-0 p-0.5"
        aria-label={`Drag to reorder ${col.label} column`}
        {...attributes}
        {...listeners}
      >
        <GripHorizontal size={12} />
      </button>

      {/* Visibility toggle */}
      <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
        <input
          type="checkbox"
          className="accent-[var(--teal)] cursor-pointer shrink-0"
          checked={!hidden}
          onChange={onToggle}
        />
        <span className="text-xs text-[var(--foreground)] truncate">{col.label}</span>
      </label>

      {/* Keyboard up/down buttons — always visible on focus/hover for a11y */}
      <div className="flex flex-col opacity-0 group-hover:opacity-100 focus-within:opacity-100 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label={`Move ${col.label} column up`}
          className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-20 disabled:cursor-not-allowed p-0"
        >
          <ChevronUp size={11} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label={`Move ${col.label} column down`}
          className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-20 disabled:cursor-not-allowed p-0"
        >
          <ChevronDown size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Sortable row ──────────────────────────────────────────────────────────────

function SortableRow({
  item,
  listType,
  canEdit,
  visibleCols,
  colWidths,
  vendorCandidates,
  recommendations,
  showRecommendations,
  showAiMarkings,
  onUpdate,
  onDelete,
  isDragOverlay,
}: {
  item: AnyItem;
  listType: "equipment" | "supplies";
  canEdit: boolean;
  visibleCols: ColDef[];
  colWidths: Map<string, number>;
  vendorCandidates: VendorCandidate[];
  recommendations?: Map<string, EquipmentRecommendation>;
  showRecommendations?: boolean;
  showAiMarkings?: boolean;
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

  const cellCls = "px-2 py-1.5 border-r border-[var(--neutral-cool-150)] last:border-r-0 align-middle text-xs";

  function renderCell(col: ColDef) {
    switch (col.id) {
      case "drag":
        return (
          <td key="drag" className={`${cellCls} text-[var(--neutral-cool-350)]`} style={{ width: colWidths.get("drag") }}>
            {canEdit && (
              <button
                type="button"
                className="cursor-grab active:cursor-grabbing touch-none p-0.5 text-[var(--neutral-cool-400)] hover:text-[var(--neutral-cool-600)] transition-colors"
                {...attributes}
                {...listeners}
                aria-label="Drag to reorder"
              >
                <GripVertical size={14} />
              </button>
            )}
          </td>
        );

      case "name": {
        const rec = listType === "equipment" ? recommendations?.get(item.id) : undefined;
        return (
          <td key="name" className={`${cellCls} sticky left-[0px] z-10 bg-white`} style={{ width: colWidths.get("name") }}>
            <div className="flex items-center gap-1.5">
              {item.source === "ai_suggested" && showAiMarkings !== false && (
                <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-50 text-amber-600">AI</span>
              )}
              <TextInput
                value={item.name}
                placeholder="Item name"
                disabled={!canEdit}
                onCommit={(v) => onUpdate(item.id, { name: v } as Partial<AnyItem>)}
              />
            </div>
            {rec && !isDragOverlay && showRecommendations !== false && (
              <EquipmentRecommendationCard recommendation={rec} />
            )}
          </td>
        );
      }

      case "vendor":
        return (
          <td key="vendor" className={cellCls} style={{ width: colWidths.get("vendor") }}>
            <TextInput
              value={(item as { vendor?: string | null }).vendor ?? ""}
              placeholder="Brand"
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
            <VendorLinkedInput
              name={eq.supplier ?? ""}
              candidateId={eq.vendor_candidate_id ?? null}
              candidates={vendorCandidates}
              disabled={!canEdit}
              onCommit={(name, candidateId) =>
                onUpdate(item.id, { supplier: name || null, vendor_candidate_id: candidateId } as Partial<AnyItem>)
              }
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

      case "useful_life_years":
        return eq ? (
          <td key="useful_life_years" className={cellCls} style={{ width: colWidths.get("useful_life_years") }}>
            <UsefulLifeInput
              years={eq.useful_life_years ?? 7}
              totalCostCents={eq.unit_cost_cents * eq.quantity}
              disabled={!canEdit}
              onCommit={(years) => onUpdate(item.id, { useful_life_years: years } as Partial<AnyItem>)}
            />
          </td>
        ) : null;

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
                className="text-[var(--neutral-cool-400)] hover:text-[var(--error)] transition-colors p-0.5"
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
      className={`border-b border-[var(--neutral-cool-100)] bg-white hover:bg-[var(--background)] transition-colors ${isDragOverlay ? "shadow-lg rounded opacity-90" : ""}`}
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
  isDragging,
  currencyCode,
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
  isDragging: boolean;
  currencyCode: string;
  onToggleCollapse: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddItem: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: section.id });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.name);
  const inputRef = useRef<HTMLInputElement>(null);

  function commitRename() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== section.name) onRename(draft.trim());
    else setDraft(section.name);
  }

  useEffect(() => { setDraft(section.name); }, [section.name]);

  const dropHighlight = isDragging && isOver;

  return (
    <tr
      ref={setNodeRef}
      className={`border-b border-[var(--teal-bg-400)] transition-colors ${
        dropHighlight ? "ring-2 ring-inset ring-[var(--teal)]" : ""
      }`}
    >
      <td
        colSpan={colCount}
        className={`px-2 py-1.5 sticky left-0 z-10 ${
          dropHighlight ? "bg-[var(--teal-bg-700)]" : "bg-[var(--teal-tint-500)]"
        }`}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors shrink-0"
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
              className="text-xs font-semibold text-[var(--foreground)] bg-white border border-[var(--teal-tint)] rounded px-2 py-0.5 outline-none focus:border-[var(--teal)] min-w-[160px]"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setEditing(false); setDraft(section.name); }
              }}
            />
          ) : (
            <span
              className="text-xs font-semibold text-[var(--foreground)] cursor-text hover:underline decoration-dotted"
              onDoubleClick={() => canEdit && setEditing(true)}
              title={canEdit ? "Double-click to rename" : undefined}
            >
              {section.name}
            </span>
          )}

          <div className="flex-1" />

          {costVisible && sectionTotal > 0 && (
            <span className="text-xs font-semibold text-[var(--teal)]">
              {formatCurrencyAmount(sectionTotal / 100, currencyCode)}
            </span>
          )}

          {canEdit && (
            <>
              <button
                type="button"
                onClick={onAddItem}
                className="text-[var(--teal)] hover:text-[var(--teal-dark)] transition-colors"
                aria-label="Add item to section"
                title="Add item"
              >
                <Plus size={13} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="text-[var(--neutral-cool-400)] hover:text-[var(--error)] transition-colors"
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

// ── Droppable empty zone ──────────────────────────────────────────────────────

// Visible drop target when a section (or the unsectioned area) has no items
// and a drag is in progress. The id uses a "__drop_" prefix so onDragOver can
// distinguish it from item ids while still resolving the target section.

function DroppableEmptyZone({
  droppableId,
  colCount,
}: {
  droppableId: string;
  colCount: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });
  return (
    <tr ref={setNodeRef}>
      <td
        colSpan={colCount}
        className={`py-4 px-6 text-xs text-center border-2 border-dashed rounded-sm transition-colors ${
          isOver
            ? "border-[var(--teal)] text-[var(--teal)] bg-[var(--teal-tint-200)]"
            : "border-[var(--teal-bg-650)] text-[var(--teal-bg-light)]"
        }`}
      >
        {isOver ? "Release to move here" : "Drop item here"}
      </td>
    </tr>
  );
}

// ── Cross-section keyboard coordinator (TIM-1220) ─────────────────────────────
// sortableKeyboardCoordinates is scoped to the active SortableContext and cannot
// navigate between station sections. This version queries all registered droppables
// in the DndContext so arrow keys cross section boundaries.
const crossSectionKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { active, collisionRect, droppableRects, droppableContainers } }
) => {
  const directions = [KeyboardCode.Down, KeyboardCode.Right, KeyboardCode.Up, KeyboardCode.Left];
  if (!directions.includes(event.code as KeyboardCode)) return;

  event.preventDefault();
  if (!active || !collisionRect) return;

  const candidates: DroppableContainer[] = [];
  droppableContainers.getEnabled().forEach((entry) => {
    if (!entry || entry.disabled) return;
    const rect = droppableRects.get(entry.id);
    if (!rect) return;
    switch (event.code as KeyboardCode) {
      case KeyboardCode.Down:
        if (collisionRect.top < rect.top) candidates.push(entry);
        break;
      case KeyboardCode.Up:
        if (collisionRect.top > rect.top) candidates.push(entry);
        break;
      case KeyboardCode.Left:
        if (collisionRect.left > rect.left) candidates.push(entry);
        break;
      case KeyboardCode.Right:
        if (collisionRect.left < rect.left) candidates.push(entry);
        break;
    }
  });

  const collisions = closestCorners({
    active,
    collisionRect,
    droppableRects,
    droppableContainers: candidates,
    pointerCoordinates: null,
  });

  const closestId = getFirstCollision(collisions, "id");
  if (closestId == null) return;

  const newRect = droppableRects.get(closestId as string);
  if (!newRect) return;

  return { x: newRect.left, y: newRect.top };
};

// ── Main component ────────────────────────────────────────────────────────────

export interface SectionedListGridProps {
  listType: "equipment" | "supplies";
  planId: string;
  canEdit: boolean;
  sections: ListSection[];
  items: AnyItem[];
  onItemsChange: (items: AnyItem[]) => void;
  onSectionsChange: (sections: ListSection[]) => void;
  recommendations?: Map<string, EquipmentRecommendation>;
  showRecommendations?: boolean;
  showAiMarkings?: boolean;
  currencyCode?: string;
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
  recommendations,
  showRecommendations,
  showAiMarkings,
  currencyCode = "USD",
}: SectionedListGridProps) {
  const cols = listType === "equipment" ? EQUIPMENT_COLS : SUPPLIES_COLS;
  const defaultColOrder = useMemo(() => cols.map((c) => c.id), [cols]);

  // TIM-1174: Vendor candidates for autocomplete in equipment Vendor column
  const [vendorCandidates, setVendorCandidates] = useState<VendorCandidate[]>([]);
  useEffect(() => {
    if (listType !== "equipment") return;
    fetch("/api/workspaces/suppliers/candidates")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: VendorCandidate[]) => setVendorCandidates(data))
      .catch(() => {});
  }, [listType]);

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

  // TIM-1215: Column order — ordered array of col ids.
  // Loads from server on mount (with localStorage fallback); saves to both on change.
  const [colOrder, setColOrder] = useState<string[]>(() => loadColOrderLocal(listType, defaultColOrder));
  useEffect(() => {
    const localOrder = loadColOrderLocal(listType, defaultColOrder);
    setColOrder(localOrder);
    fetchColOrderServer(listType).then((serverOrder) => {
      if (serverOrder) {
        // Merge: add any new cols not in saved order at the end (before non-toggleable tail)
        const merged = [
          ...serverOrder.filter((id) => defaultColOrder.includes(id)),
          ...defaultColOrder.filter((id) => !serverOrder.includes(id)),
        ];
        setColOrder(merged);
        saveColOrderLocal(listType, merged);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listType]);

  function applyColOrder(order: string[]) {
    setColOrder(order);
    saveColOrderLocal(listType, order);
    saveColOrderServer(listType, order);
  }

  // TIM-1328: in-grid column header drag state (raw pointer events, distinct from row dnd-kit)
  type ColHeaderDrag = { draggingId: string; dropBeforeColId: string | null };
  const colHeaderDragRef = useRef<ColHeaderDrag | null>(null);
  const [colHeaderDragDisplay, setColHeaderDragDisplay] = useState<ColHeaderDrag | null>(null);
  const headerCellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());

  function startColHeaderDrag(e: React.PointerEvent, colId: string) {
    if (!canEdit) return;
    e.preventDefault();
    const init: ColHeaderDrag = { draggingId: colId, dropBeforeColId: null };
    colHeaderDragRef.current = init;
    setColHeaderDragDisplay(init);
    document.body.style.cursor = "grabbing";

    // Capture cols visible at drag-start so mid-drag visibility changes don't shift hit-boxes
    const snapCols = visibleCols;
    const snapColOrder = colOrder;

    function onMove(ev: PointerEvent) {
      if (!colHeaderDragRef.current) return;
      const { draggingId } = colHeaderDragRef.current;
      let dropBeforeColId: string | null = null;
      for (const c of snapCols) {
        if (!c.toggleable || c.id === draggingId) continue;
        const el = headerCellRefs.current.get(c.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (ev.clientX < r.left + r.width / 2) { dropBeforeColId = c.id; break; }
      }
      const next: ColHeaderDrag = { draggingId, dropBeforeColId };
      colHeaderDragRef.current = next;
      setColHeaderDragDisplay(next);
    }

    function onUp() {
      const state = colHeaderDragRef.current;
      colHeaderDragRef.current = null;
      setColHeaderDragDisplay(null);
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!state) return;
      const { draggingId, dropBeforeColId } = state;
      const toggleableIds = snapColOrder.filter((id) => cols.find((c) => c.id === id)?.toggleable);
      const fromIdx = toggleableIds.indexOf(draggingId);
      if (fromIdx === -1) return;
      const toIdx = dropBeforeColId === null ? toggleableIds.length : toggleableIds.indexOf(dropBeforeColId);
      if (toIdx === -1 || toIdx === fromIdx || toIdx === fromIdx + 1) return;
      const next = [...toggleableIds];
      next.splice(fromIdx, 1);
      const adjustedTo = toIdx > fromIdx ? toIdx - 1 : toIdx;
      next.splice(adjustedTo, 0, draggingId);
      const fixedIds = cols.filter((c) => !c.toggleable).map((c) => c.id);
      const ni = fixedIds.indexOf("name");
      applyColOrder([...fixedIds.slice(0, ni + 1), ...next, ...fixedIds.slice(ni + 1)]);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function moveColByKey(colId: string, direction: "left" | "right") {
    const toggleableIds = colOrder.filter((id) => cols.find((c) => c.id === id)?.toggleable);
    const ci = toggleableIds.indexOf(colId);
    if (ci === -1) return;
    if (direction === "left" && ci === 0) return;
    if (direction === "right" && ci === toggleableIds.length - 1) return;
    const next = arrayMove(toggleableIds, ci, direction === "left" ? ci - 1 : ci + 1);
    const fixedIds = cols.filter((c) => !c.toggleable).map((c) => c.id);
    const ni = fixedIds.indexOf("name");
    applyColOrder([...fixedIds.slice(0, ni + 1), ...next, ...fixedIds.slice(ni + 1)]);
  }

  // TIM-1215: Column picker drag state (for dragging column rows in the picker)
  const [colPickerDragId, setColPickerDragId] = useState<string | null>(null);
  const colPickerSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);
  const itemsSnapshotRef = useRef<AnyItem[]>([]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: crossSectionKeyboardCoordinates }),
  );

  // Resize state
  const resizeRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);

  // Autosave timers
  const itemDebounce = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const sectionDebounce = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingItemPatches = useRef<Map<string, Record<string, unknown>>>(new Map());
  const creatingItems = useRef<Set<string>>(new Set());

  // TIM-1215: Apply user-defined column order, then filter hidden.
  const visibleCols = useMemo(() => {
    const colMap = new Map(cols.map((c) => [c.id, c]));
    return colOrder
      .map((id) => colMap.get(id))
      .filter((c): c is ColDef => !!c && (!c.toggleable || !hiddenCols.has(c.id)));
  }, [cols, colOrder, hiddenCols]);

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
        body.vendor_candidate_id = eq.vendor_candidate_id ?? null;
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
        vendor_candidate_id: null,
        priority_tier: "must_have",
        financing_method: "cash" as FinancingMethod,
        useful_life_years: 7,
        purchase_month: null,
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
    itemsSnapshotRef.current = items;
    setActiveId(active.id as string);
  }

  function onDragCancel() {
    onItemsChange(itemsSnapshotRef.current);
    setActiveId(null);
  }

  function resolveSectionId(overId: string): string | null | undefined {
    const overItem = items.find((i) => i.id === overId);
    if (overItem) return overItem.section_id;
    const overSection = sections.find((s) => s.id === overId);
    if (overSection) return overSection.id;
    if (overId === "__unsectioned__") return null;
    // Empty-zone droppable: "__drop_<sectionId>" or "__drop___unsectioned__"
    if (overId.startsWith("__drop_")) {
      const inner = overId.slice("__drop_".length);
      if (inner === "__unsectioned__") return null;
      const sec = sections.find((s) => s.id === inner);
      if (sec) return sec.id;
    }
    return undefined; // unresolvable
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeItemId = active.id as string;
    const overId = over.id as string;

    const activeSectionId = findItemSectionId(activeItemId);
    const targetSectionId = resolveSectionId(overId);
    if (targetSectionId === undefined) return;
    if (activeSectionId === targetSectionId) return; // same section — sortable handles it

    // Optimistically move active item to target section
    const updated = items.map((i) =>
      i.id === activeItemId ? { ...i, section_id: targetSectionId } : i
    );
    onItemsChange(updated);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) {
      onItemsChange(itemsSnapshotRef.current);
      return;
    }

    const activeItemId = active.id as string;
    const overId = over.id as string;

    // Determine final section and index
    const targetSectionId = (() => {
      const resolved = resolveSectionId(overId);
      if (resolved !== undefined) return resolved;
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

  const headerCellCls = "px-2 py-2 text-left text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide border-r border-[var(--neutral-cool-150)] last:border-r-0 bg-[var(--background)] select-none relative";

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
          {items.filter((i) => !i.archived).length > 0 && (
            <>
              <span>{items.filter((i) => !i.archived).length} item{items.filter((i) => !i.archived).length !== 1 ? "s" : ""}</span>
              {costVisible && grandTotal > 0 && (
                <>
                  <span className="text-[var(--border)]">|</span>
                  <span className="font-semibold text-[var(--foreground)]">Total: {formatCurrencyAmount(grandTotal / 100, currencyCode)}</span>
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
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--neutral-cool-200)] rounded px-2 py-1 hover:bg-[var(--surface-warm-100)] transition-colors"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--neutral-cool-200)] rounded px-2 py-1 hover:bg-[var(--surface-warm-100)] transition-colors"
            >
              Collapse all
            </button>
          </div>
        )}

        {/* TIM-1215: Column picker — show/hide + reorder.
            Uses GripHorizontal handles (distinct from row GripVertical) and
            up/down arrow buttons for full keyboard accessibility. */}
        <div className="relative flex-shrink-0" ref={colPickerRef}>
          <button
            type="button"
            onClick={() => setColPickerOpen((o) => !o)}
            aria-label="Column settings"
            className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--neutral-cool-200)] rounded-lg px-2 py-1.5 hover:bg-[var(--surface-warm-100)] transition-colors"
          >
            <Settings2 size={12} />
            Columns
          </button>
          {colPickerOpen && (() => {
            // Ordered list of toggleable columns only (non-toggleable stay fixed)
            const toggleableCols = colOrder
              .map((id) => cols.find((c) => c.id === id))
              .filter((c): c is ColDef => !!c && c.toggleable);

            return (
              <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-[var(--border)] rounded-xl shadow-lg py-1 min-w-[200px]">
                <p className="px-3 py-1.5 text-[10px] font-semibold text-[var(--dark-grey)] uppercase tracking-wide">Columns</p>
                <DndContext
                  sensors={colPickerSensors}
                  onDragStart={({ active }) => setColPickerDragId(active.id as string)}
                  onDragEnd={({ active, over }) => {
                    setColPickerDragId(null);
                    if (!over || active.id === over.id) return;
                    const toggleableIds = toggleableCols.map((c) => c.id);
                    const fromIdx = toggleableIds.indexOf(active.id as string);
                    const toIdx = toggleableIds.indexOf(over.id as string);
                    if (fromIdx === -1 || toIdx === -1) return;
                    const newToggleable = arrayMove(toggleableIds, fromIdx, toIdx);
                    // Rebuild full colOrder: fixed leading cols → reordered toggleable → fixed trailing cols
                    const fixed = cols.filter((c) => !c.toggleable).map((c) => c.id);
                    const leading = fixed.slice(0, fixed.indexOf("name") + 1); // drag + name
                    const trailing = fixed.slice(fixed.indexOf("name") + 1); // actions
                    const newOrder = [...leading, ...newToggleable, ...trailing];
                    applyColOrder(newOrder);
                  }}
                >
                  <SortableContext items={toggleableCols.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    {toggleableCols.map((col, idx) => {
                      const hidden = hiddenCols.has(col.id);
                      return (
                        <ColPickerRow
                          key={col.id}
                          col={col}
                          hidden={hidden}
                          isFirst={idx === 0}
                          isLast={idx === toggleableCols.length - 1}
                          isDragging={colPickerDragId === col.id}
                          onToggle={() => {
                            setHiddenCols((prev) => {
                              const next = new Set(prev);
                              if (hidden) next.delete(col.id);
                              else next.add(col.id);
                              saveColVisibility(listType, next);
                              return next;
                            });
                          }}
                          onMoveUp={() => {
                            const ids = toggleableCols.map((c) => c.id);
                            const i = ids.indexOf(col.id);
                            if (i <= 0) return;
                            const reordered = arrayMove(ids, i, i - 1);
                            const fixed = cols.filter((c) => !c.toggleable).map((c) => c.id);
                            const leading = fixed.slice(0, fixed.indexOf("name") + 1);
                            const trailing = fixed.slice(fixed.indexOf("name") + 1);
                            applyColOrder([...leading, ...reordered, ...trailing]);
                          }}
                          onMoveDown={() => {
                            const ids = toggleableCols.map((c) => c.id);
                            const i = ids.indexOf(col.id);
                            if (i >= ids.length - 1) return;
                            const reordered = arrayMove(ids, i, i + 1);
                            const fixed = cols.filter((c) => !c.toggleable).map((c) => c.id);
                            const leading = fixed.slice(0, fixed.indexOf("name") + 1);
                            const trailing = fixed.slice(fixed.indexOf("name") + 1);
                            applyColOrder([...leading, ...reordered, ...trailing]);
                          }}
                        />
                      );
                    })}
                  </SortableContext>
                </DndContext>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Table */}
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
            <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: visibleCols.reduce((s, c) => s + (colWidths.get(c.id) ?? c.defaultWidth), 0) }}>
              <colgroup>
                {visibleCols.map((col) => (
                  <col key={col.id} style={{ width: colWidths.get(col.id) ?? col.defaultWidth }} />
                ))}
              </colgroup>

              <thead>
                <tr className="border-b border-[var(--neutral-cool-150)]">
                  {visibleCols.map((col) => {
                    const isColDragging = colHeaderDragDisplay?.draggingId === col.id;
                    const isDropBefore = col.toggleable
                      && colHeaderDragDisplay !== null
                      && colHeaderDragDisplay.dropBeforeColId === col.id
                      && col.id !== colHeaderDragDisplay.draggingId;
                    const lastToggleableId = visibleCols.filter((c) => c.toggleable).at(-1)?.id;
                    const isDropAfterEnd = col.toggleable
                      && colHeaderDragDisplay !== null
                      && colHeaderDragDisplay.dropBeforeColId === null
                      && col.id === lastToggleableId
                      && col.id !== colHeaderDragDisplay.draggingId;

                    return (
                      <th
                        key={col.id}
                        ref={col.toggleable
                          ? (el) => { if (el) headerCellRefs.current.set(col.id, el); else headerCellRefs.current.delete(col.id); }
                          : undefined}
                        className={`group ${headerCellCls}${col.id === "name" ? " sticky left-0 z-20" : ""} ${isColDragging ? "opacity-40" : ""}`}
                        style={col.toggleable
                          ? { cursor: colHeaderDragDisplay ? (isColDragging ? "grabbing" : "default") : "grab" }
                          : undefined}
                        onPointerDown={col.toggleable ? (e) => startColHeaderDrag(e, col.id) : undefined}
                        tabIndex={col.toggleable ? 0 : undefined}
                        aria-label={col.toggleable ? `${col.label}. Drag or use left/right arrow keys to reorder column.` : undefined}
                        onKeyDown={col.toggleable ? (e) => {
                          if (e.key === "ArrowLeft") { e.preventDefault(); moveColByKey(col.id, "left"); }
                          else if (e.key === "ArrowRight") { e.preventDefault(); moveColByKey(col.id, "right"); }
                        } : undefined}
                      >
                        {isDropBefore && (
                          <span className="absolute left-0 top-0 h-full w-0.5 bg-[var(--teal)] z-20 pointer-events-none" aria-hidden />
                        )}
                        {isDropAfterEnd && (
                          <span className="absolute right-0 top-0 h-full w-0.5 bg-[var(--teal)] z-20 pointer-events-none" aria-hidden />
                        )}
                        {col.toggleable && !colHeaderDragDisplay && (
                          <GripHorizontal
                            size={10}
                            className="inline-block mr-1 text-[var(--gray-750)] group-hover:text-[var(--gray-1000)] transition-colors"
                            aria-hidden
                          />
                        )}
                        <span>{col.label}</span>
                        {col.resizable && (
                          <span
                            className="absolute right-0 top-0 h-full w-[10px] cursor-col-resize hover:bg-[var(--teal)]/30 transition-colors"
                            onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, col.id); }}
                          />
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {/* Sections */}
                {sections.map((section) => {
                  const sectionItems = items
                    .filter((i) => i.section_id === section.id && !i.archived)
                    .sort((a, b) => a.position - b.position);
                  const total = sectionTotal(section.id);
                  const isDraggingActive = activeId !== null;

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
                        isDragging={isDraggingActive}
                        currencyCode={currencyCode}
                        onToggleCollapse={() => toggleCollapse(section.id)}
                        onRename={(name) => renameSection(section.id, name)}
                        onDelete={() => deleteSection(section.id)}
                        onAddItem={() => addItemToSection(section.id)}
                      />
                      {!section.collapsed && (
                        <>
                          {sectionItems.length === 0 && !isDraggingActive && (
                            <tr>
                              <td colSpan={visibleCols.length} className="py-2 px-6 text-xs text-[var(--neutral-cool-400)] italic">
                                No items — click + to add
                              </td>
                            </tr>
                          )}
                          {sectionItems.length === 0 && isDraggingActive && (
                            <DroppableEmptyZone
                              droppableId={`__drop_${section.id}`}
                              colCount={visibleCols.length}
                            />
                          )}
                          {sectionItems.map((item) => (
                            <SortableRow
                              key={item.id}
                              item={item}
                              listType={listType}
                              canEdit={canEdit}
                              visibleCols={visibleCols}
                              colWidths={colWidths}
                              vendorCandidates={vendorCandidates}
                              recommendations={recommendations}
                              showRecommendations={showRecommendations}
                              showAiMarkings={showAiMarkings}
                              onUpdate={updateItem}
                              onDelete={deleteItem}
                            />
                          ))}
                          {costVisible && sectionItems.length > 0 && (() => {
                            const costIdx = visibleCols.findIndex((c) => c.id === "unit_cost_cents");
                            if (costIdx < 0) return null;
                            const afterSpan = visibleCols.length - costIdx - 1;
                            return (
                              <tr className="border-t-2 border-[var(--teal-tint)] bg-[var(--teal-tint-500)]">
                                {costIdx > 0 && (
                                  <td colSpan={costIdx} className="px-3 py-1.5 text-right text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
                                    Section total
                                  </td>
                                )}
                                <td className="px-2 py-1.5 text-xs font-bold text-[var(--teal)] text-right">
                                  {formatCurrencyAmount(total / 100, currencyCode)}
                                </td>
                                {afterSpan > 0 && <td colSpan={afterSpan} className="bg-[var(--teal-tint-500)]" />}
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
                    <tr className="border-b border-[var(--teal-bg-400)]">
                      <td colSpan={visibleCols.length} className="px-3 py-1.5 sticky left-0 z-10 bg-[var(--background)]">
                        <span className="text-xs font-semibold text-[var(--dark-grey)]">Unsectioned</span>
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
                      vendorCandidates={vendorCandidates}
                      recommendations={recommendations}
                      showRecommendations={showRecommendations}
                      showAiMarkings={showAiMarkings}
                      onUpdate={updateItem}
                      onDelete={deleteItem}
                    />
                  ))}
                  {unsectionedItems.length === 0 && activeId !== null && sections.length > 0 && (
                    <DroppableEmptyZone
                      droppableId="__drop___unsectioned__"
                      colCount={visibleCols.length}
                    />
                  )}
                </SortableContext>

                {/* Empty state */}
                {items.filter((i) => !i.archived).length === 0 && sections.length === 0 && (
                  <tr>
                    <td colSpan={visibleCols.length} className="text-center py-10 text-sm text-[var(--dark-grey)]">
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
                    <tr className="bg-[var(--teal-tint-500)] border-t-2 border-[var(--teal)]">
                      {costIdx > 0 && (
                        <td colSpan={costIdx} className="px-3 py-2.5 text-right text-xs font-bold text-[var(--foreground)] uppercase tracking-wide">
                          Grand total
                        </td>
                      )}
                      <td className="px-2 py-2.5 text-sm font-bold text-[var(--teal)] text-right">
                        {formatCurrencyAmount(grandTotal / 100, currencyCode)}
                      </td>
                      {afterSpan > 0 && <td colSpan={afterSpan} className="bg-[var(--teal-tint-500)]" />}
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
                      vendorCandidates={vendorCandidates}
                      showRecommendations={showRecommendations}
                      showAiMarkings={showAiMarkings}
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
            className="flex items-center gap-2 text-sm font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-4 py-2.5 hover:bg-[var(--teal)]/5 transition-colors"
          >
            <Plus size={14} aria-hidden="true" />
            Add section
          </button>
          <button
            type="button"
            onClick={() => addItemToSection(null)}
            className="flex items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] border border-[var(--neutral-cool-200)] rounded-xl px-4 py-2.5 hover:bg-[var(--background)] transition-colors"
          >
            <Plus size={14} aria-hidden="true" />
            Add item
          </button>
        </div>
      )}
    </div>
  );
}
