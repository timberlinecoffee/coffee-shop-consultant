"use client";

// TIM-3733: Finance COGS Menu-sync + Additional COGS sections.
// Visual references:
//   - SectionHeader.tsx (section headings)
//   - financials-v2.tsx AccordionSection (expandable category rows)
//   - workspace-table-rows.tsx SectionSubtotalRow / GrandTotalRow
//   - EquipmentGrid.tsx / SuppliesDesktopTable.tsx (inline add/edit/delete table)

import React, { useState, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  Plus,
  Trash2,
  Link2,
} from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { SectionSubtotalRow, GrandTotalRow } from "@/lib/workspace-table-rows";
import {
  TABLE_CELL_TEXT,
  TABLE_HEADER_TEXT,
  TABLE_ACTION_ICON_SIZE,
  TABLE_QUICK_ADD_ROW_CLS,
  TABLE_QUICK_ADD_INPUT_CLS,
} from "@/lib/workspace-table";
import {
  type AdditionalCogsItem,
  type MenuCogsCategoryGroup,
  menuItemMixWeight,
  formatCurrency,
} from "@/lib/financial-projection";

// ── helpers ──────────────────────────────────────────────────────────────────

export function computeCategoryMonthlyCogsCents(
  group: MenuCogsCategoryGroup,
  monthlyUnits: number
): number {
  const totalWeight = group.items.reduce((s, it) => s + menuItemMixWeight(it), 0);
  if (totalWeight === 0 || monthlyUnits <= 0) return 0;
  return Math.round(
    group.items.reduce((sum, it) => {
      const weight = menuItemMixWeight(it);
      const itemUnits = (monthlyUnits * weight) / totalWeight;
      return sum + itemUnits * it.computed_cogs_cents;
    }, 0)
  );
}

function newAdditionalCogsItem(): AdditionalCogsItem {
  return {
    id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    monthly_cost_cents: 0,
    notes: null,
  };
}

// ── MenuCogsSyncSection ───────────────────────────────────────────────────────

interface MenuCogsSyncSectionProps {
  canEdit: boolean;
  categoryGroups: MenuCogsCategoryGroup[];
  categoryUnits: Record<string, number>;
  onCategoryUnitsChange: (units: Record<string, number>) => void;
  syncedAt: string | null | undefined;
  isRefreshing: boolean;
  onSync: () => void;
  currencyCode: string;
}

export function MenuCogsSyncSection({
  canEdit,
  categoryGroups,
  categoryUnits,
  onCategoryUnitsChange,
  syncedAt,
  isRefreshing,
  onSync,
  currencyCode,
}: MenuCogsSyncSectionProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  function toggleCategory(key: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  }

  const sectionSubtotalCents = categoryGroups.reduce((sum, g) => {
    const units = categoryUnits[g.category_id ?? "__uncategorized__"] ?? 0;
    return sum + computeCategoryMonthlyCogsCents(g, units);
  }, 0);

  const isEmpty = categoryGroups.length === 0;

  const syncedLabel = syncedAt
    ? `Synced ${new Date(syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : null;

  return (
    <div className="mt-4">
      <SectionHeader
        title="Cost of Goods — from Menu"
        helpContent={
          <p className="text-xs text-[var(--muted-foreground)] max-w-xs">
            Monthly COGS from your menu items. Enter monthly units sold per category
            to compute cost. Items and costs come from the Menu workspace — edit
            recipes there.
          </p>
        }
        className="mb-2"
      />

      {/* Sync row */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2">
          {syncedLabel && (
            <span className="text-[10px] text-[var(--muted-foreground)]">{syncedLabel}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onSync}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-md px-2.5 py-1 hover:bg-[var(--teal-bg-100)] transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={11} className={isRefreshing ? "animate-spin" : ""} />
          Sync from Menu
        </button>
      </div>

      {isEmpty ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-5 text-center">
          <p className="text-xs text-[var(--muted-foreground)]">
            Add menu items in the{" "}
            <Link
              href="/workspace/menu-pricing"
              className="text-[var(--teal)] underline underline-offset-2 hover:opacity-80"
            >
              Menu workspace
            </Link>{" "}
            to see COGS here.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          <table className={`w-full ${TABLE_CELL_TEXT}`}>
            <thead>
              <tr className="bg-[var(--surface-warm-100)] border-b border-[var(--neutral-cool-200)]">
                <th className={`${TABLE_HEADER_TEXT} text-left px-3 py-1.5 w-1/2`}>Category</th>
                <th className={`${TABLE_HEADER_TEXT} text-right px-3 py-1.5 w-[140px]`}>
                  Monthly units
                </th>
                <th className={`${TABLE_HEADER_TEXT} text-right px-3 py-1.5`}>Monthly COGS</th>
              </tr>
            </thead>
            <tbody>
              {categoryGroups.map((group) => {
                const catKey = group.category_id ?? "__uncategorized__";
                const isExpanded = expandedCategories.has(catKey);
                const units = categoryUnits[catKey] ?? 0;
                const monthlyCogs = computeCategoryMonthlyCogsCents(group, units);
                const totalWeight = group.items.reduce(
                  (s, it) => s + menuItemMixWeight(it),
                  0
                );

                return (
                  <React.Fragment key={catKey}>
                    {/* Category header row */}
                    <tr
                      className="border-b border-[var(--neutral-cool-150)] hover:bg-[var(--background)] transition-colors"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleCategory(catKey)}
                            className="text-[var(--muted-foreground)] shrink-0 hover:text-[var(--foreground)] transition-colors"
                            aria-label={isExpanded ? "Collapse" : "Expand"}
                          >
                            {isExpanded ? (
                              <ChevronDown size={13} />
                            ) : (
                              <ChevronRight size={13} />
                            )}
                          </button>
                          <span className="font-medium text-[var(--foreground)]">
                            {group.category_name}
                          </span>
                          <span className="text-[10px] text-[var(--muted-foreground)] border border-[var(--border)] rounded px-1 py-0.5 ml-1 shrink-0">
                            {group.items.length} item{group.items.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={units || ""}
                          onChange={(e) => {
                            const val = Math.max(0, Math.round(parseFloat(e.target.value) || 0));
                            onCategoryUnitsChange({ ...categoryUnits, [catKey]: val });
                          }}
                          placeholder="0"
                          disabled={!canEdit}
                          className="w-20 text-xs text-right bg-white border border-[var(--teal-tint-cfe)] rounded-md px-2 py-1 text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors disabled:opacity-50 tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--teal)]">
                        {units > 0
                          ? formatCurrency(monthlyCogs / 100, currencyCode)
                          : <span className="text-[var(--muted-foreground)] font-normal">—</span>}
                      </td>
                    </tr>

                    {/* Per-item breakdown (expanded) */}
                    {isExpanded && group.items.map((item) => {
                      const itemWeight = menuItemMixWeight(item);
                      const itemUnits =
                        totalWeight > 0 && units > 0
                          ? (units * itemWeight) / totalWeight
                          : 0;
                      const itemMonthlyCogs = Math.round(itemUnits * item.computed_cogs_cents);
                      return (
                        <tr
                          key={item.id}
                          className="border-b border-[var(--neutral-cool-100)] bg-[var(--background)]"
                        >
                          <td className="pl-9 pr-3 py-1.5 text-[var(--muted-foreground)]">
                            {item.name}
                          </td>
                          <td className="px-3 py-1.5 text-right text-[var(--muted-foreground)] tabular-nums">
                            {itemUnits > 0 ? Math.round(itemUnits).toLocaleString() : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right text-[var(--muted-foreground)] tabular-nums">
                            {itemUnits > 0
                              ? formatCurrency(itemMonthlyCogs / 100, currencyCode)
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              <SectionSubtotalRow
                colSpan={3}
                label="Menu COGS subtotal"
                subtotalDisplay={formatCurrency(sectionSubtotalCents / 100, currencyCode)}
              />
            </tbody>
          </table>

          {/* Read-only attribution footer */}
          <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--border)] bg-[var(--background)]">
            <Link2 size={10} className="text-[var(--muted-foreground)] shrink-0" />
            <span className="text-[10px] text-[var(--muted-foreground)]">Synced from Menu</span>
            <Link
              href="/workspace/menu-pricing"
              className="text-[10px] text-[var(--teal)] hover:opacity-80 flex items-center gap-0.5 ml-1"
            >
              Edit in Menu workspace
              <ExternalLink size={9} className="inline" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AdditionalCogsSection ────────────────────────────────────────────────────

interface AdditionalCogsSectionProps {
  canEdit: boolean;
  items: AdditionalCogsItem[];
  onItemsChange: (items: AdditionalCogsItem[]) => void;
  currencyCode: string;
}

export function AdditionalCogsSection({
  canEdit,
  items,
  onItemsChange,
  currencyCode,
}: AdditionalCogsSectionProps) {
  const [draft, setDraft] = useState<AdditionalCogsItem | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  function startAdd() {
    setDraft(newAdditionalCogsItem());
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function commitDraft() {
    if (!draft || !draft.name.trim()) {
      setDraft(null);
      return;
    }
    onItemsChange([...items, { ...draft, name: draft.name.trim() }]);
    setDraft(null);
  }

  function deleteItem(id: string) {
    onItemsChange(items.filter((it) => it.id !== id));
  }

  function updateItem(id: string, patch: Partial<AdditionalCogsItem>) {
    onItemsChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  const subtotalCents = items.reduce((s, it) => s + (it.monthly_cost_cents || 0), 0);

  return (
    <div className="mt-4">
      <SectionHeader
        title="Additional Cost of Goods"
        helpContent={
          <p className="text-xs text-[var(--muted-foreground)] max-w-xs">
            Non-menu COGS: packaging, to-go supplies, cleaning products, etc.
            These are added here and do not appear in your Menu workspace.
          </p>
        }
        className="mb-2"
      />

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
        <table className={`w-full ${TABLE_CELL_TEXT}`}>
          <thead>
            <tr className="bg-[var(--surface-warm-100)] border-b border-[var(--neutral-cool-200)]">
              <th className={`${TABLE_HEADER_TEXT} text-left px-3 py-1.5`}>Item</th>
              <th className={`${TABLE_HEADER_TEXT} text-right px-3 py-1.5 w-[140px]`}>
                Monthly cost
              </th>
              <th className={`${TABLE_HEADER_TEXT} text-left px-3 py-1.5 w-[160px] hidden sm:table-cell`}>
                Notes
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !draft && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-4 text-center text-xs text-[var(--muted-foreground)]"
                >
                  No additional COGS items yet.
                </td>
              </tr>
            )}

            {items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-[var(--neutral-cool-150)] hover:bg-[var(--background)] transition-colors group"
              >
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateItem(item.id, { name: e.target.value })}
                    onBlur={(e) => updateItem(item.id, { name: e.target.value.trim() })}
                    disabled={!canEdit}
                    placeholder="Item name"
                    className="w-full text-xs bg-transparent border-0 outline-none text-[var(--foreground)] placeholder-[var(--muted-foreground)] disabled:opacity-70"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={item.monthly_cost_cents > 0 ? item.monthly_cost_cents / 100 : ""}
                    onChange={(e) => {
                      const val = Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100));
                      updateItem(item.id, { monthly_cost_cents: val });
                    }}
                    disabled={!canEdit}
                    placeholder="0.00"
                    className="w-24 text-xs text-right bg-transparent border-0 outline-none text-[var(--foreground)] tabular-nums disabled:opacity-70 focus:bg-white focus:border focus:border-[var(--teal)] focus:rounded focus:px-2 transition-all"
                  />
                </td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  <input
                    type="text"
                    value={item.notes ?? ""}
                    onChange={(e) => updateItem(item.id, { notes: e.target.value || null })}
                    disabled={!canEdit}
                    placeholder="Optional notes"
                    className="w-full text-xs bg-transparent border-0 outline-none text-[var(--muted-foreground)] placeholder-[var(--muted-foreground)] disabled:opacity-70"
                  />
                </td>
                <td className="px-2 py-2 text-right">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => deleteItem(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-[var(--muted-foreground)] hover:text-red-500 transition-all p-0.5"
                      aria-label="Delete item"
                    >
                      <Trash2 size={TABLE_ACTION_ICON_SIZE} />
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {/* Quick-add draft row */}
            {draft && (
              <tr
                className={TABLE_QUICK_ADD_ROW_CLS}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commitDraft();
                }}
              >
                <td className="px-3 py-2">
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitDraft();
                      if (e.key === "Escape") setDraft(null);
                    }}
                    placeholder="Item name"
                    className={TABLE_QUICK_ADD_INPUT_CLS}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={draft.monthly_cost_cents > 0 ? draft.monthly_cost_cents / 100 : ""}
                    onChange={(e) => {
                      const val = Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100));
                      setDraft({ ...draft, monthly_cost_cents: val });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitDraft();
                      if (e.key === "Escape") setDraft(null);
                    }}
                    placeholder="0.00"
                    className={`${TABLE_QUICK_ADD_INPUT_CLS} text-right w-24 tabular-nums`}
                  />
                </td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  <input
                    type="text"
                    value={draft.notes ?? ""}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitDraft();
                      if (e.key === "Escape") setDraft(null);
                    }}
                    placeholder="Optional notes"
                    className={TABLE_QUICK_ADD_INPUT_CLS}
                  />
                </td>
                <td />
              </tr>
            )}

            <SectionSubtotalRow
              colSpan={4}
              label="Additional COGS subtotal"
              subtotalDisplay={formatCurrency(subtotalCents / 100, currencyCode)}
            />
          </tbody>
        </table>

        {/* Add item footer */}
        {canEdit && !draft && (
          <button
            type="button"
            onClick={startAdd}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-[var(--teal)] hover:bg-[var(--teal-bg-100)] border-t border-[var(--border)] transition-colors"
          >
            <Plus size={11} />
            Add item
          </button>
        )}
      </div>
    </div>
  );
}

// ── CogsSectionsGrandTotal ───────────────────────────────────────────────────

interface CogsSectionsGrandTotalProps {
  menuSubtotalCents: number;
  additionalSubtotalCents: number;
  currencyCode: string;
}

export function CogsSectionsGrandTotal({
  menuSubtotalCents,
  additionalSubtotalCents,
  currencyCode,
}: CogsSectionsGrandTotalProps) {
  const total = menuSubtotalCents + additionalSubtotalCents;
  return (
    <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <table className="w-full">
        <tbody>
          <GrandTotalRow
            colSpan={1}
            label="Total COGS (monthly)"
            totalDisplay={formatCurrency(total / 100, currencyCode)}
          />
        </tbody>
      </table>
    </div>
  );
}
