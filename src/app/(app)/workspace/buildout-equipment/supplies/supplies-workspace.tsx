"use client";

// TIM-1458: Supplies page inside the Equipment & Supplies suite.
// Carries forward the TIM-1447 inventory-workspace polish (sticky Startup
// Total banner, View toolbar + AI markings toggle, vendor dropdown via
// SectionedListGrid) but lives as a sibling page to the Equipment page and
// promotes the shared "buildout_equipment" status.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, X, Eye } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/currency";
import { PaywallModal } from "@/components/paywall-modal";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import { SectionedListGrid } from "@/components/buildout/SectionedListGrid";
import { EquipmentSuppliesSubNav } from "@/components/buildout/EquipmentSuppliesSubNav";
// TIM-2779 (Phase 6): v2 mobile + desktop surfaces gated by ui_revamp_v2.
import { useUiRevamp } from "@/hooks/useUiRevamp";
import { SuppliesMobileV2 } from "@/components/equipment/SuppliesMobileV2";
import { SuppliesDesktopTable } from "@/components/equipment/SuppliesDesktopTable";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { AskScoutButton } from "@/components/workspace/AskScoutButton";
import {
  WorkspaceActionMenu,
  WorkspaceActionMenuItem,
} from "@/components/workspace/WorkspaceActionMenu";
import { SaveStatusAndButton } from "@/components/workspace/SaveStatusAndButton";
import { suppliesProgress } from "@/components/buildout/equipment-progress";
import type { SuppliesSaveEvent } from "@/components/equipment/SuppliesDesktopTable";
import type { ListSection, SuppliesItem } from "@/types/buildout";
import type { EquipmentItem } from "@/app/(app)/workspace/financials/financials-workspace";

type AnyItem = EquipmentItem | SuppliesItem;

interface Props {
  planId: string;
  initialSupplies: SuppliesItem[];
  initialSections: ListSection[];
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
  initialCurrencyCode?: string;
  showInventoryToast?: boolean;
}

function InventoryRedirectToast() {
  const router = useRouter();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Clean up the ?from=inventory param so it doesn't persist in the URL.
    router.replace("/workspace/buildout-equipment/supplies");
    const t = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      data-testid="inventory-redirect-toast"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[var(--teal)] text-white px-4 py-3 rounded-xl shadow-lg max-w-sm"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <p className="text-sm font-medium flex-1">
        Inventory is now tracked inside Buildout &amp; Equipment.
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="text-white/80 hover:text-white"
        aria-label="Dismiss"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function SeedBanner({
  canEdit,
  hasAiItems,
  onSeed,
}: {
  canEdit: boolean;
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
    <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-500)] px-5 py-4 mb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--teal)] mb-1">Generate a starter supplies list</p>
          <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
            Creates standard supply categories with typical consumables for a coffee shop. Adjust after.
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
          onClick={handleSeed}
          disabled={status === "loading"}
          className="text-xs font-semibold bg-[var(--teal)] text-white px-4 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-60"
        >
          {status === "loading" ? "Generating..." : "Generate List"}
        </button>
        {status === "error" && (
          <span className="text-xs text-[var(--error)]">Could not generate. Try again.</span>
        )}
      </div>
    </div>
  );
}

export function SuppliesWorkspace({
  planId,
  initialSupplies,
  initialSections,
  canEdit,
  initialTrialMessagesUsed,
  initialCurrencyCode = "USD",
  showInventoryToast = false,
}: Props) {
  const [supplies, setSupplies] = useState<SuppliesItem[]>(initialSupplies);
  const [sections, setSections] = useState<ListSection[]>(initialSections);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [showAiMarkings, setShowAiMarkings] = useState(true);

  const { promoteOnEdit } = useWorkspaceStatus();
  // TIM-1458: editing supplies promotes the shared Equipment & Supplies suite.
  useEffect(() => {
    if (supplies.length > 0) promoteOnEdit("buildout_equipment");
  }, [supplies.length, promoteOnEdit]);

  const hasAiSupplies = supplies.some((i) => i.source === "ai_suggested");

  useEffect(() => {
    async function loadViewPrefs() {
      try {
        const res = await fetch("/api/ui-prefs/inventory-show-ai-markings");
        if (res.ok) {
          const { data } = (await res.json()) as { data: boolean | null };
          if (data !== null) setShowAiMarkings(data);
        }
      } catch { /* non-blocking */ }
    }
    void loadViewPrefs();
  }, []);

  // TIM-4108: the hand-rolled view dropdown and its outside-click handling are
  // gone. The toggle lives in the shared ⋯ menu now, which already handles
  // outside clicks, Escape, and arrow-key navigation — none of which this
  // bespoke copy did.

  function toggleAiMarkings() {
    const next = !showAiMarkings;
    setShowAiMarkings(next);
    fetch("/api/ui-prefs/inventory-show-ai-markings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => {});
  }

  async function seedSupplies() {
    const res = await fetch("/api/workspaces/buildout/supplies/seed", { method: "POST" });
    if (!res.ok) throw new Error(`seed failed (${res.status})`);
    const [supRes, secRes] = await Promise.all([
      fetch("/api/workspaces/buildout/supplies"),
      fetch("/api/workspaces/buildout/sections?list_type=supplies"),
    ]);
    if (!supRes.ok || !secRes.ok) throw new Error("reload failed");
    const [newSup, newSec] = await Promise.all([supRes.json(), secRes.json()]);
    setSupplies(newSup as SuppliesItem[]);
    setSections(newSec as ListSection[]);
  }

  function handleSuppliesChange(next: AnyItem[]) {
    setSupplies(next as SuppliesItem[]);
  }

  function handleSectionsChange(next: ListSection[]) {
    setSections(next);
  }

  const suppliesSections = sections.filter((s) => s.list_type === "supplies");

  const activeSupplies = supplies.filter((i) => !i.archived);

  // TIM-2779 (Phase 6): v2 surfaces gated by ui_revamp_v2.
  const uiRevampV2 = useUiRevamp();
  const grandTotalCents = useMemo(
    () => activeSupplies.reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0),
    [activeSupplies]
  );
  const sectionCount = suppliesSections.length;
  const itemCount = activeSupplies.length;

  // TIM-4108 (UX Phase 3): this page had no save indicator, because each row
  // saves itself and there was nothing page-level to report. It has one now,
  // driven by the real writes rather than by keystrokes — the table fires these
  // around the request, not when the owner types.
  const [saveState, setSaveState] = useState<{
    saving: boolean;
    savedAt: string | null;
    unsaved: boolean;
    error: string | null;
  }>({ saving: false, savedAt: null, unsaved: false, error: null });

  const handleSaveActivity = useCallback((event: SuppliesSaveEvent) => {
    setSaveState((prev) => {
      switch (event) {
        case "pending":
          return { ...prev, unsaved: true, error: null };
        case "saving":
          return { ...prev, saving: true, error: null };
        case "saved":
          return {
            saving: false,
            savedAt: new Date().toISOString(),
            unsaved: false,
            error: null,
          };
        case "failed":
          // The row still shows the owner's edit, which is exactly why this has
          // to say so rather than quietly settling on "Saved".
          return {
            ...prev,
            saving: false,
            unsaved: true,
            error: "Could not save that change.",
          };
      }
    });
  }, []);

  // Lets the Save button flush pending edits immediately instead of waiting out
  // the debounce. Pressing Save should mean now.
  const flushRef = useRef<(() => void) | null>(null);

  return (
    <div className="bg-[var(--background)] min-h-screen">
      {showInventoryToast && <InventoryRedirectToast />}
      {grandTotalCents > 0 && (
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-[var(--teal-bg-ultra)] shadow-sm">
          <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-4 sm:gap-6">
            <div>
              <p className="text-[10px] font-semibold text-[var(--dark-grey)] uppercase tracking-wide">Startup Total</p>
              <p className="text-xl font-bold text-[var(--teal)]">{formatCurrencyAmount(grandTotalCents / 100, initialCurrencyCode)}</p>
            </div>
            {sectionCount > 0 && (
              <>
                <div className="h-9 w-px bg-[var(--border)]" aria-hidden="true" />
                <div>
                  <p className="text-[10px] font-semibold text-[var(--dark-grey)] uppercase tracking-wide">Categories</p>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{sectionCount}</p>
                </div>
              </>
            )}
            {itemCount > 0 && (
              <>
                <div className="h-9 w-px bg-[var(--border)]" aria-hidden="true" />
                <div>
                  <p className="text-[10px] font-semibold text-[var(--dark-grey)] uppercase tracking-wide">Items</p>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{itemCount}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <div className="px-4 sm:px-6 pt-8 pb-16">
        {/* TIM-1793: canonical chrome — title left, action cluster top-right. */}
        {/* TIM-1894: canonical WorkspaceHeader (View filter is the only action;
            no hero primary on the Supplies tab). */}
        <WorkspaceHeader
          Icon={Package}
          title="Equipment & Supplies"
          description="Plan the consumables you'll buy for opening day: cups, lids, dairy, beans, syrups, and cleaning supplies. Vendors live in Suppliers & Vendors."
          scout={
            /* TIM-4108, Trent's call 2026-08-02: Supplies had no Scout at all.
               It was the only workspace without one, which made it the only
               place a first-time owner could not ask for help from the header
               they had learned everywhere else. */
            <AskScoutButton
              workspaceKey="buildout_equipment"
              focusLabel="supplies list"
              hasContent={itemCount > 0}
            />
          }
          overflow={
            /* The view filter was a hand-rolled dropdown living where the
               action cluster goes. It is a low-frequency toggle, so it belongs
               in the ⋯ menu with the other view toggles on the Equipment tab —
               same control, same place, on both pages of this suite.

               Like Equipment, this page has NO emphasised button: supplies are
               added per category, and each category carries its own add row. */
            <WorkspaceActionMenu hideAdvisor>
              {({ closeMenu }) => (
                <WorkspaceActionMenuItem
                  Icon={Eye}
                  label="Show AI markings"
                  checked={showAiMarkings}
                  onClick={() => {
                    toggleAiMarkings();
                    closeMenu();
                  }}
                />
              )}
            </WorkspaceActionMenu>
          }
          save={
            <SaveStatusAndButton
              saving={saveState.saving}
              savedAt={saveState.savedAt}
              unsaved={saveState.unsaved}
              error={saveState.error}
              canEdit={canEdit}
              onSave={() => flushRef.current?.()}
            />
          }
          progress={suppliesProgress({
            items: itemCount,
            categories: sectionCount,
          })}
        />

        <EquipmentSuppliesSubNav active="supplies" />

        <SeedBanner
          canEdit={canEdit}
          hasAiItems={hasAiSupplies}
          onSeed={seedSupplies}
        />

        {/* TIM-2779 (Phase 6): v2 mobile + desktop — gated by ui_revamp_v2. */}
        {uiRevampV2 ? (
          <>
            <div className="md:hidden">
              <SuppliesMobileV2
                items={supplies}
                sections={suppliesSections}
                currencyCode={initialCurrencyCode}
              />
            </div>
            <div className="hidden md:block">
              <SuppliesDesktopTable
                planId={planId}
                canEdit={canEdit}
                items={supplies}
                sections={suppliesSections}
                onItemsChange={handleSuppliesChange}
                currencyCode={initialCurrencyCode}
                onSaveActivity={handleSaveActivity}
                flushRef={flushRef}
              />
            </div>
          </>
        ) : (
          <SectionedListGrid
            listType="supplies"
            planId={planId}
            canEdit={canEdit}
            sections={suppliesSections}
            items={supplies as AnyItem[]}
            onItemsChange={handleSuppliesChange}
            onSectionsChange={handleSectionsChange}
            showAiMarkings={showAiMarkings}
            currencyCode={initialCurrencyCode}
          />
        )}
      </div>

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} variant="copilot_trial" />
    </div>
  );
}
