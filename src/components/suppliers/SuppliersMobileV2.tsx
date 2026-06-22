"use client";

// TIM-2781 (Phase 6): Mobile card-per-supplier view for Suppliers workspace v2.
// Pattern: SuppliesMobileV2 — grouped by category, tap card → detail sheet.
// Renders at md:hidden when ui_revamp_v2 is on; desktop keeps the category nav + table.

import { useMemo, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import {
  VENDOR_CATEGORY_KEYS,
  VENDOR_CATEGORY_LABELS,
  isSeededCategoryKey,
  type VendorCandidate,
  type VendorCategoryId,
  type VendorCustomCategory,
  type VendorDecision,
  type VendorStatus,
} from "@/lib/suppliers";

const STATUS_LABELS: Record<VendorStatus, string> = {
  researching: "Researching",
  shortlisted: "Shortlisted",
  chosen: "Chosen",
  rejected: "Rejected",
};

const STATUS_BADGE: Record<VendorStatus, string> = {
  researching: "bg-[var(--gray-200)] text-[var(--muted-foreground)]",
  shortlisted: "bg-[var(--warning-bg-2)] text-[var(--warning-text-5)]",
  chosen: "bg-[var(--teal-bg-palest)] text-[var(--teal)]",
  rejected: "bg-[var(--error-bg-5)] text-[var(--error)]",
};

interface Props {
  candidates: VendorCandidate[];
  decisions: VendorDecision[];
  customCategories: VendorCustomCategory[];
}

export function SuppliersMobileV2({ candidates, decisions, customCategories }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const customById = useMemo(() => {
    const m = new Map<string, VendorCustomCategory>();
    for (const c of customCategories) m.set(c.key, c);
    return m;
  }, [customCategories]);

  const allCategoryIds: VendorCategoryId[] = useMemo(
    () => [...VENDOR_CATEGORY_KEYS, ...customCategories.map((c) => c.key as `custom:${string}`)],
    [customCategories]
  );

  function labelFor(id: VendorCategoryId): string {
    if (isSeededCategoryKey(id)) return VENDOR_CATEGORY_LABELS[id];
    return customById.get(id)?.label ?? "Custom Category";
  }

  const chosenDecisions = useMemo(() => {
    const m = new Map<VendorCategoryId, VendorDecision>();
    for (const d of decisions) {
      if (d.is_current) m.set(d.category, d);
    }
    return m;
  }, [decisions]);

  const grouped = useMemo(() => {
    const byCategory = new Map<VendorCategoryId, VendorCandidate[]>();
    for (const cat of allCategoryIds) byCategory.set(cat, []);
    for (const c of candidates) {
      const list = byCategory.get(c.category);
      if (list) list.push(c);
    }
    return allCategoryIds
      .map((id) => ({ id, label: labelFor(id), items: byCategory.get(id) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [candidates, allCategoryIds, customById]);

  const totalCandidates = candidates.length;
  const chosenCount = chosenDecisions.size;
  const totalCategories = allCategoryIds.length;

  const openCandidate = openId ? candidates.find((c) => c.id === openId) ?? null : null;

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-100)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--teal)]">
          Suppliers &amp; Vendors
        </p>
        <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">
          {totalCandidates} vendor{totalCandidates === 1 ? "" : "s"}
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          {chosenCount} of {totalCategories} {totalCategories === 1 ? "category" : "categories"} decided
        </p>
      </div>

      {/* Cards grouped by category */}
      {grouped.map((group) => (
        <section key={group.id} aria-labelledby={`cat-hd-${group.id}`}>
          <div className="mb-2 flex items-center justify-between">
            <h2
              id={`cat-hd-${group.id}`}
              className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
            >
              {group.label}
            </h2>
            {chosenDecisions.has(group.id) && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--teal)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--teal)]" aria-hidden="true" />
                Decided
              </span>
            )}
          </div>
          <ul className="space-y-2">
            {group.items.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(candidate.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left transition-colors hover:border-[var(--teal-tint)] hover:bg-[var(--teal-tint-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] focus-visible:ring-offset-1"
                  aria-label={`Open details for ${candidate.name || "Unnamed Vendor"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                        {candidate.name || "Unnamed Vendor"}
                      </p>
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[candidate.status]}`}
                      >
                        {STATUS_LABELS[candidate.status]}
                      </span>
                    </div>
                    {candidate.contact && (
                      <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                        {candidate.contact}
                      </p>
                    )}
                    {candidate.notes && (
                      <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                        {candidate.notes}
                      </p>
                    )}
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
          <p className="text-sm text-[var(--muted-foreground)]">No vendors yet.</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Add vendors or generate suggestions from the desktop view.
          </p>
        </div>
      )}

      {openCandidate && (
        <SupplierDetailSheet
          candidate={openCandidate}
          categoryLabel={labelFor(openCandidate.category)}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function SupplierDetailSheet({
  candidate,
  categoryLabel,
  onClose,
}: {
  candidate: VendorCandidate;
  categoryLabel: string;
  onClose: () => void;
}) {
  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Category", value: categoryLabel },
    { label: "Status", value: STATUS_LABELS[candidate.status] },
    { label: "Contact", value: candidate.contact },
    { label: "Price / Unit", value: candidate.price_per_unit },
    { label: "Minimum Order", value: candidate.minimum_order },
    { label: "Lead Time", value: candidate.lead_time },
    { label: "Notes", value: candidate.notes },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supplier-detail-title"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p
              id="supplier-detail-title"
              className="truncate text-base font-semibold text-[var(--foreground)]"
            >
              {candidate.name || "Unnamed Vendor"}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{categoryLabel}</p>
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
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)] shrink-0">
                {row.label}
              </dt>
              <dd className="max-w-[65%] text-right text-sm text-[var(--foreground)]">
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
