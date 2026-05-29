"use client";

// TIM-1171: Inventory workspace — supplies list (cups, lids, dairy, beans,
// syrups, cleaning supplies). v1 = simple list. No tracking, depletion, or
// reorder logic in v1. Suppliers reference points to Suppliers & Vendors.

import { useState } from "react";
import Link from "next/link";
import { Package, X } from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { SectionedListGrid } from "@/components/buildout/SectionedListGrid";
import type { ListSection, SuppliesItem } from "@/types/buildout";
import type { EquipmentItem } from "@/app/workspace/financials/financials-workspace";

type AnyItem = EquipmentItem | SuppliesItem;

interface Props {
  planId: string;
  initialSupplies: SuppliesItem[];
  initialSections: ListSection[];
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
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

export function InventoryWorkspace({
  planId,
  initialSupplies,
  initialSections,
  canEdit,
  initialTrialMessagesUsed,
}: Props) {
  const [supplies, setSupplies] = useState<SuppliesItem[]>(initialSupplies);
  const [sections, setSections] = useState<ListSection[]>(initialSections);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const hasAiSupplies = supplies.some((i) => i.source === "ai_suggested");

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

  return (
    <div className="bg-[var(--background)] min-h-screen">
      <div className="px-6 pt-8 pb-16">
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-5 h-5 text-[var(--teal)] flex-shrink-0" aria-hidden="true" />
            <h1 className="font-bold text-[var(--foreground)]" style={{ fontSize: "28px" }}>
              Inventory
            </h1>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            Track consumables and supplies — cups, lids, dairy, beans, syrups, and cleaning supplies.
            Vendors live in{" "}
            <Link href="/workspace/suppliers" className="text-[var(--teal)] underline decoration-dotted hover:decoration-solid">
              Suppliers &amp; Vendors
            </Link>
            .
          </p>
        </header>

        {/* v2 backlog notice */}
        <div className="mb-5 rounded-xl border border-[var(--neutral-cool-200)] bg-[var(--neutral-cool-50)] px-4 py-3">
          <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-0.5">Roadmap note</p>
          <p className="text-xs text-[var(--neutral-cool-600)] leading-relaxed">
            v2 will add inventory tracking (counts, reorder thresholds, depletion logic) — do not build in v1.
          </p>
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
        />
      </div>

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} variant="copilot_trial" />
      <CoPilotDrawer
        planId={planId}
        workspaceKey="inventory"
        currentFocus={{ label: "Inventory" }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
      />
    </div>
  );
}
