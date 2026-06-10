"use client";

// TIM-1038: Build Out & Equipment workspace — Equipment sections,
// workstation sections, drag-drop, resizable columns, per-section totals.
// TIM-1171: Supplies tab removed — now lives in the Inventory workspace.
// TIM-1179: AI equipment recommendations + referral cards.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApprovedChange } from "@/hooks/useAIReviewModal";
import { Wrench, X, Settings2, FileSpreadsheet, MessageSquare, Eye } from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import { SectionedListGrid } from "@/components/buildout/SectionedListGrid";
// TIM-2598 (Phase 5.0): mobile card-per-item Equipment surface, gated by
// ui_revamp_v2. Renders below md; v1 SectionedListGrid keeps rendering at md+.
import { EquipmentMobileV2 } from "@/components/equipment/EquipmentMobileV2";
import { useUiRevamp } from "@/hooks/useUiRevamp";
import { CategorySettingsPanel } from "@/components/buildout/CategorySettingsPanel";
import { SpreadsheetImportModal } from "@/components/buildout/SpreadsheetImportModal";
import { DescribeSetupModal } from "@/components/buildout/DescribeSetupModal";
import { EquipmentSuppliesSubNav } from "@/components/buildout/EquipmentSuppliesSubNav";
// TIM-2481 (F12): buildout grid vs Financials equipment line reconciliation pill.
import { EquipmentReconciliationBanner } from "@/components/cross-suite/EquipmentReconciliationBanner";
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { SaveStatusAndButton } from "@/components/workspace/SaveStatusAndButton";
import {
  WorkspaceActionMenu,
  WorkspaceActionMenuItem,
} from "@/components/workspace/WorkspaceActionMenu";
import type { EquipmentItem } from "@/app/(app)/workspace/financials/financials-workspace";
import type { ListSection, SuppliesItem } from "@/types/buildout";
import type { EquipmentRecommendation } from "@/types/referral";
import { useCalloutDismissed } from "@/lib/use-callout-dismissed";
import type { CalloutKey } from "@/lib/callouts";

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
  initialCurrencyCode?: string;
}

type SaveState =
  | { kind: "idle"; lastSavedAt: string | null }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

// TIM-2423: the seed prompt is a callout with a stateful Generate action below
// the copy (not a single right-aligned button), so it doesn't fit the standard
// <DismissibleCallout> layout. It reuses the shared per-user dismissal hook
// (`useCalloutDismissed`) so the X close persists like every other callout.
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
  const calloutKey: CalloutKey =
    listType === "equipment"
      ? "buildout-equipment.seed-equipment-prompt"
      : "buildout-equipment.seed-supplies-prompt";
  const { dismissed, dismiss } = useCalloutDismissed(calloutKey);

  // Hide while the user pref is still loading (dismissed === null) so a
  // previously-dismissed prompt never flashes on reload. Also hide once we know
  // the list has been seeded (hasAiItems) or the user can't edit.
  if (dismissed === null || dismissed || hasAiItems || !canEdit) return null;

  async function handleSeed() {
    setStatus("loading");
    try {
      await onSeed();
      setStatus("done");
      dismiss();
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-500)] px-5 py-4 mb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--teal)] mb-1">
            {listType === "equipment"
              ? "Generate a starter equipment list"
              : "Generate a starter supplies list"}
          </p>
          <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
            {listType === "equipment"
              ? "We will populate workstation sections with typical equipment for a specialty coffee shop. Edit or remove anything after."
              : "We will create standard supply categories with typical consumables for a coffee shop. Adjust quantities and costs after."}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss this notice"
          className="flex h-5 w-5 items-center justify-center rounded-md text-[var(--dark-grey)] hover:bg-[var(--neutral-cool-100)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] focus-visible:ring-offset-1 transition-colors shrink-0 mt-0.5"
        >
          <X size={12} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSeed}
          disabled={status === "loading"}
          className="text-xs font-semibold bg-[var(--teal)] text-white px-4 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-60"
        >
          {status === "loading" ? "Generating..." : "Generate list"}
        </button>
        {status === "error" && (
          <span className="text-xs text-[var(--error)]">Could not generate. Try again.</span>
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
  initialCurrencyCode = "USD",
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
  const [importOpen, setImportOpen] = useState(false);
  const [describeOpen, setDescribeOpen] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(true);
  const [showAiMarkings, setShowAiMarkings] = useState(true);
  const [recommendations, setRecommendations] = useState<Map<string, EquipmentRecommendation>>(new Map());

  const pendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestEquipmentRef = useRef<EquipmentItem[]>(initialEquipment);

  const { promoteOnEdit } = useWorkspaceStatus();

  // Fetch AI recommendations for current equipment set (called after load/import/seed).
  const fetchRecommendations = useCallback(async (items: EquipmentItem[]) => {
    const active = items.filter((i) => !i.archived && i.name.trim());
    if (active.length === 0) return;
    try {
      const res = await fetch("/api/workspaces/buildout/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: active.map((i) => ({
            id: i.id,
            name: i.name,
            category: i.category,
            station: i.section_id ?? undefined,
          })),
        }),
      });
      if (!res.ok) return;
      const recs = (await res.json()) as EquipmentRecommendation[];
      setRecommendations(new Map(recs.map((r) => [r.item_id, r])));
    } catch { /* non-blocking */ }
  }, []);

  // Load recommendations on initial mount if items exist.
  useEffect(() => {
    if (initialEquipment.filter((i) => !i.archived).length > 0) {
      void fetchRecommendations(initialEquipment);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load view prefs on mount.
  useEffect(() => {
    async function loadViewPrefs() {
      try {
        const [recRes, markRes] = await Promise.all([
          fetch("/api/ui-prefs/buildout-show-recommendations"),
          fetch("/api/ui-prefs/buildout-show-ai-markings"),
        ]);
        if (recRes.ok) {
          const { data } = await recRes.json() as { data: boolean | null };
          if (data !== null) setShowRecommendations(data);
        }
        if (markRes.ok) {
          const { data } = await markRes.json() as { data: boolean | null };
          if (data !== null) setShowAiMarkings(data);
        }
      } catch { /* non-blocking */ }
    }
    void loadViewPrefs();
  }, []);

  function toggleRecommendations() {
    const next = !showRecommendations;
    setShowRecommendations(next);
    fetch("/api/ui-prefs/buildout-show-recommendations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => {});
  }

  function toggleAiMarkings() {
    const next = !showAiMarkings;
    setShowAiMarkings(next);
    fetch("/api/ui-prefs/buildout-show-ai-markings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => {});
  }

  const showReviewBanner =
    !reviewDismissed &&
    !!initialNeedsReviewAt &&
    !!initialModelUpdatedAtForReview &&
    new Date(initialNeedsReviewAt) > new Date(initialModelUpdatedAtForReview);

  const progress = useMemo(() => ({ filled: equipment.length > 0 ? 1 : 0, total: 1 }), [equipment]);

  useEffect(() => {
    if (progress.filled > 0) promoteOnEdit("buildout_equipment");
  }, [progress.filled, promoteOnEdit]);

  // TIM-1253: removed dead persist() that wrote startup_costs.total_equipment_cents
  // (a field nothing reads). The financial planner now reads buildout_equipment_items
  // directly via shared-read. Individual row saves are handled by SectionedListGrid.

  const scheduleSave = useCallback(
    (eq: EquipmentItem[]) => {
      latestEquipmentRef.current = eq;
      setSaveState({ kind: "dirty" });
      if (pendingSaveTimer.current) clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = setTimeout(() => {
        pendingSaveTimer.current = null;
        setSaveState({ kind: "saved", at: new Date().toISOString() });
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    []
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
    setSaveState({ kind: "saved", at: new Date().toISOString() });
  }

  // TIM-1637: apply Scout's accepted equipment reorganization suggestions.
  // fieldId encodes the proposal: "equipment-item:{item_id}:{section_id|null}:{position}"
  const handleAIApplySuggestions = useCallback(async (accepted: ApprovedChange[]) => {
    const items: { item_id: string; section_id: string | null; position: number }[] = [];
    for (const change of accepted) {
      if (!change.fieldId.startsWith("equipment-item:")) continue;
      const parts = change.fieldId.split(":");
      if (parts.length < 4) continue;
      const item_id = parts[1];
      const section_id = parts[2] === "null" ? null : parts[2];
      const position = parseInt(parts[3], 10);
      if (!item_id || isNaN(position)) continue;
      items.push({ item_id, section_id, position });
    }
    if (items.length === 0) return;
    const res = await fetch("/api/workspaces/buildout/reorganize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      // TIM-1653: surface the failure so the AIReviewModal can show an error
      // and keep the accepted changes visible for retry, instead of closing silently.
      throw new Error("Couldn't apply the reorganization. Your changes are still here - try again.");
    }
    // Refetch to sync local state with persisted arrangement.
    const [eqRes, secRes] = await Promise.all([
      fetch("/api/workspaces/financials/equipment"),
      fetch("/api/workspaces/buildout/sections?list_type=equipment"),
    ]);
    if (eqRes.ok) setEquipment((await eqRes.json()) as EquipmentItem[]);
    if (secRes.ok) setSections((await secRes.json()) as ListSection[]);
  }, []);

  function handleImportCommitted(newItems: EquipmentItem[], newSections: ListSection[]) {
    setEquipment(newItems);
    setSections(newSections);
    scheduleSave(newItems);
    setImportOpen(false);
    void fetchRecommendations(newItems);
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
    void fetchRecommendations(newEq as EquipmentItem[]);
  }

  const lastSavedAt =
    saveState.kind === "saved" ? saveState.at : saveState.kind === "idle" ? saveState.lastSavedAt : null;

  const equipmentSections = sections.filter((s) => s.list_type === "equipment");
  const hasAiEquipment = equipment.some((i) => i.source === "ai_suggested");

  const activeEquipment = equipment.filter((i) => !i.archived);

  // TIM-2598 (Phase 5.0): when ui_revamp_v2 is on, render the v2 card-per-item
  // surface below md and keep the v1 grid at md+. When off, v1 renders at all
  // sizes (unchanged behavior).
  const uiRevampV2 = useUiRevamp();

  return (
    <div className="bg-[var(--background)] min-h-screen">
      <div className="px-6 pt-8 pb-16">
        {/* TIM-1793: canonical chrome — title left, action cluster top-right. */}
        {/* TIM-1894: canonical WorkspaceHeader. "Describe your setup" is the
            filled-primary (the AI hero action, analogous to Financials' Guided
            setup); the board flagged this header as the Item-3 offender for
            having no primary. Other actions are outlined secondaries. */}
        <WorkspaceHeader
          Icon={Wrench}
          title="Equipment & Supplies"
          description="Plan the gear that goes on the bar: espresso machines, grinders, fridges, furniture, and fixtures. Opening-day consumables live on the Supplies page."
          actions={
            <>
            {/* TIM-2413: primary hero CTA + SaveStatusAndButton stay outside;
                secondary utilities (Manage Stations, Import, View options)
                live inside the hamburger. View options become check-style menu
                items so the existing toggle state surfaces inline without a
                nested popover. */}
            {canEdit && (
            <WorkspaceActionButton variant="primary" onClick={() => setDescribeOpen(true)} aria-label="Describe your setup" title="Describe your setup">
              <MessageSquare size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
              <span>Describe your setup</span>
            </WorkspaceActionButton>
          )}
          <WorkspaceActionMenu>
            {({ closeMenu }) => (
              <>
                {canEdit && (
                  <WorkspaceActionMenuItem
                    Icon={Settings2}
                    label="Manage stations"
                    onClick={() => {
                      closeMenu();
                      setSettingsOpen(true);
                    }}
                  />
                )}
                {canEdit && (
                  <WorkspaceActionMenuItem
                    Icon={FileSpreadsheet}
                    label="Import from spreadsheet"
                    onClick={() => {
                      closeMenu();
                      setImportOpen(true);
                    }}
                  />
                )}
                <WorkspaceActionMenuItem
                  Icon={Eye}
                  label="Show recommendations"
                  checked={showRecommendations}
                  onClick={toggleRecommendations}
                />
                <WorkspaceActionMenuItem
                  Icon={Eye}
                  label="Show AI markings"
                  checked={showAiMarkings}
                  onClick={toggleAiMarkings}
                />
              </>
            )}
          </WorkspaceActionMenu>
          {/* TIM-1937: SaveStatusAndButton renders the saved-status text +
              Save as one adjacent unit at the END of the action cluster. */}
          <SaveStatusAndButton
            saving={saveState.kind === "saving"}
            savedAt={saveState.kind === "saved" ? saveState.at : lastSavedAt}
            error={saveState.kind === "error" ? saveState.message : null}
            unsaved={saveState.kind === "dirty"}
            canEdit={canEdit}
            onSave={handleManualSave}
          />
            </>
          }
        />

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

        {/* TIM-1458/TIM-1793: canonical pill sub-nav, left-aligned under header. */}
        <EquipmentSuppliesSubNav active="equipment" />

        <SeedBanner
          canEdit={canEdit}
          listType="equipment"
          hasAiItems={hasAiEquipment}
          onSeed={seedEquipment}
        />
        {/* TIM-2481 (F12): inline reconciliation banner — surfaces only when
            the buildout grid total drifts meaningfully from Financials
            startup_costs.equipment. Sync button opens the cross-suite
            resolver on equipment_mismatch. */}
        <EquipmentReconciliationBanner origin="buildout" className="mb-3" />
        {uiRevampV2 && (
          <div className="md:hidden">
            <EquipmentMobileV2
              items={equipment}
              sections={equipmentSections}
              currencyCode={initialCurrencyCode}
            />
          </div>
        )}
        <div className={uiRevampV2 ? "hidden md:block" : undefined}>
          <SectionedListGrid
            listType="equipment"
            planId={planId}
            canEdit={canEdit}
            sections={equipmentSections}
            items={equipment as AnyItem[]}
            onItemsChange={handleEquipmentChange}
            onSectionsChange={handleSectionsChange}
            recommendations={recommendations}
            showRecommendations={showRecommendations}
            showAiMarkings={showAiMarkings}
            currencyCode={initialCurrencyCode}
          />
        </div>
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

      {importOpen && (
        <SpreadsheetImportModal
          sections={equipmentSections}
          onClose={() => setImportOpen(false)}
          onCommitted={handleImportCommitted}
        />
      )}

      {describeOpen && (
        <DescribeSetupModal
          sections={equipmentSections}
          hasExistingItems={activeEquipment.length > 0}
          onClose={() => setDescribeOpen(false)}
          onCommitted={handleImportCommitted}
        />
      )}

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} variant="copilot_trial" />
      <CoPilotDrawer
        planId={planId}
        workspaceKey="buildout_equipment"
        currentFocus={{ label: "Equipment & Supplies: Equipment" }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
        onApplySuggestions={handleAIApplySuggestions}
      />
    </div>
  );
}
