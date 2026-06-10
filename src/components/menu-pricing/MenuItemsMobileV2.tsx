"use client";

// TIM-2596 (Phase 5.8): v2 Menu Items mobile surface — card-per-item layout.
// Renders at <md viewports when ui_revamp_v2 is on; v1 accordion keeps
// rendering at md+. Tap a card → slide-up detail sheet with name, price,
// COGS, gross margin, category, and popularity.

import { useState } from "react";
import { ChevronRight, X } from "lucide-react";
import type { MenuCategory, MenuItemWithCogs } from "@/lib/menu";
import { effectiveCogsCents } from "@/lib/menu";
import { formatMinor } from "@/lib/formatters";

interface Props {
  items: MenuItemWithCogs[];
  categories: MenuCategory[];
  currencyCode: string;
}

export function MenuItemsMobileV2({ items, categories, currencyCode }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const openItem = openId ? items.find((i) => i.id === openId) ?? null : null;

  const catById = new Map(categories.map((c) => [c.id, c]));

  const grouped = categories.map((cat) => ({
    cat,
    items: items
      .filter((i) => i.category_id === cat.id && !i.archived)
      .sort((a, b) => a.position - b.position),
  })).filter((g) => g.items.length > 0);

  const activeCount = items.filter((i) => !i.archived).length;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-100)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--teal)]">
          Menu Overview
        </p>
        <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">
          {activeCount} item{activeCount === 1 ? "" : "s"}
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Across {grouped.length} categor{grouped.length === 1 ? "y" : "ies"}
        </p>
      </div>

      {grouped.map((group) => (
        <section key={group.cat.id} aria-labelledby={`menu-sec-${group.cat.id}`}>
          <h2
            id={`menu-sec-${group.cat.id}`}
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
          >
            {group.cat.name}
          </h2>
          <ul className="space-y-2">
            {group.items.map((item) => {
              const cogs = effectiveCogsCents(item);
              const gm = item.price_cents > 0
                ? Math.round(((item.price_cents - cogs) / item.price_cents) * 100)
                : null;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(item.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left transition-colors hover:border-[var(--teal-tint)] hover:bg-[var(--teal-tint-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] focus-visible:ring-offset-1"
                    aria-label={`Open details for ${item.name || "Untitled item"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                          {item.name || "Untitled item"}
                        </p>
                        <p className="shrink-0 text-sm font-semibold text-[var(--teal)]">
                          {formatMinor(item.price_cents, currencyCode)}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                        {gm !== null ? `${gm}% margin` : "No COGS set"}
                        {item.expected_popularity
                          ? ` · ${item.expected_popularity} popularity`
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
          categoryName={catById.get(openItem.category_id)?.name ?? "Uncategorized"}
          currencyCode={currencyCode}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function MenuItemDetailSheet({
  item,
  categoryName,
  currencyCode,
  onClose,
}: {
  item: MenuItemWithCogs;
  categoryName: string;
  currencyCode: string;
  onClose: () => void;
}) {
  const cogs = effectiveCogsCents(item);
  const grossProfit = item.price_cents - cogs;
  const gm = item.price_cents > 0 ? (grossProfit / item.price_cents) * 100 : null;

  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Category", value: categoryName },
    { label: "Price", value: formatMinor(item.price_cents, currencyCode) },
    { label: "COGS", value: cogs > 0 ? formatMinor(cogs, currencyCode) : null },
    { label: "Gross Profit", value: grossProfit > 0 ? formatMinor(grossProfit, currencyCode) : null },
    { label: "Gross Margin", value: gm !== null ? `${Math.round(gm)}%` : null },
    {
      label: "Popularity",
      value: item.expected_popularity
        ? item.expected_popularity.charAt(0).toUpperCase() + item.expected_popularity.slice(1)
        : null,
    },
    {
      label: "Prep Time",
      value: item.prep_time_seconds
        ? `${Math.round(item.prep_time_seconds / 60)} min`
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
              {item.name || "Untitled item"}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{categoryName}</p>
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
            Edit this item in the full desktop view.
          </p>
        </div>
      </div>
    </div>
  );
}
