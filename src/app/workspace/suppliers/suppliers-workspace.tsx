"use client";

// TIM-1059: Suppliers & Vendors workspace — vendor categories with
// side-by-side comparison rows, decision capture on "chosen", and AI seed
// per category. Reuses the same shell language as Build-out & Equipment:
// teal accents, edit-in-place inputs, CoPilotDrawer, PaywallModal.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Truck, Plus, Sparkles, X, Trash2 } from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import {
  VENDOR_CATEGORY_KEYS,
  VENDOR_CATEGORY_LABELS,
  VENDOR_CATEGORY_SUBTITLES,
  type VendorCandidate,
  type VendorCategoryKey,
  type VendorDecision,
  type VendorStatus,
} from "@/lib/suppliers";

interface Props {
  planId: string;
  canEdit: boolean;
  initialCandidates: VendorCandidate[];
  initialDecisions: VendorDecision[];
  initialTrialMessagesUsed?: number;
}

const STATUS_LABELS: Record<VendorStatus, string> = {
  researching: "Researching",
  shortlisted: "Shortlisted",
  chosen: "Chosen",
  rejected: "Rejected",
};

const STATUS_BADGE: Record<VendorStatus, string> = {
  researching: "bg-[var(--gray-200)] text-[var(--muted-foreground)] border-[var(--neutral-cool-200)]",
  shortlisted: "bg-[var(--warning-bg-2)] text-[var(--warning-text-5)] border-[var(--warning-amber-bg-6)]",
  chosen: "bg-[var(--teal-bg-palest)] text-[var(--teal)] border-[var(--teal-tint)]",
  rejected: "bg-[var(--error-bg-5)] text-[var(--error)] border-[var(--error-bg-13)]",
};

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function SuppliersWorkspace({
  planId,
  canEdit,
  initialCandidates,
  initialDecisions,
  initialTrialMessagesUsed,
}: Props) {
  const [candidates, setCandidates] = useState<VendorCandidate[]>(initialCandidates);
  const [decisions, setDecisions] = useState<VendorDecision[]>(initialDecisions);
  const [activeCategory, setActiveCategory] = useState<VendorCategoryKey>("coffee_roaster");
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [seedingCategory, setSeedingCategory] = useState<VendorCategoryKey | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [reasonModal, setReasonModal] = useState<{
    candidate: VendorCandidate;
    reason: string;
  } | null>(null);

  const { promoteOnEdit } = useWorkspaceStatus();

  const candidatesByCategory = useMemo(() => {
    const map = new Map<VendorCategoryKey, VendorCandidate[]>();
    for (const cat of VENDOR_CATEGORY_KEYS) map.set(cat, []);
    for (const c of candidates) {
      const list = map.get(c.category);
      if (list) list.push(c);
    }
    return map;
  }, [candidates]);

  const decisionsByCategory = useMemo(() => {
    const map = new Map<VendorCategoryKey, VendorDecision>();
    for (const d of decisions) {
      if (d.is_current) map.set(d.category, d);
    }
    return map;
  }, [decisions]);

  const chosenCount = decisionsByCategory.size;
  const totalCategories = VENDOR_CATEGORY_KEYS.length;

  useEffect(() => {
    if (chosenCount > 0) promoteOnEdit("suppliers");
  }, [chosenCount, promoteOnEdit]);

  const persistCandidate = useMemo(
    () =>
      debounce(async (id: string, patch: Partial<VendorCandidate>) => {
        const res = await fetch(`/api/workspaces/suppliers/candidates/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.status === 402) setPaywallOpen(true);
      }, 500),
    []
  );

  const updateCandidateLocal = useCallback(
    (id: string, patch: Partial<VendorCandidate>) => {
      setCandidates((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      );
    },
    []
  );

  const handleFieldChange = useCallback(
    (id: string, field: keyof VendorCandidate, value: string) => {
      if (!canEdit) {
        setPaywallOpen(true);
        return;
      }
      const patch = { [field]: value || null } as Partial<VendorCandidate>;
      updateCandidateLocal(id, patch);
      void persistCandidate(id, patch);
    },
    [canEdit, persistCandidate, updateCandidateLocal]
  );

  const handleStatusChange = useCallback(
    async (candidate: VendorCandidate, nextStatus: VendorStatus) => {
      if (!canEdit) {
        setPaywallOpen(true);
        return;
      }
      // For "chosen" we capture an optional reason in a small modal.
      if (nextStatus === "chosen" && candidate.status !== "chosen") {
        setReasonModal({ candidate, reason: "" });
        return;
      }

      updateCandidateLocal(candidate.id, { status: nextStatus });
      const res = await fetch(`/api/workspaces/suppliers/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.status === 402) {
        setPaywallOpen(true);
        return;
      }
      // Refresh decisions when status leaves "chosen"
      if (candidate.status === "chosen") {
        const decRes = await fetch("/api/workspaces/suppliers/decisions");
        if (decRes.ok) setDecisions((await decRes.json()) as VendorDecision[]);
      }
    },
    [canEdit, updateCandidateLocal]
  );

  const submitChosen = useCallback(async () => {
    if (!reasonModal) return;
    const { candidate, reason } = reasonModal;
    updateCandidateLocal(candidate.id, { status: "chosen" });
    setReasonModal(null);
    const res = await fetch(`/api/workspaces/suppliers/candidates/${candidate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "chosen", reason: reason.trim() || null }),
    });
    if (res.status === 402) {
      setPaywallOpen(true);
      return;
    }
    const decRes = await fetch("/api/workspaces/suppliers/decisions");
    if (decRes.ok) setDecisions((await decRes.json()) as VendorDecision[]);
  }, [reasonModal, updateCandidateLocal]);

  const handleAddRow = useCallback(
    async (category: VendorCategoryKey) => {
      if (!canEdit) {
        setPaywallOpen(true);
        return;
      }
      const res = await fetch("/api/workspaces/suppliers/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, name: "" }),
      });
      if (res.status === 402) {
        setPaywallOpen(true);
        return;
      }
      if (!res.ok) return;
      const created = (await res.json()) as VendorCandidate;
      setCandidates((prev) => [...prev, created]);
    },
    [canEdit]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!canEdit) {
        setPaywallOpen(true);
        return;
      }
      setCandidates((prev) => prev.filter((c) => c.id !== id));
      await fetch(`/api/workspaces/suppliers/candidates/${id}`, { method: "DELETE" });
    },
    [canEdit]
  );

  const handleSeed = useCallback(
    async (category: VendorCategoryKey) => {
      if (!canEdit) {
        setPaywallOpen(true);
        return;
      }
      setSeedingCategory(category);
      setSeedError(null);
      try {
        const res = await fetch("/api/workspaces/suppliers/seed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category }),
        });
        if (res.status === 402) {
          setPaywallOpen(true);
          return;
        }
        if (!res.ok) throw new Error(`seed failed (${res.status})`);
        // Reload candidates for this category
        const reload = await fetch("/api/workspaces/suppliers/candidates");
        if (reload.ok) {
          setCandidates((await reload.json()) as VendorCandidate[]);
        }
      } catch {
        setSeedError("Could not generate suggestions. Try again.");
      } finally {
        setSeedingCategory(null);
      }
    },
    [canEdit]
  );

  const activeRows = candidatesByCategory.get(activeCategory) ?? [];
  const activeDecision = decisionsByCategory.get(activeCategory) ?? null;
  const showSeedBanner =
    activeRows.length === 0 ||
    (!activeRows.some((r) => r.source === "ai_suggested") && activeRows.length < 5);

  return (
    <div className="bg-[var(--background)] min-h-screen">
      <div className="max-w-6xl mx-auto px-6 pt-8 pb-16">
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-5 h-5 text-[var(--teal)] flex-shrink-0" aria-hidden="true" />
            <h1 className="font-bold text-[var(--foreground)]" style={{ fontSize: "28px" }}>
              Suppliers &amp; Vendors
            </h1>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            Shortlist vendors in each category, compare them side-by-side, and lock in the one you choose. Choices land in your concept brief.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
          {/* Category nav */}
          <nav className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden self-start">
            <ul className="divide-y divide-[var(--border)]">
              {VENDOR_CATEGORY_KEYS.map((key) => {
                const decision = decisionsByCategory.get(key);
                const rows = candidatesByCategory.get(key) ?? [];
                const isActive = key === activeCategory;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => setActiveCategory(key)}
                      className={`w-full text-left px-4 py-3 flex items-start justify-between gap-2 transition-colors ${
                        isActive
                          ? "bg-[var(--teal-tint-500)] border-l-2 border-l-[var(--teal)]"
                          : "border-l-2 border-l-transparent hover:bg-[var(--neutral-cool-50)]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-semibold ${
                            isActive ? "text-[var(--teal)]" : "text-[var(--foreground)]"
                          }`}
                        >
                          {VENDOR_CATEGORY_LABELS[key]}
                        </p>
                        <p className="text-[11px] text-[var(--dark-grey)] mt-0.5 truncate">
                          {decision
                            ? `Chosen: ${decision.vendor_name}`
                            : `${rows.length} candidate${rows.length === 1 ? "" : "s"}`}
                        </p>
                      </div>
                      {decision && (
                        <span className="mt-0.5 w-2 h-2 rounded-full bg-[var(--teal)] flex-shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="px-4 py-3 bg-[var(--neutral-cool-50)] text-[11px] text-[var(--muted-foreground)] border-t border-[var(--border)]">
              {chosenCount}/{totalCategories} categories decided
            </div>
          </nav>

          {/* Active category panel */}
          <section>
            <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
              <div className="px-5 pt-5 pb-4 border-b border-[var(--border)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-[var(--foreground)]">
                      {VENDOR_CATEGORY_LABELS[activeCategory]}
                    </h2>
                    <p className="text-xs text-[var(--dark-grey)] mt-0.5">
                      {VENDOR_CATEGORY_SUBTITLES[activeCategory]}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddRow(activeCategory)}
                    disabled={!canEdit || activeRows.length >= 5}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[var(--teal)] border border-[var(--teal)]/30 rounded-lg px-3 py-1.5 hover:bg-[var(--teal)]/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={12} aria-hidden="true" />
                    Add vendor
                  </button>
                </div>
                {activeDecision && (
                  <div className="mt-3 rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-500)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[var(--teal)] uppercase tracking-wide">
                          Decision logged
                        </p>
                        <p className="text-sm text-[var(--foreground)] mt-1">
                          <span className="font-semibold">{activeDecision.vendor_name}</span>
                          <span className="text-[var(--muted-foreground)]"> · {new Date(activeDecision.decided_on).toLocaleDateString()}</span>
                        </p>
                        {activeDecision.reason && (
                          <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">{activeDecision.reason}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {showSeedBanner && (
                <div className="px-5 pt-4">
                  <SeedBanner
                    canEdit={canEdit}
                    label={VENDOR_CATEGORY_LABELS[activeCategory]}
                    loading={seedingCategory === activeCategory}
                    error={seedError}
                    onSeed={() => handleSeed(activeCategory)}
                  />
                </div>
              )}

              {activeRows.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-[var(--dark-grey)]">
                  No candidates yet. Add a vendor or generate suggestions.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[var(--neutral-cool-50)] text-[11px] uppercase tracking-wide text-[var(--dark-grey)]">
                        <th className="text-left font-semibold px-4 py-2.5 min-w-[160px]">Name</th>
                        <th className="text-left font-semibold px-4 py-2.5 min-w-[160px]">Contact</th>
                        <th className="text-left font-semibold px-4 py-2.5 min-w-[140px]">Price / Unit</th>
                        <th className="text-left font-semibold px-4 py-2.5 min-w-[120px]">Minimum Order</th>
                        <th className="text-left font-semibold px-4 py-2.5 min-w-[120px]">Lead Time</th>
                        <th className="text-left font-semibold px-4 py-2.5 min-w-[200px]">Notes</th>
                        <th className="text-left font-semibold px-4 py-2.5 min-w-[140px]">Status</th>
                        <th className="font-semibold px-2 py-2.5 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {activeRows.map((row) => (
                        <CandidateRow
                          key={row.id}
                          row={row}
                          canEdit={canEdit}
                          onField={handleFieldChange}
                          onStatus={handleStatusChange}
                          onDelete={handleDelete}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {reasonModal && (
        <ChooseReasonModal
          vendorName={reasonModal.candidate.name || "this vendor"}
          reason={reasonModal.reason}
          onChange={(reason) => setReasonModal((prev) => (prev ? { ...prev, reason } : prev))}
          onCancel={() => setReasonModal(null)}
          onSubmit={submitChosen}
        />
      )}

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} variant="save" />

      <CoPilotDrawer
        planId={planId}
        workspaceKey="suppliers"
        currentFocus={{ label: `Suppliers: ${VENDOR_CATEGORY_LABELS[activeCategory]}` }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
      />
    </div>
  );
}

function CandidateRow({
  row,
  canEdit,
  onField,
  onStatus,
  onDelete,
}: {
  row: VendorCandidate;
  canEdit: boolean;
  onField: (id: string, field: keyof VendorCandidate, value: string) => void;
  onStatus: (row: VendorCandidate, status: VendorStatus) => void;
  onDelete: (id: string) => void;
}) {
  // updated_at acts as a "version" so inputs remount when a server-side
  // change (e.g. AI seed) overrides the canonical value.
  const v = row.updated_at;
  return (
    <tr className="hover:bg-[var(--neutral-cool-50)]">
      <Cell>
        <Input key={`name:${v}`} value={row.name} placeholder="Vendor name" disabled={!canEdit} onChange={(v) => onField(row.id, "name", v)} />
      </Cell>
      <Cell>
        <Input key={`contact:${v}`} value={row.contact ?? ""} placeholder="Email, phone, or site" disabled={!canEdit} onChange={(v) => onField(row.id, "contact", v)} />
      </Cell>
      <Cell>
        <Input key={`price:${v}`} value={row.price_per_unit ?? ""} placeholder="$18 / lb" disabled={!canEdit} onChange={(v) => onField(row.id, "price_per_unit", v)} />
      </Cell>
      <Cell>
        <Input key={`min:${v}`} value={row.minimum_order ?? ""} placeholder="5 lb" disabled={!canEdit} onChange={(v) => onField(row.id, "minimum_order", v)} />
      </Cell>
      <Cell>
        <Input key={`lead:${v}`} value={row.lead_time ?? ""} placeholder="3-5 days" disabled={!canEdit} onChange={(v) => onField(row.id, "lead_time", v)} />
      </Cell>
      <Cell>
        <Input key={`notes:${v}`} value={row.notes ?? ""} placeholder="Notes" disabled={!canEdit} onChange={(v) => onField(row.id, "notes", v)} />
      </Cell>
      <Cell>
        <select
          value={row.status}
          disabled={!canEdit}
          onChange={(e) => onStatus(row, e.target.value as VendorStatus)}
          className={`text-xs font-semibold rounded-md border px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--teal)] ${STATUS_BADGE[row.status]} disabled:opacity-50`}
        >
          {(["researching", "shortlisted", "chosen", "rejected"] as VendorStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </Cell>
      <td className="px-2 py-2 text-right align-middle">
        {canEdit && (
          <button
            type="button"
            onClick={() => onDelete(row.id)}
            className="text-[var(--dark-grey)] hover:text-[var(--error)] transition-colors p-1"
            aria-label="Delete vendor"
          >
            <Trash2 size={14} />
          </button>
        )}
      </td>
    </tr>
  );
}

function Cell({ children }: { children: ReactNode }) {
  return <td className="px-4 py-2 align-middle">{children}</td>;
}

function Input({
  value,
  placeholder,
  disabled,
  onChange,
}: {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  // Uncontrolled-with-key: `defaultValue` lets the user type without parent
  // round-trips; when the canonical value changes (e.g. after AI seed) the
  // parent remounts this input via React's key reconciliation.
  return (
    <input
      type="text"
      defaultValue={value}
      placeholder={placeholder}
      disabled={disabled}
      onBlur={(e) => {
        const next = e.target.value;
        if (next !== value) onChange(next);
      }}
      className="w-full text-sm bg-transparent border border-transparent rounded-md px-2 py-1.5 hover:border-[var(--neutral-cool-200)] focus:border-[var(--teal)] focus:outline-none focus:bg-white disabled:opacity-50"
    />
  );
}

function SeedBanner({
  canEdit,
  label,
  loading,
  error,
  onSeed,
}: {
  canEdit: boolean;
  label: string;
  loading: boolean;
  error: string | null;
  onSeed: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !canEdit) return null;

  return (
    <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-500)] px-4 py-3 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--teal)] mb-1">
            Suggest candidate {label} vendors
          </p>
          <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
            Reads your concept (city, vibe, menu) and drafts three vendors to research. Edit or remove anything after.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors shrink-0 mt-0.5"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onSeed}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[var(--teal)] text-white px-4 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-60"
        >
          <Sparkles size={12} aria-hidden="true" />
          {loading ? "Generating..." : "Generate suggestions"}
        </button>
        {error && <span className="text-xs text-[var(--error)]">{error}</span>}
      </div>
    </div>
  );
}

function ChooseReasonModal({
  vendorName,
  reason,
  onChange,
  onCancel,
  onSubmit,
}: {
  vendorName: string;
  reason: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-[var(--foreground)]">Choose {vendorName}?</h2>
        <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">
          We&apos;ll log this decision with today&apos;s date and surface it in your concept brief. Add a short reason so future-you remembers.
        </p>
        <label className="block mt-4">
          <span className="text-xs font-medium text-[var(--foreground)]">Why this vendor (optional)</span>
          <textarea
            value={reason}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Best price, local relationship, fits the brand..."
            rows={4}
            className="mt-1 w-full text-sm border border-[var(--neutral-cool-200)] rounded-lg px-3 py-2 focus:border-[var(--teal)] focus:outline-none"
          />
        </label>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold text-[var(--muted-foreground)] px-3 py-2 hover:text-[var(--foreground)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="text-xs font-semibold bg-[var(--teal)] text-white px-4 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors"
          >
            Log decision
          </button>
        </div>
      </div>
    </div>
  );
}
