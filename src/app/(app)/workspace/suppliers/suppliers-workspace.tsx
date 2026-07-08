"use client";

// TIM-1059: Suppliers & Vendors workspace — vendor categories with
// side-by-side comparison rows, decision capture on "chosen", and AI seed
// per category. Reuses the same shell language as Build-out & Equipment:
// teal accents, edit-in-place inputs, CoPilotDrawer, PaywallModal.
//
// TIM-1414:
//   1. Container bounded to workspace width (was overflowing right of viewport).
//   2. Persistent "Suggest more vendors" button at the top of every list.
//   3. Equipment-parity table: drag-to-reorder column headers + resizable
//      columns (localStorage-persisted), GripHorizontal/Vertical visual cues.
//   4. Custom categories — inline "+ Add category" at the bottom of the
//      category nav, rename/delete custom ones, AI seed works on them too.
//   5. Elegant truncation via shared <TruncatedText> in every cell — no more
//      silently clipped bubbles.

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Truck, Plus, Sparkles, Trash2, GripHorizontal, MoreVertical, Pencil } from "lucide-react";
import { PaywallModal } from "@/components/paywall-modal";
import { useAIReviewModal } from "@/hooks/useAIReviewModal";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import { TABLE_CELL_TEXT, TABLE_HEADER_TEXT, TABLE_ACTION_ICON_SIZE } from "@/lib/workspace-table";
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { AskScoutButton } from "@/components/workspace/AskScoutButton";
import { SectionHeader } from "@/components/section-header";
import { useMutationStatus } from "@/hooks/use-mutation-status";
import { SaveStatusAndButton } from "@/components/workspace/SaveStatusAndButton";
import { useCurrency } from "@/components/CurrencyProvider";
import {
  VENDOR_CATEGORY_KEYS,
  VENDOR_CATEGORY_LABELS,
  VENDOR_CATEGORY_SUBTITLES,
  isSeededCategoryKey,
  type VendorCandidate,
  type VendorCategoryId,
  type VendorCustomCategory,
  type VendorDecision,
  type VendorStatus,
} from "@/lib/suppliers";

interface Props {
  planId: string;
  canEdit: boolean;
  initialCandidates: VendorCandidate[];
  initialDecisions: VendorDecision[];
  initialCustomCategories: VendorCustomCategory[];
  initialTrialMessagesUsed?: number;
  uiRevampV3?: boolean;
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

// ── Column definitions ──────────────────────────────────────────────────────
//
// Mirrors the Equipment & Buildout column-config shape so visual treatment
// and behaviour stay aligned (TIM-1215 / TIM-1328).

type SupplierColDef = {
  id: SupplierColId;
  label: string;
  placeholder?: string;
  defaultWidth: number;
  minWidth: number;
  resizable: boolean;
  reorderable: boolean;
};

type SupplierColId =
  | "name"
  | "contact"
  | "price_per_unit"
  | "minimum_order"
  | "lead_time"
  | "notes"
  | "status"
  | "actions";

const SUPPLIER_COLS: SupplierColDef[] = [
  { id: "name",           label: "Name",            placeholder: "Vendor name",            defaultWidth: 200, minWidth: 140, resizable: true,  reorderable: false },
  { id: "contact",        label: "Contact",         placeholder: "Email, phone, or site",  defaultWidth: 180, minWidth: 120, resizable: true,  reorderable: true  },
  // TIM-2486: rendered placeholder is overridden per-row using the active
  // currency symbol from useCurrency(). Keep a unit-only default here as the
  // fallback for any non-row use site.
  { id: "price_per_unit", label: "Price / Unit",    placeholder: "Price per unit",         defaultWidth: 130, minWidth: 100, resizable: true,  reorderable: true  },
  { id: "minimum_order",  label: "Minimum Order",   placeholder: "5 lb",                   defaultWidth: 130, minWidth: 100, resizable: true,  reorderable: true  },
  { id: "lead_time",      label: "Lead Time",       placeholder: "3-5 days",               defaultWidth: 130, minWidth: 100, resizable: true,  reorderable: true  },
  { id: "notes",          label: "Notes",           placeholder: "Notes",                  defaultWidth: 220, minWidth: 140, resizable: true,  reorderable: true  },
  { id: "status",         label: "Status",          defaultWidth: 140, minWidth: 110, resizable: true,  reorderable: true  },
  { id: "actions",        label: "",                defaultWidth: 36,  minWidth: 36,  resizable: false, reorderable: false },
];

const DEFAULT_COL_ORDER: SupplierColId[] = SUPPLIER_COLS.map((c) => c.id);

function loadColWidths(): Map<SupplierColId, number> {
  try {
    const raw = localStorage.getItem("tcs-suppliers-col-widths");
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>;
      return new Map(SUPPLIER_COLS.map((c) => [c.id, parsed[c.id] ?? c.defaultWidth]));
    }
  } catch { /* ignore */ }
  return new Map(SUPPLIER_COLS.map((c) => [c.id, c.defaultWidth]));
}

function saveColWidths(widths: Map<SupplierColId, number>) {
  try {
    localStorage.setItem("tcs-suppliers-col-widths", JSON.stringify(Object.fromEntries(widths)));
  } catch { /* ignore */ }
}

function loadColOrder(): SupplierColId[] {
  try {
    const raw = localStorage.getItem("tcs-suppliers-col-order");
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (
        Array.isArray(parsed) &&
        DEFAULT_COL_ORDER.every((id) => parsed.includes(id)) &&
        parsed.every((id) => (DEFAULT_COL_ORDER as string[]).includes(id))
      ) {
        return parsed as SupplierColId[];
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_COL_ORDER;
}

function saveColOrder(order: SupplierColId[]) {
  try {
    localStorage.setItem("tcs-suppliers-col-order", JSON.stringify(order));
  } catch { /* ignore */ }
}

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
  initialCustomCategories,
  initialTrialMessagesUsed,
  uiRevampV3 = true,
}: Props) {
  const [candidates, setCandidates] = useState<VendorCandidate[]>(initialCandidates);
  const [decisions, setDecisions] = useState<VendorDecision[]>(initialDecisions);
  const { openAIReviewModal, AIReviewModalNode } = useAIReviewModal();
  const [customCategories, setCustomCategories] = useState<VendorCustomCategory[]>(initialCustomCategories);
  const [activeCategory, setActiveCategory] = useState<VendorCategoryId>("coffee_roaster");
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [seedingCategory, setSeedingCategory] = useState<VendorCategoryId | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [addCategoryDraft, setAddCategoryDraft] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<{ id: string; label: string } | null>(null);
  const [categoryMenu, setCategoryMenu] = useState<string | null>(null);
  const [reasonModal, setReasonModal] = useState<{
    candidate: VendorCandidate;
    reason: string;
  } | null>(null);

  // Column UI state (localStorage-backed) — hydrate after mount to avoid SSR mismatch.
  const [colWidths, setColWidths] = useState<Map<SupplierColId, number>>(() =>
    new Map(SUPPLIER_COLS.map((c) => [c.id, c.defaultWidth]))
  );
  const [colOrder, setColOrder] = useState<SupplierColId[]>(DEFAULT_COL_ORDER);
  const [resizingCol, setResizingCol] = useState<SupplierColId | null>(null);
  const [dragColId, setDragColId] = useState<SupplierColId | null>(null);
  const [dropTarget, setDropTarget] = useState<SupplierColId | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage is unavailable during SSR; hydrate after mount */
    setColWidths(loadColWidths());
    setColOrder(loadColOrder());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const { promoteOnEdit } = useWorkspaceStatus();
  const { saving: mutationSaving, savedAt: mutationSavedAt, confirmSaved } = useMutationStatus();

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
    return customById.get(id)?.label ?? "Custom category";
  }

  function subtitleFor(id: VendorCategoryId): string {
    if (isSeededCategoryKey(id)) return VENDOR_CATEGORY_SUBTITLES[id];
    return "Custom category — vendors specific to your shop.";
  }

  const candidatesByCategory = useMemo(() => {
    const map = new Map<VendorCategoryId, VendorCandidate[]>();
    for (const cat of allCategoryIds) map.set(cat, []);
    for (const c of candidates) {
      const list = map.get(c.category);
      if (list) list.push(c);
    }
    return map;
  }, [candidates, allCategoryIds]);

  const decisionsByCategory = useMemo(() => {
    const map = new Map<VendorCategoryId, VendorDecision>();
    for (const d of decisions) {
      if (d.is_current) map.set(d.category, d);
    }
    return map;
  }, [decisions]);

  // Switch to a real category if the active one was deleted.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- snap to a valid category when current one is removed */
    if (!allCategoryIds.includes(activeCategory)) {
      setActiveCategory(allCategoryIds[0] ?? "coffee_roaster");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [allCategoryIds, activeCategory]);

  const chosenCount = decisionsByCategory.size;
  const totalCategories = allCategoryIds.length;

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
    async (category: VendorCategoryId) => {
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
    // TIM-1561: captures existing candidates snapshot, seeds new vendors, then
    // shows only the newly added vendors in the review modal before applying to state.
    async (category: VendorCategoryId, mode: "replace" | "append" = "replace") => {
      if (!canEdit) {
        setPaywallOpen(true);
        return;
      }
      setSeedingCategory(category);
      setSeedError(null);
      const preExistingIds = new Set(candidates.map((c) => c.id));
      try {
        const res = await fetch("/api/workspaces/suppliers/seed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, mode: mode === "append" ? "append" : undefined }),
        });
        if (res.status === 402) {
          setPaywallOpen(true);
          return;
        }
        if (!res.ok) throw new Error(`seed failed (${res.status})`);
        const reload = await fetch("/api/workspaces/suppliers/candidates");
        if (!reload.ok) return;
        const allCandidates = (await reload.json()) as VendorCandidate[];
        const newCandidates = allCandidates.filter((c) => !preExistingIds.has(c.id) && c.category === category);
        const existingForCategory = candidates.filter((c) => c.category === category);
        if (newCandidates.length === 0) {
          setCandidates(allCandidates);
          return;
        }
        openAIReviewModal({
          suggestions: [
            {
              id: `vendors-${category}`,
              fieldId: category,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              fieldLabel: `${(VENDOR_CATEGORY_LABELS as any)[category] ?? category} Vendors`,
              originalValue: JSON.stringify(existingForCategory.map((c) => ({ name: c.name, notes: c.notes }))),
              proposedValue: JSON.stringify(newCandidates.map((c) => ({ name: c.name, notes: c.notes }))),
              isStructured: true,
            },
          ],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          context: { workspace: "Suppliers & Vendors", section: (VENDOR_CATEGORY_LABELS as any)[category] ?? category },
          onApply: async () => {
            setCandidates(allCandidates);
          },
        });
      } catch {
        setSeedError("Could not generate suggestions. Try again.");
      } finally {
        setSeedingCategory(null);
      }
    },
    [canEdit]
  );

  const handleAddCategory = useCallback(async () => {
    if (!canEdit) {
      setPaywallOpen(true);
      return;
    }
    const label = (addCategoryDraft ?? "").trim();
    if (!label) {
      setAddCategoryDraft(null);
      return;
    }
    const res = await fetch("/api/workspaces/suppliers/custom-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (res.status === 402) {
      setPaywallOpen(true);
      return;
    }
    if (!res.ok) return;
    const created = (await res.json()) as VendorCustomCategory;
    setCustomCategories((prev) => [...prev, created]);
    setActiveCategory(created.key as VendorCategoryId);
    setAddCategoryDraft(null);
  }, [addCategoryDraft, canEdit]);

  const handleRenameCategory = useCallback(async () => {
    if (!renameDraft) return;
    const label = renameDraft.label.trim();
    if (!label) return;
    const res = await fetch(`/api/workspaces/suppliers/custom-categories/${renameDraft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (res.ok) {
      const updated = (await res.json()) as VendorCustomCategory;
      setCustomCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    }
    setRenameDraft(null);
  }, [renameDraft]);

  const handleDeleteCategory = useCallback(
    async (id: string, key: string) => {
      if (!canEdit) {
        setPaywallOpen(true);
        return;
      }
      const cat = customCategories.find((c) => c.id === id);
      const ok = window.confirm(
        `Delete category "${cat?.label ?? "Custom"}"? Vendors and decisions in this category will also be removed.`
      );
      if (!ok) return;
      const res = await fetch(`/api/workspaces/suppliers/custom-categories/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setCustomCategories((prev) => prev.filter((c) => c.id !== id));
        setCandidates((prev) => prev.filter((c) => c.category !== key));
        setDecisions((prev) => prev.filter((d) => d.category !== key));
      }
      setCategoryMenu(null);
    },
    [canEdit, customCategories]
  );

  // ── Column resize ────────────────────────────────────────────────────────
  const beginResize = useCallback(
    (id: SupplierColId, startX: number, startWidth: number) => {
      setResizingCol(id);
      function move(e: PointerEvent) {
        const next = Math.max(
          SUPPLIER_COLS.find((c) => c.id === id)?.minWidth ?? 60,
          startWidth + (e.clientX - startX)
        );
        setColWidths((prev) => {
          const m = new Map(prev);
          m.set(id, next);
          return m;
        });
      }
      function up() {
        setResizingCol(null);
        setColWidths((prev) => {
          saveColWidths(prev);
          return prev;
        });
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    []
  );

  // ── Column reorder (header drag) ─────────────────────────────────────────
  const handleHeaderDragStart = useCallback(
    (id: SupplierColId, e: ReactPointerEvent<HTMLDivElement>) => {
      const col = SUPPLIER_COLS.find((c) => c.id === id);
      if (!col || !col.reorderable) return;
      e.stopPropagation();
      setDragColId(id);
      setDropTarget(null);
    },
    []
  );

  const handleHeaderDragOver = useCallback(
    (id: SupplierColId) => {
      if (!dragColId || dragColId === id) return;
      const col = SUPPLIER_COLS.find((c) => c.id === id);
      if (!col?.reorderable) return;
      setDropTarget(id);
    },
    [dragColId]
  );

  const handleHeaderDragEnd = useCallback(() => {
    if (dragColId && dropTarget && dragColId !== dropTarget) {
      setColOrder((prev) => {
        const next = [...prev];
        const from = next.indexOf(dragColId);
        const to = next.indexOf(dropTarget);
        if (from === -1 || to === -1) return prev;
        next.splice(from, 1);
        next.splice(to, 0, dragColId);
        saveColOrder(next);
        return next;
      });
    }
    setDragColId(null);
    setDropTarget(null);
  }, [dragColId, dropTarget]);

  useEffect(() => {
    if (!dragColId) return;
    function onUp() { handleHeaderDragEnd(); }
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [dragColId, handleHeaderDragEnd]);

  const orderedCols = useMemo(
    () => colOrder.map((id) => SUPPLIER_COLS.find((c) => c.id === id)!).filter(Boolean),
    [colOrder]
  );

  const activeRows = candidatesByCategory.get(activeCategory) ?? [];
  const activeDecision = decisionsByCategory.get(activeCategory) ?? null;

  return (
    <>
    {AIReviewModalNode}
    <div className="bg-[var(--background)] min-h-screen">
      <div className="w-full px-4 sm:px-6 pt-8 pb-16">
        {/* TIM-1787 / TIM-1894: canonical WorkspaceHeader — icon+title+description
            on the left, chosen-vendor summary in the top-right actions slot. */}
        {/* TIM-3695 (P1-1): under v3 the per-category Suggest/Add actions move here
            so SectionHeader's contract (title+help+onWriteWithAi only) is respected. */}
        <WorkspaceHeader
          Icon={Truck}
          title="Suppliers & Vendors"
          description="Shortlist vendors in each category, compare them side-by-side, and lock in the one you choose. Choices land in your concept brief."
          actions={
            <>
              {chosenCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-[var(--teal)]">{chosenCount}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    of {totalCategories} {totalCategories === 1 ? "category" : "categories"} chosen
                  </span>
                </div>
              )}
              {uiRevampV3 && (
                <>
                  <WorkspaceActionButton
                    onClick={() => handleSeed(activeCategory, activeRows.length > 0 ? "append" : "replace")}
                    disabled={!canEdit || seedingCategory === activeCategory}
                    title={activeRows.length > 0 ? "Generate more AI-suggested vendors" : "Generate AI suggestions"}
                  >
                    <Sparkles size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
                    {seedingCategory === activeCategory
                      ? "Generating..."
                      : activeRows.length > 0
                        ? "Suggest more"
                        : "Suggest vendors"}
                  </WorkspaceActionButton>
                  <WorkspaceActionButton
                    onClick={() => handleAddRow(activeCategory)}
                    disabled={!canEdit}
                  >
                    <Plus size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
                    Add vendor
                  </WorkspaceActionButton>
                </>
              )}
              {/* TIM-3676: shared Scout entry point, matches Business Plan / Marketing / Hiring / Ops Playbook. */}
              <AskScoutButton
                workspaceKey="suppliers"
                focusLabel="supplier and vendor plan"
                hasContent={chosenCount > 0}
              />
              <SaveStatusAndButton
                saving={mutationSaving}
                savedAt={mutationSavedAt}
                unsaved={false}
                canEdit={true}
                onSave={confirmSaved}
              />
            </>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-6">
          {/* Category nav */}
          <nav className="rounded-xl border border-[var(--border)] bg-white overflow-hidden self-start">
            <ul className="divide-y divide-[var(--border)]">
              {allCategoryIds.map((key) => {
                const decision = decisionsByCategory.get(key);
                const rows = candidatesByCategory.get(key) ?? [];
                const isActive = key === activeCategory;
                const isCustom = !isSeededCategoryKey(key);
                const custom = isCustom ? customById.get(key) : null;
                return (
                  <li key={key} className="relative">
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
                        <TruncatedText
                          text={labelFor(key)}
                          className={`text-sm font-semibold ${
                            isActive ? "text-[var(--teal)]" : "text-[var(--foreground)]"
                          }`}
                        />
                        <TruncatedText
                          text={
                            decision
                              ? `Chosen: ${decision.vendor_name}`
                              : `${rows.length} candidate${rows.length === 1 ? "" : "s"}`
                          }
                          className="text-[11px] text-[var(--dark-grey)] mt-0.5 block"
                        />
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 flex-shrink-0">
                        {decision && (
                          <span className="w-2 h-2 rounded-full bg-[var(--teal)]" aria-hidden="true" />
                        )}
                      </div>
                    </button>
                    {isCustom && custom && canEdit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCategoryMenu((cur) => (cur === custom.id ? null : custom.id));
                        }}
                        aria-label="Category options"
                        className="absolute top-2.5 right-2 text-[var(--dark-grey)] hover:text-[var(--foreground)] p-1 rounded hover:bg-white"
                      >
                        <MoreVertical size={14} />
                      </button>
                    )}
                    {isCustom && custom && categoryMenu === custom.id && (
                      <div
                        className="absolute right-2 top-9 z-30 bg-white border border-[var(--border)] rounded-lg shadow-lg py-1 min-w-[140px]"
                        onMouseLeave={() => setCategoryMenu(null)}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setRenameDraft({ id: custom.id, label: custom.label });
                            setCategoryMenu(null);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--neutral-cool-50)] flex items-center gap-2"
                        >
                          <Pencil size={12} aria-hidden="true" /> Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(custom.id, custom.key)}
                          className="w-full text-left px-3 py-1.5 text-xs text-[var(--error)] hover:bg-[var(--error-bg-5)] flex items-center gap-2"
                        >
                          <Trash2 size={12} aria-hidden="true" /> Delete category
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
              {/* Add custom category affordance */}
              {canEdit && (
                <li>
                  {addCategoryDraft === null ? (
                    <button
                      type="button"
                      onClick={() => setAddCategoryDraft("")}
                      className="w-full text-left px-4 py-3 flex items-center gap-2 text-xs font-semibold text-[var(--teal)] hover:bg-[var(--neutral-cool-50)] transition-colors"
                    >
                      <Plus size={14} aria-hidden="true" />
                      Add category
                    </button>
                  ) : (
                    <div className="px-3 py-2.5">
                      <input
                        type="text"
                        autoFocus
                        value={addCategoryDraft}
                        onChange={(e) => setAddCategoryDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddCategory();
                          if (e.key === "Escape") setAddCategoryDraft(null);
                        }}
                        placeholder="New category name"
                        className="w-full text-xs border border-[var(--neutral-cool-200)] rounded-md px-2 py-1.5 focus:border-[var(--teal)] focus-visible:outline-none"
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleAddCategory}
                          className="text-[11px] font-semibold bg-[var(--teal)] text-white px-2.5 py-1 rounded-md hover:bg-[var(--teal-dark)]"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddCategoryDraft(null)}
                          className="text-[11px] font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )}
            </ul>
            <div className="px-4 py-3 bg-[var(--neutral-cool-50)] text-[11px] text-[var(--muted-foreground)] border-t border-[var(--border)]">
              {chosenCount}/{totalCategories} categories decided
            </div>
          </nav>

          {/* Active category panel */}
          <section className="min-w-0">
            <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
              <div className="px-5 pt-5 pb-4 border-b border-[var(--border)]">
                {/* TIM-3695 (P1-1): v3 — SectionHeader standalone (contract: title+help only);
                    actions live in WorkspaceHeader above. v1 — original flex row kept. */}
                {uiRevampV3 ? (
                  <SectionHeader
                    title={labelFor(activeCategory)}
                    helpContent={subtitleFor(activeCategory)}
                  />
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <SectionHeader
                      title={labelFor(activeCategory)}
                      helpContent={subtitleFor(activeCategory)}
                      className="mb-0 flex-1"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      {/* TIM-1846: canonical WorkspaceActionButton chrome (were hand-rolled). */}
                      <WorkspaceActionButton
                        onClick={() => handleSeed(activeCategory, activeRows.length > 0 ? "append" : "replace")}
                        disabled={!canEdit || seedingCategory === activeCategory}
                        title={activeRows.length > 0 ? "Generate more AI-suggested vendors" : "Generate AI suggestions"}
                      >
                        <Sparkles size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
                        {seedingCategory === activeCategory
                          ? "Generating..."
                          : activeRows.length > 0
                            ? "Suggest more"
                            : "Suggest vendors"}
                      </WorkspaceActionButton>
                      <WorkspaceActionButton
                        onClick={() => handleAddRow(activeCategory)}
                        disabled={!canEdit}
                      >
                        <Plus size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
                        Add vendor
                      </WorkspaceActionButton>
                    </div>
                  </div>
                )}
                {seedError && (
                  <p className="mt-2 text-xs text-[var(--error)]">{seedError}</p>
                )}
                {activeDecision && (
                  <div className="mt-3 rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-500)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[var(--teal)] uppercase tracking-wide">
                          Decision logged
                        </p>
                        <p className="text-sm text-[var(--foreground)] mt-1">
                          <span className="font-semibold">
                            <TruncatedText text={activeDecision.vendor_name} />
                          </span>
                          <span className="text-[var(--muted-foreground)]"> · {new Date(activeDecision.decided_on).toLocaleDateString()}</span>
                        </p>
                        {activeDecision.reason && (
                          <TruncatedText
                            text={activeDecision.reason}
                            lines={2}
                            className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed block"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {activeRows.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-[var(--dark-grey)]">
                  No candidates yet. Add a vendor or generate suggestions.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table
                    className={`w-full ${TABLE_CELL_TEXT}`}
                    style={{ tableLayout: "fixed", minWidth: orderedCols.reduce((s, c) => s + (colWidths.get(c.id) ?? c.defaultWidth), 0) }}
                  >
                    <colgroup>
                      {orderedCols.map((c) => (
                        <col key={c.id} style={{ width: colWidths.get(c.id) ?? c.defaultWidth }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className={`bg-[var(--neutral-cool-50)] ${TABLE_HEADER_TEXT} text-[var(--dark-grey)]`}>
                        {orderedCols.map((c) => (
                          <th
                            key={c.id}
                            className="text-left font-semibold px-3 py-2.5 relative select-none"
                            onPointerEnter={() => handleHeaderDragOver(c.id)}
                            style={{
                              boxShadow:
                                dropTarget === c.id ? "inset 2px 0 0 var(--teal)" : undefined,
                            }}
                          >
                            <div className="flex items-center gap-1.5">
                              {c.reorderable && canEdit && (
                                <div
                                  onPointerDown={(e) => handleHeaderDragStart(c.id, e)}
                                  className="cursor-grab text-[var(--neutral-cool-400)] hover:text-[var(--dark-grey)] active:cursor-grabbing"
                                  aria-label={`Reorder column ${c.label}`}
                                  title="Drag to reorder column"
                                >
                                  <GripHorizontal size={12} />
                                </div>
                              )}
                              <TruncatedText text={c.label} />
                            </div>
                            {c.resizable && (
                              <div
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  beginResize(c.id, e.clientX, colWidths.get(c.id) ?? c.defaultWidth);
                                }}
                                className={`absolute top-0 right-0 h-full w-1 cursor-col-resize ${resizingCol === c.id ? "bg-[var(--teal)]" : "hover:bg-[var(--teal)]/40"}`}
                                aria-label={`Resize column ${c.label}`}
                              />
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {activeRows.map((row) => (
                        <CandidateRow
                          key={row.id}
                          row={row}
                          canEdit={canEdit}
                          orderedCols={orderedCols}
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

      {renameDraft && (
        <RenameCategoryModal
          label={renameDraft.label}
          onChange={(label) => setRenameDraft((prev) => (prev ? { ...prev, label } : prev))}
          onCancel={() => setRenameDraft(null)}
          onSubmit={handleRenameCategory}
        />
      )}

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} variant="save" />

    </div>
    </>
  );
}

function CandidateRow({
  row,
  canEdit,
  orderedCols,
  onField,
  onStatus,
  onDelete,
}: {
  row: VendorCandidate;
  canEdit: boolean;
  orderedCols: SupplierColDef[];
  onField: (id: string, field: keyof VendorCandidate, value: string) => void;
  onStatus: (row: VendorCandidate, status: VendorStatus) => void;
  onDelete: (id: string) => void;
}) {
  const v = row.updated_at;
  const { symbol } = useCurrency();
  const pricePlaceholder = `${symbol}18 / lb`;
  function cellFor(col: SupplierColDef): ReactNode {
    switch (col.id) {
      case "name":
        return <Input key={`name:${v}`} value={row.name} placeholder={col.placeholder} disabled={!canEdit} onChange={(val) => onField(row.id, "name", val)} />;
      case "contact":
        return <Input key={`contact:${v}`} value={row.contact ?? ""} placeholder={col.placeholder} disabled={!canEdit} onChange={(val) => onField(row.id, "contact", val)} />;
      case "price_per_unit":
        // TIM-2486: swap the hardcoded "$18 / lb" placeholder for one prefixed
        // with the active currency symbol so an EUR/CAD/GBP plan doesn't see
        // a USD hint.
        return <Input key={`price:${v}`} value={row.price_per_unit ?? ""} placeholder={pricePlaceholder} disabled={!canEdit} onChange={(val) => onField(row.id, "price_per_unit", val)} />;
      case "minimum_order":
        return <Input key={`min:${v}`} value={row.minimum_order ?? ""} placeholder={col.placeholder} disabled={!canEdit} onChange={(val) => onField(row.id, "minimum_order", val)} />;
      case "lead_time":
        return <Input key={`lead:${v}`} value={row.lead_time ?? ""} placeholder={col.placeholder} disabled={!canEdit} onChange={(val) => onField(row.id, "lead_time", val)} />;
      case "notes":
        return <Input key={`notes:${v}`} value={row.notes ?? ""} placeholder={col.placeholder} disabled={!canEdit} onChange={(val) => onField(row.id, "notes", val)} />;
      case "status":
        return (
          <select
            value={row.status}
            disabled={!canEdit}
            onChange={(e) => onStatus(row, e.target.value as VendorStatus)}
            className={`w-full text-xs font-semibold rounded-md border px-2 py-1.5 focus-visible:outline-none focus:ring-1 focus:ring-[var(--teal)] ${STATUS_BADGE[row.status]} disabled:opacity-50`}
          >
            {(["researching", "shortlisted", "chosen", "rejected"] as VendorStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        );
      case "actions":
        return canEdit ? (
          <button
            type="button"
            onClick={() => onDelete(row.id)}
            className="text-[var(--dark-grey)] hover:text-[var(--error)] transition-colors p-1"
            aria-label="Delete vendor"
          >
            <Trash2 size={TABLE_ACTION_ICON_SIZE} />
          </button>
        ) : null;
    }
  }

  return (
    <tr className="hover:bg-[var(--neutral-cool-50)]">
      {orderedCols.map((col) => (
        <td
          key={col.id}
          className={`px-3 py-2 align-middle ${col.id === "actions" ? "text-right" : ""}`}
          style={{ overflow: "hidden" }}
        >
          {cellFor(col)}
        </td>
      ))}
    </tr>
  );
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
  // TIM-1414: native title surfaces full value while typing; on blur the
  // TruncatedText layer takes over for hover popovers in read state.
  const inputStyle: CSSProperties = { textOverflow: "ellipsis" };
  return (
    <input
      type="text"
      defaultValue={value}
      placeholder={placeholder}
      disabled={disabled}
      title={value || undefined}
      style={inputStyle}
      onBlur={(e) => {
        const next = e.target.value;
        if (next !== value) onChange(next);
      }}
      className={`w-full min-w-0 ${TABLE_CELL_TEXT} bg-transparent border border-transparent rounded-md px-2 py-1.5 hover:border-[var(--neutral-cool-200)] focus:border-[var(--teal)] focus-visible:outline-none focus:bg-white disabled:opacity-50`}
    />
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
            className="mt-1 w-full text-sm border border-[var(--neutral-cool-200)] rounded-lg px-3 py-2 focus:border-[var(--teal)] focus-visible:outline-none"
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
            Log Decision
          </button>
        </div>
      </div>
    </div>
  );
}

function RenameCategoryModal({
  label,
  onChange,
  onCancel,
  onSubmit,
}: {
  label: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-[var(--foreground)]">Rename category</h2>
        <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">
          Pick a name that reads cleanly in the side nav and concept brief.
        </p>
        <label className="block mt-4">
          <span className="text-xs font-medium text-[var(--foreground)]">Category name</span>
          <input
            type="text"
            autoFocus
            value={label}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
              if (e.key === "Escape") onCancel();
            }}
            className="mt-1 w-full text-sm border border-[var(--neutral-cool-200)] rounded-lg px-3 py-2 focus:border-[var(--teal)] focus-visible:outline-none"
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
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
