"use client";

// TIM-2780 (Phase 6): v2 Menu-pricing surface — card-per-item mobile layout.
// Mirrors EquipmentMobileV2/SuppliesMobileV2 pattern, adapted for MenuItemWithCogs.
// Renders below md when ui_revamp_v2 is on; desktop keeps the existing category
// accordion with drag-to-reorder.

import { useMemo, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import type { MenuItemWithCogs, MenuCategory } from "@/lib/menu";
import { formatMinor, fmtPct } from "@/lib/formatters";

const POPULARITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

interface Props {
  items: MenuItemWithCogs[];
  categories: MenuCategory[];
  currencyCode: string;
}

export function MenuMobileV2({ items, categories, currencyCode }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const categoriesById = useMemo(() => {
    const map = new Map<string, MenuCategory>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const activeItems = useMemo(
    () => items.filter((i) => !i.archived).sort((a, b) => a.position - b.position),
    [items]
  );

  const grouped = useMemo(() => {
    const buckets = new Map<string, MenuItemWithCogs[]>();
    const order: string[] = [];
    for (const cat of categories) {
      buckets.set(cat.id, []);
      order.push(cat.id);
    }
    for (const it of activeItems) {
      const key = it.category_id;
      if (!buckets.has(key)) {
        buckets.set(key, []);
        order.push(key);
      }
      buckets.get(key)!.push(it);
    }
    return order
      .filter((key) => (buckets.get(key)?.length ?? 0) > 0)
      .map((key) => ({
        categoryId: key,
        label: categoriesById.get(key)?.name ?? "Uncategorized",
        items: buckets.get(key)!,
      }));
  }, [activeItems, categories, categoriesById]);

  const avgPriceCents = useMemo(() => {
    const priced = activeItems.filter((i) => i.price_cents > 0);
    if (priced.length === 0) return 0;
    return Math.round(priced.reduce((sum, i) => sum + i.price_cents, 0) / priced.length);
  }, [activeItems]);

  const avgGpPct = useMemo(() => {
    const costed = activeItems.filter(
      (i) => i.price_cents > 0 && (i.computed_cogs_cents > 0 || (i.cogs_cents ?? 0) > 0)
    );
    if (costed.length === 0) return null;
    const total = costed.reduce((sum, i) => {
      const cogs = i.computed_cogs_cents > 0 ? i.computed_cogs_cents : (i.cogs_cents ?? 0);
      return sum + (i.price_cents - cogs) / i.price_cents;
    }, 0);
    return total / costed.length;
  }, [activeItems]);

  const openItem = openId ? activeItems.find((i) => i.id === openId) ?? null : null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-100)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--teal)]">
          Menu Overview
        </p>
        <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">
          {activeItems.length} item{activeItems.length === 1 ? "" : "s"}
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          {avgPriceCents > 0 ? `Avg price ${formatMinor(avgPriceCents, currencyCode)}` : "No prices set"}
          {avgGpPct !== null ? ` · Avg GP ${fmtPct(avgGpPct)}` : ""}
        </p>
      </div>

      {grouped.map((group) => (
        <section key={group.categoryId} aria-labelledby={`cat-${group.categoryId}`}>
          <h2
            id={`cat-${group.categoryId}`}
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
          >
            {group.label}
          </h2>
          <ul className="space-y-2">
            {group.items.map((it) => {
              const cogs =
                it.computed_cogs_cents > 0 ? it.computed_cogs_cents : (it.cogs_cents ?? 0);
              const gpPct =
                it.price_cents > 0 && cogs > 0
                  ? (it.price_cents - cogs) / it.price_cents
                  : null;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(it.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left transition-colors hover:border-[var(--teal-tint)] hover:bg-[var(--teal-tint-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] focus-visible:ring-offset-1"
                    aria-label={`Open details for ${it.name}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                          {it.name || "Unnamed Item"}
                        </p>
                        <p className="shrink-0 text-sm font-semibold text-[var(--foreground)]">
                          {it.price_cents > 0
                            ? formatMinor(it.price_cents, currencyCode)
                            : <span className="text-[var(--muted-foreground)] font-normal">No price</span>}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                        {group.label}
                        {gpPct !== null ? ` · ${fmtPct(gpPct)} GP` : ""}
                        {it.expected_popularity
                          ? ` · ${POPULARITY_LABELS[it.expected_popularity] ?? it.expected_popularity} popularity`
                          : ""}
                      </p>
                    </div>
                    <ChevronRight
                      size={16}
                      className="shrink-0 text-[var(--muted-foreground)]"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {grouped.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">No menu items yet.</p>
        </div>
      )}

      {openItem && (
        <MenuItemDetailSheet
          item={openItem}
          categoryLabel={categoriesById.get(openItem.category_id)?.name ?? "Uncategorized"}
          currencyCode={currencyCode}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function MenuItemDetailSheet({
  item,
  categoryLabel,
  currencyCode,
  onClose,
}: {
  item: MenuItemWithCogs;
  categoryLabel: string;
  currencyCode: string;
  onClose: () => void;
}) {
  const cogs =
    item.computed_cogs_cents > 0 ? item.computed_cogs_cents : (item.cogs_cents ?? 0);
  const gpCents = item.price_cents > 0 && cogs > 0 ? item.price_cents - cogs : null;
  const gpPct =
    item.price_cents > 0 && cogs > 0
      ? (item.price_cents - cogs) / item.price_cents
      : null;

  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Category", value: categoryLabel },
    {
      label: "Price",
      value: item.price_cents > 0 ? formatMinor(item.price_cents, currencyCode) : null,
    },
    {
      label: "COGS",
      value: cogs > 0 ? formatMinor(cogs, currencyCode) : null,
    },
    {
      label: "Gross Profit",
      value: gpCents !== null ? formatMinor(gpCents, currencyCode) : null,
    },
    {
      label: "GP %",
      value: gpPct !== null ? fmtPct(gpPct) : null,
    },
    {
      label: "Popularity",
      value: item.expected_popularity
        ? (POPULARITY_LABELS[item.expected_popularity] ?? item.expected_popularity)
        : null,
    },
    { label: "Notes", value: item.notes },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-item-detail-title"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p
              id="menu-item-detail-title"
              className="truncate text-base font-semibold text-[var(--foreground)]"
            >
              {item.name || "Unnamed Item"}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              {categoryLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <dl className="divide-y divide-[var(--border)] px-5">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-start justify-between gap-3 py-3"
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                {row.label}
              </dt>
              <dd className="max-w-[60%] text-right text-sm text-[var(--foreground)]">
                {row.value && row.value.trim() ? (
                  row.value
                ) : (
                  <span className="text-[var(--muted-foreground)]">—</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-[var(--border)] px-5 py-4">
          <p className="text-xs text-[var(--muted-foreground)]">
            Edits are available on the desktop view.
          </p>
        </div>
      </div>
    </div>
  );
}
