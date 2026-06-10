"use client";

// TIM-2596 (Phase 5.8): v2 Suppliers mobile surface — card-per-vendor layout.
// Renders at <md viewports when ui_revamp_v2 is on; v1 table keeps rendering
// at md+. Tap a card → slide-up detail sheet (placeholder for TIM-2592
// BottomSheet) with full row detail + inline editable status, contact, notes.
//
// Supports tap-to-edit per acceptance criteria.

import { useState } from "react";
import { ChevronRight, X } from "lucide-react";
import type { VendorCandidate, VendorCategoryId, VendorStatus } from "@/lib/suppliers";

const STATUS_LABELS: Record<VendorStatus, string> = {
  researching: "Researching",
  shortlisted: "Shortlisted",
  chosen: "Chosen",
  rejected: "Rejected",
};

const STATUS_DOT: Record<VendorStatus, string> = {
  researching: "bg-[var(--muted-foreground)]",
  shortlisted: "bg-amber-400",
  chosen: "bg-[var(--teal)]",
  rejected: "bg-[var(--error)]",
};

const STATUS_BADGE: Record<VendorStatus, string> = {
  researching: "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]",
  shortlisted: "bg-amber-50 text-amber-700 border-amber-200",
  chosen: "bg-[var(--teal-bg-palest)] text-[var(--teal)] border-[var(--teal-tint)]",
  rejected: "bg-[var(--error-bg-5)] text-[var(--error)] border-[var(--error-bg-13)]",
};

interface Props {
  candidates: VendorCandidate[];
  allCategoryIds: VendorCategoryId[];
  labelFor: (id: VendorCategoryId) => string;
  canEdit: boolean;
  onFieldChange: (id: string, field: keyof VendorCandidate, value: string) => void;
  onStatusChange: (candidate: VendorCandidate, status: VendorStatus) => void;
}

export function SuppliersMobileV2({
  candidates,
  allCategoryIds,
  labelFor,
  canEdit,
  onFieldChange,
  onStatusChange,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const openItem = openId ? candidates.find((c) => c.id === openId) ?? null : null;

  const grouped = allCategoryIds.map((catId) => ({
    catId,
    label: labelFor(catId),
    items: candidates.filter((c) => c.category === catId),
  })).filter((g) => g.items.length > 0);

  const total = candidates.length;
  const chosenCount = candidates.filter((c) => c.status === "chosen").length;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-100)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--teal)]">
          Suppliers Overview
        </p>
        <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">
          {chosenCount} chosen
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          {total} vendor{total === 1 ? "" : "s"} across {grouped.length} categor{grouped.length === 1 ? "y" : "ies"}
        </p>
      </div>

      {grouped.map((group) => (
        <section key={group.catId} aria-labelledby={`sec-${group.catId}`}>
          <h2
            id={`sec-${group.catId}`}
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
          >
            {group.label}
          </h2>
          <ul className="space-y-2">
            {group.items.map((vendor) => (
              <li key={vendor.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(vendor.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left transition-colors hover:border-[var(--teal-tint)] hover:bg-[var(--teal-tint-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] focus-visible:ring-offset-1"
                  aria-label={`Open details for ${vendor.name || "Unnamed vendor"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[vendor.status]}`}
                        aria-hidden="true"
                      />
                      <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                        {vendor.name || "Unnamed vendor"}
                      </p>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[vendor.status]}`}
                      >
                        {STATUS_LABELS[vendor.status]}
                      </span>
                      {vendor.contact && (
                        <p className="truncate text-xs text-[var(--muted-foreground)]">
                          {vendor.contact}
                        </p>
                      )}
                    </div>
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
        </div>
      )}

      {openItem && (
        <VendorDetailSheet
          vendor={openItem}
          categoryLabel={labelFor(openItem.category)}
          canEdit={canEdit}
          onFieldChange={onFieldChange}
          onStatusChange={onStatusChange}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function VendorDetailSheet({
  vendor,
  categoryLabel,
  canEdit,
  onFieldChange,
  onStatusChange,
  onClose,
}: {
  vendor: VendorCandidate;
  categoryLabel: string;
  canEdit: boolean;
  onFieldChange: (id: string, field: keyof VendorCandidate, value: string) => void;
  onStatusChange: (candidate: VendorCandidate, status: VendorStatus) => void;
  onClose: () => void;
}) {
  const inputCls =
    "w-full rounded-lg border border-[var(--border-medium)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vendor-detail-title"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p
              id="vendor-detail-title"
              className="truncate text-base font-semibold text-[var(--foreground)]"
            >
              {vendor.name || "Unnamed vendor"}
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

        <div className="divide-y divide-[var(--border)] px-5 py-2">
          {/* Status selector */}
          <div className="py-3">
            <label className="block text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)] mb-1.5">
              Status
            </label>
            <div className="flex flex-wrap gap-2">
              {(["researching", "shortlisted", "chosen", "rejected"] as VendorStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onStatusChange(vendor, s)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    vendor.status === s
                      ? STATUS_BADGE[s] + " font-semibold"
                      : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--teal-tint)] hover:text-[var(--foreground)]"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="py-3">
            <label
              htmlFor="vendor-name"
              className="block text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)] mb-1.5"
            >
              Name
            </label>
            <input
              id="vendor-name"
              type="text"
              className={inputCls}
              value={vendor.name ?? ""}
              disabled={!canEdit}
              onChange={(e) => onFieldChange(vendor.id, "name", e.target.value)}
              placeholder="Vendor name"
            />
          </div>

          {/* Contact */}
          <div className="py-3">
            <label
              htmlFor="vendor-contact"
              className="block text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)] mb-1.5"
            >
              Contact
            </label>
            <input
              id="vendor-contact"
              type="text"
              className={inputCls}
              value={vendor.contact ?? ""}
              disabled={!canEdit}
              onChange={(e) => onFieldChange(vendor.id, "contact", e.target.value)}
              placeholder="Email, phone, or website"
            />
          </div>

          {/* Read-only detail rows */}
          {[
            { label: "Price / Unit", value: vendor.price_per_unit },
            { label: "Minimum Order", value: vendor.minimum_order },
            { label: "Lead Time", value: vendor.lead_time },
          ].map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3 py-3">
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

          {/* Notes */}
          <div className="py-3">
            <label
              htmlFor="vendor-notes"
              className="block text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)] mb-1.5"
            >
              Notes
            </label>
            <textarea
              id="vendor-notes"
              className={inputCls + " resize-none"}
              rows={3}
              value={vendor.notes ?? ""}
              disabled={!canEdit}
              onChange={(e) => onFieldChange(vendor.id, "notes", e.target.value)}
              placeholder="Notes about this vendor"
            />
          </div>
        </div>

        <div className="border-t border-[var(--border)] px-5 py-4">
          <p className="text-xs text-[var(--muted-foreground)]">
            More options available in the full desktop view.
          </p>
        </div>
      </div>
    </div>
  );
}
