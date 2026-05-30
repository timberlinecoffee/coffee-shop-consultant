"use client";

// TIM-1458: Supplies page inside the Equipment & Supplies suite.
// Carries forward the TIM-1447 inventory-workspace polish (sticky Startup
// Total banner, View toolbar + AI markings toggle, vendor dropdown via
// SectionedListGrid) but lives as a sibling page to the Equipment page and
// promotes the shared "buildout_equipment" status.

import { useEffect, useMemo, useRef, useState } from "react";
import { Package, X, Eye } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/currency";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import { SectionedListGrid } from "@/components/buildout/SectionedListGrid";
import { EquipmentSuppliesSubNav } from "@/components/buildout/EquipmentSuppliesSubNav";
import type { ListSection, SuppliesItem } from "@/types/buildout";
import type { EquipmentItem } from "@/app/workspace/financials/financials-workspace";

type AnyItem = EquipmentItem | SuppliesItem;

interface Props {
  planId: string;
  initialSupplies: SuppliesItem[];
  initialSections: ListSection[];
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
  initialCurrencyCode?: string;
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
          {status === "loading" ? "Generating..." : "Generate list"}
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
}: Props) {
  const [supplies, setSupplies] = useState<SuppliesItem[]>(initialSupplies);
  const [sections, setSections] = useState<ListSection[]>(initialSections);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
  const [showAiMarkings, setShowAiMarkings] = useState(true);
  const viewOptionsRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!viewOptionsOpen) return;
    function handler(e: MouseEvent) {
      if (viewOptionsRef.current && !viewOptionsRef.current.contains(e.target as Node)) {
        setViewOptionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [viewOptionsOpen]);

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
  const grandTotalCents = useMemo(
    () => activeSupplies.reduce((s, i) => s + i.unit_cost_cents * i.quantity, 0),
    [activeSupplies]
  );
  const sectionCount = suppliesSections.length;
  const itemCount = activeSupplies.length;

  return (
    <div className="bg-[var(--background)] min-h-screen">
      {grandTotalCents > 0 && (
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-[var(--teal-bg-ultra)] shadow-sm">
          <div className="px-6 py-3 flex items-center gap-6">
            <div>
              <p className="text-[10px] font-semibold text-[var(--dark-grey)] uppercase tracking-wide">Startup Total</p>
              <p className="text-xl font-bold text-[var(--teal)]">{formatCurrencyAmount(grandTotalCents / 100, initialCurrencyCode)}</p>
            </div>
            {sectionCount > 0 && (
              <>
                <div className="h-9 w-px bg-[var(--border)]" aria-hidden="true" />
                <div>
                  <p className="text-[10px] font-semibold text-[var(--dark-grey)] uppercase tracking-wide">Sections</p>
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
      <div className="px-6 pt-8 pb-16">
        <header className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-5 h-5 text-[var(--teal)] flex-shrink-0" aria-hidden="true" />
            <h1 className="text-[28px] font-bold text-[var(--foreground)] leading-tight">
              Equipment &amp; Supplies
            </h1>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            Plan the consumables you&apos;ll buy for opening day: cups, lids, dairy, beans, syrups, and cleaning supplies. Vendors live in Suppliers &amp; Vendors.
          </p>
        </header>

        <EquipmentSuppliesSubNav active="supplies" />

        <div className="flex items-center gap-3 mb-5">
          <div className="relative" ref={viewOptionsRef}>
            <button
              type="button"
              onClick={() => setViewOptionsOpen((o) => !o)}
              className={`flex items-center gap-1.5 text-xs font-semibold border rounded-lg px-3 py-1.5 transition-colors ${
                !showAiMarkings
                  ? "text-[var(--teal)] border-[var(--teal)]/50 bg-[var(--teal)]/5"
                  : "text-[var(--muted-foreground)] border-[var(--neutral-cool-200)] hover:bg-[var(--background)]"
              }`}
              aria-label="View options"
            >
              <Eye size={12} aria-hidden="true" />
              View
            </button>
            {viewOptionsOpen && (
              <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-[var(--border)] rounded-xl shadow-lg py-1.5 min-w-[210px]">
                <p className="px-3 py-1 text-[10px] font-semibold text-[var(--dark-grey)] uppercase tracking-wide">Show in workspace</p>
                <label className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--background)] cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-[var(--teal)] cursor-pointer shrink-0"
                    checked={showAiMarkings}
                    onChange={toggleAiMarkings}
                  />
                  <span className="text-xs text-[var(--foreground)]">AI markings</span>
                </label>
              </div>
            )}
          </div>
        </div>

        <SeedBanner
          canEdit={canEdit}
          hasAiItems={hasAiSupplies}
          onSeed={seedSupplies}
        />

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
      </div>

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} variant="copilot_trial" />
      <CoPilotDrawer
        planId={planId}
        workspaceKey="buildout_equipment"
        currentFocus={{ label: "Equipment & Supplies — Supplies" }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
      />
    </div>
  );
}
