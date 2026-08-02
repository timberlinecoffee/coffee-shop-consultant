"use client";

// TIM-4110: the Insights tab, lifted out of menu-workspace.tsx. See
// menu-ingredients-tab.tsx for why the file was split. Move, not a rewrite.

"use client";

// TIM-967: Menu & Pricing workspace — drink overview, recipe builder, ingredient costing, AI price suggestion.
// TIM-1020: searchable ingredient combobox, COGS+GP on overview rows, concept-aware price suggestion.
// TIM-1140: editable per-plan categories, drag/drop item reorder + move between categories,
// workspace + per-category aggregate metrics (avg COGS%, avg GP%), category-level default
// ingredients (amortized disposables), 'piece' unit, badge-styled category UX on item card.

import { useState, useMemo } from "react";
import {
  Utensils,
  LayoutGrid,
  TrendingUp,
  } from "lucide-react";
import { Illustration } from "@/components/illustrations/Illustration";
import { TABLE_CELL_TEXT } from "@/lib/workspace-table";
import { SectionHelp } from "@/components/ui/section-help";
import { SectionHeader } from "@/components/section-header";
// TIM-2482 (F13): menu-side reconciliation banner — shows menu blend vs
// Forecast Inputs avg ticket and offers a Sync action that opens the
// cross-suite resolver.
import {
  type MenuItemWithCogs,
  formatCents,
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
import { fmtPct, fmtIntegerPct } from "@/lib/formatters";

function MetricsBar({
  items,
  targetGrossMargin,
  canEdit,
  onUpdateTargetGrossMargin,
}: {
  items: MenuItemWithCogs[];
  targetGrossMargin: number;
  canEdit: boolean;
  onUpdateTargetGrossMargin: (next: number) => Promise<void>;
}) {
  const agg = aggregateMargins(items);
  return (
    <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-500)] px-5 py-3 flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
      {agg.count > 0 ? (
        <>
          <div>
            <span className="text-xs text-[var(--dark-grey)] font-semibold">Average Cost of Goods Sold</span>{" "}
            <span className="text-base font-bold text-[var(--foreground)] ml-1">{fmtPct((agg.avgCogsPct ?? 0) / 100)}</span>
          </div>
          <div>
            <span className="text-xs text-[var(--dark-grey)] font-semibold">Average Gross Profit</span>{" "}
            <span className="text-base font-bold text-[var(--teal)] ml-1">{fmtPct((agg.avgGpPct ?? 0) / 100)}</span>
          </div>
        </>
      ) : (
        <div className="text-[11px] text-[var(--muted-foreground)]">
          Add a priced item with recipe ingredients (or a manual COGS) to see workspace margin.
        </div>
      )}
      <TargetMarginControl
        value={targetGrossMargin}
        canEdit={canEdit}
        onUpdate={onUpdateTargetGrossMargin}
      />
      {agg.count > 0 && (
        <div className="text-[11px] text-[var(--muted-foreground)]">
          Unweighted simple mean across {agg.count} priced item{agg.count !== 1 ? "s" : ""} with COGS.
        </div>
      )}
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
  star: { cell: "border-[var(--teal-bg-lightest)] bg-[var(--sage-success-bg)]", badge: "bg-[var(--teal)] text-white", dot: "bg-[var(--teal)]" },
  plowhorse: { cell: "border-[var(--amber-bg-f0d)] bg-[var(--warning-bg-5)]", badge: "bg-[var(--warning-text-8)] text-white", dot: "bg-[var(--warning-text-8)]" },
  puzzle: { cell: "border-[var(--teal-tint)] bg-[var(--teal-tint-500)]", badge: "bg-[var(--teal-750)] text-white", dot: "bg-[var(--teal-750)]" },
  dog: { cell: "border-[var(--error-bg-14)] bg-[var(--warning-bg-15)]", badge: "bg-[var(--error-text)] text-white", dot: "bg-[var(--error-text)]" },
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
      className="text-xs bg-white border border-[var(--border-medium)] rounded-md px-1.5 py-1 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:opacity-50"
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

// TIM-1471: workspace-level target gross margin (default 75%) feeds MSRP in
// the Cost of Goods tab. Inline-editable so the owner can tune it without
// leaving the menu.
function TargetMarginControl({
  value,
  canEdit,
  onUpdate,
}: {
  value: number;
  canEdit: boolean;
  onUpdate: (next: number) => Promise<void>;
}) {
  // editingKey > 0 puts the control into edit mode. Each transition allocates a
  // fresh key so the input re-mounts and re-reads `value` (avoiding a sync
  // useEffect to keep draft state in step with the prop).
  const [editingKey, setEditingKey] = useState(0);
  const editing = editingKey > 0;

  return (
    <div className="inline-flex items-baseline gap-1">
      <span className="text-xs text-[var(--dark-grey)] font-semibold">
        Target Gross Margin
      </span>
      {editing ? (
        <TargetMarginInput
          key={editingKey}
          // eslint-disable-next-line no-restricted-syntax -- controlled input initial value (no `%` suffix); fmtIntegerPct adds the % which would land in the input
          initialPct={(value * 100).toFixed(0)}
          currentValue={value}
          onCommit={(next) => {
            if (next !== null && next !== value) onUpdate(next);
            setEditingKey(0);
          }}
        />
      ) : (
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setEditingKey((k) => k + 1)}
          className="text-base font-bold text-[var(--foreground)] ml-1 hover:underline decoration-dotted disabled:cursor-default disabled:no-underline"
          title={canEdit ? "Click to edit target gross margin" : "Target gross margin"}
        >
          {fmtIntegerPct(value)}
        </button>
      )}
    </div>
  );
}

function TargetMarginInput({
  initialPct,
  currentValue,
  onCommit,
}: {
  initialPct: string;
  currentValue: number;
  onCommit: (next: number | null) => void;
}) {
  const [draft, setDraft] = useState(initialPct);

  function commit() {
    const pct = parseFloat(draft);
    if (Number.isNaN(pct)) {
      onCommit(null);
      return;
    }
    const clamped = Math.min(Math.max(pct, 1), 99);
    onCommit(Math.round(clamped) / 100);
  }

  return (
    <input
      autoFocus
      type="number"
      min={1}
      max={99}
      step={1}
      className="w-12 ml-1 text-sm font-bold text-[var(--foreground)] bg-white border border-[var(--teal)] rounded px-1 py-0.5 text-right focus-visible:outline-none"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onCommit(currentValue);
      }}
    />
  );
}

export function InsightsTab({
  items,
  canEdit,
  onUpdateItem,
  onGoToMenu,
  targetGrossMargin,
  onUpdateTargetGrossMargin,
}: {
  items: MenuItemWithCogs[];
  canEdit: boolean;
  onUpdateItem: (id: string, patch: Partial<MenuItemWithCogs>) => Promise<void>;
  onGoToMenu: () => void;
  /** TIM-3150: metrics strip moved from main page to Insights tab. */
  targetGrossMargin: number;
  onUpdateTargetGrossMargin: (next: number) => Promise<void>;
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
      <div className="space-y-6">
        {/* TIM-3150: metrics strip moved from main page to Insights tab. */}
        <MetricsBar
          items={items}
          targetGrossMargin={targetGrossMargin}
          canEdit={canEdit}
          onUpdateTargetGrossMargin={onUpdateTargetGrossMargin}
        />
        <div className="rounded-xl border border-dashed border-[var(--teal-bg-750)] bg-[var(--teal-bg-faint)] px-6 py-10 text-center">
          {/* TIM-1585: Lane A empty-state line-art, with the icon as graceful fallback. */}
          <Illustration
            recipeId="empty-state-no-data"
            className="w-20 h-20 mx-auto mb-6"
            fallback={<LayoutGrid className="w-6 h-6 text-[var(--sage)] mx-auto mb-3" />}
          />
          <p className="text-sm font-semibold text-[var(--foreground)] mb-1">No items to analyze yet</p>
          <p className="text-xs text-[var(--muted-foreground)] max-w-md mx-auto leading-relaxed">
            Add a few drinks or food items with a price, a cost, and an expected
            popularity. We will sort them into what to feature, re-price, promote,
            or rethink.
          </p>
          <button
            type="button"
            onClick={onGoToMenu}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--teal)] bg-[var(--teal-bg-f0f8)] border border-[var(--teal-tint)] px-3 py-2 rounded-lg hover:bg-[var(--teal-bg-450)] transition-colors"
          >
            <Utensils size={13} /> Go to the menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* TIM-3150: metrics strip moved from main page to Insights tab. */}
      <MetricsBar
        items={items}
        targetGrossMargin={targetGrossMargin}
        canEdit={canEdit}
        onUpdateTargetGrossMargin={onUpdateTargetGrossMargin}
      />
      {/* Intro */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <LayoutGrid className="w-4 h-4 text-[var(--teal)]" />
          <h2 className="text-lg font-bold text-[var(--foreground)] leading-tight">What To Serve</h2>
          <SectionHelp title="What To Serve">Every item is sorted by two things: how profitable it is (your gross margin) and how popular you expect it to be. We split each one at your own menu average, so this is always relative to the rest of your menu.</SectionHelp>
        </div>
      </div>

      {/* Quadrant matrix */}
      {classified.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--teal-bg-750)] bg-[var(--teal-bg-faint)] px-5 py-4 text-xs text-[var(--muted-foreground)] leading-relaxed">
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
                <span className="text-[var(--muted-foreground)]">{counts[q]}</span>
              </span>
            ))}
          </div>

          {/* Axis-labeled 2x2 */}
          <div className="grid grid-cols-[1.25rem_1fr_1fr] gap-2 items-stretch">
            <div />
            <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--teal)] pb-0.5">
              Higher Margin
            </div>
            <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--teal)] pb-0.5">
              Lower Margin
            </div>

            {/* Row 1: more popular */}
            <div className="flex items-center justify-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--teal)] [writing-mode:vertical-rl] rotate-180">
                More Popular
              </span>
            </div>
            <QuadrantCell quadrant="star" items={itemsByQuadrant.star} />
            <QuadrantCell quadrant="plowhorse" items={itemsByQuadrant.plowhorse} />

            {/* Row 2: less popular */}
            <div className="flex items-center justify-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--teal)] [writing-mode:vertical-rl] rotate-180">
                Less Popular
              </span>
            </div>
            <QuadrantCell quadrant="puzzle" items={itemsByQuadrant.puzzle} />
            <QuadrantCell quadrant="dog" items={itemsByQuadrant.dog} />
          </div>

          {thresholds && (
            <p className="text-[11px] text-[var(--neutral-cool-650)] mt-3 leading-relaxed">
              Split points: items above {fmtIntegerPct(thresholds.avgMarginPct / 100)} gross
              margin count as higher margin, and items you rated at or above your
              average popularity count as more popular.
            </p>
          )}
        </div>
      )}

      {/* Margin ranking */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-4 h-4 text-[var(--teal)]" />
          <h2 className="text-lg font-bold text-[var(--foreground)] leading-tight">Margin Ranking</h2>
          <SectionHelp title="Margin Ranking">Your items from most to least profitable. Set each item&apos;s expected popularity here to place it on the grid above.</SectionHelp>
        </div>

        {ranking.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--teal-bg-750)] bg-[var(--teal-bg-faint)] px-5 py-4 text-xs text-[var(--muted-foreground)]">
            Add a price and a cost (recipe ingredients or a manual COGS) to an
            item to rank it by profitability.
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className={`w-full ${TABLE_CELL_TEXT}`}>
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] bg-[var(--background)] border-b border-[var(--border)]">
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
                      <tr key={r.id} className="border-b border-[var(--gray-200)] last:border-0 hover:bg-[var(--background)] transition-colors">
                        <td className="px-4 py-2 text-[var(--dark-grey)] tabular-nums">{idx + 1}</td>
                        <td className="px-2 py-2 font-medium text-[var(--foreground)]">
                          {r.name || <span className="text-[var(--dark-grey)] font-normal">Unnamed item</span>}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-[var(--teal)] font-semibold">{formatCents(r.priceCents)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-[var(--muted-foreground)]">{formatCents(r.cogsCents)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-[var(--foreground)]">{formatCents(r.gpCents)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-[var(--teal-bg-deep)] rounded-full overflow-hidden min-w-[40px]">
                              <div
                                className="h-full bg-[var(--teal)] rounded-full"
                                style={{ width: `${Math.max(0, Math.min(100, r.marginPct))}%` }}
                              />
                            </div>
                            <span className="tabular-nums text-[var(--foreground)] font-semibold w-10 text-right">
                              {fmtIntegerPct(r.marginPct / 100)}
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
                            <span className="text-[10px] text-[var(--dark-grey)]">Set popularity</span>
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
          <SectionHeader title={`Not Enough Info Yet (${needsInfo.length})`} headingLevel={3} />
          <div className="rounded-xl border border-[var(--border)] bg-white divide-y divide-[var(--gray-200)]">
            {needsInfo.map((n) => {
              const item = items.find((i) => i.id === n.id);
              const onlyPopularity = n.missing.length === 1 && n.missing[0] === "popularity";
              return (
                <div key={n.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--foreground)] break-words">
                      {n.name || <span className="text-[var(--dark-grey)] font-normal">Unnamed item</span>}
                    </p>
                    <p className="text-[11px] text-[var(--neutral-cool-650)]">
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
                      className="text-[11px] font-semibold text-[var(--teal)] hover:underline shrink-0"
                    >
                      Open Menu
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
          <span className="text-sm font-bold text-[var(--foreground)]">{meta.label}</span>
        </div>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${styles.badge}`}>
          {items.length}
        </span>
      </div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-semibold mb-1.5">
        {meta.tagline}
      </p>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {items.map((it) => (
            <span
              key={it.id}
              className="text-[11px] bg-white/70 border border-white text-[var(--foreground)] rounded-md px-1.5 py-0.5 break-words max-w-full"
            >
              {it.name || "Unnamed"}
            </span>
          ))}
        </div>
      )}
      <p className="text-[11px] text-[var(--gray-1200)] leading-relaxed mt-auto">{meta.recommendation}</p>
    </div>
  );
}
