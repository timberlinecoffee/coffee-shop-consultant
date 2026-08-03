"use client";

// TIM-967: Menu & Pricing workspace — drink overview, recipe builder, ingredient costing, AI price suggestion.
// TIM-1020: searchable ingredient combobox, COGS+GP on overview rows, concept-aware price suggestion.
// TIM-1140: editable per-plan categories, drag/drop item reorder + move between categories,
// workspace + per-category aggregate metrics (avg COGS%, avg GP%), category-level default
// ingredients (amortized disposables), 'piece' unit, badge-styled category UX on item card.

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { CollapseButton } from "@/components/ui/CollapseButton";
import { useSearchParams } from "next/navigation";
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
  Lock,
  Printer,
} from "lucide-react";
import { z } from "zod";
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
import { useCurrency } from "@/components/CurrencyProvider";
import { MoneyInput } from "@/components/ui/money-input";
import { Illustration } from "@/components/illustrations/Illustration";
import { WorkspaceSubNav } from "@/components/workspace/WorkspaceSubNav";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { AskScoutButton } from "@/components/workspace/AskScoutButton";
import {
  WorkspaceActionMenu,
  WorkspaceActionMenuItem,
} from "@/components/workspace/WorkspaceActionMenu";
import { menuProgress } from "@/components/menu/menu-progress";
import {
  IngredientsTab,
  IngredientCombobox,
  PopularitySelector,
} from "./menu-ingredients-tab";
import { InsightsTab } from "./menu-insights-tab";
import { inputCls, labelCls } from "./menu-shared-styles";
import { WorkspaceActionButton, WORKSPACE_ACTION_ICON_SIZE } from "@/components/workspace/WorkspaceActionButton";
import { ItemPhotoUpload } from "./ItemPhotoUpload";
import { TABLE_CELL_TEXT } from "@/lib/workspace-table";
import { PaywallModal } from "@/components/paywall-modal";
import { ProUpgradePrompt, type ProFeatureKey } from "@/components/pro-upgrade-prompt";
import { useAIReviewModal } from "@/hooks/useAIReviewModal";
import { useMutationStatus } from "@/hooks/use-mutation-status";
import { SaveStatusAndButton } from "@/components/workspace/SaveStatusAndButton";
import { DismissibleCallout } from "@/components/DismissibleCallout";
import { CategoryPresetPicker } from "@/components/menu-pricing/CategoryPresetPicker";
import { SectionHelp } from "@/components/ui/section-help";
import { SectionHeader } from "@/components/section-header";
import type { AiAction } from "@/components/section-header";
import { InlineAnalysisCard } from "@/components/ai-analyse/InlineAnalysisCard";
import type { AnalyseResponse } from "@/components/ai-analyse/InlineAnalysisCard";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
// TIM-2482 (F13): menu-side reconciliation banner — shows menu blend vs
// Forecast Inputs avg ticket and offers a Sync action that opens the
// cross-suite resolver.
import { MenuTicketReconciliationBanner } from "@/components/cross-suite/MenuTicketReconciliationBanner";
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
  computeMsrpCents,
  cogsChipStatusFor,
  menuMixSharePct,
} from "@/lib/menu";
import { MenuBlendedCogsSummary } from "@/components/cross-suite/MenuBlendedCogsSummary";
import {
  type ExpectedPopularity,
  type Quadrant,
  POPULARITY_OPTIONS,
  QUADRANT_META,
  classifyMenu,
  marginRanking,
} from "@/lib/menu-engineering";
import { fmtPct, fmtIntegerPct, formatMinor, formatMinorExact } from "@/lib/formatters";
import { resolveCogsFraction, computeMarginFloorCents } from "@/lib/menu-pricing/cogs-target";
import { BenchmarkChip, type BenchmarkStatus } from "@/components/benchmark/BenchmarkChip";

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
  initialTargetGrossMargin: number;
  conceptContext?: ConceptContext;
}

// TIM-1471: "Benchmark against cafés in my area" — AI compares current price
// to the local market band and tells the owner where they sit.
// TIM-2922: now ships citations (real cafes in the same country) as the
// primary range; the curated industry dataset moves to a secondary panel.
type BenchmarkCitation = {
  name: string;
  url: string;
  price_cents: number;
  city?: string | null;
};
type BenchmarkResult = {
  low_cents: number;
  high_cents: number;
  current_price_cents: number;
  verdict: "below" | "in_band" | "above" | "unknown";
  commentary: string;
  // TIM-2922: post-rewrite, primary source is always "local_cafes" (real
  // cited cafes via web_search). Old values kept for backwards-compat reads
  // of any cached responses during the deploy window.
  source?: "local_cafes" | "ai_estimated" | "platform_data" | "industry_benchmark";
  source_note?: string;
  // TIM-2922: real cafe citations powering the primary range.
  citations?: BenchmarkCitation[];
  country_used?: string | null;
  city_used?: string | null;
  // TIM-2922: secondary industry comparison panel (was the primary source
  // pre-rewrite). Rendered as a labelled "for reference" panel, never the
  // headline.
  industry_comparison?: {
    low_cents: number;
    high_cents: number;
    source_label: string;
    source_note: string;
    // TIM-2922 review fix: industry dataset is USD; carry the currency so
    // the UI does not silently relabel as the workspace currency.
    currency?: string;
  } | null;
};

// TIM-2922: ISO-2 to display name for header rendering. Mirrors the small
// table on the server but only the codes we care about for UI labelling.
const COUNTRY_DISPLAY: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  AU: "Australia",
  NZ: "New Zealand",
  IE: "Ireland",
  DE: "Germany",
  FR: "France",
  NL: "Netherlands",
  MX: "Mexico",
};
function humaniseCountry(code: string | null | undefined): string {
  if (!code) return "";
  return COUNTRY_DISPLAY[code.toUpperCase()] ?? code.toUpperCase();
}

function makeLocalId() {
  return "local_" + Math.random().toString(36).slice(2, 10);
}

// TIM-2921: extract the first dollar/currency amount from a free-text blob
// (e.g. the AI price-suggestion proposedValue: "$5.50\n\nMarket range: ...").
// Used when the founder edits the suggested price in the review modal — the
// final value can be a bare number ("5.25"), a currency-prefixed string
// ("$5.25"), or a multi-line edit that keeps the commentary; we read the first
// numeric token. Returns null on unparseable input so the caller falls back to
// the AI's original suggestion rather than writing NaN.
function parseFirstAmountToCents(text: string): number | null {
  const m = text.match(/-?\d+(?:[.,]\d{1,2})?/);
  if (!m) return null;
  const num = parseFloat(m[0].replace(",", "."));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}


// TIM-1353 v2: 14px / bold / wider tracking — read as section headers.
const sectionLabelCls =
  "text-sm font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-3 leading-tight";


type PriceSuggestion = {
  suggested_price_cents: number;
  low_cents: number;
  high_cents: number;
  margin_pct: number;
  commentary: string;
  // TIM-2922: when suggestion sits outside the live local cafe band the
  // server surfaces the reason here instead of silently disagreeing.
  disagreement_reason?: string | null;
  local_range?: {
    low_cents: number;
    high_cents: number;
    citations: { name: string; url: string; price_cents: number; city?: string | null }[];
  } | null;
  // TIM-2922 review fix: distinct top-level signal — set when the live local
  // research call failed. Lets the UI say "couldn't check local market" instead
  // of "reason for going outside the band" (there's no band to be outside of).
  local_range_unavailable?: string | null;
  country_used?: string | null;
  city_used?: string | null;
};

// TIM-1323: an AI-suggested candidate menu item the owner can add in one tap.
// TIM-3683 Bug 3: the AI now returns a full item spec — retail price, COGS
// estimate, and full ingredient list including non-defaults (syrups, alt
// milks, toppings) so accepting a suggestion yields a complete item, not one
// missing its signature ingredients.
type SuggestedIngredient = {
  name: string;
  amount: number;
  unit: IngredientUnit;
};

type MenuSuggestion = {
  name: string;
  category_id: string;
  category_name: string;
  rationale: string | null;
  estimated_price_cents: number | null;
  estimated_cogs_cents: number | null;
  ingredients: SuggestedIngredient[];
};

// TIM-4110: the Ingredients tab and its private controls moved to
// ./menu-ingredients-tab.tsx (see that file for why).


// ─── Item editor panel ───────────────────────────────────────────────────────

type ItemEditorTab = "recipe" | "cogs";

function ItemEditorPanel({
  item,
  category,
  categories,
  ingredients,
  itemIngredients,
  categoryDefaults,
  canEdit,
  targetGrossMargin,
  onClose,
  onUpdateItem,
  onAddRecipeLine,
  onUpdateRecipeLine,
  onDeleteRecipeLine,
  onSuggestRecipe,
  recipeLoading,
  recipeError,
  onSuggestPrepSteps,
  prepStepsLoading,
  prepStepsError,
  onSuggestPrice,
  priceLoading,
  onBenchmarkPrice,
  benchmarkLoading,
  benchmarkResult,
  benchmarkError,
  onPhotoChange,
  mixSharePct,
}: {
  item: MenuItemWithCogs;
  category: MenuCategory | undefined;
  categories: MenuCategory[];
  ingredients: MenuIngredient[];
  itemIngredients: MenuItemIngredient[];
  categoryDefaults: CategoryDefaultIngredient[];
  canEdit: boolean;
  targetGrossMargin: number;
  onClose: () => void;
  onUpdateItem: (patch: Partial<MenuItemWithCogs>) => Promise<void>;
  onPhotoChange: (photoPath: string | null) => void;
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
  onSuggestPrepSteps: () => Promise<void>;
  prepStepsLoading: boolean;
  prepStepsError: string | null;
  onSuggestPrice: () => Promise<void>;
  priceLoading: boolean;
  onBenchmarkPrice: () => Promise<void>;
  benchmarkLoading: boolean;
  benchmarkResult: BenchmarkResult | null;
  benchmarkError: string | null;
  /** TIM-4114: this item's implied share of sales, from its popularity. */
  mixSharePct: number | null;
}) {
  const [activeTab, setActiveTab] = useState<ItemEditorTab>("recipe");
  const [name, setName] = useState(item.name);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [priceDisplay, setPriceDisplay] = useState(
    item.price_cents > 0 ? (item.price_cents / 100).toFixed(2) : ""
  );
  const panelRootRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // TIM-3723: when the editor opens for a brand-new (unnamed) item — i.e.
  // right after the `+ Add` button in the category header — the row and
  // editor land at the bottom of the category's item list and can render
  // hundreds of pixels below the button that opened them. Without an
  // explicit scroll + focus the click looks like a no-op. Scroll the panel
  // into view and focus the name input so the user can type immediately.
  useEffect(() => {
    if (!canEdit) return;
    if (item.name && item.name.trim().length > 0) return;
    const raf = requestAnimationFrame(() => {
      panelRootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      nameInputRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
    // Only fire on mount for a given item id — re-focusing on every keystroke
    // would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const { currencyCode } = useCurrency();
  const recipeLines = itemIngredients.filter(
    (ii) => ii.menu_item_id === item.id
  );
  // TIM-2950: ingredient ids that come from this item's category-default
  // template — used to render a subtle "from category" badge on those rows.
  // The recipe row data itself is unchanged: defaults were auto-copied into
  // menu_item_ingredients on item create (TIM-1140), so they stay editable
  // and removable like any other item ingredient.
  const categoryDefaultIngredientIds = useMemo(
    () =>
      new Set(
        categoryDefaults
          .filter((d) => d.category_id === item.category_id)
          .map((d) => d.ingredient_id)
      ),
    [categoryDefaults, item.category_id]
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
      ? formatMinorExact(Math.round(computedCogs * 100), currencyCode)
      : item.cogs_cents && item.cogs_cents > 0
      ? formatCents(item.cogs_cents)
      : "—";

  const effectiveCogs =
    recipeLines.length > 0 ? computedCogs * 100 : (item.cogs_cents ?? 0);
  const marginDisplay =
    item.price_cents > 0 && effectiveCogs > 0
      ? fmtPct((item.price_cents - effectiveCogs) / item.price_cents)
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

  // TIM-3248: when the category has a COGS range, use its midpoint as the
  // recommender floor instead of the global target gross margin.
  const catLowPct = category?.target_cogs_low_pct ?? null;
  const catHighPct = category?.target_cogs_high_pct ?? null;
  const hasCatRange = catLowPct !== null && catHighPct !== null;
  const categoryMidPct = hasCatRange ? (catLowPct! + catHighPct!) / 2 : null;
  const msrpCents = hasCatRange && effectiveCogs > 0
    ? computeMarginFloorCents(Math.round(effectiveCogs), resolveCogsFraction(catLowPct, catHighPct))
    : computeMsrpCents(effectiveCogs, targetGrossMargin);

  return (
    <div ref={panelRootRef} data-item-editor="true" className="bg-white rounded-b-xl overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-start gap-3">
        {/* TIM-2949: user-uploaded 4:5 photo replaces the curated illustration. */}
        <ItemPhotoUpload
          itemId={item.id}
          photoPath={item.photo_path}
          canEdit={canEdit}
          onPhotoChange={onPhotoChange}
        />
        <div className="flex-1 min-w-0">
          <input
            ref={nameInputRef}
            aria-label="Item name"
            className={
              "w-full text-base font-semibold border-0 border-b border-transparent focus:border-[var(--teal)] focus-visible:outline-none text-[var(--foreground)] bg-transparent py-0.5 transition-colors disabled:text-[var(--dark-grey)]"
            }
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            placeholder="Item name"
          />
          <div className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)] bg-[var(--teal-tint-500)] border border-[var(--teal-tint)] rounded-full pl-2 pr-1 py-0.5">
            <Tag size={10} className="text-[var(--teal)]" />
            <span className="font-semibold uppercase tracking-wider">Category</span>
            <select
              className="text-xs text-[var(--teal)] font-medium bg-transparent border-0 focus-visible:outline-none cursor-pointer pr-1"
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
        <CollapseButton
          onClick={onClose}
          size={16}
          className="text-[var(--dark-grey)] hover:text-[var(--foreground)] mt-0.5 shrink-0"
          aria-label="Collapse"
        />
      </div>

      {/* TIM-1471: structured tabs inside the expanded card. */}
      <div className="px-5 pt-3" role="tablist" aria-label="Item details">
        <div className="inline-flex items-center gap-1 bg-[var(--background)] border border-[var(--border)] rounded-lg p-0.5">
          {([
            { id: "recipe" as const, label: "Ingredients & Supplies" },
            { id: "cogs" as const, label: "Cost of Goods" },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                activeTab === t.id
                  ? "bg-[var(--teal)] text-white"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5 pt-4">
        {activeTab === "recipe" && (
          <RecipeTabContent
            item={item}
            ingredients={ingredients}
            recipeLines={recipeLines}
            availableIngredients={availableIngredients}
            categoryDefaultIngredientIds={categoryDefaultIngredientIds}
            canEdit={canEdit}
            itemName={name}
            notes={notes}
            setNotes={setNotes}
            onNotesBlur={handleNotesBlur}
            onAddRecipeLine={handleIngredientSelect}
            onUpdateRecipeLine={onUpdateRecipeLine}
            onDeleteRecipeLine={onDeleteRecipeLine}
            onSuggestRecipe={onSuggestRecipe}
            recipeLoading={recipeLoading}
            recipeError={recipeError}
            onUpdateItem={onUpdateItem}
            onSuggestPrepSteps={onSuggestPrepSteps}
            prepStepsLoading={prepStepsLoading}
            prepStepsError={prepStepsError}
          />
        )}

        {activeTab === "cogs" && (
          <CostOfGoodsTabContent
            item={item}
            category={category}
            categoryMidPct={categoryMidPct}
            canEdit={canEdit}
            priceDisplay={priceDisplay}
            setPriceDisplay={setPriceDisplay}
            onPriceBlur={handlePriceBlur}
            cogsDisplay={cogsDisplay}
            effectiveCogs={effectiveCogs}
            marginDisplay={marginDisplay}
            msrpCents={msrpCents}
            targetGrossMargin={targetGrossMargin}
            onUpdateItem={onUpdateItem}
            onSuggestPrice={onSuggestPrice}
            priceLoading={priceLoading}
            onBenchmarkPrice={onBenchmarkPrice}
            benchmarkLoading={benchmarkLoading}
            benchmarkResult={benchmarkResult}
            benchmarkError={benchmarkError}
            mixSharePct={mixSharePct}
          />
        )}
      </div>
    </div>
  );
}

// TIM-3861: keyword-based role inference for the two-group recipe display.
// Prefer the explicit ingredient.category when set; fall back to keyword match on name.
// Returns 'supply' for disposables/packaging, 'ingredient' for everything else.
// Child 4 (TIM-3862) and the AI prompt rework should read ingredient.category directly.
const SUPPLY_KEYWORDS = /\b(cup|cups|lid|lids|sleeve|sleeves|napkin|napkins|straw|straws|wrapper|wrappers|plate|plates|utensil|utensils|spoon|spoons|fork|forks|knife|knives|bag|bags|box|boxes|container|containers|packaging|wrap|wraps|seal|seals|tray|trays|doily|doilies)\b/i;

function inferIngredientRole(ingredient: MenuIngredient | null): 'ingredient' | 'supply' {
  if (!ingredient) return 'ingredient';
  if (ingredient.category === 'supply') return 'supply';
  if (ingredient.category === 'ingredient') return 'ingredient';
  return SUPPLY_KEYWORDS.test(ingredient.name) ? 'supply' : 'ingredient';
}

// TIM-1471: Recipe tab — reads like a recipe page. Ingredients on top, then
// preparation steps as an ordered list. Both editable. Both AI-seedable.
// TIM-3861: recipe lines split into Ingredients / Supplies & Packaging groups.
function RecipeTabContent({
  item,
  ingredients,
  recipeLines,
  availableIngredients,
  categoryDefaultIngredientIds,
  canEdit,
  itemName,
  notes,
  setNotes,
  onNotesBlur,
  onAddRecipeLine,
  onUpdateRecipeLine,
  onDeleteRecipeLine,
  onSuggestRecipe,
  recipeLoading,
  recipeError,
  onUpdateItem,
  onSuggestPrepSteps,
  prepStepsLoading,
  prepStepsError,
}: {
  item: MenuItemWithCogs;
  ingredients: MenuIngredient[];
  recipeLines: MenuItemIngredient[];
  availableIngredients: MenuIngredient[];
  categoryDefaultIngredientIds: Set<string>;
  canEdit: boolean;
  itemName: string;
  notes: string;
  setNotes: (v: string) => void;
  onNotesBlur: () => void;
  onAddRecipeLine: (ingredientId: string) => void;
  onUpdateRecipeLine: (
    id: string,
    patch: { amount?: number; unit?: IngredientUnit }
  ) => Promise<void>;
  onDeleteRecipeLine: (id: string) => Promise<void>;
  onSuggestRecipe: () => Promise<void>;
  recipeLoading: boolean;
  recipeError: string | null;
  onUpdateItem: (patch: Partial<MenuItemWithCogs>) => Promise<void>;
  onSuggestPrepSteps: () => Promise<void>;
  prepStepsLoading: boolean;
  prepStepsError: string | null;
}) {
  const steps = item.preparation_steps ?? [];
  const noName = itemName.trim().length === 0;

  function setSteps(next: string[]) {
    onUpdateItem({ preparation_steps: next });
  }
  function updateStep(idx: number, value: string) {
    const next = [...steps];
    next[idx] = value;
    setSteps(next);
  }
  function removeStep(idx: number) {
    setSteps(steps.filter((_, i) => i !== idx));
  }
  function addStep() {
    setSteps([...steps, ""]);
  }
  function moveStep(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[idx], next[j]] = [next[j], next[idx]];
    setSteps(next);
  }

  return (
    <div className="space-y-6">
      {/* AI generators */}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <WorkspaceActionButton
            variant="secondary"
            onClick={onSuggestRecipe}
            disabled={recipeLoading || noName}
            title={noName ? "Name the item first" : "Suggest a starting recipe with AI"}
          >
            <Sparkles size={WORKSPACE_ACTION_ICON_SIZE} />
            {recipeLoading ? "Building recipe…" : "Suggest recipe with AI"}
          </WorkspaceActionButton>
          <WorkspaceActionButton
            variant="secondary"
            onClick={onSuggestPrepSteps}
            disabled={prepStepsLoading || noName}
            title={noName ? "Name the item first" : "Suggest preparation steps with AI"}
          >
            <Sparkles size={WORKSPACE_ACTION_ICON_SIZE} />
            {prepStepsLoading ? "Writing steps…" : "Suggest prep steps with AI"}
          </WorkspaceActionButton>
        </div>
      )}
      {(recipeError || prepStepsError) && (
        <p className="text-[11px] text-[var(--error-accent)]">
          {recipeError || prepStepsError}
        </p>
      )}

      {/* TIM-3861: Ingredients & Supplies — two-group recipe section */}
      <section>
        {/* Section header with help tooltip — copy from board spec */}
        <SectionHeader
          title="Recipe and Cost Components"
          helpContent="This includes everything that goes into making and serving this item — ingredients, disposables, and packaging — so we can calculate your true cost per item."
          className="mb-4"
          headingLevel={3}
        />

        {recipeLines.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)] mb-4 italic">
            No ingredients yet. Add one below to build the recipe and compute COGS.
          </p>
        ) : (() => {
          // Build a lookup map so each line resolves its ingredient in O(1)
          // instead of O(n) per find call.
          const ingMap = new Map(ingredients.map((i) => [i.id, i]));

          // Partition recipe lines into Ingredients vs Supplies & Packaging.
          // Both groups roll into total COGS — the total per item is unchanged.
          const ingredientLines: typeof recipeLines = [];
          const supplyLines: typeof recipeLines = [];
          for (const line of recipeLines) {
            const ing = ingMap.get(line.ingredient_id);
            if (inferIngredientRole(ing ?? null) === 'supply') {
              supplyLines.push(line);
            } else {
              ingredientLines.push(line);
            }
          }

          const groupItems = (lines: typeof recipeLines) =>
            lines.map((line) => {
              const ing = ingMap.get(line.ingredient_id);
              const lineCost = ing ? line.amount * costPerUnit(ing) : null;
              return (
                <li key={line.id}>
                  <RecipeLineRow
                    line={line}
                    ingredient={ing ?? null}
                    lineCost={lineCost}
                    canEdit={canEdit}
                    isFromCategoryDefault={categoryDefaultIngredientIds.has(line.ingredient_id)}
                    onUpdate={(patch) => onUpdateRecipeLine(line.id, patch)}
                    onDelete={() => onDeleteRecipeLine(line.id)}
                  />
                </li>
              );
            });

          return (
            <div className="space-y-4 mb-4">
              {ingredientLines.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-2">
                    Ingredients
                  </p>
                  <ul className="space-y-1 mb-2">{groupItems(ingredientLines)}</ul>
                </div>
              )}
              {supplyLines.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-2">
                    Supplies and Packaging
                  </p>
                  <ul className="space-y-1 mb-2">{groupItems(supplyLines)}</ul>
                </div>
              )}
            </div>
          );
        })()}

        {/* TIM-2950: Add Ingredient control is ALWAYS visible — never hidden
            when category defaults are present. When the catalog is exhausted
            (or empty), show a clearly-labeled disabled affordance that points
            the user to the Ingredients tab. Defaults render as normal item
            rows (auto-copied at item create, TIM-1140) and additions append
            to the same list. Cost roll-up already sums all recipe lines. */}
        {canEdit && availableIngredients.length > 0 && (
          <IngredientCombobox
            ingredients={availableIngredients}
            onSelect={onAddRecipeLine}
          />
        )}
        {canEdit && availableIngredients.length === 0 && (
          <div>
            <label className={labelCls}>Add Ingredient or Supply</label>
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--dark-grey)] pointer-events-none"
              />
              <input
                type="text"
                className={inputCls + " pl-8"}
                disabled
                placeholder={
                  ingredients.length === 0
                    ? "Add ingredients in the Ingredients tab first…"
                    : "All catalog ingredients are in this recipe — add more in the Ingredients tab…"
                }
              />
            </div>
          </div>
        )}
      </section>

      {/* Preparation steps */}
      <section className="border-t border-[var(--border-subtle)] pt-2">
        <h3 className="text-[15px] font-semibold text-[var(--foreground)] tracking-tight mb-4">
          Preparation
        </h3>
        {steps.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)] mb-3 italic">
            No preparation steps yet.{canEdit && " Click \"Suggest prep steps with AI\" above, or add steps manually."}
          </p>
        ) : (
          <ol className="space-y-4 mb-3">
            {steps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-[var(--teal)] text-white text-xs font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
                {canEdit ? (
                  <textarea
                    className={inputCls + " resize-none flex-1"}
                    rows={2}
                    value={step}
                    onChange={(e) => updateStep(idx, e.target.value)}
                    onBlur={() => {
                      const cleaned = steps
                        .map((s) => s.trim())
                        .filter((s) => s.length > 0);
                      onUpdateItem({ preparation_steps: cleaned });
                    }}
                    placeholder="Step instructions…"
                  />
                ) : (
                  <p className="text-sm text-[var(--foreground)] leading-relaxed flex-1 pt-0.5">
                    {step}
                  </p>
                )}
                {canEdit && (
                  <div className="flex flex-col gap-0.5 mt-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveStep(idx, -1)}
                      disabled={idx === 0}
                      className="text-[var(--neutral-cool-400)] hover:text-[var(--teal)] disabled:opacity-30 transition-colors"
                      aria-label="Move step up"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(idx, 1)}
                      disabled={idx === steps.length - 1}
                      className="text-[var(--neutral-cool-400)] hover:text-[var(--teal)] disabled:opacity-30 transition-colors"
                      aria-label="Move step down"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(idx)}
                      className="text-[var(--neutral-cool-400)] hover:text-[var(--error-accent)] transition-colors"
                      aria-label="Remove step"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={addStep}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:text-[var(--teal-deep)] transition-colors"
          >
            <Plus size={13} />
            Add step
          </button>
        )}
      </section>

      {/* Notes */}
      <section className="border-t border-[var(--border-subtle)] pt-2">
        <h3 className="text-[15px] font-semibold text-[var(--foreground)] tracking-tight mb-4">
          Notes
        </h3>
        {canEdit ? (
          <textarea
            className={inputCls + " resize-none"}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={onNotesBlur}
            placeholder="Prep notes, variations, seasonal availability…"
          />
        ) : notes.trim() ? (
          <p className="text-sm text-[var(--foreground)] leading-relaxed italic">
            {notes}
          </p>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)] italic">
            No notes added.
          </p>
        )}
      </section>
    </div>
  );
}

// TIM-1471: Cost of Goods tab — the costing summary. COGS, selling price,
// MSRP (derived from target gross margin or category midpoint), gross margin, AI benchmark.
// TIM-3248: now accepts category + categoryMidPct for the Category target callout.
function CostOfGoodsTabContent({
  item,
  category,
  categoryMidPct,
  canEdit,
  priceDisplay,
  setPriceDisplay,
  onPriceBlur,
  cogsDisplay,
  effectiveCogs,
  marginDisplay,
  msrpCents,
  targetGrossMargin,
  onUpdateItem,
  onSuggestPrice,
  priceLoading,
  onBenchmarkPrice,
  benchmarkLoading,
  benchmarkResult,
  benchmarkError,
  mixSharePct,
}: {
  item: MenuItemWithCogs;
  category: MenuCategory | undefined;
  categoryMidPct: number | null;
  canEdit: boolean;
  /** TIM-4114: this item's implied share of sales, or null if unpriced. */
  mixSharePct: number | null;
  priceDisplay: string;
  setPriceDisplay: (v: string) => void;
  onPriceBlur: () => void;
  cogsDisplay: string;
  effectiveCogs: number;
  marginDisplay: string | null;
  msrpCents: number | null;
  targetGrossMargin: number;
  onUpdateItem: (patch: Partial<MenuItemWithCogs>) => Promise<void>;
  onSuggestPrice: () => Promise<void>;
  priceLoading: boolean;
  onBenchmarkPrice: () => Promise<void>;
  benchmarkLoading: boolean;
  benchmarkResult: BenchmarkResult | null;
  benchmarkError: string | null;
}) {
  const { currencyCode } = useCurrency();
  const targetPct = (targetGrossMargin * 100).toFixed(0);
  const noPriceYet = item.price_cents === 0;

  // TIM-3248: compute COGS% for the category target callout.
  const catLow = category?.target_cogs_low_pct ?? null;
  const catHigh = category?.target_cogs_high_pct ?? null;
  const hasCatRange = catLow !== null && catHigh !== null;
  const cogsPctEditor = effectiveCogs > 0 && item.price_cents > 0
    ? (effectiveCogs / item.price_cents) * 100
    : null;
  let editorChipStatus: BenchmarkStatus | null = null;
  let editorChipLabel = "";
  if (hasCatRange && cogsPctEditor !== null) {
    // TIM-3683: COGS % is lower-is-better. In-or-under range = green (beating
    // the margin target). Slightly over = yellow, significantly over = red.
    const chip = cogsChipStatusFor(cogsPctEditor, catLow!, catHigh!);
    editorChipStatus = chip.status;
    editorChipLabel = chip.label;
  }

  return (
    <div className="space-y-6">
      {/* Costing summary — 4-stat grid */}
      <section>
        <SectionHeader title="Costing" headingLevel={3} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Selling Price</label>
            <MoneyInput
              className={inputCls}
              value={priceDisplay}
              disabled={!canEdit}
              onChange={(e) => setPriceDisplay(e.target.value)}
              onBlur={onPriceBlur}
              min={0}
              step="0.01"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className={labelCls}>Cost of Goods</label>
            <p className="text-sm font-semibold text-[var(--foreground)] py-2">
              {cogsDisplay}
            </p>
          </div>
          <div>
            <label className={labelCls}>
              {categoryMidPct !== null && msrpCents !== null ? "Recommended Price" : "Min. Suggested Price"}
            </label>
            <p className="text-sm font-semibold text-[var(--foreground)] py-2">
              {msrpCents !== null ? formatCents(msrpCents) : "—"}
            </p>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              {categoryMidPct !== null && msrpCents !== null
                ? `Based on ${category?.name ?? "category"} midpoint: ${categoryMidPct.toFixed(1)}%`
                : `From ${targetPct}% target margin`}
            </p>
          </div>
          <div>
            <label className={labelCls}>Profit Margin</label>
            <p className="text-sm font-semibold text-[var(--teal)] py-2">
              {marginDisplay ?? "—"}
            </p>
            {msrpCents !== null && item.price_cents > 0 && item.price_cents < msrpCents && (
              <p className="text-[11px] text-[var(--warning-text)]">
                Below target margin
              </p>
            )}
          </div>
        </div>
      </section>

      {/* TIM-3248: Category target callout — shown when the item's category has a COGS range. */}
      {hasCatRange && (
        <section>
          <SectionHeader title="Category Target" headingLevel={3} />
          <div className="rounded-lg border border-[var(--border)] bg-[var(--off-white)] px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
              <Tag size={12} className="text-[var(--teal)]" aria-hidden="true" />
              <span>{category?.name}</span>
            </div>
            <p className="text-[10px] text-[var(--muted-foreground)]">
              Target range: {catLow}%–{catHigh}%
            </p>
            {cogsPctEditor !== null && editorChipStatus && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  Your COGS: {Math.round(cogsPctEditor)}%
                </span>
                <BenchmarkChip
                  status={editorChipStatus}
                  label={editorChipLabel}
                  ariaLabel={`Your COGS is ${Math.round(cogsPctEditor)}% — ${editorChipLabel} (target ${catLow}%–${catHigh}%)`}
                />
              </div>
            )}
            {cogsPctEditor === null && (
              <p className="text-[10px] text-[var(--muted-foreground)] italic">
                Set a price and recipe to see your COGS% vs. target.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Expected popularity — kept on the costing tab since it pairs with margin
          for the Insights matrix. */}
      <section>
        <SectionHeader title="Expected Popularity" headingLevel={3} />
        <PopularitySelector
          value={item.expected_popularity}
          disabled={!canEdit}
          onChange={(v) => onUpdateItem({ expected_popularity: v })}
        />
        <p className="text-[11px] text-[var(--neutral-cool-650)] mt-1.5 leading-relaxed">
          Your best guess at how often this will sell. Paired with margin in the Insights tab.
        </p>
        {/* TIM-4114 (UX Phase 6): what that guess actually means, in the units
            the owner was thinking in. Trent asked for "what percentage of
            beverages sold do we anticipate will be this particular beverage" —
            the maths already had an answer and never said it out loud, so the
            blended cost of goods downstream looked like it came from nowhere. */}
        {mixSharePct !== null && (
          <p className="text-[11px] text-[var(--muted-foreground)] mt-1.5 leading-relaxed">
            On your current guesses, that works out at roughly{" "}
            <span className="font-semibold text-[var(--foreground)]">
              {fmtIntegerPct(mixSharePct / 100)}
            </span>{" "}
            of everything you sell — which is how much this item pulls on your
            average cost of goods.
          </p>
        )}
      </section>

      {/* AI suggest retail price — TIM-1561: bespoke box replaced by unified modal */}
      {canEdit && (
        <section>
          <SectionHeader title="AI Price Suggestion" headingLevel={3} />
          <WorkspaceActionButton
            variant="primary"
            onClick={onSuggestPrice}
            disabled={priceLoading || effectiveCogs <= 0}
            title={effectiveCogs <= 0 ? "Add a recipe or manual COGS first" : "Suggest a retail price with AI"}
          >
            <Sparkles size={WORKSPACE_ACTION_ICON_SIZE} />
            {priceLoading ? "Thinking…" : "Suggest retail price with AI"}
          </WorkspaceActionButton>
        </section>
      )}

      {/* AI benchmark against cafés in my area (TIM-1471) */}
      {canEdit && (
        <section>
          <SectionHeader title="Local Benchmark" headingLevel={3} />
          <WorkspaceActionButton
            variant="secondary"
            onClick={onBenchmarkPrice}
            disabled={benchmarkLoading || noPriceYet}
            title={noPriceYet ? "Set a selling price first" : "Benchmark against cafés in my area"}
          >
            <Sparkles size={WORKSPACE_ACTION_ICON_SIZE} />
            {benchmarkLoading ? "Reading local market…" : "Benchmark against cafés in my area"}
          </WorkspaceActionButton>
          {benchmarkError && (
            <p className="text-[11px] text-[var(--error-accent)] mt-1.5">{benchmarkError}</p>
          )}
          {benchmarkResult && (
            <div className="mt-3 rounded-lg border border-[var(--teal-bg-750)] bg-[var(--teal-bg-f0f8)] p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-[var(--muted-foreground)]">
                  {/* TIM-2922: header surfaces the resolved city/country so the geo is auditable at a glance.
                      Country codes are humanised ("Canada" not "CA") so the parenthetical reads naturally. */}
                  Local cafe range for{" "}
                  <span className="font-medium text-[var(--foreground)]">{item.name}</span>
                  {benchmarkResult.city_used
                    ? ` in ${benchmarkResult.city_used}`
                    : benchmarkResult.country_used
                      ? ` (${humaniseCountry(benchmarkResult.country_used)})`
                      : ""}
                  :{" "}
                  <span className="font-semibold text-[var(--foreground)]">
                    {formatMinorExact(benchmarkResult.low_cents, currencyCode)} to {formatMinorExact(benchmarkResult.high_cents, currencyCode)}
                  </span>
                </p>
                {benchmarkResult.source === "local_cafes" && (
                  <span
                    className="shrink-0 text-[10px] font-medium text-[var(--teal)] border border-[var(--teal-bg-750)] rounded px-1.5 py-0.5 leading-none cursor-default"
                    title={`Range derived from ${benchmarkResult.citations?.length ?? 0} real cafe citations in ${benchmarkResult.country_used ?? "your country"}.`}
                  >
                    Local cafes
                  </span>
                )}
                {benchmarkResult.source === "industry_benchmark" && (
                  <span
                    className="shrink-0 text-[10px] font-medium text-[var(--teal)] border border-[var(--teal-bg-750)] rounded px-1.5 py-0.5 leading-none cursor-default"
                    title={benchmarkResult.source_note ?? "Sourced from publicly available industry data (NCA, SCA, Square, BLS)."}
                  >
                    Industry benchmark
                  </span>
                )}
                {(!benchmarkResult.source || benchmarkResult.source === "ai_estimated") && (
                  <span className="shrink-0 text-[10px] font-medium text-[var(--muted-foreground)] border border-[var(--border)] rounded px-1.5 py-0.5 leading-none">
                    AI-estimated
                  </span>
                )}
              </div>
              <p className="text-xs">
                Your price{" "}
                <span className="font-semibold text-[var(--foreground)]">
                  {formatMinorExact(benchmarkResult.current_price_cents, currencyCode)}
                </span>{" "}
                reads as{" "}
                {/* TIM-3583: below/in-range are both favorable states (below
                    = healthy margin opportunity; in-range = priced correctly),
                    so both render in Groundwork's brand teal. Above-range is
                    the only warning state — high price is real customer risk —
                    and reads in the error-accent red. */}
                <span
                  className={
                    benchmarkResult.verdict === "above"
                      ? "font-semibold text-[var(--error-accent)]"
                      : "font-semibold text-[var(--teal)]"
                  }
                >
                  {benchmarkResult.verdict === "below"
                    ? "below market"
                    : benchmarkResult.verdict === "above"
                      ? "above market"
                      : benchmarkResult.verdict === "in_band"
                        ? "in market range"
                        : "unknown"}
                </span>
                .
              </p>
              <p className="text-xs text-[var(--gray-1150)] italic leading-relaxed">
                {benchmarkResult.commentary}
              </p>
              {/* TIM-2922: citation list — the actual cafes powering the range. */}
              {benchmarkResult.citations && benchmarkResult.citations.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-medium text-[var(--teal)] hover:text-[var(--teal-deep)]">
                    Cited cafes ({benchmarkResult.citations.length})
                  </summary>
                  <ul className="mt-1.5 space-y-1 text-[11px]">
                    {benchmarkResult.citations.map((c, idx) => (
                      <li key={`${c.url}-${idx}`} className="flex items-baseline justify-between gap-2">
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--teal)] hover:underline truncate"
                          title={c.url}
                        >
                          {c.name}
                          {c.city ? <span className="text-[var(--muted-foreground)]"> · {c.city}</span> : null}
                        </a>
                        <span className="shrink-0 tabular-nums text-[var(--foreground)] font-medium">
                          {formatMinorExact(c.price_cents, currencyCode)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {/* TIM-2922: industry-body figures (SCA/NCA/Square/BLS) — secondary panel, never the headline.
                  Currency is the industry dataset's own (USD), NOT the workspace currency — labelling
                  with the workspace currency would silently mislabel ($ vs CA$) for non-US shops. */}
              {benchmarkResult.industry_comparison && (
                <div className="mt-2 pt-2 border-t border-[var(--teal-bg-750)] text-[11px] text-[var(--muted-foreground)]">
                  <span className="font-medium">For reference</span>
                  <span className="ml-1">
                    ({benchmarkResult.industry_comparison.source_label.replace(/_/g, " ")}):{" "}
                  </span>
                  <span className="text-[var(--foreground)]">
                    {formatMinorExact(
                      benchmarkResult.industry_comparison.low_cents,
                      benchmarkResult.industry_comparison.currency ?? "USD",
                    )}{" "}
                    to{" "}
                    {formatMinorExact(
                      benchmarkResult.industry_comparison.high_cents,
                      benchmarkResult.industry_comparison.currency ?? "USD",
                    )}
                  </span>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function RecipeLineRow({
  line,
  ingredient,
  lineCost,
  canEdit,
  isFromCategoryDefault,
  onUpdate,
  onDelete,
}: {
  line: MenuItemIngredient;
  ingredient: MenuIngredient | null;
  lineCost: number | null;
  canEdit: boolean;
  // TIM-2950: subtle "from category" badge on rows seeded from the
  // category-default template — additions render without the badge.
  isFromCategoryDefault?: boolean;
  onUpdate: (patch: { amount?: number; unit?: IngredientUnit }) => void;
  onDelete: () => void;
}) {
  const { symbol } = useCurrency();
  const [amount, setAmount] = useState(line.amount.toString());

  function handleAmountBlur() {
    const n = parseFloat(amount);
    if (!isNaN(n) && n !== line.amount) onUpdate({ amount: n });
  }

  function handleUnitChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onUpdate({ unit: e.target.value as IngredientUnit });
  }

  // TIM-1409: A linked ingredient with no package cost yet shouldn't render as
  // "$0.0000" — that reads as a free ingredient and hides the reason COGS is
  // staying flat after the AI starter recipe drops in. Show a "Needs cost"
  // chip pointing the owner to the Ingredients tab instead.
  const needsCost = ingredient !== null && ingredient.package_cost_cents === 0;

  // TIM-2950: subtle teal-tint chip mirroring the Category tag in the editor
  // header (line ~1049) — same family of tokens, no new design language.
  const fromCategoryChip = isFromCategoryDefault ? (
    <span
      className="text-[10px] font-medium uppercase tracking-wider text-[var(--teal)] bg-[var(--teal-tint-500)] border border-[var(--teal-tint)] rounded px-1.5 py-0.5 shrink-0"
      title="Seeded from this category's default ingredients. Edit or remove like any other ingredient."
    >
      Default Item
    </span>
  ) : null;

  if (!canEdit) {
    return (
      <div className="flex items-baseline gap-3 py-1.5">
        {/* TIM-1894: read-only recipe row matches its editable path + Equipment (text-xs, was text-sm). */}
        <span className="flex-1 min-w-0 text-xs font-medium text-[var(--foreground)] break-words">
          {ingredient?.name ?? "Unknown"}
        </span>
        {fromCategoryChip}
        <span className="text-xs text-[var(--muted-foreground)] shrink-0">
          {line.amount} {line.unit}
        </span>
        {needsCost ? (
          <span
            className="text-[10px] font-semibold uppercase tracking-wider text-[var(--warning-text)] bg-[var(--warning-bg)] border border-[var(--warning-amber)] rounded px-1.5 py-0.5 shrink-0"
            title="No package cost set yet. Add one in the Ingredients tab and this line's cost will flow into COGS."
          >
            Needs cost
          </span>
        ) : (
          lineCost !== null && (
            <span className="text-xs text-[var(--muted-foreground)] shrink-0 tabular-nums">
              {/* eslint-disable-next-line no-restricted-syntax -- per-recipe-line ingredient cost: sub-cent (4dp) precision is intentional (TIM-1409); formatMinorExact would round to 2dp and hide differences */}
              {symbol}{lineCost.toFixed(4)}
            </span>
          )
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2">
      <span className="flex-1 min-w-0 text-xs font-medium text-[var(--foreground)] break-words">
        {ingredient?.name ?? "Unknown"}
      </span>
      {fromCategoryChip}
      <input
        type="number"
        className="w-16 text-xs border border-[var(--border-medium)] rounded px-2 py-1 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-transparent transition-colors"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={handleAmountBlur}
        min={0}
        step="any"
      />
      <select
        className="text-xs border border-[var(--border-medium)] rounded px-2 py-1 text-[var(--muted-foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-transparent transition-colors"
        value={line.unit}
        onChange={handleUnitChange}
      >
        {UNIT_OPTIONS.map((u) => (
          <option key={u.value} value={u.value}>{u.label}</option>
        ))}
      </select>
      {needsCost ? (
        <span
          className="text-[10px] font-semibold uppercase tracking-wider text-[var(--warning-text)] bg-[var(--warning-bg)] border border-[var(--warning-amber)] rounded px-1.5 py-0.5 shrink-0"
          title="No package cost set yet. Add one in the Ingredients tab and this line's cost will flow into COGS."
        >
          Needs cost
        </span>
      ) : (
        lineCost !== null && (
          <span className="text-xs text-[var(--muted-foreground)] shrink-0 min-w-[3rem] text-right">
            {/* eslint-disable-next-line no-restricted-syntax -- per-recipe-line ingredient cost: sub-cent (4dp) precision is intentional (TIM-1409); formatMinorExact would round to 2dp */}
            {symbol}{lineCost.toFixed(4)}
          </span>
        )
      )}
      <button
        type="button"
        onClick={onDelete}
        className="text-[var(--neutral-cool-350)] hover:text-[var(--error-accent)] transition-colors shrink-0"
      >
        <X size={12} />
      </button>
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
  onDelete,
  isOverlay,
}: {
  item: MenuItemWithCogs;
  category: MenuCategory | undefined;
  isSelected: boolean;
  canEdit: boolean;
  onSelect: () => void;
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

  const cogs =
    item.computed_cogs_cents > 0
      ? item.computed_cogs_cents
      : (item.cogs_cents ?? 0);

  const gpCents = item.price_cents > 0 && cogs > 0 ? item.price_cents - cogs : null;
  const gpPct =
    item.price_cents > 0 && cogs > 0
      ? Math.round(((item.price_cents - cogs) / item.price_cents) * 100)
      : null;

  // TIM-3248: COGS% chip — compare item COGS% against category target range.
  const catLow = category?.target_cogs_low_pct ?? null;
  const catHigh = category?.target_cogs_high_pct ?? null;
  const hasRange = catLow !== null && catHigh !== null;
  const cogsPct = item.price_cents > 0 && cogs > 0
    ? (cogs / item.price_cents) * 100
    : null;
  let cogsChipStatus: BenchmarkStatus | null = null;
  let cogsChipLabel = "";
  if (hasRange && cogsPct !== null) {
    // TIM-3683: COGS % is lower-is-better. In-or-under range = green (beating
    // the margin target). Slightly over = yellow, significantly over = red.
    const chip = cogsChipStatusFor(cogsPct, catLow!, catHigh!);
    cogsChipStatus = chip.status;
    cogsChipLabel = chip.label;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 sm:gap-3 px-4 sm:px-5 py-3 transition-colors cursor-pointer hover:bg-[var(--background)] ${
        isSelected
          ? "border-l-2 border-[var(--teal)] bg-[var(--teal-bg-f0f8)]"
          : "border-l-2 border-transparent"
      }`}
      onClick={onSelect}
    >
      {canEdit && (
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none p-0.5 mt-0.5 text-[var(--neutral-cool-400)] hover:text-[var(--neutral-cool-600)] transition-colors shrink-0"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag to reorder"
        >
          <GripVertical size={14} />
        </button>
      )}

      {/* TIM-1674: name + (price/COGS + actions) reflow to two stacked rows on
          mobile so nothing crowds or overlaps; collapse to one row from sm: up. */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      {/* TIM-2923: row click is the single edit affordance — it opens
          ItemEditorPanel (the card editor) where name + recipe + price +
          COGS all live. The pencil button below also routes here. */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-[var(--foreground)] break-words block">
          {item.name || (
            <span className="text-[var(--dark-grey)] font-normal">Unnamed item</span>
          )}
        </span>
        <span className="text-[10px] text-[var(--dark-grey)] uppercase tracking-wider mt-0.5 flex items-center gap-1 min-w-0">
          <Tag size={9} className="shrink-0" />
          <span className="shrink-0">Category:</span>
          <span className="text-[var(--muted-foreground)] font-medium normal-case tracking-normal truncate">
            {category?.name ?? "—"}
          </span>
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 shrink-0 sm:justify-end">
      <div className="text-left sm:text-right shrink-0">
        {item.price_cents > 0 ? (
          <p className="text-sm font-semibold text-[var(--teal)]">
            {formatCents(item.price_cents)}
          </p>
        ) : (
          <p className="text-sm text-[var(--neutral-cool-350)]">—</p>
        )}
        {(cogs > 0 || gpCents !== null) && (
          <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5 whitespace-nowrap">
            {cogs > 0 && <span>COGS {formatCents(cogs)}</span>}
            {gpCents !== null && cogs > 0 && <span className="mx-1">·</span>}
            {gpCents !== null && (
              <span>
                GP {formatCents(gpCents)}
                {gpPct !== null && (
                  <span className="text-[var(--dark-grey)]"> ({gpPct}%)</span>
                )}
              </span>
            )}
          </p>
        )}
        {/* TIM-3248: COGS range chip — hidden on mobile, visible sm+ */}
        {cogsChipStatus && (
          <span className="hidden sm:inline-flex items-center gap-1 mt-1">
            <BenchmarkChip
              status={cogsChipStatus}
              label={cogsChipLabel}
              ariaLabel={`COGS ${cogsPct !== null ? Math.round(cogsPct) + "%" : ""} ${cogsChipLabel} (category target ${catLow}%–${catHigh}%)`}
            />
            <span className="text-[10px] text-[var(--muted-foreground)]">
              {catLow}%–{catHigh}%
            </span>
          </span>
        )}
      </div>

      {canEdit && (
        <div className="flex items-center gap-1 shrink-0">
          {/* TIM-2923: pencil opens the same card editor as row click — single
              canonical edit path, not an inline name-only field. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            aria-label="Edit item"
            title="Edit item"
            className="text-[var(--neutral-cool-350)] hover:text-[var(--teal)] transition-colors"
          >
            <Edit2 size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-[var(--neutral-cool-350)] hover:text-[var(--error-accent)] transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}

// ─── Category-default ingredients editor ─────────────────────────────────────

// TIM-3863: per-category supply defaults. Uses menu_ingredients.category from TIM-3861
// as the discriminator (supply vs ingredient) — same category_default_ingredients table.
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
  // Build a lookup map once to avoid O(defaults × ingredients) scans per pass.
  const ingMap = new Map(ingredients.map((i) => [i.id, i]));

  // Split defaults into supply vs ingredient groups using the same role
  // inference as the recipe display (TIM-3861).
  const supplyDefaults = defaults.filter((d) =>
    inferIngredientRole(ingMap.get(d.ingredient_id) ?? null) === 'supply'
  );
  const ingredientDefaults = defaults.filter((d) =>
    inferIngredientRole(ingMap.get(d.ingredient_id) ?? null) === 'ingredient'
  );

  const availableSupplies = ingredients.filter(
    (i) => !used.has(i.id) && inferIngredientRole(i) === 'supply'
  );
  const availableIngredients = ingredients.filter(
    (i) => !used.has(i.id) && inferIngredientRole(i) === 'ingredient'
  );

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
    <div className="px-5 py-4 bg-[var(--gray-50)] border-t border-[var(--neutral-cool-150)] space-y-4">
      <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
        Configure default supplies and ingredients for <strong>{category.name}</strong>.
        New items in this category inherit these rows as editable recipe entries.
        Changes here apply to <strong>new items only</strong> — existing items keep their current recipe.
        Editing or removing a row on an item does not affect these category defaults.
      </p>

      {/* Supply & Packaging Defaults */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-[var(--neutral-cool-650)] uppercase tracking-wide">
          Supply Defaults
        </p>
        {supplyDefaults.length > 0 ? (
          <div className="space-y-1.5">
            {supplyDefaults.map((d) => {
              const ing = ingMap.get(d.ingredient_id);
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
          <p className="text-[11px] text-[var(--neutral-cool-350)]">No supply defaults yet.</p>
        )}
        {canEdit && availableSupplies.length > 0 && (
          <DefaultAddRow available={availableSupplies} onAdd={onAdd} />
        )}
        {canEdit && availableSupplies.length === 0 && supplyDefaults.length === 0 && (
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Add cups, lids, or other packaging to your Ingredients list first, then configure defaults here.
          </p>
        )}
      </div>

      {/* Ingredient Defaults */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-[var(--neutral-cool-650)] uppercase tracking-wide">
          Ingredient Defaults
        </p>
        {ingredientDefaults.length > 0 ? (
          <div className="space-y-1.5">
            {ingredientDefaults.map((d) => {
              const ing = ingMap.get(d.ingredient_id);
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
          <p className="text-[11px] text-[var(--neutral-cool-350)]">No ingredient defaults yet.</p>
        )}
        {canEdit && availableIngredients.length > 0 && (
          <DefaultAddRow available={availableIngredients} onAdd={onAdd} />
        )}
      </div>

      {canEdit && defaults.length > 0 && (
        <div className="flex items-center gap-2 pt-1 border-t border-[var(--neutral-cool-150)]">
          <button
            type="button"
            onClick={handleApply}
            disabled={applying}
            className="text-[11px] font-medium text-[var(--teal)] hover:text-[var(--teal-dark)] disabled:opacity-50 transition-colors"
          >
            {applying ? "Applying…" : "Apply to existing items in this category"}
          </button>
          {applied !== null && (
            <span className="text-[11px] text-[var(--muted-foreground)]">Done</span>
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
    <div className="flex items-center gap-2 bg-white border border-[var(--border)] rounded-lg px-3 py-2">
      <span className="flex-1 min-w-0 text-xs font-medium text-[var(--foreground)] break-words">
        {ingredient?.name ?? "Unknown ingredient"}
      </span>
      <input
        type="number"
        className="w-16 text-xs border border-[var(--border-medium)] rounded px-2 py-1 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-transparent transition-colors"
        value={amount}
        disabled={!canEdit}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={handleAmountBlur}
        min={0}
        step="any"
      />
      <select
        className="text-xs border border-[var(--border-medium)] rounded px-2 py-1 text-[var(--muted-foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-transparent transition-colors"
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
          className="text-[var(--neutral-cool-350)] hover:text-[var(--error-accent)] transition-colors shrink-0"
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



function CategoryMetrics({ items }: { items: MenuItemWithCogs[] }) {
  const agg = aggregateMargins(items);
  if (agg.count === 0) return null;
  return (
    <span className="text-[10px] text-[var(--muted-foreground)]">
      Avg COGS <span className="font-semibold text-[var(--foreground)]">{fmtPct((agg.avgCogsPct ?? 0) / 100)}</span>
      <span className="mx-1.5 text-[var(--neutral-cool-350)]">·</span>
      GP <span className="font-semibold text-[var(--teal)]">{fmtPct((agg.avgGpPct ?? 0) / 100)}</span>
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
  targetGrossMargin: number;
  onUpdateTargetGrossMargin: (next: number) => Promise<void>;
  onToggleDefaults: (catId: string) => void;
  onSelectItem: (id: string | null) => void;
  onAddItem: (categoryId: string) => Promise<void>;
  onOpenSuggest: () => void;
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
  onSuggestPrepSteps: (item: MenuItemWithCogs) => Promise<void>;
  prepStepsLoading: boolean;
  prepStepsError: string | null;
  onSuggestPrice: (item: MenuItemWithCogs) => Promise<void>;
  priceLoading: boolean;
  onBenchmarkPrice: (item: MenuItemWithCogs) => Promise<void>;
  benchmarkLoading: boolean;
  benchmarkResult: BenchmarkResult | null;
  benchmarkError: string | null;
  onReorderItems: (updates: Array<{ id: string; position: number; category_id: string }>) => Promise<void>;
  onAddCategory: () => Promise<void>;
  onRenameCategory: (id: string, name: string) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onReorderCategories: (updates: Array<{ id: string; position: number }>) => Promise<void>;
  // TIM-3247: updates target_cogs_low_pct + target_cogs_high_pct on a user category.
  onUpdateCogsRange: (id: string, low: number, high: number) => Promise<void>;
  onAddDefault: (categoryId: string, ingredientId: string, amount: number, unit: IngredientUnit) => Promise<void>;
  onUpdateDefault: (id: string, patch: { amount?: number; unit?: IngredientUnit }) => Promise<void>;
  onDeleteDefault: (id: string) => Promise<void>;
  onApplyDefaults: (categoryId: string) => Promise<void>;
  onPhotoChange: (itemId: string, photoPath: string | null) => void;
}

function MenuTab(props: MenuTabProps) {
  const {
    canEdit, items, categories, ingredients, itemIngredients, categoryDefaults,
    selectedItemId, expandedDefaultsCatId,
    targetGrossMargin, onUpdateTargetGrossMargin,
    onToggleDefaults,
    onSelectItem, onAddItem, onOpenSuggest, onUpdateItem, onDeleteItem,
    onAddRecipeLine, onUpdateRecipeLine, onDeleteRecipeLine,
    onSuggestRecipe, recipeLoading, recipeError,
    onSuggestPrepSteps, prepStepsLoading, prepStepsError,
    onSuggestPrice, priceLoading,
    onBenchmarkPrice, benchmarkLoading, benchmarkResult, benchmarkError,
    onReorderItems,
    onAddCategory, onRenameCategory, onDeleteCategory, onUpdateCogsRange,
    onAddDefault, onUpdateDefault, onDeleteDefault, onApplyDefaults,
    onPhotoChange,
  } = props;

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

  // TIM-1471: single-column layout. The right side of the screen is reserved
  // for the AI chat — selecting an item expands it inline (accordion pattern
  // mirroring the Hiring/Operations Playbook suites), it does not slide a
  // panel out from the right.
  return (
    <div className="space-y-4">
      {/* TIM-3150: "Not sure where to start?" card — converted to DismissibleCallout
          (persisted per-user preference via platform.dismissed-callouts pref key).
          The "Suggest menu items with AI" CTA moved to the workspace top-right action cluster. */}
      {canEdit && (
        <DismissibleCallout
          calloutKey="menu-pricing.not-sure-where-to-start"
          heading="Not sure where to start?"
          subcopy="Get menu ideas that fit your concept and location. Use the Suggest menu items with AI button above."
        />
      )}

      {/* TIM-2482 (F13): menu↔ticket reconciliation. Renders only when the
          menu blend drifts meaningfully from Forecast Inputs avg ticket; sync
          button opens the cross-suite resolver. */}
      <MenuTicketReconciliationBanner origin="menu" />

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
              className="rounded-xl border border-[var(--border)] bg-white overflow-hidden"
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
                onUpdateCogsRange={(low, high) => onUpdateCogsRange(cat.id, low, high)}
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
                  <div className="divide-y divide-[var(--neutral-cool-100)]">
                    {catItems.map((item) => {
                      const isExpanded = item.id === selectedItemId;
                      return (
                        <div key={item.id}>
                          <SortableMenuItemRow
                            item={item}
                            category={cat}
                            isSelected={isExpanded}
                            canEdit={canEdit}
                            onSelect={() =>
                              onSelectItem(isExpanded ? null : item.id)
                            }
                            onDelete={() => onDeleteItem(item.id)}
                          />
                          {isExpanded && (
                            <div className="bg-[var(--warm-1050)] border-t border-b-2 border-[var(--neutral-cool-200)] pb-4 mb-3">
                              <ItemEditorPanel
                                item={item}
                                mixSharePct={menuMixSharePct(items, item.id)}
                                category={cat}
                                categories={categories}
                                ingredients={ingredients}
                                itemIngredients={itemIngredients}
                                categoryDefaults={categoryDefaults}
                                canEdit={canEdit}
                                targetGrossMargin={targetGrossMargin}
                                onClose={() => onSelectItem(null)}
                                onUpdateItem={(patch) =>
                                  onUpdateItem(item.id, patch)
                                }
                                onAddRecipeLine={(ingId, amount, unit) =>
                                  onAddRecipeLine(item.id, ingId, amount, unit)
                                }
                                onUpdateRecipeLine={onUpdateRecipeLine}
                                onDeleteRecipeLine={onDeleteRecipeLine}
                                onSuggestRecipe={() => onSuggestRecipe(item)}
                                recipeLoading={recipeLoading}
                                recipeError={recipeError}
                                onSuggestPrepSteps={() =>
                                  onSuggestPrepSteps(item)
                                }
                                prepStepsLoading={prepStepsLoading}
                                prepStepsError={prepStepsError}
                                onSuggestPrice={() => onSuggestPrice(item)}
                                priceLoading={priceLoading}
                                onBenchmarkPrice={() => onBenchmarkPrice(item)}
                                benchmarkLoading={benchmarkLoading}
                                benchmarkResult={benchmarkResult}
                                benchmarkError={benchmarkError}
                                onPhotoChange={(path) =>
                                  onPhotoChange(item.id, path)
                                }
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
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
          className="flex items-center gap-2 text-sm font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-4 py-2.5 hover:bg-[var(--teal)]/5 transition-colors"
        >
          <Plus size={14} />
          Add category
        </button>
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
        isOver ? "bg-[var(--teal-tint-500)]" : ""
      }`}
    >
      <p className="text-xs text-[var(--neutral-cool-350)]">No items yet</p>
    </div>
  );
}

// TIM-3246: Zod schema for client-side COGS range validation — mirrors the server schema in
// /api/workspaces/menu-pricing/categories/route.ts (low ≥ 0, high ≤ 100, low < high).
const CogsRangeSchema = z.object({
  low: z.number().min(0, "Low must be at least 0").max(100, "Low must be at most 100"),
  high: z.number().min(0, "High must be at least 0").max(100, "High must be at most 100"),
}).refine((v) => v.low < v.high, { message: "Low must be less than high" });

// TIM-3246: Inline COGS range display row shown inside each CategoryHeader.
// Preset categories (is_default = true) show a locked read-only badge.
// User-created categories show an editable pair of % inputs with Zod validation.
function CogsRangeRow({
  category,
  canEdit,
  onUpdateCogsRange,
}: {
  category: MenuCategory;
  canEdit: boolean;
  onUpdateCogsRange: (low: number, high: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [lowVal, setLowVal] = useState("");
  const [highVal, setHighVal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lowRef = useRef<HTMLInputElement>(null);

  const hasRange = category.target_cogs_low_pct !== null && category.target_cogs_high_pct !== null;
  if (!hasRange) return null;

  const isPreset = category.is_default;

  function startEdit() {
    setLowVal(String(category.target_cogs_low_pct ?? ""));
    setHighVal(String(category.target_cogs_high_pct ?? ""));
    setError(null);
    setEditing(true);
    setTimeout(() => lowRef.current?.focus(), 0);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    const raw = { low: parseFloat(lowVal), high: parseFloat(highVal) };
    const result = CogsRangeSchema.safeParse(raw);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Invalid range");
      return;
    }
    setSaving(true);
    try {
      await onUpdateCogsRange(result.data.low, result.data.high);
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.target instanceof HTMLButtonElement) return;
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
  }

  if (isPreset) {
    return (
      <div className="flex items-center gap-1.5 mt-1.5 pl-6">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          Target COGS
        </span>
        <Lock size={10} className="text-[var(--neutral-cool-350)] shrink-0" aria-label="Read-only: preset category" />
        <span className="text-xs font-semibold text-[var(--foreground)] tabular-nums">
          {category.target_cogs_low_pct}%&ndash;{category.target_cogs_high_pct}%
        </span>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="mt-1.5 pl-6">
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1" onKeyDown={handleKeyDown}>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Target COGS
          </span>
          <div className="flex items-center gap-1 text-xs">
            {/* eslint-disable-next-line no-restricted-syntax -- COGS percentage target (0–100%), not a dollar amount; <MoneyInput> not applicable here */}
            <input
              ref={lowRef}
              type="number"
              min={0}
              max={99}
              step={1}
              value={lowVal}
              onChange={(e) => { setLowVal(e.target.value); setError(null); }}
              aria-label="Low COGS target %"
              placeholder="e.g. 20"
              className="w-14 border border-[var(--border-medium)] rounded-md px-2 py-0.5 text-xs text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-[var(--muted-foreground)]">%</span>
            <span className="text-[var(--muted-foreground)]">to</span>
            {/* eslint-disable-next-line no-restricted-syntax -- COGS percentage target (0–100%), not a dollar amount; <MoneyInput> not applicable here */}
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={highVal}
              onChange={(e) => { setHighVal(e.target.value); setError(null); }}
              aria-label="High COGS target %"
              placeholder="e.g. 30"
              className="w-14 border border-[var(--border-medium)] rounded-md px-2 py-0.5 text-xs text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-[var(--muted-foreground)]">%</span>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="text-xs px-2.5 py-0.5 rounded-md bg-[var(--teal)] text-white font-semibold disabled:opacity-60 hover:bg-[var(--teal-dark)] transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={cancel}
            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            Cancel
          </button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-[var(--error-accent)] mt-1">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 mt-1.5 pl-6 group/cogs">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
        Target COGS
      </span>
      <span className="text-xs font-semibold text-[var(--foreground)] tabular-nums">
        {category.target_cogs_low_pct}%&ndash;{category.target_cogs_high_pct}%
      </span>
      {canEdit && (
        <button
          type="button"
          onClick={startEdit}
          title="Edit COGS target range"
          aria-label="Edit COGS target range"
          className="opacity-0 group-hover/cogs:opacity-100 text-[var(--muted-foreground)] hover:text-[var(--teal)] transition-all"
        >
          <Edit2 size={11} />
        </button>
      )}
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
  onUpdateCogsRange,
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
  // TIM-3247: called when the user selects a preset or sets a custom range.
  onUpdateCogsRange: (low: number, high: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  // Re-sync draft on every edit-enter (no useEffect needed) and on each new
  // server-confirmed category.name via the `key` on the input.
  const [draft, setDraft] = useState(category.name);
  // TIM-3247: picker is dismissed per-category via local state (persists until
  // the user sets a range, which collapses it automatically).
  const [pickerDismissed, setPickerDismissed] = useState(false);

  const showPicker =
    canEdit &&
    category.target_cogs_low_pct === null &&
    !pickerDismissed;

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

  async function handleApplyPreset(low: number, high: number) {
    await onUpdateCogsRange(low, high);
    // Picker collapses automatically when the category row re-renders with the new range.
  }

  return (
    <div className="border-b border-[var(--border)]">
      <div className="px-4 sm:px-5 py-3">
        <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FolderOpen size={14} className="text-[var(--teal)] shrink-0" />
          {editing ? (
            <input
              autoFocus
              className="text-sm font-semibold text-[var(--foreground)] border-0 border-b border-[var(--teal)] focus-visible:outline-none bg-transparent min-w-[140px]"
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
              className="text-sm font-semibold text-[var(--foreground)] hover:underline decoration-dotted text-left truncate min-w-0"
              title={canEdit ? "Click to rename" : undefined}
            >
              {category.name}
            </button>
          )}
          <span className="text-xs text-[var(--dark-grey)] shrink-0">{itemCount}</span>
          {/* TIM-1674: metrics inline beside the title from sm: up; on mobile they
              drop to their own line below so the gear/+Add/× never collide with GP. */}
          <span className="hidden sm:inline-flex items-center shrink-0 whitespace-nowrap">
            <CategoryMetrics items={catItems} />
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {canEdit && (
            <button
              type="button"
              onClick={onToggleDefaults}
              className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                defaultsOpen ? "text-[var(--teal)]" : "text-[var(--muted-foreground)] hover:text-[var(--teal)]"
              }`}
              title="Edit default ingredients for this category"
            >
              <Settings size={11} />
              Defaults
              {defaultsCount > 0 && (
                <span className="text-[10px] bg-[var(--teal-tint-200)] text-[var(--teal)] rounded-full px-1.5 py-0.5 font-semibold">
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
              className="flex items-center gap-1 text-xs font-medium text-[var(--teal)] hover:text-[var(--teal-dark)] transition-colors"
            >
              <Plus size={12} />
              Add
            </button>
          )}
          {canEdit && canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-[var(--neutral-cool-400)] hover:text-[var(--error)] transition-colors"
              aria-label="Delete category"
              title="Delete category"
            >
              <X size={13} />
            </button>
          )}
        </div>
        </div>
        {/* TIM-1674: COGS/GP metrics on their own line below 640px — no overlap with actions. */}
        <div className="sm:hidden mt-1.5 pl-6">
          <CategoryMetrics items={catItems} />
        </div>
        {/* TIM-3246: target COGS range row — always visible once range is set. */}
        <CogsRangeRow
          category={category}
          canEdit={canEdit}
          onUpdateCogsRange={onUpdateCogsRange}
        />
      </div>

      {/* TIM-3247: onboarding preset picker — surfaces when no COGS range is set. */}
      {showPicker && (
        <div className="px-4 sm:px-5 pb-3">
          <CategoryPresetPicker
            categoryName={category.name}
            onApplyPreset={handleApplyPreset}
            onSkip={() => setPickerDismissed(true)}
          />
        </div>
      )}
    </div>
  );
}


// TIM-4110: InsightsTab moved to ./menu-insights-tab.tsx (see that file for why).


// ─── Top-level workspace ─────────────────────────────────────────────────────

// TIM-1323: pick-list of AI-suggested menu items. Each candidate is added into
// its resolved category in one tap (reusing the standard item-create flow, so
// category-default ingredients and COGS math carry over) and AI recipe
// suggestion is available per item once it lands.
function SuggestItemsModal({
  open,
  loading,
  error,
  suggestions,
  addedKeys,
  addingKeys,
  onAdd,
  onClose,
  onRetry,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  suggestions: MenuSuggestion[];
  addedKeys: Set<string>;
  addingKeys: Set<string>;
  onAdd: (s: MenuSuggestion) => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  if (!open) return null;

  // Group candidates under their resolved category, preserving first-seen order.
  const groups: { category: string; items: MenuSuggestion[] }[] = [];
  for (const s of suggestions) {
    let g = groups.find((x) => x.category === s.category_name);
    if (!g) {
      g = { category: s.category_name, items: [] };
      groups.push(g);
    }
    g.items.push(s);
  }

  const addedCount = suggestions.filter((s) => addedKeys.has(s.name.toLowerCase())).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Suggested menu items"
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--teal)]" aria-hidden="true" />
            <div>
              <h2 className="text-base font-bold text-[var(--foreground)] leading-tight">Suggested menu items</h2>
              <p className="text-xs text-[var(--muted-foreground)]">Tap to add any that fit. You can edit prices and recipes after.</p>
            </div>
          </div>
          <CollapseButton
            onClick={onClose}
            size={18}
            className="text-[var(--neutral-cool-650)] hover:text-[var(--foreground)]"
            aria-label="Close"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="py-10 text-center">
              <Sparkles className="w-5 h-5 text-[var(--teal)] mx-auto mb-2 animate-pulse" aria-hidden="true" />
              <p className="text-sm text-[var(--muted-foreground)]">Reading your concept and building suggestions…</p>
            </div>
          )}

          {!loading && error && (
            <div className="py-10 text-center">
              <p className="text-sm text-[var(--error-medium)] mb-3">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="text-sm font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-lg px-4 py-2 hover:bg-[var(--teal)]/5 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {!loading && !error && groups.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">No suggestions yet.</p>
          )}

          {!loading && !error && groups.length > 0 && (
            <div className="space-y-5">
              {groups.map((g) => (
                <div key={g.category}>
                  <p className={sectionLabelCls}>{g.category}</p>
                  <div className="space-y-2">
                    {g.items.map((s) => {
                      const key = s.name.toLowerCase();
                      const added = addedKeys.has(key);
                      const adding = addingKeys.has(key);
                      return (
                        <div
                          key={key}
                          className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[var(--foreground)]">{s.name}</p>
                            {s.rationale && (
                              <p className="text-xs text-[var(--muted-foreground)] leading-snug mt-0.5">{s.rationale}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => onAdd(s)}
                            disabled={added || adding}
                            className={`flex items-center gap-1 text-xs font-semibold rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors ${
                              added
                                ? "text-[var(--teal)] bg-[var(--teal-bg-350)] cursor-default"
                                : "text-white bg-[var(--teal)] hover:bg-[var(--teal-deep)] disabled:opacity-60"
                            }`}
                          >
                            {added ? (
                              <>Added</>
                            ) : adding ? (
                              <>Adding…</>
                            ) : (
                              <>
                                <Plus size={13} /> Add
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!loading && !error && groups.length > 0 && (
          <div className="px-5 py-3 border-t border-[var(--border)] flex items-center justify-between">
            <p className="text-xs text-[var(--muted-foreground)]">
              {addedCount} of {suggestions.length} added
            </p>
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-medium text-[var(--teal)] hover:underline"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

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
  initialTargetGrossMargin,
  conceptContext,
}: Props) {
  const { symbol } = useCurrency();
  const [items, setItems] = useState<MenuItemWithCogs[]>(initialItems);
  const [ingredients, setIngredients] = useState<MenuIngredient[]>(initialIngredients);
  const [itemIngredients, setItemIngredients] = useState<MenuItemIngredient[]>(initialItemIngredients);
  const [categories, setCategories] = useState<MenuCategory[]>(initialCategories);
  const [categoryDefaults, setCategoryDefaults] = useState<CategoryDefaultIngredient[]>(initialCategoryDefaults);
  // TIM-1471: workspace-level target gross margin → drives MSRP in COGS tab.
  const [targetGrossMargin, setTargetGrossMargin] = useState<number>(initialTargetGrossMargin);
  // TIM-1416: Operations Playbook recipes panel deep-links into a specific menu
  // item via ?item=<id>. Honor the param on first render so the editor opens
  // directly — initial state, not an effect, to avoid cascading renders.
  const searchParams = useSearchParams();
  const deepLinkItemId = searchParams?.get("item") ?? null;
  const [activeTab, setActiveTab] = useState<Tab>("menu");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(() =>
    deepLinkItemId && initialItems.some((it) => it.id === deepLinkItemId)
      ? deepLinkItemId
      : null,
  );
  const [expandedDefaultsCatId, setExpandedDefaultsCatId] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  // TIM-1956 Phase 2C: Pro-feature upgrade prompt for Starter clients on the
  // Coffee Shop World benchmark touchpoint. Distinct from the generic paywall
  // (which fires on trial-exhaust / no-sub) — this one carries Pro-specific
  // microcopy from Marketing v3.
  const [proPromptFeature, setProPromptFeature] = useState<ProFeatureKey | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const { openAIReviewModal, AIReviewModalNode } = useAIReviewModal();
  const { saving: mutationSaving, savedAt: mutationSavedAt, confirmSaved } = useMutationStatus();
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  // TIM-1471: AI preparation-steps generator state.
  const [prepStepsLoading, setPrepStepsLoading] = useState(false);
  const [prepStepsError, setPrepStepsError] = useState<string | null>(null);
  // TIM-1471: AI benchmark-against-cafés state.
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  // TIM-1323: AI menu-item suggestions (pick-list modal).
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MenuSuggestion[]>([]);
  const [addedSuggestionKeys, setAddedSuggestionKeys] = useState<Set<string>>(new Set());
  const [addingSuggestionKeys, setAddingSuggestionKeys] = useState<Set<string>>(new Set());

  const { promoteOnEdit } = useWorkspaceStatus();
  // Auto-promote not_started → in_progress once any menu items exist.
  useEffect(() => {
    if (items.length > 0) promoteOnEdit("menu_pricing");
  }, [items.length, promoteOnEdit]);

  const tabs: { id: Tab; label: string; Icon: typeof Utensils; badge?: number }[] = [
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
      preparation_steps: [],
      photo_path: null,
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
      // TIM-3247: new categories start with no range — triggers the preset picker.
      target_cogs_low_pct: null,
      target_cogs_high_pct: null,
      financial_role: null,
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

  // TIM-3247: copies preset or custom low/high values into a user category.
  // Optimistic-updates locally so the picker collapses immediately; server
  // confirms and replaces the row. Standing Rule 3 validation happens on the server.
  // Throws on non-ok response so CogsRangeRow.save() can surface the error message.
  async function updateCategoryCogsRange(id: string, low: number, high: number) {
    // Snapshot prior values before mutation so rollback restores them exactly.
    const prior = categories.find((c) => c.id === id);
    const priorLow = prior?.target_cogs_low_pct ?? null;
    const priorHigh = prior?.target_cogs_high_pct ?? null;

    const rollback = () =>
      setCategories((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, target_cogs_low_pct: priorLow, target_cogs_high_pct: priorHigh }
            : c
        )
      );

    setCategories((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, target_cogs_low_pct: low, target_cogs_high_pct: high }
          : c
      )
    );

    let res: Response;
    try {
      res = await fetch("/api/workspaces/menu-pricing/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, target_cogs_low_pct: low, target_cogs_high_pct: high }),
      });
    } catch {
      rollback();
      throw new Error("Failed to save. Please try again.");
    }

    if (res.ok) {
      const updated = (await res.json()) as MenuCategory;
      setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } else {
      rollback();
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? "Failed to save — please try again");
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
      category: null,
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
        // TIM-1561: route through unified review modal (delete bespoke proposal box).
        const suggestedDollars = (data.suggested_price_cents / 100).toFixed(2);
        const currentDollars = item.price_cents > 0
          ? `${symbol}${(item.price_cents / 100).toFixed(2)}`
          : "Not set";
        // TIM-2922: surface the live local cafe band + any disagreement_reason
        // so the owner sees both the suggestion AND its reconciliation with the
        // benchmark engine in the same modal. When the local range couldn't be
        // fetched at all, label it as such — never as "outside the band".
        const localRangeLine = data.local_range
          ? `\nLive local cafe band${data.city_used ? ` (${data.city_used})` : data.country_used ? ` (${humaniseCountry(data.country_used)})` : ""}: ${symbol}${(data.local_range.low_cents / 100).toFixed(2)} – ${symbol}${(data.local_range.high_cents / 100).toFixed(2)} from ${data.local_range.citations.length} cited cafes.`
          : data.local_range_unavailable
            ? `\nLocal cafe band: could not check (${data.local_range_unavailable}).`
            : "";
        const disagreementLine = data.local_range && data.disagreement_reason
          ? `\n\nReason for going outside the local band: ${data.disagreement_reason}`
          : "";
        openAIReviewModal({
          suggestions: [
            {
              id: `price-${item.id}`,
              fieldId: "price_cents",
              fieldLabel: `${item.name} - Retail Price`,
              originalValue: currentDollars,
              proposedValue: `${symbol}${suggestedDollars}\n\nMarket range: ${symbol}${(data.low_cents / 100).toFixed(2)} – ${symbol}${(data.high_cents / 100).toFixed(2)}\nMargin at suggested price: ${(data.margin_pct * 100).toFixed(1)}%${localRangeLine}\n\n${data.commentary}${disagreementLine}`,
              isStructured: false,
            },
          ],
          context: { workspace: "Menu & Pricing", section: item.name },
          // TIM-2921: the previous handler issued PATCH /items/${id} (no such
          // route — items PATCH lives at the collection with id in the body)
          // and wrote `data.suggested_price_cents` blindly. Both bugs meant
          // Accept was silently lost on reload and any user-edit in the modal
          // was discarded (TIM-1797 class). Now: route through the real
          // endpoint, honor `accepted[0].finalValue` when the user edited,
          // check the response, and refetch so server truth wins.
          onApply: async (accepted) => {
            if (accepted.length === 0) return;
            const change = accepted[0]!;
            const editedCents = change.wasEdited
              ? parseFirstAmountToCents(change.finalValue)
              : null;
            const finalCents = editedCents ?? data.suggested_price_cents;
            const res = await fetch("/api/workspaces/menu-pricing/items", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: item.id, price_cents: finalCents }),
            });
            if (!res.ok) {
              throw new Error("Couldn't save the new price. Please try again.");
            }
            setItems((prev) =>
              prev.map((i) => i.id === item.id ? { ...i, price_cents: finalCents } : i)
            );
            await refetchItems();
          },
        });
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
      // TIM-2924 Shape C fix: suggest-recipe now returns raw AI lines (no DB writes).
      const data = (await res.json()) as {
        lines: Array<{ name: string; amount: number; unit: string }>;
      };
      // TIM-1561: route through review modal before applying.
      // TIM-2924 Shape B fix: proposedValue holds structured raw lines so
      // onApply can send accepted[0].finalValue to the apply route.
      const currentLines = itemIngredients.filter((ii) => ii.menu_item_id === item.id);
      const currentRawLines = currentLines.map((ii) => {
        const ing = ingredients.find((g) => g.id === ii.ingredient_id);
        return { name: ing?.name ?? ii.ingredient_id, amount: ii.amount, unit: ii.unit, inventory_item_id: ii.ingredient_id };
      });
      openAIReviewModal({
        suggestions: [
          {
            id: `recipe-${item.id}`,
            fieldId: "recipe",
            fieldLabel: `${item.name} - Recipe`,
            originalValue: JSON.stringify(currentRawLines),
            proposedValue: JSON.stringify(data.lines),
            isStructured: true,
            isRecipeLines: true,
          },
        ],
        context: { workspace: "Menu & Pricing", section: item.name },
        onApply: async (accepted) => {
          const lines = JSON.parse(accepted[0].finalValue) as Array<{ name: string; amount: number; unit: string }>;
          const applyRes = await fetch("/api/workspaces/menu-pricing/suggest-recipe/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item_id: item.id, lines }),
          });
          if (!applyRes.ok) throw new Error("Failed to apply recipe");
          const applied = await applyRes.json() as { ingredients: MenuIngredient[]; lines: MenuItemIngredient[] };
          setIngredients(applied.ingredients);
          setItemIngredients((prev) => [
            ...prev.filter((ii) => ii.menu_item_id !== item.id),
            ...applied.lines,
          ]);
          await refetchItems();
        },
      });
    } catch {
      setRecipeError("Couldn't suggest a recipe. Try again in a moment.");
    } finally {
      setRecipeLoading(false);
    }
  }

  // ── AI preparation steps (TIM-1471) ──────────────────────────────────────
  async function suggestPreparationSteps(item: MenuItemWithCogs) {
    if (!item.name.trim()) return;
    setPrepStepsLoading(true);
    setPrepStepsError(null);
    try {
      const lineNames = itemIngredients
        .filter((ii) => ii.menu_item_id === item.id)
        .map((ii) => ingredients.find((g) => g.id === ii.ingredient_id)?.name)
        .filter((n): n is string => typeof n === "string" && n.length > 0);
      const res = await fetch(
        "/api/workspaces/menu-pricing/suggest-preparation-steps",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_id: item.id,
            item_name: item.name,
            ingredient_names: lineNames,
            concept_context: conceptContext ?? {},
          }),
        },
      );
      if (res.status === 402) {
        setPaywallOpen(true);
        return;
      }
      if (!res.ok) {
        setPrepStepsError("Couldn't suggest steps. Try again in a moment.");
        return;
      }
      const data = (await res.json()) as { steps: string[] };
      // TIM-1561: route through review modal before applying.
      const currentSteps = item.preparation_steps ?? [];
      openAIReviewModal({
        suggestions: [
          {
            id: `prep-${item.id}`,
            fieldId: "preparation_steps",
            fieldLabel: `${item.name} - Preparation Steps`,
            originalValue: JSON.stringify(currentSteps),
            proposedValue: JSON.stringify(data.steps),
            isStructured: true,
          },
        ],
        context: { workspace: "Menu & Pricing", section: item.name },
        onApply: async (accepted) => {
          // Defence in depth. The review modal's structured form editor now
          // always emits parseable JSON (src/lib/structured-value.ts), but a
          // bare JSON.parse here used to throw inside the apply handler and
          // surface the raw SyntaxError text to the user. Fail with copy a
          // first-time cafe owner can act on instead.
          let steps: string[];
          try {
            const parsed: unknown = JSON.parse(accepted[0].finalValue);
            if (!Array.isArray(parsed)) throw new Error("not a list");
            steps = parsed.map((s) => String(s).trim()).filter(Boolean);
          } catch {
            throw new Error("Those preparation steps could not be saved. Please try again.");
          }
          const patchRes = await fetch("/api/workspaces/menu-pricing/items", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id, preparation_steps: steps }),
          });
          if (!patchRes.ok) throw new Error("Failed to save preparation steps");
          setItems((prev) =>
            prev.map((i) => i.id === item.id ? { ...i, preparation_steps: steps } : i),
          );
        },
      });
    } catch {
      setPrepStepsError("Couldn't suggest steps. Try again in a moment.");
    } finally {
      setPrepStepsLoading(false);
    }
  }

  // ── AI benchmark against cafés in my area (TIM-1471) ─────────────────────
  async function benchmarkPrice(item: MenuItemWithCogs) {
    setBenchmarkLoading(true);
    setBenchmarkError(null);
    setBenchmarkResult(null);
    try {
      const res = await fetch("/api/workspaces/menu-pricing/benchmark-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: item.id,
          item_name: item.name,
          current_price_cents: item.price_cents,
          concept_context: conceptContext ?? {},
        }),
      });
      if (res.status === 402) {
        // TIM-1956: Coffee Shop World benchmarking is Pro-only. Server returns
        // code:"pro_required" for Starter users; any other 402 (trial out,
        // cancelled, paused) falls through to the generic paywall.
        try {
          const payload = (await res.clone().json()) as { code?: string };
          if (payload.code === "pro_required") {
            setProPromptFeature("coffee_shop_world");
            return;
          }
        } catch {
          // Ignore JSON parse failure and fall through to generic paywall.
        }
        setPaywallOpen(true);
        return;
      }
      if (!res.ok) {
        setBenchmarkError("Couldn't pull a benchmark. Try again in a moment.");
        return;
      }
      const data = (await res.json()) as BenchmarkResult;
      setBenchmarkResult(data);
    } catch {
      setBenchmarkError("Couldn't pull a benchmark. Try again in a moment.");
    } finally {
      setBenchmarkLoading(false);
    }
  }

  // ── Target gross margin (TIM-1471) ───────────────────────────────────────
  async function updateTargetGrossMargin(next: number) {
    const prev = targetGrossMargin;
    setTargetGrossMargin(next);
    const res = await fetch("/api/workspaces/menu-pricing/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_gross_margin: next }),
    });
    if (!res.ok) setTargetGrossMargin(prev);
  }

  // ── AI menu-item suggestions (TIM-1323) ──────────────────────────────────
  async function suggestMenuItems() {
    setSuggestOpen(true);
    setSuggestLoading(true);
    setSuggestError(null);
    setSuggestions([]);
    setAddedSuggestionKeys(new Set());
    setAddingSuggestionKeys(new Set());
    try {
      const res = await fetch("/api/workspaces/menu-pricing/suggest-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept_context: conceptContext ?? {} }),
      });
      if (res.status === 402) {
        setSuggestOpen(false);
        setPaywallOpen(true);
        return;
      }
      if (!res.ok) {
        setSuggestError("Couldn't suggest menu items. Try again in a moment.");
        return;
      }
      const data = (await res.json()) as { suggestions: MenuSuggestion[] };
      setSuggestions(data.suggestions ?? []);
    } catch {
      setSuggestError("Couldn't suggest menu items. Try again in a moment.");
    } finally {
      setSuggestLoading(false);
    }
  }

  // One-tap add: create the item in its resolved category via the standard
  // item-create flow. TIM-3683 Bug 3: when the AI supplied a full recipe
  // (Option A), pass ingredients + estimated price through so the item lands
  // with a complete recipe, not category defaults alone. Category defaults are
  // skipped in that path (the AI recipe already covers the base).
  async function addSuggestedItem(s: MenuSuggestion) {
    const key = s.name.toLowerCase();
    if (addedSuggestionKeys.has(key) || addingSuggestionKeys.has(key)) return;
    setAddingSuggestionKeys((prev) => new Set(prev).add(key));
    try {
      const position = items.filter(
        (i) => i.category_id === s.category_id && !i.archived
      ).length;
      const hasAiIngredients = s.ingredients && s.ingredients.length > 0;
      const res = await fetch("/api/workspaces/menu-pricing/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: s.name,
          category_id: s.category_id,
          position,
          price_cents: s.estimated_price_cents ?? 0,
          cogs_cents: s.estimated_cogs_cents ?? null,
          ...(hasAiIngredients
            ? {
                ingredients: s.ingredients,
                skip_category_defaults: true,
              }
            : {}),
        }),
      });
      if (res.status === 402) {
        setSuggestOpen(false);
        setPaywallOpen(true);
        return;
      }
      if (!res.ok) {
        setSuggestError("Couldn't add that item. Try again in a moment.");
        return;
      }
      const created = (await res.json()) as MenuItemWithCogs;
      setItems((prev) => [...prev, created]);
      // Server may have auto-attached category default ingredients.
      const r = await fetch(
        "/api/workspaces/menu-pricing/item-ingredients?item_id=" + created.id
      );
      if (r.ok) {
        const lines = (await r.json()) as MenuItemIngredient[];
        setItemIngredients((prev) => [
          ...prev.filter((ii) => ii.menu_item_id !== created.id),
          ...lines,
        ]);
      }
      setAddedSuggestionKeys((prev) => new Set(prev).add(key));
    } finally {
      setAddingSuggestionKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  const handleSelectItem = useCallback((id: string | null) => {
    setSelectedItemId(id);
    setRecipeError(null);
    setPrepStepsError(null);
    setBenchmarkResult(null);
    setBenchmarkError(null);
  }, []);

  return (
    <>
    {AIReviewModalNode}
    <div className="bg-[var(--background)] min-h-screen">
      <div className="w-full px-4 sm:px-6 pt-8 pb-16">
        {/* TIM-3150: canonical WorkspaceHeader with Suggest menu items with AI in action cluster.
            TIM-3296: Print Recipe Cards added as a secondary action — opens the
            printable recipe card page in a new tab. */}
        <WorkspaceHeader
          Icon={Utensils}
          title="Menu & Pricing"
          description="Build your menu, add recipe ingredients to compute COGS, and get AI-suggested retail prices."
          scout={
            /* TIM-3676: shared Scout entry point. Never emphasised. */
            <AskScoutButton
              workspaceKey="menu_pricing"
              focusLabel="menu and pricing"
              hasContent={items.length > 0}
            />
          }
          overflow={
            /* TIM-4108 (UX Phase 3): "Suggest menu items with AI" was the
               emphasised button here — the last of the three screens Trent
               named when he ruled that the loud button must be the next REAL
               thing to do (D-010). It moves into the menu, unchanged.

               No emphasised button on this screen: menu items are added inside
               a category, and every category already carries its own add row.
               A header button would have to pick a category on the owner's
               behalf, which is a worse answer than no button.

               "Print recipe cards" keeps its own name rather than becoming
               "Print document" — it prints something DIFFERENT from the page
               you are looking at, and Phase 1's rule was that only buttons
               printing the current page share the one name. */
            <WorkspaceActionMenu hideAdvisor>
              {({ closeMenu }) => (
                <>
                  {canEdit && (
                    <WorkspaceActionMenuItem
                      Icon={Sparkles}
                      label="Suggest menu items with AI"
                      onClick={() => {
                        closeMenu();
                        suggestMenuItems();
                      }}
                    />
                  )}
                  <WorkspaceActionMenuItem
                    Icon={Printer}
                    label="Print recipe cards"
                    onClick={() => {
                      closeMenu();
                      window.open(
                        "/workspace/menu-pricing/print",
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                  />
                </>
              )}
            </WorkspaceActionMenu>
          }
          save={
            <SaveStatusAndButton
              saving={mutationSaving}
              savedAt={mutationSavedAt}
              unsaved={false}
              canEdit={true}
              onSave={confirmSaved}
            />
          }
          progress={menuProgress({
            items: items.length,
            categories: categories.length,
          })}
        />

        {/* Tab nav — canonical WorkspaceSubNav (TIM-1793).
            TIM-1888 H-6: text-only pills (no Icon). T-1: default mb-5 spacing. */}
        <WorkspaceSubNav
          tabs={tabs.map((t) => ({ key: t.id, label: t.label, badge: t.badge }))}
          active={activeTab}
          onSelect={setActiveTab}
          ariaLabel="Menu & Pricing sections"
        />

        {/* TIM-4114 (UX Phase 6): the menu says what it is handing to the
            financial plan. Before this, the blend was computed here and only
            ever read on another screen, so the popularity settings felt like a
            note to yourself rather than something that moves the numbers. */}
        {activeTab === "menu" && (
          <MenuBlendedCogsSummary items={items} className="mb-4" />
        )}

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
            targetGrossMargin={targetGrossMargin}
            onUpdateTargetGrossMargin={updateTargetGrossMargin}
            onToggleDefaults={(catId) =>
              setExpandedDefaultsCatId((prev) => (prev === catId ? null : catId))
            }
            onSelectItem={handleSelectItem}
            onAddItem={addItem}
            onOpenSuggest={suggestMenuItems}
            onUpdateItem={updateItem}
            onDeleteItem={deleteItem}
            onAddRecipeLine={addRecipeLine}
            onUpdateRecipeLine={updateRecipeLine}
            onDeleteRecipeLine={deleteRecipeLine}
            onSuggestRecipe={suggestRecipe}
            recipeLoading={recipeLoading}
            recipeError={recipeError}
            onSuggestPrepSteps={suggestPreparationSteps}
            prepStepsLoading={prepStepsLoading}
            prepStepsError={prepStepsError}
            onSuggestPrice={suggestPrice}
            priceLoading={priceLoading}
            onBenchmarkPrice={benchmarkPrice}
            benchmarkLoading={benchmarkLoading}
            benchmarkResult={benchmarkResult}
            benchmarkError={benchmarkError}
            onReorderItems={reorderItems}
            onAddCategory={addCategory}
            onRenameCategory={renameCategory}
            onDeleteCategory={deleteCategory}
            onUpdateCogsRange={updateCategoryCogsRange}
            onReorderCategories={async () => {}}
            onAddDefault={addDefault}
            onUpdateDefault={updateDefault}
            onDeleteDefault={deleteDefault}
            onApplyDefaults={applyDefaults}
            onPhotoChange={(itemId, photoPath) =>
              setItems((prev) =>
                prev.map((i) => (i.id === itemId ? { ...i, photo_path: photoPath } : i))
              )
            }
          />
        )}

        {activeTab === "ingredients" && (
          <IngredientsTab
            canEdit={canEdit}
            canUseAI={canEdit}
            onPaywall={() => setPaywallOpen(true)}
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
            targetGrossMargin={targetGrossMargin}
            onUpdateTargetGrossMargin={updateTargetGrossMargin}
          />
        )}
      </div>

      <SuggestItemsModal
        open={suggestOpen}
        loading={suggestLoading}
        error={suggestError}
        suggestions={suggestions}
        addedKeys={addedSuggestionKeys}
        addingKeys={addingSuggestionKeys}
        onAdd={addSuggestedItem}
        onClose={() => setSuggestOpen(false)}
        onRetry={suggestMenuItems}
      />

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        variant="copilot_trial"
      />

      <ProUpgradePrompt
        open={proPromptFeature !== null}
        onClose={() => setProPromptFeature(null)}
        feature={proPromptFeature ?? "generic"}
      />

    </div>
    </>
  );
}
