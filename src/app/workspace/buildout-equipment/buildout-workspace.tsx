"use client";

// TIM-1029: Build Out & Equipment workspace — Equipment table promoted from Financials.
// Full-width layout, manual Save button alongside per-cell autosave,
// column-visibility settings (see EquipmentGrid).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wrench, X, Save } from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { useWorkspaceProgress } from "@/components/workspace/WorkspaceProgressProvider";
import { EquipmentGrid } from "@/components/equipment/EquipmentGrid";
import type {
  EquipmentItem,
} from "@/app/workspace/financials/financials-workspace";

const AUTOSAVE_DEBOUNCE_MS = 800;

interface Props {
  planId: string;
  initialEquipment: EquipmentItem[];
  initialModelUpdatedAt: string | null;
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
  initialNeedsReviewAt: string | null;
  initialModelUpdatedAtForReview: string | null;
}

type SaveState =
  | { kind: "idle"; lastSavedAt: string | null }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Not saved yet";
  try {
    const d = new Date(iso);
    return `Saved ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } catch {
    return "Saved";
  }
}

function EquipmentSection({
  planId,
  canEdit,
  items,
  onItemsChange,
}: {
  planId: string;
  canEdit: boolean;
  items: EquipmentItem[];
  onItemsChange: (items: EquipmentItem[]) => void;
}) {
  const [seedStatus, setSeedStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [seedDismissed, setSeedDismissed] = useState(
    items.some((i) => i.source === "ai_suggested")
  );

  const aiSeeded = items.some((i) => i.source === "ai_suggested");

  async function handleSeed() {
    setSeedStatus("loading");
    try {
      const res = await fetch("/api/workspaces/financials/seed", { method: "POST" });
      if (!res.ok) throw new Error(`seed failed (${res.status})`);
      const listRes = await fetch("/api/workspaces/financials/equipment");
      if (!listRes.ok) throw new Error(`reload failed (${listRes.status})`);
      const newItems = (await listRes.json()) as EquipmentItem[];
      onItemsChange(newItems);
      setSeedStatus("done");
      setSeedDismissed(true);
    } catch {
      setSeedStatus("error");
    }
  }

  return (
    <div className="space-y-4">
      {!seedDismissed && !aiSeeded && canEdit && (
        <div className="rounded-xl border border-[#cfe0e1] bg-[#f4f9f8] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#155e63] mb-1">
                Generate a starter equipment list
              </p>
              <p className="text-xs text-[#6b6b6b] leading-relaxed">
                Based on your concept and menu profile, we&apos;ll suggest typical equipment
                for a coffee shop like yours. Edit or remove anything after.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSeedDismissed(true)}
              className="text-[#afafaf] hover:text-[#1a1a1a] transition-colors shrink-0 mt-0.5"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSeed}
              disabled={seedStatus === "loading"}
              className="text-xs font-semibold bg-[#155e63] text-white px-4 py-2 rounded-lg hover:bg-[#0e4448] transition-colors disabled:opacity-60"
            >
              {seedStatus === "loading" ? "Generating..." : "Generate list"}
            </button>
            {seedStatus === "error" && (
              <span className="text-xs text-[#a13d3d]">Could not generate. Try again.</span>
            )}
          </div>
        </div>
      )}

      <EquipmentGrid
        planId={planId}
        canEdit={canEdit}
        items={items}
        onItemsChange={onItemsChange}
      />
    </div>
  );
}

export function BuildoutEquipmentWorkspace({
  planId,
  initialEquipment,
  initialModelUpdatedAt,
  canEdit,
  initialTrialMessagesUsed,
  initialNeedsReviewAt,
  initialModelUpdatedAtForReview,
}: Props) {
  const [equipment, setEquipment] = useState<EquipmentItem[]>(initialEquipment);
  const [saveState, setSaveState] = useState<SaveState>({
    kind: "idle",
    lastSavedAt: initialModelUpdatedAt,
  });
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [reviewDismissed, setReviewDismissed] = useState(false);

  const pendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightController = useRef<AbortController | null>(null);
  const latestEquipmentRef = useRef<EquipmentItem[]>(initialEquipment);

  const { setModuleProgress } = useWorkspaceProgress();

  const showReviewBanner =
    !reviewDismissed &&
    !!initialNeedsReviewAt &&
    !!initialModelUpdatedAtForReview &&
    new Date(initialNeedsReviewAt) > new Date(initialModelUpdatedAtForReview);

  const progress = useMemo(() => {
    const hasEquipment = equipment.length > 0 ? 1 : 0;
    return { filled: hasEquipment, total: 1 };
  }, [equipment]);

  useEffect(() => {
    setModuleProgress(5, progress.filled, progress.total);
  }, [progress.filled, progress.total, setModuleProgress]);

  // persist saves the startup_costs equipment total to the financial_models row
  // so projections stay in sync without requiring Equipment to still live under Financials.
  const persist = useCallback(
    async (eq: EquipmentItem[]) => {
      if (!canEdit) return;
      if (inFlightController.current) inFlightController.current.abort();
      const controller = new AbortController();
      inFlightController.current = controller;
      setSaveState({ kind: "saving" });
      try {
        const totalEquipmentCents = eq.reduce(
          (s, i) => s + i.unit_cost_cents * i.quantity,
          0
        );
        const res = await fetch("/api/workspaces/financials/model", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startup_costs: { total_equipment_cents: totalEquipmentCents },
          }),
          signal: controller.signal,
        });
        if (res.status === 402) {
          setSaveState({
            kind: "error",
            message: "Subscription paused — reactivate to keep editing.",
          });
          setPaywallOpen(true);
          return;
        }
        if (!res.ok) throw new Error(`save failed (${res.status})`);
        const data = (await res.json()) as { updated_at?: string };
        setSaveState({ kind: "saved", at: data?.updated_at ?? new Date().toISOString() });
      } catch (err) {
        if (controller.signal.aborted) return;
        setSaveState({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not save.",
        });
      }
    },
    [canEdit]
  );

  const scheduleSave = useCallback(
    (eq: EquipmentItem[]) => {
      latestEquipmentRef.current = eq;
      setSaveState({ kind: "dirty" });
      if (pendingSaveTimer.current) clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = setTimeout(() => {
        pendingSaveTimer.current = null;
        void persist(latestEquipmentRef.current);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [persist]
  );

  function handleEquipmentChange(next: EquipmentItem[]) {
    setEquipment(next);
    scheduleSave(next);
  }

  // Manual save: flush any pending debounce immediately
  function handleManualSave() {
    if (!canEdit) return;
    if (pendingSaveTimer.current) {
      clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = null;
    }
    void persist(latestEquipmentRef.current);
  }

  const lastSavedAt =
    saveState.kind === "saved" ? saveState.at : saveState.kind === "idle" ? saveState.lastSavedAt : null;

  const saveLabel =
    saveState.kind === "saving"
      ? "Saving..."
      : saveState.kind === "dirty"
      ? "Unsaved changes"
      : saveState.kind === "error"
      ? saveState.message
      : formatTimestamp(lastSavedAt);

  return (
    <div className="bg-[#faf9f7] min-h-screen">
      {/* Full-width content — no max-w constraint so Equipment table can breathe */}
      <div className="px-6 pt-8 pb-16">
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="w-5 h-5 text-[#155e63] flex-shrink-0" aria-hidden="true" />
            <h1 className="font-bold text-[#1a1a1a]" style={{ fontSize: "28px" }}>
              Build Out &amp; Equipment
            </h1>
          </div>
          <p className="text-sm text-[#6b6b6b] leading-relaxed">
            Track every piece of equipment, its cost, and how you plan to finance it.
          </p>
        </header>

        {showReviewBanner && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800">
                Your concept or menu has changed
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Review your equipment list to make sure it still reflects your plan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReviewDismissed(true)}
              className="text-amber-400 hover:text-amber-600 transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Save toolbar */}
        <div className="mb-5 flex items-center justify-end gap-3">
          <span
            className={`text-xs ${saveState.kind === "error" ? "text-[#a13d3d]" : "text-[#afafaf]"}`}
          >
            {saveLabel}
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={handleManualSave}
              disabled={saveState.kind === "saving"}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#155e63] border border-[#155e63]/30 rounded-lg px-3 py-1.5 hover:bg-[#155e63]/5 transition-colors disabled:opacity-50"
            >
              <Save size={12} aria-hidden="true" />
              Save
            </button>
          )}
        </div>

        <EquipmentSection
          planId={planId}
          canEdit={canEdit}
          items={equipment}
          onItemsChange={handleEquipmentChange}
        />
      </div>

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} variant="copilot_trial" />
      <CoPilotDrawer
        planId={planId}
        workspaceKey="buildout_equipment"
        currentFocus={{ label: "Build Out & Equipment" }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
      />
    </div>
  );
}
