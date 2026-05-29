"use client";

// TIM-967: Menu & Pricing workspace — drink overview, recipe builder, ingredient costing, AI price suggestion.
// TIM-1020: searchable ingredient combobox, COGS+GP on overview rows, concept-aware price suggestion.
// TIM-1140: editable per-plan categories, drag/drop item reorder + move between categories,
// workspace + per-category aggregate metrics (avg COGS%, avg GP%), category-level default
// ingredients (amortized disposables), 'piece' unit, badge-styled category UX on item card.

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Utensils,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  X,
  Sparkles,
  Package,
  Edit2,
  Search,
  GripVertical,
  FolderOpen,
  Tag,
  Settings,
  StickyNote,
  LayoutGrid,
  TrendingUp,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import {
  type MenuItemWithCogs,
  type MenuIngredient,
  type MenuItemIngredient,
  type MenuCategory,
  type CategoryDefaultIngredient,
  type IngredientUnit,
  UNIT_OPTIONS,
  formatCents,
  costPerUnit,
  aggregateMargins,
} from "@/lib/menu";
import {
  type ExpectedPopularity,
  type Quadrant,
  POPULARITY_OPTIONS,
  QUADRANT_META,
  classifyMenu,
  marginRanking,
} from "@/lib/menu-engineering";

interface ConceptContext {
  shop_identity?: string;
  location?: string;
  target_customer?: string;
  vision?: string;
}

interface Props {
  planId: string;
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
  initialItems: MenuItemWithCogs[];
  initialIngredients: MenuIngredient[];
  initialItemIngredients: MenuItemIngredient[];
  initialCategories: MenuCategory[];
  initialCategoryDefaults: CategoryDefaultIngredient[];
  conceptContext?: ConceptContext;
}

function makeLocalId() {
  return "local_" + Math.random().toString(36).slice(2, 10);
}

const inputCls =
  "w-full text-sm border border-[#e0e0e0] rounded-lg px-3 py-2 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors";
const labelCls = "block text-xs font-medium text-[#6b6b6b] mb-1";
const sectionLabelCls =
  "text-[10px] font-semibold uppercase tracking-wider text-[#155e63] mb-3";

// TIM-1212: dense, spreadsheet-style cell input — borderless until hover/focus
// so the ingredient grid stays flat and scannable.
const cellInputCls =
  "w-full text-sm bg-transparent border border-transparent rounded-md px-2 py-1.5 text-[#1a1a1a] placeholder-[#c5c5c5] hover:border-[#e6e6e6] focus:outline-none focus:border-[#155e63] focus:bg-white disabled:text-[#6b6b6b] disabled:hover:border-transparent transition-colors";
const quickInputCls =
  "w-full text-sm bg-white border border-[#cfe3e3] rounded-md px-2 py-1.5 text-[#1a1a1a] placeholder-[#9fb4b4] focus:outline-none focus:border-[#155e63] transition-colors";
// Shared column template so the header, data rows, and quick-add row stay aligned.
const ingGridCls =
  "grid grid-cols-[minmax(0,1fr)_5rem_5.5rem_6rem_6.5rem_3.5rem] gap-2 items-center";

type PriceSuggestion = {
  suggested_price_cents: number;
  low_cents: number;
  high_cents: number;
  margin_pct: number;
  commentary: string;
};

// ─── Expected-popularity selector (TIM-1322) ─────────────────────────────────
// Segmented Low / Medium / High control. Clicking the active option clears it
// back to "not set". Pre-launch there is no real sales data, so this is the
// owner's estimate feeding the menu-engineering matrix.
function PopularitySelector({
  value,
  disabled,
  onChange,
  size = "md",
}: {
  value: ExpectedPopularity | null;
  disabled?: boolean;
  onChange: (value: ExpectedPopularity | null) => void;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs";
  return (
    <div
      className="inline-flex rounded-lg border border-[#e0e0e0] overflow-hidden"
      role="group"
      aria-label="Expected popularity"
    >
      {POPULARITY_OPTIONS.map((opt, idx) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(active ? null : opt.value)}
            className={`${pad} font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              idx > 0 ? "border-l border-[#e0e0e0]" : ""
            } ${
              active
                ? "bg-[#155e63] text-white"
                : "bg-white text-[#6b6b6b] hover:text-[#1a1a1a]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Searchable ingredient combobox (TIM-1020) ───────────────────────────────

function IngredientCombobox({
  ingredients,
  onSelect,
  disabled,
}: {
  ingredients: MenuIngredient[];
  onSelect: (ingredientId: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const sorted = useMemo(
    () => [...ingredients].sort((a, b) => a.name.localeCompare(b.name)),
    [ingredients]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return sorted;
    const q = query.toLowerCase();
    return sorted.filter((i) => i.name.toLowerCase().includes(q));
  }, [sorted, query]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        inputRef.current &&
        !inputRef.current.closest("[data-combobox]")?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
      scrollHighlighted(highlightIdx + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
      scrollHighlighted(highlightIdx - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightIdx]) pick(filtered[highlightIdx].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function scrollHighlighted(idx: number) {
    if (!listRef.current) return;
    const li = listRef.current.children[idx] as HTMLElement | undefined;
    li?.scrollIntoView({ block: "nearest" });
  }

  function pick(id: string) {
    onSelect(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div data-combobox className="relative">
      <label className={labelCls}>Add Ingredient</label>
      <div className="relative">
        <Search
          size={12}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#afafaf] pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          className={inputCls + " pl-8"}
          value={query}
          disabled={disabled}
          placeholder="Search ingredients…"
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-[#e0e0e0] bg-white shadow-md text-sm"
          role="listbox"
        >
          {filtered.map((ing, idx) => (
            <li
              key={ing.id}
              role="option"
              aria-selected={idx === highlightIdx}
              className={`px-3 py-2 cursor-pointer transition-colors ${
                idx === highlightIdx
                  ? "bg-[#e8f4f5] text-[#155e63] font-medium"
                  : "text-[#1a1a1a] hover:bg-[#faf9f7]"
              }`}
              onMouseEnter={() => setHighlightIdx(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(ing.id);
              }}
            >
              {ing.name}
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && query.trim() !== "" && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-[#e0e0e0] bg-white shadow-md px-3 py-2 text-xs text-[#afafaf]">
          No ingredients match &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}

// ─── Ingredients tab ─────────────────────────────────────────────────────────

type IngredientSortKey = "name" | "unit" | "cpu";
type IngredientSortDir = "asc" | "desc";

// TIM-1212: flat inline row — name, size, unit, cost edited in place (no accordion).
// Cost/unit is computed and read-only; notes live behind a compact per-row toggle.
function IngredientTableRow({
  ingredient,
  canEdit,
  onUpdate,
  onDelete,
}: {
  ingredient: MenuIngredient;
  canEdit: boolean;
  onUpdate: (patch: Partial<MenuIngredient>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(ingredient.name);
  const [packageSize, setPackageSize] = useState(
    ingredient.package_size.toString()
  );
  const [packageCost, setPackageCost] = useState(
    ingredient.package_cost_cents > 0
      ? (ingredient.package_cost_cents / 100).toFixed(2)
      : ""
  );
  const [notes, setNotes] = useState(ingredient.notes ?? "");
  const [notesOpen, setNotesOpen] = useState(false);

  const cpu = costPerUnit(ingredient);
  const cpuDisplay =
    ingredient.package_size > 0 && ingredient.package_cost_cents > 0
      ? "$" + cpu.toFixed(4)
      : "—";
  const hasNotes = (ingredient.notes ?? "").trim().length > 0;

  function handleNameBlur() {
    if (name !== ingredient.name) onUpdate({ name });
  }
  function handlePackageSizeBlur() {
    const n = parseFloat(packageSize);
    if (!isNaN(n) && n !== ingredient.package_size) onUpdate({ package_size: n });
  }
  function handlePackageUnitChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onUpdate({ package_unit: e.target.value as IngredientUnit });
  }
  function handlePackageCostBlur() {
    const dollars = parseFloat(packageCost);
    const cents = isNaN(dollars) ? 0 : Math.round(dollars * 100);
    if (cents !== ingredient.package_cost_cents) onUpdate({ package_cost_cents: cents });
  }
  function handleNotesBlur() {
    const val = notes.trim() === "" ? null : notes;
    if (val !== ingredient.notes) onUpdate({ notes: val });
  }

  return (
    <div className="hover:bg-[#faf9f7] transition-colors">
      <div className={ingGridCls + " px-5 py-1.5"}>
        <input
          className={cellInputCls + " font-medium"}
          value={name}
          disabled={!canEdit}
          placeholder="Unnamed ingredient"
          aria-label="Ingredient name"
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
        />
        <input
          type="number"
          className={cellInputCls + " tabular-nums"}
          value={packageSize}
          disabled={!canEdit}
          min={0}
          step="any"
          aria-label="Package size"
          onChange={(e) => setPackageSize(e.target.value)}
          onBlur={handlePackageSizeBlur}
        />
        <select
          className={cellInputCls}
          value={ingredient.package_unit}
          disabled={!canEdit}
          aria-label="Unit"
          onChange={handlePackageUnitChange}
        >
          {UNIT_OPTIONS.map((u) => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </select>
        <input
          type="number"
          className={cellInputCls + " tabular-nums"}
          value={packageCost}
          disabled={!canEdit}
          min={0}
          step="0.01"
          placeholder="0.00"
          aria-label="Package cost in dollars"
          onChange={(e) => setPackageCost(e.target.value)}
          onBlur={handlePackageCostBlur}
        />
        <span
          className="px-2 text-sm font-semibold text-[#155e63] tabular-nums truncate"
          title="Cost per unit"
        >
          {cpuDisplay}
        </span>
        <div className="flex items-center justify-end gap-0.5">
          {(canEdit || hasNotes) && (
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              title={hasNotes ? "Notes: " + ingredient.notes : "Add notes"}
              aria-label="Toggle notes"
              className={`p-1 rounded-md transition-colors ${
                hasNotes
                  ? "text-[#155e63] hover:bg-[#e8f4f5]"
                  : "text-[#cccccc] hover:text-[#6b6b6b] hover:bg-[#f2f2f2]"
              }`}
            >
              <StickyNote size={13} />
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={onDelete}
              title="Delete ingredient"
              aria-label="Delete ingredient"
              className="p-1 rounded-md text-[#cccccc] hover:text-[#c44] hover:bg-[#fbeaea] transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      {notesOpen && (
        <div className="px-5 pb-2.5 pt-0.5">
          <input
            className={inputCls + " text-xs"}
            value={notes}
            disabled={!canEdit}
            placeholder="Vendor info, storage notes…"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
          />
        </div>
      )}
    </div>
  );
}

// TIM-1212: persistent quick-add row — type name → size → unit → cost, press
// Enter to commit; focus returns to the name field for rapid multi-entry.
function QuickAddRow({
  onAdd,
}: {
  onAdd: (init: {
    name: string;
    package_size: number;
    package_unit: IngredientUnit;
    package_cost_cents: number;
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [unit, setUnit] = useState<IngredientUnit>("g");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const sizeNum = parseFloat(size);
  const costNum = parseFloat(cost);
  const cpuPreview =
    !isNaN(sizeNum) && sizeNum > 0 && !isNaN(costNum) && costNum > 0
      ? "$" + (costNum / sizeNum).toFixed(4)
      : "—";
  const canCommit = name.trim().length > 0 && !busy;

  async function commit() {
    if (name.trim().length === 0 || submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    const ok = await onAdd({
      name: name.trim(),
      package_size: !isNaN(sizeNum) && sizeNum > 0 ? sizeNum : 1,
      package_unit: unit,
      package_cost_cents:
        !isNaN(costNum) && costNum > 0 ? Math.round(costNum * 100) : 0,
    });
    submittingRef.current = false;
    setBusy(false);
    if (ok) {
      setName("");
      setSize("");
      setCost("");
      // keep the unit selection for rapid same-unit entry
      nameRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  }

  return (
    <div
      className={ingGridCls + " px-5 py-2.5 bg-[#f3f8f8] border-t border-[#e0eeee]"}
      onKeyDown={handleKeyDown}
    >
      <input
        ref={nameRef}
        className={quickInputCls}
        value={name}
        placeholder="Add an ingredient…"
        autoComplete="off"
        aria-label="New ingredient name"
        onChange={(e) => setName(e.target.value)}
      />
      <input
        type="number"
        className={quickInputCls + " tabular-nums"}
        value={size}
        placeholder="Qty"
        min={0}
        step="any"
        aria-label="New ingredient package size"
        onChange={(e) => setSize(e.target.value)}
      />
      <select
        className={quickInputCls}
        value={unit}
        aria-label="New ingredient unit"
        onChange={(e) => setUnit(e.target.value as IngredientUnit)}
      >
        {UNIT_OPTIONS.map((u) => (
          <option key={u.value} value={u.value}>{u.label}</option>
        ))}
      </select>
      <input
        type="number"
        className={quickInputCls + " tabular-nums"}
        value={cost}
        placeholder="0.00"
        min={0}
        step="0.01"
        aria-label="New ingredient package cost in dollars"
        onChange={(e) => setCost(e.target.value)}
      />
      <span className="px-2 text-sm font-medium text-[#6b6b6b] tabular-nums truncate">
        {cpuPreview}
      </span>
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={commit}
          disabled={!canCommit}
          title="Add ingredient (Enter)"
          aria-label="Add ingredient"
          className="flex items-center justify-center w-8 h-8 rounded-md bg-[#155e63] text-white hover:bg-[#0e4448] disabled:bg-[#c8d6d6] disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

function IngredientSortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onToggle,
}: {
  label: string;
  k: IngredientSortKey;
  sortKey: IngredientSortKey;
  sortDir: IngredientSortDir;
  onToggle: (k: IngredientSortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <button
      type="button"
      onClick={() => onToggle(k)}
      className={`flex items-center gap-1 px-2 text-left uppercase tracking-wider transition-colors ${
        active ? "text-[#155e63]" : "text-[#6b6b6b] hover:text-[#1a1a1a]"
      }`}
    >
      {label}
      {active &&
        (sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
    </button>
  );
}

function IngredientsTab({
  canEdit,
  ingredients,
  onAddIngredient,
  onUpdateIngredient,
  onDeleteIngredient,
}: {
  canEdit: boolean;
  ingredients: MenuIngredient[];
  onAddIngredient: (init: {
    name: string;
    package_size: number;
    package_unit: IngredientUnit;
    package_cost_cents: number;
  }) => Promise<boolean>;
  onUpdateIngredient: (id: string, patch: Partial<MenuIngredient>) => Promise<void>;
  onDeleteIngredient: (id: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<IngredientSortKey>("name");
  const [sortDir, setSortDir] = useState<IngredientSortDir>("asc");

  function toggleSort(key: IngredientSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? ingredients.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            (i.notes ?? "").toLowerCase().includes(q)
        )
      : ingredients;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let primary: number;
      if (sortKey === "unit") {
        primary = a.package_unit.localeCompare(b.package_unit);
      } else if (sortKey === "cpu") {
        const d = costPerUnit(a) - costPerUnit(b);
        primary = d < 0 ? -1 : d > 0 ? 1 : 0;
      } else {
        primary = a.name.localeCompare(b.name);
      }
      if (primary === 0) primary = a.name.localeCompare(b.name);
      return primary * dir;
    });
  }, [ingredients, search, sortKey, sortDir]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#efefef]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#1a1a1a]">Ingredients</p>
              <p className="text-xs text-[#6b6b6b] mt-0.5">
                Track every ingredient, its package size, and cost so recipe lines can compute COGS automatically.
              </p>
            </div>
            <span className="text-xs text-[#afafaf] shrink-0 mt-0.5 whitespace-nowrap">
              {ingredients.length} {ingredients.length === 1 ? "ingredient" : "ingredients"}
            </span>
          </div>
          <div className="relative mt-3 max-w-xs">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#afafaf] pointer-events-none"
            />
            <input
              type="text"
              className={inputCls + " pl-8"}
              value={search}
              placeholder="Search ingredients…"
              autoComplete="off"
              aria-label="Search ingredients"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {ingredients.length === 0 && !canEdit ? (
          <div className="py-10 text-center">
            <Package size={28} className="text-[#d0d0d0] mx-auto mb-2" />
            <p className="text-sm text-[#afafaf]">No ingredients yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div
                className={
                  ingGridCls +
                  " px-5 py-2.5 bg-[#faf9f7] border-b border-[#efefef] text-[10px] font-semibold"
                }
              >
                <IngredientSortHeader label="Ingredient" k="name" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <span className="px-2 uppercase tracking-wider text-[#6b6b6b]">Size</span>
                <IngredientSortHeader label="Unit" k="unit" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <span className="px-2 uppercase tracking-wider text-[#6b6b6b]">Pkg Cost</span>
                <IngredientSortHeader label="Cost / Unit" k="cpu" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <span className="sr-only">Actions</span>
              </div>

              {visible.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-[#afafaf]">
                  {ingredients.length === 0
                    ? "No ingredients yet — add your first below."
                    : `No ingredients match “${search.trim()}”.`}
                </div>
              ) : (
                <div className="divide-y divide-[#f5f5f5]">
                  {visible.map((ing) => (
                    <IngredientTableRow
                      key={ing.id}
                      ingredient={ing}
                      canEdit={canEdit}
                      onUpdate={(patch) => onUpdateIngredient(ing.id, patch)}
                      onDelete={() => onDeleteIngredient(ing.id)}
                    />
                  ))}
                </div>
              )}

              {canEdit && <QuickAddRow onAdd={onAddIngredient} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Item editor panel ───────────────────────────────────────────────────────

function ItemEditorPanel({
  item,
  category,
  categories,
  ingredients,
  itemIngredients,
  canEdit,
  onClose,
  onUpdateItem,
  onAddRecipeLine,
  onUpdateRecipeLine,
  onDeleteRecipeLine,
  onSuggestRecipe,
  recipeLoading,
  recipeError,
  onSuggestPrice,
  priceLoading,
  priceSuggestion,
}: {
  item: MenuItemWithCogs;
  category: MenuCategory | undefined;
  categories: MenuCategory[];
  ingredients: MenuIngredient[];
  itemIngredients: MenuItemIngredient[];
  canEdit: boolean;
  onClose: () => void;
  onUpdateItem: (patch: Partial<MenuItemWithCogs>) => Promise<void>;
  onAddRecipeLine: (
    ingredientId: string,
    amount: number,
    unit: IngredientUnit
  ) => Promise<void>;
  onUpdateRecipeLine: (
    id: string,
    patch: { amount?: number; unit?: IngredientUnit }
  ) => Promise<void>;
  onDeleteRecipeLine: (id: string) => Promise<void>;
  onSuggestRecipe: () => Promise<void>;
  recipeLoading: boolean;
  recipeError: string | null;
  onSuggestPrice: () => Promise<void>;
  priceLoading: boolean;
  priceSuggestion: PriceSuggestion | null;
}) {
  const [name, setName] = useState(item.name);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [priceDisplay, setPriceDisplay] = useState(
    item.price_cents > 0 ? (item.price_cents / 100).toFixed(2) : ""
  );

  const recipeLines = itemIngredients.filter(
    (ii) => ii.menu_item_id === item.id
  );

  const computedCogs = useMemo(() => {
    let total = 0;
    for (const line of recipeLines) {
      const ing = ingredients.find((i) => i.id === line.ingredient_id);
      if (ing) total += line.amount * costPerUnit(ing);
    }
    return total;
  }, [recipeLines, ingredients]);

  const cogsDisplay =
    recipeLines.length > 0
      ? "$" + computedCogs.toFixed(2)
      : item.cogs_cents && item.cogs_cents > 0
      ? formatCents(item.cogs_cents)
      : "—";

  const effectiveCogs =
    recipeLines.length > 0 ? computedCogs * 100 : (item.cogs_cents ?? 0);
  const marginPct =
    item.price_cents > 0 && effectiveCogs > 0
      ? (((item.price_cents - effectiveCogs) / item.price_cents) * 100).toFixed(
          1
        )
      : null;

  function handleNameBlur() {
    if (name !== item.name) onUpdateItem({ name });
  }

  function handleCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onUpdateItem({ category_id: e.target.value });
  }

  function handleNotesBlur() {
    const val = notes.trim() === "" ? null : notes;
    if (val !== item.notes) onUpdateItem({ notes: val });
  }

  function handlePriceBlur() {
    const dollars = parseFloat(priceDisplay);
    const cents = isNaN(dollars) ? 0 : Math.round(dollars * 100);
    if (cents !== item.price_cents) onUpdateItem({ price_cents: cents });
  }

  function handleIngredientSelect(ingredientId: string) {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) return;
    onAddRecipeLine(ingredientId, 1, ing.package_unit);
  }

  const usedIngredientIds = new Set(recipeLines.map((l) => l.ingredient_id));
  const availableIngredients = useMemo(
    () => ingredients.filter((i) => !usedIngredientIds.has(i.id)),
    [ingredients, usedIngredientIds]
  );

  return (
    <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#efefef] flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <input
            className={
              "w-full text-base font-semibold border-0 border-b border-transparent focus:border-[#155e63] focus:outline-none text-[#1a1a1a] bg-transparent py-0.5 transition-colors disabled:text-[#afafaf]"
            }
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            placeholder="Item name"
          />
          {/* TIM-1140: Category badge — "Category:" label + folder icon makes
              it unambiguous, then an inline <select> for fast reassignment. */}
          <div className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] text-[#6b6b6b] bg-[#f4f9f8] border border-[#cfe0e1] rounded-full pl-2 pr-1 py-0.5">
            <Tag size={10} className="text-[#155e63]" />
            <span className="font-semibold uppercase tracking-wider">Category</span>
            <select
              className="text-xs text-[#155e63] font-medium bg-transparent border-0 focus:outline-none cursor-pointer pr-1"
              value={item.category_id}
              disabled={!canEdit}
              onChange={handleCategoryChange}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              {category === undefined && (
                <option value={item.category_id}>Unknown</option>
              )}
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[#afafaf] hover:text-[#1a1a1a] transition-colors mt-0.5 shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        <div>
          <p className={sectionLabelCls}>Pricing</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Retail Price ($)</label>
              <input
                type="number"
                className={inputCls}
                value={priceDisplay}
                disabled={!canEdit}
                onChange={(e) => setPriceDisplay(e.target.value)}
                onBlur={handlePriceBlur}
                min={0}
                step="0.01"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className={labelCls}>Cost of Goods</label>
              <p className="text-sm font-semibold text-[#1a1a1a] py-2">
                {cogsDisplay}
              </p>
              {marginPct !== null && (
                <p className="text-xs text-[#6b6b6b]">
                  Gross margin:{" "}
                  <span className="font-semibold text-[#155e63]">
                    {marginPct}%
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* TIM-1322: owner's popularity estimate (no POS history pre-launch).
              Pairs with margin to place the item on the menu-engineering matrix
              in the Insights tab. */}
          <div className="mt-4">
            <label className={labelCls}>Expected Popularity</label>
            <PopularitySelector
              value={item.expected_popularity}
              disabled={!canEdit}
              onChange={(v) => onUpdateItem({ expected_popularity: v })}
            />
            <p className="text-[11px] text-[#9a9a9a] mt-1.5 leading-relaxed">
              Your best guess at how often this will sell. We pair it with your
              margin in the Insights tab to suggest what to feature or rework.
            </p>
          </div>
        </div>

        <div>
          <p className={sectionLabelCls}>Recipe</p>

          {canEdit && (
            <div className="mb-3">
              <button
                type="button"
                onClick={onSuggestRecipe}
                disabled={recipeLoading || name.trim().length === 0}
                title={
                  name.trim().length === 0
                    ? "Name the item first"
                    : "Suggest a starting recipe with AI"
                }
                className="flex items-center gap-2 text-xs font-semibold text-[#155e63] bg-[#f0f8f8] border border-[#cfe0e1] px-3 py-2 rounded-lg hover:bg-[#e4f1f1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {recipeLoading ? (
                  <svg
                    className="animate-spin w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeDasharray="31.4"
                      strokeDashoffset="10"
                    />
                  </svg>
                ) : (
                  <Sparkles size={13} />
                )}
                {recipeLoading ? "Building recipe…" : "Suggest recipe with AI"}
              </button>
              {name.trim().length === 0 && (
                <p className="text-[11px] text-[#afafaf] mt-1.5">
                  Add an item name above to get a recipe suggestion.
                </p>
              )}
              {recipeError && (
                <p className="text-[11px] text-[#c44] mt-1.5">{recipeError}</p>
              )}
              <p className="text-[11px] text-[#9a9a9a] mt-1.5 leading-relaxed">
                AI fills in a standard build as a starting point. Edit or remove any line.
              </p>
            </div>
          )}

          {recipeLines.length > 0 ? (
            <div className="space-y-2 mb-3">
              {recipeLines.map((line) => {
                const ing = ingredients.find((i) => i.id === line.ingredient_id);
                const lineCost =
                  ing ? line.amount * costPerUnit(ing) : null;
                return (
                  <RecipeLineRow
                    key={line.id}
                    line={line}
                    ingredient={ing ?? null}
                    lineCost={lineCost}
                    canEdit={canEdit}
                    onUpdate={(patch) => onUpdateRecipeLine(line.id, patch)}
                    onDelete={() => onDeleteRecipeLine(line.id)}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[#afafaf] mb-3">
              No recipe lines yet. Add an ingredient below to build the recipe and compute COGS automatically.
            </p>
          )}

          {canEdit && availableIngredients.length > 0 && (
            <IngredientCombobox
              ingredients={availableIngredients}
              onSelect={handleIngredientSelect}
            />
          )}

          {canEdit && availableIngredients.length === 0 && ingredients.length === 0 && (
            <p className="text-xs text-[#afafaf]">
              Add ingredients in the Ingredients tab first.
            </p>
          )}
        </div>

        <div>
          <p className={sectionLabelCls}>Notes</p>
          <textarea
            className={inputCls + " resize-none"}
            rows={3}
            value={notes}
            disabled={!canEdit}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            placeholder="Prep notes, variations, seasonal availability…"
          />
        </div>

        {canEdit && (
          <div>
            <p className={sectionLabelCls}>AI Price Suggestion</p>
            <button
              type="button"
              onClick={onSuggestPrice}
              disabled={priceLoading}
              className="flex items-center gap-2 text-xs font-semibold text-white bg-[#155e63] px-3 py-2 rounded-lg hover:bg-[#0e4448] disabled:opacity-60 transition-colors"
            >
              {priceLoading ? (
                <svg
                  className="animate-spin w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray="31.4"
                    strokeDashoffset="10"
                  />
                </svg>
              ) : (
                <Sparkles size={13} />
              )}
              {priceLoading ? "Thinking…" : "Suggest retail price"}
            </button>

            {priceSuggestion && (
              <div className="mt-3 rounded-lg border border-[#d4e8e9] bg-[#f0f8f8] p-4 space-y-2">
                <div className="flex items-baseline gap-2">
                  <div>
                    <p className="text-xs text-[#6b6b6b]">Recommended</p>
                    <p className="text-2xl font-bold text-[#155e63]">
                      ${(priceSuggestion.suggested_price_cents / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-[#6b6b6b]">
                  Market range:{" "}
                  <span className="font-medium text-[#1a1a1a]">
                    ${(priceSuggestion.low_cents / 100).toFixed(2)} – ${(priceSuggestion.high_cents / 100).toFixed(2)}
                  </span>
                </p>
                <p className="text-xs text-[#6b6b6b]">
                  Margin at recommended price:{" "}
                  <span className="font-semibold text-[#155e63]">
                    {(priceSuggestion.margin_pct * 100).toFixed(1)}%
                  </span>
                </p>
                <p className="text-xs text-[#555] italic leading-relaxed">
                  {priceSuggestion.commentary}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPriceDisplay(
                      (priceSuggestion.suggested_price_cents / 100).toFixed(2)
                    );
                    onUpdateItem({
                      price_cents: priceSuggestion.suggested_price_cents,
                    });
                  }}
                  className="text-xs font-semibold text-[#155e63] hover:text-[#0e4448] transition-colors"
                >
                  Use this price
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RecipeLineRow({
  line,
  ingredient,
  lineCost,
  canEdit,
  onUpdate,
  onDelete,
}: {
  line: MenuItemIngredient;
  ingredient: MenuIngredient | null;
  lineCost: number | null;
  canEdit: boolean;
  onUpdate: (patch: { amount?: number; unit?: IngredientUnit }) => void;
  onDelete: () => void;
}) {
  const [amount, setAmount] = useState(line.amount.toString());

  function handleAmountBlur() {
    const n = parseFloat(amount);
    if (!isNaN(n) && n !== line.amount) onUpdate({ amount: n });
  }

  function handleUnitChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onUpdate({ unit: e.target.value as IngredientUnit });
  }

  return (
    <div className="flex items-center gap-2 bg-[#faf9f7] border border-[#efefef] rounded-lg px-3 py-2">
      <span className="flex-1 text-xs font-medium text-[#1a1a1a] truncate">
        {ingredient?.name ?? "Unknown"}
      </span>
      <input
        type="number"
        className="w-16 text-xs border border-[#e0e0e0] rounded px-2 py-1 text-[#1a1a1a] focus:outline-none focus:border-[#155e63] disabled:bg-transparent transition-colors"
        value={amount}
        disabled={!canEdit}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={handleAmountBlur}
        min={0}
        step="any"
      />
      <select
        className="text-xs border border-[#e0e0e0] rounded px-2 py-1 text-[#6b6b6b] focus:outline-none focus:border-[#155e63] disabled:bg-transparent transition-colors"
        value={line.unit}
        disabled={!canEdit}
        onChange={handleUnitChange}
      >
        {UNIT_OPTIONS.map((u) => (
          <option key={u.value} value={u.value}>{u.label}</option>
        ))}
      </select>
      {lineCost !== null && (
        <span className="text-xs text-[#6b6b6b] shrink-0 min-w-[3rem] text-right">
          ${lineCost.toFixed(4)}
        </span>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={onDelete}
          className="text-[#d0d0d0] hover:text-[#c44] transition-colors shrink-0"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Sortable menu item row (drag/drop within & across categories) ───────────

function SortableMenuItemRow({
  item,
  category,
  isSelected,
  canEdit,
  onSelect,
  onUpdate,
  onDelete,
  isOverlay,
}: {
  item: MenuItemWithCogs;
  category: MenuCategory | undefined;
  isSelected: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<MenuItemWithCogs>) => void;
  onDelete: () => void;
  isOverlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canEdit || isOverlay });

  const style = isOverlay
    ? {}
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      };

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(item.name);

  function handleNameBlur() {
    setEditingName(false);
    if (name !== item.name) onUpdate({ name });
  }

  const cogs =
    item.computed_cogs_cents > 0
      ? item.computed_cogs_cents
      : (item.cogs_cents ?? 0);

  const gpCents = item.price_cents > 0 && cogs > 0 ? item.price_cents - cogs : null;
  const gpPct =
    item.price_cents > 0 && cogs > 0
      ? Math.round(((item.price_cents - cogs) / item.price_cents) * 100)
      : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-5 py-3 transition-colors cursor-pointer hover:bg-[#faf9f7] ${
        isSelected
          ? "border-l-2 border-[#155e63] bg-[#f0f8f8]"
          : "border-l-2 border-transparent"
      }`}
      onClick={onSelect}
    >
      {canEdit && (
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none p-0.5 text-[#c0c0c0] hover:text-[#888] transition-colors shrink-0"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag to reorder"
        >
          <GripVertical size={14} />
        </button>
      )}

      <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
        {editingName ? (
          <input
            autoFocus
            className="text-sm font-medium text-[#1a1a1a] border-0 border-b border-[#155e63] focus:outline-none bg-transparent w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNameBlur();
              if (e.key === "Escape") {
                setName(item.name);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <div onClick={onSelect}>
            <span className="text-sm font-medium text-[#1a1a1a] truncate block">
              {item.name || (
                <span className="text-[#afafaf] font-normal">Unnamed item</span>
              )}
            </span>
            {/* TIM-1140: explicit "Category:" tag on the row so it isn't
                mistakable for a subtitle. */}
            <span className="text-[10px] text-[#afafaf] uppercase tracking-wider mt-0.5 inline-flex items-center gap-1">
              <Tag size={9} />
              <span>Category:</span>
              <span className="text-[#6b6b6b] font-medium normal-case tracking-normal">
                {category?.name ?? "—"}
              </span>
            </span>
          </div>
        )}
      </div>

      <div className="text-right shrink-0">
        {item.price_cents > 0 ? (
          <p className="text-sm font-semibold text-[#155e63]">
            {formatCents(item.price_cents)}
          </p>
        ) : (
          <p className="text-sm text-[#d0d0d0]">—</p>
        )}
        {(cogs > 0 || gpCents !== null) && (
          <p className="text-[10px] text-[#6b6b6b] mt-0.5 whitespace-nowrap">
            {cogs > 0 && <span>COGS {formatCents(cogs)}</span>}
            {gpCents !== null && cogs > 0 && <span className="mx-1">·</span>}
            {gpCents !== null && (
              <span>
                GP {formatCents(gpCents)}
                {gpPct !== null && (
                  <span className="text-[#afafaf]"> ({gpPct}%)</span>
                )}
              </span>
            )}
          </p>
        )}
      </div>

      {canEdit && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditingName(true);
            }}
            className="text-[#d0d0d0] hover:text-[#155e63] transition-colors"
          >
            <Edit2 size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-[#d0d0d0] hover:text-[#c44] transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Category-default ingredients editor ─────────────────────────────────────

function CategoryDefaultsEditor({
  category,
  defaults,
  ingredients,
  canEdit,
  onAdd,
  onUpdate,
  onDelete,
  onApplyToExisting,
}: {
  category: MenuCategory;
  defaults: CategoryDefaultIngredient[];
  ingredients: MenuIngredient[];
  canEdit: boolean;
  onAdd: (ingredientId: string, amount: number, unit: IngredientUnit) => Promise<void>;
  onUpdate: (id: string, patch: { amount?: number; unit?: IngredientUnit }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onApplyToExisting: () => Promise<void>;
}) {
  const used = new Set(defaults.map((d) => d.ingredient_id));
  const available = ingredients.filter((i) => !used.has(i.id));
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);

  async function handleApply() {
    setApplying(true);
    setApplied(null);
    try {
      await onApplyToExisting();
    } finally {
      setApplying(false);
    }
    setApplied(0);
  }

  return (
    <div className="px-5 py-4 bg-[#fafaf7] border-t border-[#f0f0f0] space-y-3">
      <div>
        <p className="text-[11px] text-[#6b6b6b] leading-relaxed">
          Default ingredients are auto-added to every <strong>new</strong> item in <strong>{category.name}</strong> — handy for amortizing
          cups, lids, sleeves, and napkins across beverages (try 0.7 cups to represent 70% to-go).
          Editing or removing a default on an existing item won&apos;t change the category default.
        </p>
      </div>

      {defaults.length > 0 ? (
        <div className="space-y-2">
          {defaults.map((d) => {
            const ing = ingredients.find((i) => i.id === d.ingredient_id);
            return (
              <DefaultLineRow
                key={d.id}
                def={d}
                ingredient={ing ?? null}
                canEdit={canEdit}
                onUpdate={(patch) => onUpdate(d.id, patch)}
                onDelete={() => onDelete(d.id)}
              />
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-[#afafaf]">No default ingredients yet.</p>
      )}

      {canEdit && available.length > 0 && (
        <DefaultAddRow
          available={available}
          onAdd={onAdd}
        />
      )}

      {canEdit && defaults.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleApply}
            disabled={applying}
            className="text-[11px] font-medium text-[#155e63] hover:text-[#0e4448] disabled:opacity-50 transition-colors"
          >
            {applying ? "Applying…" : "Apply to existing items in this category"}
          </button>
          {applied !== null && (
            <span className="text-[11px] text-[#6b6b6b]">Done</span>
          )}
        </div>
      )}
    </div>
  );
}

function DefaultLineRow({
  def,
  ingredient,
  canEdit,
  onUpdate,
  onDelete,
}: {
  def: CategoryDefaultIngredient;
  ingredient: MenuIngredient | null;
  canEdit: boolean;
  onUpdate: (patch: { amount?: number; unit?: IngredientUnit }) => void;
  onDelete: () => void;
}) {
  const [amount, setAmount] = useState(def.amount.toString());

  function handleAmountBlur() {
    const n = parseFloat(amount);
    if (!isNaN(n) && n > 0 && n !== def.amount) onUpdate({ amount: n });
  }

  return (
    <div className="flex items-center gap-2 bg-white border border-[#efefef] rounded-lg px-3 py-2">
      <span className="flex-1 text-xs font-medium text-[#1a1a1a] truncate">
        {ingredient?.name ?? "Unknown ingredient"}
      </span>
      <input
        type="number"
        className="w-16 text-xs border border-[#e0e0e0] rounded px-2 py-1 text-[#1a1a1a] focus:outline-none focus:border-[#155e63] disabled:bg-transparent transition-colors"
        value={amount}
        disabled={!canEdit}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={handleAmountBlur}
        min={0}
        step="any"
      />
      <select
        className="text-xs border border-[#e0e0e0] rounded px-2 py-1 text-[#6b6b6b] focus:outline-none focus:border-[#155e63] disabled:bg-transparent transition-colors"
        value={def.unit}
        disabled={!canEdit}
        onChange={(e) => onUpdate({ unit: e.target.value as IngredientUnit })}
      >
        {UNIT_OPTIONS.map((u) => (
          <option key={u.value} value={u.value}>{u.label}</option>
        ))}
      </select>
      {canEdit && (
        <button
          type="button"
          onClick={onDelete}
          className="text-[#d0d0d0] hover:text-[#c44] transition-colors shrink-0"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

function DefaultAddRow({
  available,
  onAdd,
}: {
  available: MenuIngredient[];
  onAdd: (ingredientId: string, amount: number, unit: IngredientUnit) => Promise<void>;
}) {
  return (
    <IngredientCombobox
      ingredients={available}
      onSelect={(id) => {
        const ing = available.find((i) => i.id === id);
        if (!ing) return;
        onAdd(id, 1, ing.package_unit);
      }}
    />
  );
}

// ─── Workspace aggregate metrics + per-category header ───────────────────────

function MetricsBar({ items }: { items: MenuItemWithCogs[] }) {
  const agg = aggregateMargins(items);
  if (agg.count === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#d4e8e9] bg-[#f9fcfc] px-5 py-3 text-xs text-[#6b6b6b]">
        Add an item with a price and recipe ingredients (or a manual COGS) to see workspace-level margin metrics.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[#cfe0e1] bg-[#f4f9f8] px-5 py-3 flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
      <div>
        <span className="text-[10px] uppercase tracking-wider text-[#155e63] font-semibold">Avg COGS</span>{" "}
        <span className="text-base font-bold text-[#1a1a1a] ml-1">{agg.avgCogsPct?.toFixed(1)}%</span>
      </div>
      <div>
        <span className="text-[10px] uppercase tracking-wider text-[#155e63] font-semibold">Avg Gross Profit</span>{" "}
        <span className="text-base font-bold text-[#155e63] ml-1">{agg.avgGpPct?.toFixed(1)}%</span>
      </div>
      <div className="text-[11px] text-[#6b6b6b]">
        Unweighted simple mean across {agg.count} priced item{agg.count !== 1 ? "s" : ""} with COGS.
      </div>
    </div>
  );
}

function CategoryMetrics({ items }: { items: MenuItemWithCogs[] }) {
  const agg = aggregateMargins(items);
  if (agg.count === 0) return null;
  return (
    <span className="text-[10px] text-[#6b6b6b]">
      Avg COGS <span className="font-semibold text-[#1a1a1a]">{agg.avgCogsPct?.toFixed(0)}%</span>
      <span className="mx-1.5 text-[#d0d0d0]">·</span>
      GP <span className="font-semibold text-[#155e63]">{agg.avgGpPct?.toFixed(0)}%</span>
    </span>
  );
}

// ─── Menu tab ────────────────────────────────────────────────────────────────

interface MenuTabProps {
  canEdit: boolean;
  items: MenuItemWithCogs[];
  categories: MenuCategory[];
  ingredients: MenuIngredient[];
  itemIngredients: MenuItemIngredient[];
  categoryDefaults: CategoryDefaultIngredient[];
  selectedItemId: string | null;
  expandedDefaultsCatId: string | null;
  onToggleDefaults: (catId: string) => void;
  onSelectItem: (id: string | null) => void;
  onAddItem: (categoryId: string) => Promise<void>;
  onUpdateItem: (id: string, patch: Partial<MenuItemWithCogs>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onAddRecipeLine: (
    menuItemId: string,
    ingredientId: string,
    amount: number,
    unit: IngredientUnit
  ) => Promise<void>;
  onUpdateRecipeLine: (
    id: string,
    patch: { amount?: number; unit?: IngredientUnit }
  ) => Promise<void>;
  onDeleteRecipeLine: (id: string) => Promise<void>;
  onSuggestRecipe: (item: MenuItemWithCogs) => Promise<void>;
  recipeLoading: boolean;
  recipeError: string | null;
  onSuggestPrice: (item: MenuItemWithCogs) => Promise<void>;
  priceLoading: boolean;
  priceSuggestion: PriceSuggestion | null;
  onReorderItems: (updates: Array<{ id: string; position: number; category_id: string }>) => Promise<void>;
  onAddCategory: () => Promise<void>;
  onRenameCategory: (id: string, name: string) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onReorderCategories: (updates: Array<{ id: string; position: number }>) => Promise<void>;
  onAddDefault: (categoryId: string, ingredientId: string, amount: number, unit: IngredientUnit) => Promise<void>;
  onUpdateDefault: (id: string, patch: { amount?: number; unit?: IngredientUnit }) => Promise<void>;
  onDeleteDefault: (id: string) => Promise<void>;
  onApplyDefaults: (categoryId: string) => Promise<void>;
}

function MenuTab(props: MenuTabProps) {
  const {
    canEdit, items, categories, ingredients, itemIngredients, categoryDefaults,
    selectedItemId, expandedDefaultsCatId, onToggleDefaults,
    onSelectItem, onAddItem, onUpdateItem, onDeleteItem,
    onAddRecipeLine, onUpdateRecipeLine, onDeleteRecipeLine,
    onSuggestRecipe, recipeLoading, recipeError,
    onSuggestPrice, priceLoading, priceSuggestion, onReorderItems,
    onAddCategory, onRenameCategory, onDeleteCategory,
    onAddDefault, onUpdateDefault, onDeleteDefault, onApplyDefaults,
  } = props;

  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Map item id → its category id (live, so cross-section moves resolve fast).
  const itemToCategory = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items) m.set(i.id, i.category_id);
    return m;
  }, [items]);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // The `over.id` is either another item id (drop on an item) or a category
    // sentinel "__cat__:<id>" (drop on an empty category list).
    let targetCategoryId: string;
    if (overId.startsWith("__cat__:")) {
      targetCategoryId = overId.slice("__cat__:".length);
    } else {
      const overCat = itemToCategory.get(overId);
      if (!overCat) return;
      targetCategoryId = overCat;
    }

    const activeCat = itemToCategory.get(activeId);
    if (!activeCat) return;

    // Compute the new ordered list for the target category.
    const targetItems = items
      .filter((i) => !i.archived && i.category_id === targetCategoryId && i.id !== activeId)
      .sort((a, b) => a.position - b.position);

    let insertIdx = targetItems.length;
    if (!overId.startsWith("__cat__:")) {
      insertIdx = targetItems.findIndex((i) => i.id === overId);
      if (insertIdx === -1) insertIdx = targetItems.length;
    }

    const moved = items.find((i) => i.id === activeId);
    if (!moved) return;
    const next = [...targetItems];
    next.splice(insertIdx, 0, { ...moved, category_id: targetCategoryId });

    const updates = next.map((item, idx) => ({
      id: item.id,
      position: idx,
      category_id: targetCategoryId,
    }));

    onReorderItems(updates);
  }

  return (
    <div
      className={
        selectedItemId
          ? "grid grid-cols-[1fr_360px] gap-5 items-start"
          : "block"
      }
    >
      <div className="space-y-4">
        <MetricsBar items={items} />

        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {categories.map((cat) => {
            const catItems = items
              .filter((i) => i.category_id === cat.id && !i.archived)
              .sort((a, b) => a.position - b.position);
            const catDefaults = categoryDefaults
              .filter((d) => d.category_id === cat.id)
              .sort((a, b) => a.position - b.position);
            const defaultsOpen = expandedDefaultsCatId === cat.id;
            return (
              <div
                key={cat.id}
                className="rounded-xl border border-[#efefef] bg-white overflow-hidden"
              >
                <CategoryHeader
                  category={cat}
                  itemCount={catItems.length}
                  catItems={catItems}
                  defaultsCount={catDefaults.length}
                  defaultsOpen={defaultsOpen}
                  canEdit={canEdit}
                  canDelete={categories.length > 1}
                  onAddItem={() => onAddItem(cat.id)}
                  onToggleDefaults={() => onToggleDefaults(cat.id)}
                  onRename={(name) => onRenameCategory(cat.id, name)}
                  onDelete={() => onDeleteCategory(cat.id)}
                />

                {defaultsOpen && (
                  <CategoryDefaultsEditor
                    category={cat}
                    defaults={catDefaults}
                    ingredients={ingredients}
                    canEdit={canEdit}
                    onAdd={(ingId, amt, unit) => onAddDefault(cat.id, ingId, amt, unit)}
                    onUpdate={onUpdateDefault}
                    onDelete={onDeleteDefault}
                    onApplyToExisting={() => onApplyDefaults(cat.id)}
                  />
                )}

                <SortableContext
                  id={`__cat__:${cat.id}`}
                  items={catItems.length > 0 ? catItems.map((i) => i.id) : [`__cat__:${cat.id}`]}
                  strategy={verticalListSortingStrategy}
                >
                  {catItems.length === 0 ? (
                    <EmptyCategoryDropZone categoryId={cat.id} canEdit={canEdit} />
                  ) : (
                    <div className="divide-y divide-[#f5f5f5]">
                      {catItems.map((item) => (
                        <SortableMenuItemRow
                          key={item.id}
                          item={item}
                          category={cat}
                          isSelected={item.id === selectedItemId}
                          canEdit={canEdit}
                          onSelect={() =>
                            onSelectItem(item.id === selectedItemId ? null : item.id)
                          }
                          onUpdate={(patch) => onUpdateItem(item.id, patch)}
                          onDelete={() => onDeleteItem(item.id)}
                        />
                      ))}
                    </div>
                  )}
                </SortableContext>
              </div>
            );
          })}
        </DndContext>

        {canEdit && (
          <button
            type="button"
            onClick={onAddCategory}
            className="flex items-center gap-2 text-sm font-medium text-[#155e63] border border-[#cfe0e1] rounded-xl px-4 py-2.5 hover:bg-[#155e63]/5 transition-colors"
          >
            <Plus size={14} />
            Add category
          </button>
        )}
      </div>

      {selectedItem && (
        <div className="sticky top-6">
          <ItemEditorPanel
            item={selectedItem}
            category={categories.find((c) => c.id === selectedItem.category_id)}
            categories={categories}
            ingredients={ingredients}
            itemIngredients={itemIngredients}
            canEdit={canEdit}
            onClose={() => onSelectItem(null)}
            onUpdateItem={(patch) => onUpdateItem(selectedItem.id, patch)}
            onAddRecipeLine={(ingId, amount, unit) =>
              onAddRecipeLine(selectedItem.id, ingId, amount, unit)
            }
            onUpdateRecipeLine={onUpdateRecipeLine}
            onDeleteRecipeLine={onDeleteRecipeLine}
            onSuggestRecipe={() => onSuggestRecipe(selectedItem)}
            recipeLoading={recipeLoading}
            recipeError={recipeError}
            onSuggestPrice={() => onSuggestPrice(selectedItem)}
            priceLoading={priceLoading}
            priceSuggestion={priceSuggestion}
          />
        </div>
      )}
    </div>
  );
}

function EmptyCategoryDropZone({
  categoryId,
  canEdit,
}: {
  categoryId: string;
  canEdit: boolean;
}) {
  // Empty categories still need a droppable so cross-category drag works.
  const { setNodeRef, isOver } = useSortable({
    id: `__cat__:${categoryId}`,
    disabled: !canEdit,
  });
  return (
    <div
      ref={setNodeRef}
      className={`py-6 text-center transition-colors ${
        isOver ? "bg-[#f4f9f8]" : ""
      }`}
    >
      <p className="text-xs text-[#d0d0d0]">No items yet</p>
    </div>
  );
}

function CategoryHeader({
  category,
  itemCount,
  catItems,
  defaultsCount,
  defaultsOpen,
  canEdit,
  canDelete,
  onAddItem,
  onToggleDefaults,
  onRename,
  onDelete,
}: {
  category: MenuCategory;
  itemCount: number;
  catItems: MenuItemWithCogs[];
  defaultsCount: number;
  defaultsOpen: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onAddItem: () => void;
  onToggleDefaults: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  // Re-sync draft on every edit-enter (no useEffect needed) and on each new
  // server-confirmed category.name via the `key` on the input.
  const [draft, setDraft] = useState(category.name);

  function startEdit() {
    setDraft(category.name);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== category.name) onRename(trimmed);
    else setDraft(category.name);
  }

  return (
    <div className="px-5 py-3 border-b border-[#efefef] flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <FolderOpen size={14} className="text-[#155e63] shrink-0" />
        {editing ? (
          <input
            autoFocus
            className="text-sm font-semibold text-[#1a1a1a] border-0 border-b border-[#155e63] focus:outline-none bg-transparent min-w-[140px]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setDraft(category.name); setEditing(false); }
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => canEdit && startEdit()}
            className="text-sm font-semibold text-[#1a1a1a] hover:underline decoration-dotted truncate"
            title={canEdit ? "Click to rename" : undefined}
          >
            {category.name}
          </button>
        )}
        <span className="text-xs text-[#afafaf]">{itemCount}</span>
        <CategoryMetrics items={catItems} />
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {canEdit && (
          <button
            type="button"
            onClick={onToggleDefaults}
            className={`flex items-center gap-1 text-xs font-medium transition-colors ${
              defaultsOpen ? "text-[#155e63]" : "text-[#6b6b6b] hover:text-[#155e63]"
            }`}
            title="Edit default ingredients for this category"
          >
            <Settings size={11} />
            Defaults
            {defaultsCount > 0 && (
              <span className="text-[10px] bg-[#e8f4f5] text-[#155e63] rounded-full px-1.5 py-0.5 font-semibold">
                {defaultsCount}
              </span>
            )}
            {defaultsOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={onAddItem}
            className="flex items-center gap-1 text-xs font-medium text-[#155e63] hover:text-[#0e4448] transition-colors"
          >
            <Plus size={12} />
            Add
          </button>
        )}
        {canEdit && canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="text-[#c0c0c0] hover:text-[#a13d3d] transition-colors"
            aria-label="Delete category"
            title="Delete category"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Insights tab: menu-engineering matrix + margin ranking (TIM-1322) ───────

// Soft brand-aligned tints per quadrant. Star = primary teal (the goal),
// Plowhorse = warm amber (watch the margin), Puzzle = muted teal (needs a push),
// Dog = muted clay (reconsider). No hard reds.
const QUADRANT_STYLES: Record<
  Quadrant,
  { cell: string; badge: string; dot: string }
> = {
  star: { cell: "border-[#bfe0d8] bg-[#f0f8f5]", badge: "bg-[#155e63] text-white", dot: "bg-[#155e63]" },
  plowhorse: { cell: "border-[#f0dcb0] bg-[#fdf8ee]", badge: "bg-[#b9852a] text-white", dot: "bg-[#b9852a]" },
  puzzle: { cell: "border-[#cfe0e1] bg-[#f4f9f8]", badge: "bg-[#3d7c84] text-white", dot: "bg-[#3d7c84]" },
  dog: { cell: "border-[#e6d2cd] bg-[#fbf5f2]", badge: "bg-[#9a5a4d] text-white", dot: "bg-[#9a5a4d]" },
};

// Order matches the matrix layout: top row = more popular, bottom = less popular;
// left column = higher margin, right column = lower margin.
const MATRIX_ORDER: Quadrant[] = ["star", "plowhorse", "puzzle", "dog"];

function PopularityInlineSelect({
  value,
  disabled,
  onChange,
}: {
  value: ExpectedPopularity | null;
  disabled?: boolean;
  onChange: (value: ExpectedPopularity | null) => void;
}) {
  return (
    <select
      className="text-xs bg-white border border-[#e0e0e0] rounded-md px-1.5 py-1 text-[#1a1a1a] focus:outline-none focus:border-[#155e63] disabled:opacity-50"
      value={value ?? ""}
      disabled={disabled}
      aria-label="Expected popularity"
      onChange={(e) =>
        onChange(e.target.value === "" ? null : (e.target.value as ExpectedPopularity))
      }
    >
      <option value="">Not set</option>
      {POPULARITY_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function InsightsTab({
  items,
  canEdit,
  onUpdateItem,
  onGoToMenu,
}: {
  items: MenuItemWithCogs[];
  canEdit: boolean;
  onUpdateItem: (id: string, patch: Partial<MenuItemWithCogs>) => Promise<void>;
  onGoToMenu: () => void;
}) {
  const { classified, needsInfo, thresholds, counts } = useMemo(
    () => classifyMenu(items),
    [items]
  );
  const ranking = useMemo(() => marginRanking(items), [items]);
  const quadrantById = useMemo(() => {
    const m = new Map<string, Quadrant>();
    for (const c of classified) m.set(c.id, c.quadrant);
    return m;
  }, [classified]);
  const itemsByQuadrant = useMemo(() => {
    const m: Record<Quadrant, typeof classified> = { star: [], plowhorse: [], puzzle: [], dog: [] };
    for (const c of classified) m[c.quadrant].push(c);
    return m;
  }, [classified]);

  const hasAnything = items.some((i) => !i.archived);

  if (!hasAnything) {
    return (
      <div className="rounded-xl border border-dashed border-[#d4e8e9] bg-[#f9fcfc] px-6 py-10 text-center">
        <LayoutGrid className="w-6 h-6 text-[#76b39d] mx-auto mb-3" />
        <p className="text-sm font-semibold text-[#1a1a1a] mb-1">No items to analyze yet</p>
        <p className="text-xs text-[#6b6b6b] max-w-md mx-auto leading-relaxed">
          Add a few drinks or food items with a price, a cost, and an expected
          popularity. We will sort them into what to feature, re-price, promote,
          or rethink.
        </p>
        <button
          type="button"
          onClick={onGoToMenu}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#155e63] bg-[#f0f8f8] border border-[#cfe0e1] px-3 py-2 rounded-lg hover:bg-[#e4f1f1] transition-colors"
        >
          <Utensils size={13} /> Go to the menu
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Intro */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <LayoutGrid className="w-4 h-4 text-[#155e63]" />
          <h2 className="text-base font-bold text-[#1a1a1a]">What To Serve</h2>
        </div>
        <p className="text-xs text-[#6b6b6b] leading-relaxed max-w-2xl">
          Every item is sorted by two things: how profitable it is (your gross
          margin) and how popular you expect it to be. We split each one at your
          own menu average, so this is always relative to the rest of your menu.
        </p>
      </div>

      {/* Quadrant matrix */}
      {classified.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d4e8e9] bg-[#f9fcfc] px-5 py-4 text-xs text-[#6b6b6b] leading-relaxed">
          None of your items have everything they need yet. Add a price, a cost,
          and an expected popularity to an item and it will show up here.
        </div>
      ) : (
        <div>
          {/* Counts summary */}
          <div className="flex flex-wrap gap-2 mb-4">
            {MATRIX_ORDER.map((q) => (
              <span
                key={q}
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${QUADRANT_STYLES[q].cell}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${QUADRANT_STYLES[q].dot}`} />
                {QUADRANT_META[q].label}
                <span className="text-[#6b6b6b]">{counts[q]}</span>
              </span>
            ))}
          </div>

          {/* Axis-labeled 2x2 */}
          <div className="grid grid-cols-[1.25rem_1fr_1fr] gap-2 items-stretch">
            <div />
            <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-[#155e63] pb-0.5">
              Higher Margin
            </div>
            <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-[#155e63] pb-0.5">
              Lower Margin
            </div>

            {/* Row 1: more popular */}
            <div className="flex items-center justify-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#155e63] [writing-mode:vertical-rl] rotate-180">
                More Popular
              </span>
            </div>
            <QuadrantCell quadrant="star" items={itemsByQuadrant.star} />
            <QuadrantCell quadrant="plowhorse" items={itemsByQuadrant.plowhorse} />

            {/* Row 2: less popular */}
            <div className="flex items-center justify-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#155e63] [writing-mode:vertical-rl] rotate-180">
                Less Popular
              </span>
            </div>
            <QuadrantCell quadrant="puzzle" items={itemsByQuadrant.puzzle} />
            <QuadrantCell quadrant="dog" items={itemsByQuadrant.dog} />
          </div>

          {thresholds && (
            <p className="text-[11px] text-[#9a9a9a] mt-3 leading-relaxed">
              Split points: items above {thresholds.avgMarginPct.toFixed(0)}% gross
              margin count as higher margin, and items you rated at or above your
              average popularity count as more popular.
            </p>
          )}
        </div>
      )}

      {/* Margin ranking */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-4 h-4 text-[#155e63]" />
          <h2 className="text-base font-bold text-[#1a1a1a]">Margin Ranking</h2>
        </div>
        <p className="text-xs text-[#6b6b6b] leading-relaxed mb-3">
          Your items from most to least profitable. Set each item&rsquo;s expected
          popularity here to place it on the grid above.
        </p>

        {ranking.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#d4e8e9] bg-[#f9fcfc] px-5 py-4 text-xs text-[#6b6b6b]">
            Add a price and a cost (recipe ingredients or a manual COGS) to an
            item to rank it by profitability.
          </div>
        ) : (
          <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-[#6b6b6b] bg-[#faf9f7] border-b border-[#efefef]">
                    <th className="text-left font-semibold px-4 py-2 w-8">#</th>
                    <th className="text-left font-semibold px-2 py-2">Item</th>
                    <th className="text-right font-semibold px-2 py-2">Price</th>
                    <th className="text-right font-semibold px-2 py-2">COGS</th>
                    <th className="text-right font-semibold px-2 py-2">Profit</th>
                    <th className="text-left font-semibold px-3 py-2 w-[34%]">Gross Margin</th>
                    <th className="text-left font-semibold px-2 py-2">Popularity</th>
                    <th className="text-left font-semibold px-2 py-2">Class</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, idx) => {
                    const item = items.find((i) => i.id === r.id);
                    const q = quadrantById.get(r.id);
                    return (
                      <tr key={r.id} className="border-b border-[#f4f4f4] last:border-0 hover:bg-[#faf9f7] transition-colors">
                        <td className="px-4 py-2 text-[#afafaf] tabular-nums">{idx + 1}</td>
                        <td className="px-2 py-2 font-medium text-[#1a1a1a]">
                          {r.name || <span className="text-[#afafaf] font-normal">Unnamed item</span>}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-[#155e63] font-semibold">{formatCents(r.priceCents)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-[#6b6b6b]">{formatCents(r.cogsCents)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-[#1a1a1a]">{formatCents(r.gpCents)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-[#eef0ef] rounded-full overflow-hidden min-w-[40px]">
                              <div
                                className="h-full bg-[#155e63] rounded-full"
                                style={{ width: `${Math.max(0, Math.min(100, r.marginPct))}%` }}
                              />
                            </div>
                            <span className="tabular-nums text-[#1a1a1a] font-semibold w-10 text-right">
                              {r.marginPct.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <PopularityInlineSelect
                            value={item?.expected_popularity ?? null}
                            disabled={!canEdit}
                            onChange={(v) => onUpdateItem(r.id, { expected_popularity: v })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          {q ? (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${QUADRANT_STYLES[q].cell}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${QUADRANT_STYLES[q].dot}`} />
                              {QUADRANT_META[q].label}
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#afafaf]">Set popularity</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Needs info */}
      {needsInfo.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6b6b6b] mb-2">
            Not Enough Info Yet ({needsInfo.length})
          </h3>
          <div className="rounded-xl border border-[#efefef] bg-white divide-y divide-[#f4f4f4]">
            {needsInfo.map((n) => {
              const item = items.find((i) => i.id === n.id);
              const onlyPopularity = n.missing.length === 1 && n.missing[0] === "popularity";
              return (
                <div key={n.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1a1a1a] truncate">
                      {n.name || <span className="text-[#afafaf] font-normal">Unnamed item</span>}
                    </p>
                    <p className="text-[11px] text-[#9a9a9a]">
                      Add {n.missing.map((m) => (m === "cost" ? "a cost" : m === "price" ? "a price" : "an expected popularity")).join(", ")}.
                    </p>
                  </div>
                  {onlyPopularity ? (
                    <PopularityInlineSelect
                      value={item?.expected_popularity ?? null}
                      disabled={!canEdit}
                      onChange={(v) => onUpdateItem(n.id, { expected_popularity: v })}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={onGoToMenu}
                      className="text-[11px] font-semibold text-[#155e63] hover:underline shrink-0"
                    >
                      Open menu
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function QuadrantCell({
  quadrant,
  items,
}: {
  quadrant: Quadrant;
  items: { id: string; name: string }[];
}) {
  const meta = QUADRANT_META[quadrant];
  const styles = QUADRANT_STYLES[quadrant];
  return (
    <div className={`rounded-xl border p-3 flex flex-col min-h-[8rem] ${styles.cell}`}>
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${styles.dot}`} />
          <span className="text-sm font-bold text-[#1a1a1a]">{meta.label}</span>
        </div>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${styles.badge}`}>
          {items.length}
        </span>
      </div>
      <p className="text-[10px] uppercase tracking-wider text-[#6b6b6b] font-semibold mb-1.5">
        {meta.tagline}
      </p>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {items.map((it) => (
            <span
              key={it.id}
              className="text-[11px] bg-white/70 border border-white text-[#1a1a1a] rounded-md px-1.5 py-0.5 truncate max-w-full"
            >
              {it.name || "Unnamed"}
            </span>
          ))}
        </div>
      )}
      <p className="text-[11px] text-[#4a4a4a] leading-relaxed mt-auto">{meta.recommendation}</p>
    </div>
  );
}

// ─── Top-level workspace ─────────────────────────────────────────────────────

type Tab = "menu" | "ingredients" | "insights";

export function MenuWorkspace({
  planId,
  canEdit,
  initialTrialMessagesUsed,
  initialItems,
  initialIngredients,
  initialItemIngredients,
  initialCategories,
  initialCategoryDefaults,
  conceptContext,
}: Props) {
  const [items, setItems] = useState<MenuItemWithCogs[]>(initialItems);
  const [ingredients, setIngredients] = useState<MenuIngredient[]>(initialIngredients);
  const [itemIngredients, setItemIngredients] = useState<MenuItemIngredient[]>(initialItemIngredients);
  const [categories, setCategories] = useState<MenuCategory[]>(initialCategories);
  const [categoryDefaults, setCategoryDefaults] = useState<CategoryDefaultIngredient[]>(initialCategoryDefaults);
  const [activeTab, setActiveTab] = useState<Tab>("menu");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [expandedDefaultsCatId, setExpandedDefaultsCatId] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceSuggestion, setPriceSuggestion] = useState<PriceSuggestion | null>(null);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recipeError, setRecipeError] = useState<string | null>(null);

  const tabs: { id: Tab; label: string; Icon: typeof Utensils }[] = [
    { id: "menu", label: "Menu", Icon: Utensils },
    { id: "ingredients", label: "Ingredients", Icon: Package },
    { id: "insights", label: "Insights", Icon: LayoutGrid },
  ];

  async function refetchItems() {
    const r = await fetch("/api/workspaces/menu-pricing/items");
    if (r.ok) {
      const data = (await r.json()) as MenuItemWithCogs[];
      setItems(data);
    }
  }

  // ── Item operations ──────────────────────────────────────────────────────
  async function addItem(categoryId: string) {
    const optimistic: MenuItemWithCogs = {
      id: makeLocalId(),
      plan_id: planId,
      position: items.filter((i) => i.category_id === categoryId).length,
      name: "",
      category_id: categoryId,
      price_cents: 0,
      cogs_cents: null,
      expected_mix_pct: 0,
      expected_popularity: null,
      prep_time_seconds: null,
      notes: null,
      recipe: {},
      archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      computed_cogs_cents: 0,
    };
    setItems((prev) => [...prev, optimistic]);
    setSelectedItemId(optimistic.id);

    const res = await fetch("/api/workspaces/menu-pricing/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "",
        category_id: categoryId,
        position: optimistic.position,
        price_cents: 0,
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as MenuItemWithCogs;
      // Server may have auto-attached category default ingredients — refresh
      // both items (for new computed COGS) and item-ingredients.
      setItems((prev) => prev.map((i) => (i.id === optimistic.id ? created : i)));
      setSelectedItemId(created.id);
      const r = await fetch("/api/workspaces/menu-pricing/item-ingredients?item_id=" + created.id);
      if (r.ok) {
        const lines = (await r.json()) as MenuItemIngredient[];
        setItemIngredients((prev) => [...prev.filter((ii) => ii.menu_item_id !== created.id), ...lines]);
      }
    } else {
      setItems((prev) => prev.filter((i) => i.id !== optimistic.id));
    }
  }

  async function updateItem(id: string, patch: Partial<MenuItemWithCogs>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    await fetch("/api/workspaces/menu-pricing/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function deleteItem(id: string) {
    const prev = items;
    setItems((p) => p.filter((i) => i.id !== id));
    if (selectedItemId === id) setSelectedItemId(null);
    const res = await fetch(`/api/workspaces/menu-pricing/items?id=${id}`, { method: "DELETE" });
    if (!res.ok) setItems(prev);
  }

  async function reorderItems(updates: Array<{ id: string; position: number; category_id: string }>) {
    setItems((prev) =>
      prev.map((i) => {
        const u = updates.find((x) => x.id === i.id);
        return u ? { ...i, position: u.position, category_id: u.category_id } : i;
      })
    );
    await fetch("/api/workspaces/menu-pricing/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reorder: updates }),
    });
  }

  // ── Category operations ──────────────────────────────────────────────────
  async function addCategory() {
    const baseName = "New Category";
    let name = baseName;
    let counter = 2;
    while (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      name = `${baseName} ${counter++}`;
    }
    const position = (categories[categories.length - 1]?.position ?? -1) + 1;
    const optimistic: MenuCategory = {
      id: makeLocalId(),
      plan_id: planId,
      name,
      position,
      is_default: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setCategories((prev) => [...prev, optimistic]);

    const res = await fetch("/api/workspaces/menu-pricing/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, position }),
    });
    if (res.ok) {
      const created = (await res.json()) as MenuCategory;
      setCategories((prev) => prev.map((c) => (c.id === optimistic.id ? created : c)));
    } else {
      setCategories((prev) => prev.filter((c) => c.id !== optimistic.id));
    }
  }

  async function renameCategory(id: string, name: string) {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c))
    );
    const res = await fetch("/api/workspaces/menu-pricing/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
    if (res.ok) {
      const updated = (await res.json()) as MenuCategory;
      setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
    }
  }

  async function deleteCategory(id: string) {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    const itemsInCat = items.filter((i) => i.category_id === id && !i.archived);
    let moveToId: string | null = null;

    if (itemsInCat.length > 0) {
      const others = categories.filter((c) => c.id !== id);
      if (others.length === 0) {
        alert("Can't delete the last category — create another category first.");
        return;
      }
      const choices = others.map((c, idx) => `${idx + 1}. ${c.name}`).join("\n");
      const input = window.prompt(
        `"${cat.name}" has ${itemsInCat.length} item${itemsInCat.length !== 1 ? "s" : ""}. Move them where?\n\n${choices}\n\nType a number, or Cancel to abort.`,
        "1",
      );
      if (input === null) return;
      const idx = parseInt(input, 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= others.length) {
        alert("Invalid selection.");
        return;
      }
      moveToId = others[idx].id;
    } else if (!confirm(`Delete empty category "${cat.name}"?`)) {
      return;
    }

    const url = moveToId
      ? `/api/workspaces/menu-pricing/categories?id=${id}&moveToId=${moveToId}`
      : `/api/workspaces/menu-pricing/categories?id=${id}`;
    const res = await fetch(url, { method: "DELETE" });
    if (res.ok) {
      if (moveToId) {
        setItems((prev) =>
          prev.map((i) => (i.category_id === id ? { ...i, category_id: moveToId as string } : i))
        );
      }
      setCategories((prev) => prev.filter((c) => c.id !== id));
      if (expandedDefaultsCatId === id) setExpandedDefaultsCatId(null);
    } else {
      alert("Failed to delete category. Try again.");
    }
  }

  // ── Ingredient operations ────────────────────────────────────────────────
  async function addIngredient(init?: {
    name?: string;
    package_size?: number;
    package_unit?: IngredientUnit;
    package_cost_cents?: number;
  }): Promise<boolean> {
    const payload = {
      plan_id: planId,
      name: init?.name ?? "New ingredient",
      package_size: init?.package_size ?? 1,
      package_unit: init?.package_unit ?? "g",
      package_cost_cents: init?.package_cost_cents ?? 0,
    };
    const optimistic: MenuIngredient = {
      id: makeLocalId(),
      plan_id: planId,
      name: payload.name,
      package_size: payload.package_size,
      package_unit: payload.package_unit,
      package_cost_cents: payload.package_cost_cents,
      vendor_id: null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setIngredients((prev) => [...prev, optimistic]);

    const res = await fetch("/api/workspaces/menu-pricing/ingredients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const created = (await res.json()) as MenuIngredient;
      setIngredients((prev) => prev.map((i) => (i.id === optimistic.id ? created : i)));
      return true;
    } else {
      setIngredients((prev) => prev.filter((i) => i.id !== optimistic.id));
      return false;
    }
  }

  async function updateIngredient(id: string, patch: Partial<MenuIngredient>) {
    setIngredients((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    await fetch("/api/workspaces/menu-pricing/ingredients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if ("package_cost_cents" in patch || "package_size" in patch) {
      await refetchItems();
    }
  }

  async function deleteIngredient(id: string) {
    const prev = ingredients;
    setIngredients((p) => p.filter((i) => i.id !== id));
    setItemIngredients((p) => p.filter((ii) => ii.ingredient_id !== id));
    const res = await fetch(`/api/workspaces/menu-pricing/ingredients?id=${id}`, { method: "DELETE" });
    if (!res.ok) setIngredients(prev);
  }

  // ── Recipe line operations ───────────────────────────────────────────────
  async function addRecipeLine(menuItemId: string, ingredientId: string, amount: number, unit: IngredientUnit) {
    const optimistic: MenuItemIngredient = {
      id: makeLocalId(),
      menu_item_id: menuItemId,
      ingredient_id: ingredientId,
      amount,
      unit,
      created_at: new Date().toISOString(),
    };
    setItemIngredients((prev) => [...prev, optimistic]);

    const res = await fetch("/api/workspaces/menu-pricing/item-ingredients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menu_item_id: menuItemId, ingredient_id: ingredientId, amount, unit }),
    });
    if (res.ok) {
      const created = (await res.json()) as MenuItemIngredient;
      setItemIngredients((prev) => prev.map((ii) => (ii.id === optimistic.id ? created : ii)));
      await refetchItems();
    } else {
      setItemIngredients((prev) => prev.filter((ii) => ii.id !== optimistic.id));
    }
  }

  async function updateRecipeLine(id: string, patch: { amount?: number; unit?: IngredientUnit }) {
    setItemIngredients((prev) =>
      prev.map((ii) => (ii.id === id ? { ...ii, ...patch } : ii))
    );
    await fetch("/api/workspaces/menu-pricing/item-ingredients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    await refetchItems();
  }

  async function deleteRecipeLine(id: string) {
    const prev = itemIngredients;
    setItemIngredients((p) => p.filter((ii) => ii.id !== id));
    const res = await fetch(`/api/workspaces/menu-pricing/item-ingredients?id=${id}`, { method: "DELETE" });
    if (res.ok) await refetchItems();
    else setItemIngredients(prev);
  }

  // ── Category default ingredients ─────────────────────────────────────────
  async function addDefault(categoryId: string, ingredientId: string, amount: number, unit: IngredientUnit) {
    const res = await fetch("/api/workspaces/menu-pricing/category-defaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: categoryId, ingredient_id: ingredientId, amount, unit }),
    });
    if (res.ok) {
      const created = (await res.json()) as CategoryDefaultIngredient;
      setCategoryDefaults((prev) => [...prev, created]);
    }
  }

  async function updateDefault(id: string, patch: { amount?: number; unit?: IngredientUnit }) {
    setCategoryDefaults((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
    );
    await fetch("/api/workspaces/menu-pricing/category-defaults", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function deleteDefault(id: string) {
    const prev = categoryDefaults;
    setCategoryDefaults((p) => p.filter((d) => d.id !== id));
    const res = await fetch(`/api/workspaces/menu-pricing/category-defaults?id=${id}`, { method: "DELETE" });
    if (!res.ok) setCategoryDefaults(prev);
  }

  async function applyDefaults(categoryId: string) {
    await fetch("/api/workspaces/menu-pricing/category-defaults", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: categoryId, applyToExisting: true }),
    });
    // Refresh both items (for computed COGS) and item-ingredients.
    await refetchItems();
    const r = await fetch("/api/workspaces/menu-pricing/items"); // touch above
    if (r.ok) await r.json();
    // No single endpoint returns every line for the plan; pull lines for items in the category.
    const itemIds = items.filter((i) => i.category_id === categoryId).map((i) => i.id);
    const allLines: MenuItemIngredient[] = [];
    for (const itemId of itemIds) {
      const lr = await fetch(`/api/workspaces/menu-pricing/item-ingredients?item_id=${itemId}`);
      if (lr.ok) allLines.push(...((await lr.json()) as MenuItemIngredient[]));
    }
    setItemIngredients((prev) => [
      ...prev.filter((ii) => !itemIds.includes(ii.menu_item_id)),
      ...allLines,
    ]);
  }

  // ── AI price suggestion ──────────────────────────────────────────────────
  async function suggestPrice(item: MenuItemWithCogs) {
    setPriceLoading(true);
    setPriceSuggestion(null);

    const recipeLines = itemIngredients.filter((ii) => ii.menu_item_id === item.id);
    let cogsCents = 0;
    if (recipeLines.length > 0) {
      for (const line of recipeLines) {
        const ing = ingredients.find((i) => i.id === line.ingredient_id);
        if (ing) cogsCents += Math.round(line.amount * costPerUnit(ing) * 100);
      }
    } else {
      cogsCents = item.cogs_cents ?? item.computed_cogs_cents ?? 0;
    }

    try {
      const res = await fetch("/api/workspaces/menu-pricing/suggest-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_name: item.name,
          cogs_cents: cogsCents,
          concept_context: conceptContext ?? {},
        }),
      });
      if (res.status === 402) {
        setPaywallOpen(true);
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as PriceSuggestion;
        setPriceSuggestion(data);
      }
    } finally {
      setPriceLoading(false);
    }
  }

  // ── AI recipe starting point (TIM-1321) ──────────────────────────────────
  async function suggestRecipe(item: MenuItemWithCogs) {
    if (!item.name.trim()) return;
    setRecipeLoading(true);
    setRecipeError(null);
    try {
      const res = await fetch("/api/workspaces/menu-pricing/suggest-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: item.id,
          item_name: item.name,
          concept_context: conceptContext ?? {},
        }),
      });
      if (res.status === 402) {
        setPaywallOpen(true);
        return;
      }
      if (!res.ok) {
        setRecipeError("Couldn't suggest a recipe. Try again in a moment.");
        return;
      }
      const data = (await res.json()) as {
        ingredients: MenuIngredient[];
        lines: MenuItemIngredient[];
      };
      // Server reused/created the library ingredients and attached recipe lines.
      // Replace the ingredient list and this item's lines, then refresh COGS.
      setIngredients(data.ingredients);
      setItemIngredients((prev) => [
        ...prev.filter((ii) => ii.menu_item_id !== item.id),
        ...data.lines,
      ]);
      await refetchItems();
    } catch {
      setRecipeError("Couldn't suggest a recipe. Try again in a moment.");
    } finally {
      setRecipeLoading(false);
    }
  }

  const handleSelectItem = useCallback((id: string | null) => {
    setSelectedItemId(id);
    setPriceSuggestion(null);
    setRecipeError(null);
  }, []);

  return (
    <div className="bg-[#faf9f7] min-h-screen">
      <div className="max-w-4xl mx-auto px-6 pt-8 pb-16">
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Utensils className="w-5 h-5 text-[#155e63] flex-shrink-0" aria-hidden="true" />
            <h1 className="font-bold text-[#1a1a1a]" style={{ fontSize: "28px" }}>
              Menu &amp; Pricing
            </h1>
          </div>
          <p className="text-sm text-[#6b6b6b] leading-relaxed">
            Build your menu, add recipe ingredients to compute COGS, and get AI-suggested retail prices.
          </p>
        </header>

        <nav className="flex items-center gap-1 bg-white border border-[#efefef] rounded-xl p-1 mb-6 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? "bg-[#155e63] text-white"
                  : "text-[#6b6b6b] hover:text-[#1a1a1a]"
              }`}
            >
              <t.Icon size={13} />
              {t.label}
            </button>
          ))}
        </nav>

        {activeTab === "menu" && (
          <MenuTab
            canEdit={canEdit}
            items={items}
            categories={categories}
            ingredients={ingredients}
            itemIngredients={itemIngredients}
            categoryDefaults={categoryDefaults}
            selectedItemId={selectedItemId}
            expandedDefaultsCatId={expandedDefaultsCatId}
            onToggleDefaults={(catId) =>
              setExpandedDefaultsCatId((prev) => (prev === catId ? null : catId))
            }
            onSelectItem={handleSelectItem}
            onAddItem={addItem}
            onUpdateItem={updateItem}
            onDeleteItem={deleteItem}
            onAddRecipeLine={addRecipeLine}
            onUpdateRecipeLine={updateRecipeLine}
            onDeleteRecipeLine={deleteRecipeLine}
            onSuggestRecipe={suggestRecipe}
            recipeLoading={recipeLoading}
            recipeError={recipeError}
            onSuggestPrice={suggestPrice}
            priceLoading={priceLoading}
            priceSuggestion={priceSuggestion}
            onReorderItems={reorderItems}
            onAddCategory={addCategory}
            onRenameCategory={renameCategory}
            onDeleteCategory={deleteCategory}
            onReorderCategories={async () => {}}
            onAddDefault={addDefault}
            onUpdateDefault={updateDefault}
            onDeleteDefault={deleteDefault}
            onApplyDefaults={applyDefaults}
          />
        )}

        {activeTab === "ingredients" && (
          <IngredientsTab
            canEdit={canEdit}
            ingredients={ingredients}
            onAddIngredient={addIngredient}
            onUpdateIngredient={updateIngredient}
            onDeleteIngredient={deleteIngredient}
          />
        )}

        {activeTab === "insights" && (
          <InsightsTab
            items={items}
            canEdit={canEdit}
            onUpdateItem={updateItem}
            onGoToMenu={() => setActiveTab("menu")}
          />
        )}
      </div>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        variant="copilot_trial"
      />

      <CoPilotDrawer
        planId={planId}
        workspaceKey="menu_pricing"
        currentFocus={{ label: "Menu & Pricing" }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
      />
    </div>
  );
}
