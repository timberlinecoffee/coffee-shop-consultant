"use client";

// TIM-4110: the Ingredients tab, lifted out of menu-workspace.tsx.
//
// Why this file exists at all: menu-workspace.tsx had grown to 192KB in one
// file, which is past the point where it can be written back through the
// agent tooling in a single operation — a 100-line change was requiring 4,800
// already-correct lines to be retyped. Size stopped being a style question and
// became a "can this be changed at all" question.
//
// The split follows the screen's own tab boundaries rather than an arbitrary
// line count, so the seam is where a reader would already expect one. Nothing
// in here changed on the way across: this is a move, not a rewrite.

"use client";

// TIM-967: Menu & Pricing workspace — drink overview, recipe builder, ingredient costing, AI price suggestion.
// TIM-1020: searchable ingredient combobox, COGS+GP on overview rows, concept-aware price suggestion.
// TIM-1140: editable per-plan categories, drag/drop item reorder + move between categories,
// workspace + per-category aggregate metrics (avg COGS%, avg GP%), category-level default
// ingredients (amortized disposables), 'piece' unit, badge-styled category UX on item card.

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Package,
  Search,
  StickyNote,
  } from "lucide-react";
import { useCurrency } from "@/components/CurrencyProvider";
import { MoneyInput } from "@/components/ui/money-input";
import { Illustration } from "@/components/illustrations/Illustration";
import { SectionHeader } from "@/components/section-header";
import type { AiAction } from "@/components/section-header";
import { InlineAnalysisCard } from "@/components/ai-analyse/InlineAnalysisCard";
import type { AnalyseResponse } from "@/components/ai-analyse/InlineAnalysisCard";
// TIM-2482 (F13): menu-side reconciliation banner — shows menu blend vs
// Forecast Inputs avg ticket and offers a Sync action that opens the
// cross-suite resolver.
import {
  type MenuIngredient,
  type IngredientUnit,
  UNIT_OPTIONS,
  costPerUnit,
  } from "@/lib/menu";
import {
  type ExpectedPopularity,
  POPULARITY_OPTIONS,
  } from "@/lib/menu-engineering";
import { inputCls, labelCls } from "./menu-shared-styles";

// TIM-1212: dense, spreadsheet-style cell input — borderless until hover/focus
// so the ingredient grid stays flat and scannable.
// TIM-1894: ingredient grid is a dense data table → cells use text-xs to match
// the Equipment-table reference (was text-sm/14px, the board-flagged "too large").
const cellInputCls =
  "w-full text-xs bg-transparent border border-transparent rounded-md px-2 py-1.5 text-[var(--foreground)] placeholder-[var(--gray-950)] hover:border-[var(--gray-500)] focus-visible:outline-none focus:border-[var(--teal)] focus:bg-white disabled:text-[var(--muted-foreground)] disabled:hover:border-transparent transition-colors";
const quickInputCls =
  "w-full text-xs bg-white border border-[var(--teal-tint-cfe)] rounded-md px-2 py-1.5 text-[var(--foreground)] placeholder-[var(--teal-accent-2)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors";
// Shared column template so the header, data rows, and quick-add row stay aligned.
const ingGridCls =
  "grid grid-cols-[minmax(0,1fr)_5rem_5.5rem_6rem_6.5rem_3.5rem] gap-2 items-center";

// ─── Expected-popularity selector (TIM-1322) ─────────────────────────────────
// Segmented Low / Medium / High control. Clicking the active option clears it
// back to "not set". Pre-launch there is no real sales data, so this is the
// owner's estimate feeding the menu-engineering matrix.
export function PopularitySelector({
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
      className="inline-flex rounded-lg border border-[var(--border-medium)] overflow-hidden"
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
              idx > 0 ? "border-l border-[var(--border-medium)]" : ""
            } ${
              active
                ? "bg-[var(--teal)] text-white"
                : "bg-white text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
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

export function IngredientCombobox({
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
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--dark-grey)] pointer-events-none"
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
          className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-[var(--border-medium)] bg-white shadow-md text-sm"
          role="listbox"
        >
          {filtered.map((ing, idx) => (
            <li
              key={ing.id}
              role="option"
              aria-selected={idx === highlightIdx}
              className={`px-3 py-2 cursor-pointer transition-colors ${
                idx === highlightIdx
                  ? "bg-[var(--teal-tint-200)] text-[var(--teal)] font-medium"
                  : "text-[var(--foreground)] hover:bg-[var(--background)]"
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
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-[var(--border-medium)] bg-white shadow-md px-3 py-2 text-xs text-[var(--dark-grey)]">
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

  const { symbol } = useCurrency();
  const cpu = costPerUnit(ingredient);
  const cpuDisplay =
    ingredient.package_size > 0 && ingredient.package_cost_cents > 0
      ? `${symbol}${cpu.toFixed(4)}`
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
    <div className="hover:bg-[var(--background)] transition-colors">
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
        <MoneyInput
          compact
          className={cellInputCls + " tabular-nums"}
          value={packageCost}
          disabled={!canEdit}
          min={0}
          step="0.01"
          placeholder="0.00"
          aria-label="Package cost"
          onChange={(e) => setPackageCost(e.target.value)}
          onBlur={handlePackageCostBlur}
        />
        <span
          className="px-2 text-sm font-semibold text-[var(--teal)] tabular-nums truncate"
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
                  ? "text-[var(--teal)] hover:bg-[var(--teal-tint-200)]"
                  : "text-[var(--gray-800)] hover:text-[var(--muted-foreground)] hover:bg-[var(--gray-350)]"
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
              className="p-1 rounded-md text-[var(--gray-800)] hover:text-[var(--error-accent)] hover:bg-[var(--error-bg-6)] transition-colors"
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

  const { symbol } = useCurrency();
  const sizeNum = parseFloat(size);
  const costNum = parseFloat(cost);
  const cpuPreview =
    !isNaN(sizeNum) && sizeNum > 0 && !isNaN(costNum) && costNum > 0
      ? `${symbol}${(costNum / sizeNum).toFixed(4)}`
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
      className={ingGridCls + " px-5 py-2.5 bg-[var(--teal-bg-100)] border-t border-[var(--teal-bg-500)]"}
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
      <MoneyInput
        compact
        className={quickInputCls + " tabular-nums"}
        value={cost}
        placeholder="0.00"
        min={0}
        step="0.01"
        aria-label="New ingredient package cost"
        onChange={(e) => setCost(e.target.value)}
      />
      <span className="px-2 text-sm font-medium text-[var(--muted-foreground)] tabular-nums truncate">
        {cpuPreview}
      </span>
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={commit}
          disabled={!canCommit}
          title="Add ingredient (Enter)"
          aria-label="Add ingredient"
          className="flex items-center justify-center w-8 h-8 rounded-md bg-[var(--teal)] text-white hover:bg-[var(--teal-dark)] disabled:bg-[var(--teal-bg-soft)] disabled:cursor-not-allowed transition-colors"
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
        active ? "text-[var(--teal)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      }`}
    >
      {label}
      {active &&
        (sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
    </button>
  );
}

export function IngredientsTab({
  canEdit,
  canUseAI,
  onPaywall,
  ingredients,
  onAddIngredient,
  onUpdateIngredient,
  onDeleteIngredient,
}: {
  canEdit: boolean;
  canUseAI: boolean;
  onPaywall: () => void;
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
  const [ingredientsAnalyseResult, setIngredientsAnalyseResult] = useState<AnalyseResponse | null>(null);
  const [ingredientsAnalyseLoading, setIngredientsAnalyseLoading] = useState(false);
  const [ingredientsAnalyseError, setIngredientsAnalyseError] = useState<string | null>(null);
  const ingredientsAnalyseInFlight = useRef(false);
  // TIM-2832: right-edge fade affordance for the horizontally scrollable ingredient grid.
  const ingScrollRef = useRef<HTMLDivElement>(null);
  const [showIngFade, setShowIngFade] = useState(false);
  useEffect(() => {
    const el = ingScrollRef.current;
    if (!el) return;
    function update() {
      setShowIngFade(el!.scrollLeft < el!.scrollWidth - el!.clientWidth - 1);
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  async function runIngredientsAnalyse() {
    if (ingredientsAnalyseInFlight.current) return;
    ingredientsAnalyseInFlight.current = true;
    setIngredientsAnalyseLoading(true);
    setIngredientsAnalyseError(null);
    try {
      const res = await fetch("/api/ai/analyse/menu-ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        if (res.status === 402) {
          setIngredientsAnalyseResult(null);
          onPaywall();
          return;
        }
        let errMsg = "Analysis failed. Please try again.";
        try {
          const errData = (await res.json()) as Record<string, unknown>;
          if (typeof errData.error === "string") errMsg = errData.error;
        } catch {}
        setIngredientsAnalyseResult(null);
        setIngredientsAnalyseError(errMsg);
        return;
      }
      const data = (await res.json()) as Record<string, unknown>;
      if (
        !Array.isArray(data.strengths) ||
        !Array.isArray(data.concerns) ||
        !Array.isArray(data.callouts) ||
        !Array.isArray(data.recommendations)
      ) {
        setIngredientsAnalyseResult(null);
        setIngredientsAnalyseError("Analysis returned an unexpected format.");
        return;
      }
      setIngredientsAnalyseResult(data as AnalyseResponse);
    } catch {
      setIngredientsAnalyseError("Connection error. Please try again.");
    } finally {
      setIngredientsAnalyseLoading(false);
      ingredientsAnalyseInFlight.current = false;
    }
  }

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
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-4">
            <SectionHeader
              title="Ingredients"
              helpContent="Track every ingredient, its package size, and cost so recipe lines can compute COGS automatically."
              className="mb-0 flex-1"
              aiActions={[
                {
                  kind: "analyse",
                  onClick: runIngredientsAnalyse,
                  disabled: ingredientsAnalyseLoading || !canUseAI || ingredients.length === 0,
                } satisfies AiAction,
              ]}
            />
            <span className="text-xs text-[var(--dark-grey)] shrink-0 whitespace-nowrap">
              {ingredients.length} {ingredients.length === 1 ? "ingredient" : "ingredients"}
            </span>
          </div>
          <div className="relative mt-3 max-w-xs">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--dark-grey)] pointer-events-none"
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
            <Package size={28} className="text-[var(--neutral-cool-350)] mx-auto mb-2" />
            <p className="text-sm text-[var(--dark-grey)]">No ingredients yet.</p>
          </div>
        ) : (
          <div className="relative">
            {showIngFade && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-l from-white to-transparent"
              />
            )}
            <div className="overflow-x-auto" ref={ingScrollRef}>
            <div className="min-w-[640px]">
              <div
                className={
                  ingGridCls +
                  " px-5 py-2.5 bg-[var(--background)] border-b border-[var(--border)] text-[10px] font-semibold"
                }
              >
                <IngredientSortHeader label="Ingredient" k="name" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <span className="px-2 uppercase tracking-wider text-[var(--muted-foreground)]">Size</span>
                <IngredientSortHeader label="Unit" k="unit" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <span className="px-2 uppercase tracking-wider text-[var(--muted-foreground)]">Pkg Cost</span>
                <IngredientSortHeader label="Cost / Unit" k="cpu" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <span className="sr-only">Actions</span>
              </div>

              {visible.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-[var(--dark-grey)]">
                  {ingredients.length === 0 ? (
                    <div>
                      <Illustration
                        recipeId="empty-state-ingredients"
                        className="w-20 h-20 mx-auto mb-3"
                        fallback={<Package size={28} className="text-[var(--neutral-cool-350)] mx-auto mb-2" />}
                      />
                      No ingredients yet. Add your first below.
                    </div>
                  ) : (
                    `No ingredients match "${search.trim()}".`
                  )}
                </div>
              ) : (
                <div className="divide-y divide-[var(--neutral-cool-100)]">
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
          </div>
        )}
      </div>

      {/* Ingredients analyse error */}
      {ingredientsAnalyseError && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--error-accent)]/30 bg-[var(--error-accent)]/5 px-3 py-2.5">
          <p className="text-xs text-[var(--error-accent)]">{ingredientsAnalyseError}</p>
        </div>
      )}

      {/* Ingredients analyse result */}
      {ingredientsAnalyseResult && (
        <InlineAnalysisCard
          result={ingredientsAnalyseResult}
          loading={ingredientsAnalyseLoading}
          onRegenerate={runIngredientsAnalyse}
        />
      )}
    </div>
  );
}
