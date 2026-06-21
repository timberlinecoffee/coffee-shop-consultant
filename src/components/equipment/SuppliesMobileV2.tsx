"use client";

// TIM-2779 (Phase 6): v2 Supplies surface — card-per-item mobile layout.
// Mirrors EquipmentMobileV2's pattern, adapted for SuppliesItem fields.
// Renders below md when ui_revamp_v2 is on; desktop uses SuppliesDesktopTable.

import { useMemo, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import type { ListSection, SuppliesItem } from "@/types/buildout";
import { formatMinor } from "@/lib/formatters";

interface Props {
  items: SuppliesItem[];
  sections: ListSection[];
  currencyCode: string;
}

export function SuppliesMobileV2({ items, sections, currencyCode }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const sectionsById = useMemo(() => {
    const map = new Map<string, ListSection>();
    for (const s of sections) map.set(s.id, s);
    return map;
  }, [sections]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, SuppliesItem[]>();
    const order: string[] = [];
    const active = items.filter((i) => !i.archived);
    active.sort((a, b) => a.position - b.position);
    for (const it of active) {
      const key = it.section_id ?? "__unsectioned__";
      if (!buckets.has(key)) {
        buckets.set(key, []);
        order.push(key);
      }
      buckets.get(key)!.push(it);
    }
    return order.map((key) => ({
      sectionId: key,
      label:
        key === "__unsectioned__"
          ? "Unsectioned"
          : sectionsById.get(key)?.name ?? "Unsectioned",
      items: buckets.get(key)!,
    }));
  }, [items, sectionsById]);

  const total = useMemo(
    () =>
      items
        .filter((i) => !i.archived)
        .reduce((sum, i) => sum + i.unit_cost_cents * Math.max(1, i.quantity), 0),
    [items]
  );

  const openItem = openId ? items.find((i) => i.id === openId) ?? null : null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-100)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--teal)]">
          Startup Total
        </p>
        <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">
          {formatMinor(total, currencyCode)}
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          {items.filter((i) => !i.archived).length} items across {grouped.length} section
          {grouped.length === 1 ? "" : "s"}
        </p>
      </div>

      {grouped.map((group) => (
        <section key={group.sectionId} aria-labelledby={`sec-${group.sectionId}`}>
          <h2
            id={`sec-${group.sectionId}`}
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
          >
            {group.label}
          </h2>
          <ul className="space-y-2">
            {group.items.map((it) => (
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
                        {it.name || "Untitled Item"}
                      </p>
                      <p className="shrink-0 text-sm font-semibold text-[var(--foreground)]">
                        {formatMinor(
                          it.unit_cost_cents * Math.max(1, it.quantity),
                          currencyCode
                        )}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                      {it.unit_type}
                      {it.vendor ? ` · ${it.vendor}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {it.quantity} × {formatMinor(it.unit_cost_cents, currencyCode)}
                    </p>
                  </div>
                  <ChevronRight
                    size={16}
                    className="shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {grouped.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">No supplies yet.</p>
        </div>
      )}

      {openItem && (
        <SuppliesDetailSheet
          item={openItem}
          sectionLabel={
            openItem.section_id
              ? sectionsById.get(openItem.section_id)?.name ?? "Unsectioned"
              : "Unsectioned"
          }
          currencyCode={currencyCode}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function SuppliesDetailSheet({
  item,
  sectionLabel,
  currencyCode,
  onClose,
}: {
  item: SuppliesItem;
  sectionLabel: string;
  currencyCode: string;
  onClose: () => void;
}) {
  const total = item.unit_cost_cents * Math.max(1, item.quantity);
  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Section", value: sectionLabel },
    { label: "Vendor", value: item.vendor },
    { label: "Unit Type", value: item.unit_type },
    { label: "Quantity", value: String(item.quantity) },
    { label: "Unit Cost", value: formatMinor(item.unit_cost_cents, currencyCode) },
    { label: "Total Cost", value: formatMinor(total, currencyCode) },
    { label: "Notes", value: item.notes },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supplies-detail-title"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p
              id="supplies-detail-title"
              className="truncate text-base font-semibold text-[var(--foreground)]"
            >
              {item.name || "Untitled Item"}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              {sectionLabel}
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
                {row.value && row.value.trim() ? row.value : (
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
