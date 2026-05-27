"use client";

// TIM-1038: Build Out & Equipment workspace — Equipment sections,
// workstation sections, drag-drop, resizable columns, per-section totals.
// TIM-1171: Supplies tab removed — now lives in the Inventory workspace.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wrench, X, Save, Settings2 } from "lucide-react";
import { formatCurrency } from "@/lib/financial-projection";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { useWorkspaceProgress } from "@/components/workspace/WorkspaceProgressProvider";
import { SectionedListGrid } from "@/components/buildout/SectionedListGrid";
import { CategorySettingsPanel } from "@/components/buildout/CategorySettingsPanel";
import type { EquipmentItem } from "@/app/workspace/financials/financials-workspace";
import type { ListSection, SuppliesItem } from "@/types/buildout";

type AnyItem = EquipmentItem | SuppliesItem;

const AUTOSAVE_DEBOUNCE_MS = 800;

interface Props {
  planId: string;
  initialEquipment: EquipmentItem[];
  initialSections: ListSection[];
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

function SeedBanner({
  canEdit,
  listType,
  hasAiItems,
  onSeed,
}: {
  canEdit: boolean;
  listType: "equipment" | "supplies";
  hasAiItems: boolean;
  onSeed: () => Promise<void>;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [dismissed, setDismissed] = useState(hasAiItems);

  if (dismissed || !canEdit) return null;

  async function handleSeed() {
    setStatus("loading");
    try {
      await onSeed();
      setStatus("done");
      setDismissed(true);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="rounded-xl border border-[#cfe0e1] bg-[#f4f9f8] px-5 py-4 mb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#155e63] mb-1">
            {listType === "equipment"
              ? "Generate a starter equipment list"
              : "Generate a starter supplies list"}
          </p>
          <p className="text-xs text-[#6b6b6b] leading-relaxed">
            {listType === "equipment"
              ? "We will populate workstation sections with typical equipment for a specialty coffee shop. Edit or remove anything after."
              : "We will create standard supply categories with typical consumables for a coffee shop. Adjust quantities and costs after."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
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
          disabled={status === "loading"}
          className="text-xs font-semibold bg-[#155e63] text-white px-4 py-2 rounded-lg hover:bg-[#0e4448] transition-colors disabled:opacity-60"
        >
          {status === "loading" ? "Generating..." : "Generate list"}
        </button>
        {status === "error" && (
          <span className="text-xs text-[#a13d3d]">Could not generate. Try again.</span>
        )}
      </div>
    </div>
  );
}

export function BuildoutEquipmentWorkspace({
  planId,
  initialEquipment,
  initialSections,
  initialModelUpdatedAt,
  canEdit,
  initialTrialMessagesUsed,
  initialNeedsReviewAt,
  initialModelUpdatedAtForReview,
}: Props) {
  const [equipment, setEquipment] = useState<EquipmentItem[]>(initialEquipment);
  const [sections, setSections] = useState<ListSection[]>(initialSections);
  const [saveState, setSaveState] = useState<SaveState>({
    kind: "idle",
    lastSavedAt: initialModelUpdatedAt,
  });
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const pendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightController = useRef<AbortController | null>(null);
  const latestEquipmentRef = useRef<EquipmentItem[]>(initialEquipment);

  const { setModuleProgress } = useWorkspaceProgress();

  const showReviewBanner =
    !reviewDismissed &&
    !!initialNeedsReviewAt &&
    !!initialModelUpdatedAtForReview &&
    new Date(initialNeedsReviewAt) > new Date(initialModelUpdatedAtForReview);

  const progress = useMemo(() => ({ filled: equipment.length > 0 ? 1 : 0, total: 1 }), [equipment]);

  useEffect(() => {
    setModuleProgress(5, progress.filled, progress.total);
  }, [progress.filled, progress.total, setModuleProgress]);

  // persist saves the equipment total to financial_models for projections
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
          setSaveState({ kind: "error", message: "Subscription paused — reactivate to keep editing." });
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

  function handleEquipmentChange(next: AnyItem[]) {
    const eq = next as EquipmentItem[];
    setEquipment(eq);
    scheduleSave(eq);
  }

  function handleSectionsChange(next: ListSection[]) {
    setSections(next);
  }

  function handleItemsSectionRemoved(sectionId: string) {
    setEquipment((prev) =>
      prev.map((i) => (i.section_id === sectionId ? { ...i, section_id: null } : i))
    );
  }

  function handleManualSave() {
    if (!canEdit) return;
    if (pendingSaveTimer.current) {
      clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = null;
    }
    void persist(latestEquipmentRef.current);
  }

  // Equipment seed
  async function seedEquipment() {
    const res = await fetch("/api/workspaces/financials/seed", { method: "POST" });
    if (!res.ok) throw new Error(`seed failed (${res.status})`);
    const [eqRes, secRes] = await Promise.all([
      fetch("/api/workspaces/financials/equipment"),
      fetch("/api/workspaces/buildout/sections?list_type=equipment"),
    ]);
    if (!eqRes.ok || !secRes.ok) throw new Error("reload failed");
    const [newEq, newSec] = await Promise.all([eqRes.json(), secRes.json()]);
    setEquipment(newEq as EquipmentItem[]);
    setSections(newSec as ListSection[]);
    scheduleSave(newEq as EquipmentItem[]);
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

  const equipmentSections = sections.filter((s) => s.list_type === "equipment");
  const hasAiEquipment = equipment.some((i) => i.source === "ai_suggested");

  const activeEquipment = equipment.filter((i) => !i.archived);
  const grandTotalCents = activeEquipment.reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0);
  const stationCount = equipmentSections.length;
  const itemCount = activeEquipment.length;

  return (
    <div className="bg-[#faf9f7] min-h-screen">
      {/* Sticky grand total summary — appears once items exist */}
      {grandTotalCents > 0 && (
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-[#e8f0f0] shadow-sm">
          <div className="px-6 py-3 flex items-center gap-6">
            <div>
              <p className="text-[10px] font-semibold text-[#afafaf] uppercase tracking-wide">Grand Total</p>
              <p className="text-xl font-bold text-[#155e63]">{formatCurrency(grandTotalCents / 100)}</p>
            </div>
            {stationCount > 0 && (
              <>
                <div className="h-9 w-px bg-[#efefef]" aria-hidden="true" />
                <div>
                  <p className="text-[10px] font-semibold text-[#afafaf] uppercase tracking-wide">Stations</p>
                  <p className="text-sm font-semibold text-[#1a1a1a]">{stationCount}</p>
                </div>
              </>
            )}
            {itemCount > 0 && (
              <>
                <div className="h-9 w-px bg-[#efefef]" aria-hidden="true" />
                <div>
                  <p className="text-[10px] font-semibold text-[#afafaf] uppercase tracking-wide">Items</p>
                  <p className="text-sm font-semibold text-[#1a1a1a]">{itemCount}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <div className="px-6 pt-8 pb-16">
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="w-5 h-5 text-[#155e63] flex-shrink-0" aria-hidden="true" />
            <h1 className="font-bold text-[#1a1a1a]" style={{ fontSize: "28px" }}>
              Build Out &amp; Equipment
            </h1>
          </div>
          <p className="text-sm text-[#6b6b6b] leading-relaxed">
            Track hard assets — espresso machines, grinders, fridges, furniture, and fixtures. Consumables and supplies live in the Inventory workspace.
          </p>
        </header>

        {showReviewBanner && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800">Your concept or menu has changed</p>
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
        <div className="flex items-center gap-3 mb-5">
          {canEdit && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#155e63] border border-[#155e63]/30 rounded-lg px-3 py-1.5 hover:bg-[#155e63]/5 transition-colors"
            >
              <Settings2 size={12} aria-hidden="true" />
              Manage Stations
            </button>
          )}
          <span className={`text-xs ml-auto ${saveState.kind === "error" ? "text-[#a13d3d]" : "text-[#afafaf]"}`}>
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

        <SeedBanner
          canEdit={canEdit}
          listType="equipment"
          hasAiItems={hasAiEquipment}
          onSeed={seedEquipment}
        />
        <SectionedListGrid
          listType="equipment"
          planId={planId}
          canEdit={canEdit}
          sections={equipmentSections}
          items={equipment as AnyItem[]}
          onItemsChange={handleEquipmentChange}
          onSectionsChange={handleSectionsChange}
        />
      </div>

      {settingsOpen && (
        <CategorySettingsPanel
          sections={equipmentSections}
          items={equipment}
          canEdit={canEdit}
          planId={planId}
          onClose={() => setSettingsOpen(false)}
          onSectionsChange={handleSectionsChange}
          onItemsSectionRemoved={handleItemsSectionRemoved}
        />
      )}

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
