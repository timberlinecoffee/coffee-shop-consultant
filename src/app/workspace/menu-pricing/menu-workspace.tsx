"use client";

// TIM-967: Menu & Pricing workspace — drink overview, recipe builder, ingredient costing, and AI price suggestion.

import { useState, useCallback, useMemo } from "react";
import {
  Utensils,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  Package,
  Tag,
  Edit2,
} from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import {
  type MenuItemWithCogs,
  type MenuIngredient,
  type MenuItemIngredient,
  type MenuCategory,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  formatCents,
  costPerUnit,
} from "@/lib/menu";

interface Props {
  planId: string;
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
  initialItems: MenuItemWithCogs[];
  initialIngredients: MenuIngredient[];
  initialItemIngredients: MenuItemIngredient[];
}

function makeLocalId() {
  return "local_" + Math.random().toString(36).slice(2, 10);
}

const inputCls =
  "w-full text-sm border border-[#e0e0e0] rounded-lg px-3 py-2 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors";
const labelCls = "block text-xs font-medium text-[#6b6b6b] mb-1";
const sectionLabelCls =
  "text-[10px] font-semibold uppercase tracking-wider text-[#155e63] mb-3";

type PriceSuggestion = {
  suggested_price_cents: number;
  low_cents: number;
  high_cents: number;
  margin_pct: number;
  commentary: string;
};

interface MenuTabProps {
  planId: string;
  canEdit: boolean;
  items: MenuItemWithCogs[];
  ingredients: MenuIngredient[];
  itemIngredients: MenuItemIngredient[];
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
  onAddItem: (category: MenuCategory) => Promise<void>;
  onUpdateItem: (id: string, patch: Partial<MenuItemWithCogs>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onAddRecipeLine: (
    menuItemId: string,
    ingredientId: string,
    amount: number,
    unit: string
  ) => Promise<void>;
  onUpdateRecipeLine: (
    id: string,
    patch: { amount?: number; unit?: string }
  ) => Promise<void>;
  onDeleteRecipeLine: (id: string) => Promise<void>;
  onSuggestPrice: (item: MenuItemWithCogs) => Promise<void>;
  priceLoading: boolean;
  priceSuggestion: PriceSuggestion | null;
}

interface IngredientsTabProps {
  planId: string;
  canEdit: boolean;
  ingredients: MenuIngredient[];
  onAddIngredient: () => Promise<void>;
  onUpdateIngredient: (
    id: string,
    patch: Partial<MenuIngredient>
  ) => Promise<void>;
  onDeleteIngredient: (id: string) => Promise<void>;
}

function IngredientRow({
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
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(ingredient.name);
  const [packageSize, setPackageSize] = useState(
    ingredient.package_size.toString()
  );
  const [packageUnit, setPackageUnit] = useState(ingredient.package_unit);
  const [packageCost, setPackageCost] = useState(
    ingredient.package_cost_cents > 0
      ? (ingredient.package_cost_cents / 100).toFixed(2)
      : ""
  );
  const [notes, setNotes] = useState(ingredient.notes ?? "");

  const cpu = costPerUnit(ingredient);
  const cpuDisplay =
    ingredient.package_size > 0
      ? "$" + cpu.toFixed(4) + " / " + ingredient.package_unit
      : "—";

  function handleNameBlur() {
    if (name !== ingredient.name) onUpdate({ name });
  }

  function handlePackageSizeBlur() {
    const n = parseFloat(packageSize);
    if (!isNaN(n) && n !== ingredient.package_size) onUpdate({ package_size: n });
  }

  function handlePackageUnitChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value as MenuIngredient["package_unit"];
    setPackageUnit(val);
    onUpdate({ package_unit: val });
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
    <div className="border-b border-[#f5f5f5] last:border-0">
      <div
        className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-[#faf9f7] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-[#1a1a1a] truncate block">
            {ingredient.name || (
              <span className="text-[#afafaf] font-normal">Unnamed ingredient</span>
            )}
          </span>
          <span className="text-xs text-[#6b6b6b]">{cpuDisplay}</span>
        </div>
        <span className="text-xs text-[#6b6b6b] shrink-0">
          {ingredient.package_size} {ingredient.package_unit} /{" "}
          {formatCents(ingredient.package_cost_cents)}
        </span>
        {expanded ? (
          <ChevronUp size={14} className="text-[#afafaf] shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-[#afafaf] shrink-0" />
        )}
      </div>

      {expanded && (
        <div
          className="px-5 pb-5 pt-2 bg-[#faf9f7] border-t border-[#f0f0f0]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className={labelCls}>Name</label>
              <input
                className={inputCls}
                value={name}
                disabled={!canEdit}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameBlur}
              />
            </div>
            <div>
              <label className={labelCls}>Package size</label>
              <input
                type="number"
                className={inputCls}
                value={packageSize}
                disabled={!canEdit}
                onChange={(e) => setPackageSize(e.target.value)}
                onBlur={handlePackageSizeBlur}
                min={0}
                step="any"
              />
            </div>
            <div>
              <label className={labelCls}>Unit</label>
              <select
                className={inputCls}
                value={packageUnit}
                disabled={!canEdit}
                onChange={handlePackageUnitChange}
              >
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="oz">oz</option>
                <option value="each">each</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Package cost ($)</label>
              <input
                type="number"
                className={inputCls}
                value={packageCost}
                disabled={!canEdit}
                onChange={(e) => setPackageCost(e.target.value)}
                onBlur={handlePackageCostBlur}
                min={0}
                step="0.01"
                placeholder="0.00"
              />
            </div>
            <div className="flex items-end">
              <div>
                <label className={labelCls}>Cost per unit</label>
                <p className="text-sm font-semibold text-[#155e63]">{cpuDisplay}</p>
              </div>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea
                className={inputCls + " resize-none"}
                rows={2}
                value={notes}
                disabled={!canEdit}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleNotesBlur}
                placeholder="Vendor info, storage notes…"
              />
            </div>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1.5 text-xs font-medium text-[#c44] hover:text-[#a33] transition-colors"
            >
              <Trash2 size={12} />
              Delete ingredient
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function IngredientsTab({
  planId,
  canEdit,
  ingredients,
  onAddIngredient,
  onUpdateIngredient,
  onDeleteIngredient,
}: IngredientsTabProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#efefef] flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#1a1a1a]">Ingredients</p>
            <p className="text-xs text-[#6b6b6b] mt-0.5">
              Track every ingredient, its package size, and cost so recipe lines can compute COGS automatically.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={onAddIngredient}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#155e63] px-3 py-2 rounded-lg hover:bg-[#0e4448] transition-colors whitespace-nowrap shrink-0"
            >
              <Plus size={13} />
              Add ingredient
            </button>
          )}
        </div>

        {ingredients.length === 0 ? (
          <div className="py-10 text-center">
            <Package size={28} className="text-[#d0d0d0] mx-auto mb-2" />
            <p className="text-sm text-[#afafaf]">No ingredients yet. Add your first ingredient above.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f5f5f5]">
            {ingredients.map((ing) => (
              <IngredientRow
                key={ing.id}
                ingredient={ing}
                canEdit={canEdit}
                onUpdate={(patch) => onUpdateIngredient(ing.id, patch)}
                onDelete={() => onDeleteIngredient(ing.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ItemEditorPanel({
  item,
  ingredients,
  itemIngredients,
  canEdit,
  onClose,
  onUpdateItem,
  onAddRecipeLine,
  onUpdateRecipeLine,
  onDeleteRecipeLine,
  onSuggestPrice,
  priceLoading,
  priceSuggestion,
}: {
  item: MenuItemWithCogs;
  ingredients: MenuIngredient[];
  itemIngredients: MenuItemIngredient[];
  canEdit: boolean;
  onClose: () => void;
  onUpdateItem: (patch: Partial<MenuItemWithCogs>) => Promise<void>;
  onAddRecipeLine: (
    ingredientId: string,
    amount: number,
    unit: string
  ) => Promise<void>;
  onUpdateRecipeLine: (
    id: string,
    patch: { amount?: number; unit?: string }
  ) => Promise<void>;
  onDeleteRecipeLine: (id: string) => Promise<void>;
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
    onUpdateItem({ category: e.target.value as MenuCategory });
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

  function handleAddIngredientSelect(
    e: React.ChangeEvent<HTMLSelectElement>
  ) {
    const ingredientId = e.target.value;
    if (!ingredientId) return;
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) return;
    e.target.value = "";
    onAddRecipeLine(ingredientId, 1, ing.package_unit);
  }

  const usedIngredientIds = new Set(recipeLines.map((l) => l.ingredient_id));
  const availableIngredients = ingredients.filter(
    (i) => !usedIngredientIds.has(i.id)
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
          <div className="mt-1.5">
            <select
              className="text-xs border border-[#e0e0e0] rounded-md px-2 py-1 text-[#6b6b6b] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] transition-colors"
              value={item.category}
              disabled={!canEdit}
              onChange={handleCategoryChange}
            >
              {CATEGORY_ORDER.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
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
              <label className={labelCls}>Retail price ($)</label>
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
              <label className={labelCls}>Cost of goods</label>
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
        </div>

        <div>
          <p className={sectionLabelCls}>Recipe</p>

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
            <div>
              <label className={labelCls}>Add ingredient</label>
              <select
                className={inputCls}
                defaultValue=""
                onChange={handleAddIngredientSelect}
              >
                <option value="" disabled>
                  Select an ingredient…
                </option>
                {availableIngredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name}
                  </option>
                ))}
              </select>
            </div>
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
                <div>
                  <p className="text-xs text-[#6b6b6b]">Suggested price</p>
                  <p className="text-2xl font-bold text-[#155e63]">
                    ${(priceSuggestion.suggested_price_cents / 100).toFixed(2)}
                  </p>
                </div>
                <p className="text-xs text-[#6b6b6b]">
                  Market range: ${(priceSuggestion.low_cents / 100).toFixed(2)}{" "}
                  – ${(priceSuggestion.high_cents / 100).toFixed(2)}
                </p>
                <p className="text-xs text-[#6b6b6b]">
                  Margin at suggested price:{" "}
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
  onUpdate: (patch: { amount?: number; unit?: string }) => void;
  onDelete: () => void;
}) {
  const [amount, setAmount] = useState(line.amount.toString());

  function handleAmountBlur() {
    const n = parseFloat(amount);
    if (!isNaN(n) && n !== line.amount) onUpdate({ amount: n });
  }

  function handleUnitChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onUpdate({ unit: e.target.value });
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
        <option value="g">g</option>
        <option value="ml">ml</option>
        <option value="oz">oz</option>
        <option value="each">each</option>
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

function MenuTab({
  planId,
  canEdit,
  items,
  ingredients,
  itemIngredients,
  selectedItemId,
  onSelectItem,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onAddRecipeLine,
  onUpdateRecipeLine,
  onDeleteRecipeLine,
  onSuggestPrice,
  priceLoading,
  priceSuggestion,
}: MenuTabProps) {
  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;

  return (
    <div
      className={
        selectedItemId
          ? "grid grid-cols-[1fr_360px] gap-5 items-start"
          : "block"
      }
    >
      <div className="space-y-4">
        {CATEGORY_ORDER.map((cat) => {
          const catItems = items.filter(
            (i) => i.category === cat && !i.archived
          );
          return (
            <div
              key={cat}
              className="rounded-xl border border-[#efefef] bg-white overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-[#efefef] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#1a1a1a]">
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="text-xs text-[#afafaf]">
                    {catItems.length}
                  </span>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onAddItem(cat)}
                    className="flex items-center gap-1 text-xs font-medium text-[#155e63] hover:text-[#0e4448] transition-colors"
                  >
                    <Plus size={12} />
                    Add
                  </button>
                )}
              </div>

              {catItems.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-xs text-[#d0d0d0]">No items yet</p>
                </div>
              ) : (
                <div className="divide-y divide-[#f5f5f5]">
                  {catItems.map((item) => {
                    const isSelected = item.id === selectedItemId;
                    return (
                      <MenuItemRow
                        key={item.id}
                        item={item}
                        isSelected={isSelected}
                        canEdit={canEdit}
                        onSelect={() =>
                          onSelectItem(isSelected ? null : item.id)
                        }
                        onUpdate={(patch) => onUpdateItem(item.id, patch)}
                        onDelete={() => onDeleteItem(item.id)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedItem && (
        <div className="sticky top-6">
          <ItemEditorPanel
            item={selectedItem}
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
            onSuggestPrice={() => onSuggestPrice(selectedItem)}
            priceLoading={priceLoading}
            priceSuggestion={priceSuggestion}
          />
        </div>
      )}
    </div>
  );
}

function MenuItemRow({
  item,
  isSelected,
  canEdit,
  onSelect,
  onUpdate,
  onDelete,
}: {
  item: MenuItemWithCogs;
  isSelected: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<MenuItemWithCogs>) => void;
  onDelete: () => void;
}) {
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

  return (
    <div
      className={`flex items-center gap-3 px-5 py-3 transition-colors cursor-pointer hover:bg-[#faf9f7] ${
        isSelected
          ? "border-l-2 border-[#155e63] bg-[#f0f8f8]"
          : "border-l-2 border-transparent"
      }`}
      onClick={onSelect}
    >
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
          <span
            className="text-sm font-medium text-[#1a1a1a] truncate block"
            onClick={onSelect}
          >
            {item.name || (
              <span className="text-[#afafaf] font-normal">Unnamed item</span>
            )}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {cogs > 0 && (
          <span className="text-[10px] font-medium text-[#6b6b6b] bg-[#f5f5f5] border border-[#efefef] px-2 py-0.5 rounded-full">
            COGS {formatCents(cogs)}
          </span>
        )}
        {item.price_cents > 0 && (
          <span className="text-[10px] font-semibold text-[#155e63] bg-[#e8f4f5] border border-[#c5e2e3] px-2 py-0.5 rounded-full">
            {formatCents(item.price_cents)}
          </span>
        )}
        {canEdit && (
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
        )}
        {canEdit && (
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
        )}
      </div>
    </div>
  );
}

type Tab = "menu" | "ingredients";

export function MenuWorkspace({
  planId,
  canEdit,
  initialTrialMessagesUsed,
  initialItems,
  initialIngredients,
  initialItemIngredients,
}: Props) {
  const [items, setItems] = useState<MenuItemWithCogs[]>(initialItems);
  const [ingredients, setIngredients] =
    useState<MenuIngredient[]>(initialIngredients);
  const [itemIngredients, setItemIngredients] = useState<MenuItemIngredient[]>(
    initialItemIngredients
  );
  const [activeTab, setActiveTab] = useState<Tab>("menu");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceSuggestion, setPriceSuggestion] =
    useState<PriceSuggestion | null>(null);

  const tabs: { id: Tab; label: string; Icon: typeof Utensils }[] = [
    { id: "menu", label: "Menu", Icon: Utensils },
    { id: "ingredients", label: "Ingredients", Icon: Package },
  ];

  async function addItem(category: MenuCategory) {
    const optimistic: MenuItemWithCogs = {
      id: makeLocalId(),
      plan_id: planId,
      position: items.length,
      name: "",
      category,
      price_cents: 0,
      cogs_cents: null,
      expected_mix_pct: 0,
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
        plan_id: planId,
        name: "",
        category,
        position: items.length,
        price_cents: 0,
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as MenuItemWithCogs;
      const withCogs: MenuItemWithCogs = {
        ...created,
        computed_cogs_cents: created.computed_cogs_cents ?? 0,
      };
      setItems((prev) =>
        prev.map((i) => (i.id === optimistic.id ? withCogs : i))
      );
      setSelectedItemId(withCogs.id);
    } else {
      setItems((prev) => prev.filter((i) => i.id !== optimistic.id));
    }
  }

  async function updateItem(id: string, patch: Partial<MenuItemWithCogs>) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...patch } : i))
    );
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
    const res = await fetch(
      `/api/workspaces/menu-pricing/items?id=${id}`,
      { method: "DELETE" }
    );
    if (!res.ok) setItems(prev);
  }

  async function addIngredient() {
    const optimistic: MenuIngredient = {
      id: makeLocalId(),
      plan_id: planId,
      name: "New ingredient",
      package_size: 1,
      package_unit: "g",
      package_cost_cents: 0,
      vendor_id: null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setIngredients((prev) => [...prev, optimistic]);

    const res = await fetch("/api/workspaces/menu-pricing/ingredients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: planId,
        name: "New ingredient",
        package_size: 1,
        package_unit: "g",
        package_cost_cents: 0,
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as MenuIngredient;
      setIngredients((prev) =>
        prev.map((i) => (i.id === optimistic.id ? created : i))
      );
    } else {
      setIngredients((prev) => prev.filter((i) => i.id !== optimistic.id));
    }
  }

  async function updateIngredient(id: string, patch: Partial<MenuIngredient>) {
    setIngredients((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...patch } : i))
    );
    await fetch("/api/workspaces/menu-pricing/ingredients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if ("package_cost_cents" in patch || "package_size" in patch) {
      const r = await fetch("/api/workspaces/menu-pricing/items");
      if (r.ok) {
        const data = (await r.json()) as MenuItemWithCogs[];
        setItems(data);
      }
    }
  }

  async function deleteIngredient(id: string) {
    const prev = ingredients;
    setIngredients((p) => p.filter((i) => i.id !== id));
    setItemIngredients((p) => p.filter((ii) => ii.ingredient_id !== id));
    const res = await fetch(
      `/api/workspaces/menu-pricing/ingredients?id=${id}`,
      { method: "DELETE" }
    );
    if (!res.ok) setIngredients(prev);
  }

  async function addRecipeLine(
    menuItemId: string,
    ingredientId: string,
    amount: number,
    unit: string
  ) {
    const optimistic: MenuItemIngredient = {
      id: makeLocalId(),
      menu_item_id: menuItemId,
      ingredient_id: ingredientId,
      amount,
      unit: unit as MenuItemIngredient["unit"],
      created_at: new Date().toISOString(),
    };
    setItemIngredients((prev) => [...prev, optimistic]);

    const res = await fetch("/api/workspaces/menu-pricing/item-ingredients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menu_item_id: menuItemId,
        ingredient_id: ingredientId,
        amount,
        unit,
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as MenuItemIngredient;
      setItemIngredients((prev) =>
        prev.map((ii) => (ii.id === optimistic.id ? created : ii))
      );
      const r = await fetch("/api/workspaces/menu-pricing/items");
      if (r.ok) {
        const data = (await r.json()) as MenuItemWithCogs[];
        setItems(data);
      }
    } else {
      setItemIngredients((prev) =>
        prev.filter((ii) => ii.id !== optimistic.id)
      );
    }
  }

  async function updateRecipeLine(
    id: string,
    patch: { amount?: number; unit?: string }
  ) {
    const typedPatch: Partial<MenuItemIngredient> = {
      ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
      ...(patch.unit !== undefined
        ? { unit: patch.unit as MenuItemIngredient["unit"] }
        : {}),
    };
    setItemIngredients((prev) =>
      prev.map((ii) => (ii.id === id ? { ...ii, ...typedPatch } : ii))
    );
    await fetch("/api/workspaces/menu-pricing/item-ingredients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const r = await fetch("/api/workspaces/menu-pricing/items");
    if (r.ok) {
      const data = (await r.json()) as MenuItemWithCogs[];
      setItems(data);
    }
  }

  async function deleteRecipeLine(id: string) {
    const prev = itemIngredients;
    setItemIngredients((p) => p.filter((ii) => ii.id !== id));
    const res = await fetch(
      `/api/workspaces/menu-pricing/item-ingredients?id=${id}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      setItemIngredients(prev);
    } else {
      const r = await fetch("/api/workspaces/menu-pricing/items");
      if (r.ok) {
        const data = (await r.json()) as MenuItemWithCogs[];
        setItems(data);
      }
    }
  }

  async function suggestPrice(item: MenuItemWithCogs) {
    setPriceLoading(true);
    setPriceSuggestion(null);

    const recipeLines = itemIngredients.filter(
      (ii) => ii.menu_item_id === item.id
    );
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
          cogs_cents: cogsCents,
          concept_type: "specialty",
          market: "US",
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

  const handleSelectItem = useCallback((id: string | null) => {
    setSelectedItemId(id);
    setPriceSuggestion(null);
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
            planId={planId}
            canEdit={canEdit}
            items={items}
            ingredients={ingredients}
            itemIngredients={itemIngredients}
            selectedItemId={selectedItemId}
            onSelectItem={handleSelectItem}
            onAddItem={addItem}
            onUpdateItem={updateItem}
            onDeleteItem={deleteItem}
            onAddRecipeLine={addRecipeLine}
            onUpdateRecipeLine={updateRecipeLine}
            onDeleteRecipeLine={deleteRecipeLine}
            onSuggestPrice={suggestPrice}
            priceLoading={priceLoading}
            priceSuggestion={priceSuggestion}
          />
        )}

        {activeTab === "ingredients" && (
          <IngredientsTab
            planId={planId}
            canEdit={canEdit}
            ingredients={ingredients}
            onAddIngredient={addIngredient}
            onUpdateIngredient={updateIngredient}
            onDeleteIngredient={deleteIngredient}
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
