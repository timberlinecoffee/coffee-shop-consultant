"use client";

// TIM-1061: Operations Playbook workspace — SOP tabs plus the V1 binder
// sections added in TIM-1416 (Menu-sourced recipes, roles, vendor contacts,
// training checklist).
// TIM-2776: v2 layout — WorkspaceHeader + AccordionSection replacing the
// sidebar+single-section pattern (matches FinancialsV2).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Sparkles,
  ExternalLink,
  Printer,
  TrendingUp,
  ChevronDown,
  CheckCircle,
  Circle,
  Minus,
} from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { useAIReviewModal, type ApprovedChange } from "@/hooks/useAIReviewModal";
import { WorkspaceSubNav } from "@/components/workspace/WorkspaceSubNav";
import { BenchmarkDashboard } from "@/components/benchmark/BenchmarkDashboard";
import { AskScoutButton } from "@/components/workspace/AskScoutButton";
import { SaveIndicator } from "@/components/ui/save-indicator";
import { SectionHelp } from "@/components/ui/section-help";
import { InfoTip } from "@/components/ui/info-tip";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import {
  type OperationsPlaybookDocument,
  type SopCategoryKey,
  type SopChecklistItem,
  type SopCadence,
  type RoleAssignment,
  type VendorContact,
  type TrainingItem,
  type TrainingPhase,
  type OperationsSectionKey,
  SOP_CATEGORY_KEYS,
  TRAINING_PHASE_KEYS,
  TRAINING_PHASE_LABELS,
  RECIPES_SECTION_KEY,
  OPERATIONS_SECTION_KEYS,
  operationsSectionLabel,
  operationsSectionTagline,
} from "@/lib/operations-playbook";
import type { OperationsRecipeCard } from "@/lib/operations-recipes";
import { groupRecipeCardsByCategory } from "@/lib/operations-recipes";

// ── Shared styles — match Concept / Marketing tokens ────────────────────────

const inputCls =
  "w-full text-sm border border-[var(--border-medium)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";
const textareaCls = `${inputCls} resize-none leading-relaxed`;
const labelCls = "block text-xs font-medium text-[var(--muted-foreground)] mb-1";

function localId() {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Accordion types & components ─────────────────────────────────────────────
// TIM-2776: pattern lifted from FinancialsV2 (financials-v2.tsx).

type SectionStatus = "complete" | "in_progress" | "empty";

function StatusBadge({ status }: { status: SectionStatus }) {
  if (status === "complete") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--teal)] bg-[var(--teal-tint-100)] border border-[var(--teal-tint)] px-2 py-0.5 rounded-full shrink-0">
        <CheckCircle size={10} aria-hidden="true" />
        Complete
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
        <Circle size={10} aria-hidden="true" />
        In progress
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--muted-foreground)] bg-[var(--background)] border border-[var(--border)] px-2 py-0.5 rounded-full shrink-0">
      <Minus size={10} aria-hidden="true" />
      Empty
    </span>
  );
}

function AccordionSection({
  title,
  status,
  defaultOpen = false,
  children,
}: {
  title: string;
  status: SectionStatus;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--background)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <ChevronDown
            size={16}
            className={`text-[var(--muted-foreground)] transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-[var(--foreground)]">{title}</span>
        </div>
        <StatusBadge status={status} />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-[var(--border)] space-y-5">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function PlaybookProgressBar({ statuses }: { statuses: SectionStatus[] }) {
  const complete = statuses.filter((s) => s === "complete").length;
  const pct = Math.round((complete / statuses.length) * 100);
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          Playbook completion
        </span>
        <span className="text-xs font-semibold text-[var(--teal)]">
          {complete} of {statuses.length} sections complete
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--teal)] transition-all duration-300"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

// ── Section-status derivers ───────────────────────────────────────────────────

function getSectionStatus(
  doc: OperationsPlaybookDocument,
  key: OperationsSectionKey,
  recipeCount: number,
): SectionStatus {
  if (key === RECIPES_SECTION_KEY) return recipeCount > 0 ? "complete" : "empty";
  if ((SOP_CATEGORY_KEYS as readonly string[]).includes(key)) {
    const cat = doc[key as SopCategoryKey];
    if (cat.items.length > 0) return "complete";
    if (cat.intro?.trim()) return "in_progress";
    return "empty";
  }
  if (key === "roles") {
    const s = doc.roles;
    if (s.items.length > 0) return "complete";
    if (s.intro?.trim()) return "in_progress";
    return "empty";
  }
  if (key === "vendor_contacts") {
    const s = doc.vendor_contacts;
    if (s.items.length > 0) return "complete";
    if (s.intro?.trim()) return "in_progress";
    return "empty";
  }
  if (key === "training") {
    const s = doc.training;
    if (s.items.length > 0) return "complete";
    if (s.intro?.trim()) return "in_progress";
    return "empty";
  }
  return "empty";
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  planId: string;
  canEdit: boolean;
  initialDoc: OperationsPlaybookDocument;
  conceptShopIdentity: string;
  initialTrialMessagesUsed?: number;
  initialRecipeCards: OperationsRecipeCard[];
}

type GeneratableSection = SopCategoryKey | "roles" | "vendor_contacts" | "training";
type OperationsView = "playbook" | "how-you-compare";

export function OperationsPlaybookWorkspace({
  planId,
  canEdit,
  initialDoc,
  initialTrialMessagesUsed,
  initialRecipeCards,
}: Props) {
  const [doc, setDoc] = useState<OperationsPlaybookDocument>(initialDoc);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [paywallReason, setPaywallReason] = useState<
    "no_subscription" | "paused" | "expired" | null
  >(null);
  const [generating, setGenerating] = useState<GeneratableSection | null>(null);
  const { openAIReviewModal, AIReviewModalNode } = useAIReviewModal();
  const { openAIReviewModal: openBenchmarkAIReviewModal, AIReviewModalNode: benchmarkAIReviewModalNode } = useAIReviewModal();
  const [activeView, setActiveView] = useState<OperationsView>("playbook");
  const [benchmarkYellowCount, setBenchmarkYellowCount] = useState(0);

  const opsTabs: { id: OperationsView; label: string; Icon?: typeof TrendingUp; badge?: number }[] = [
    { id: "playbook", label: "Playbook" },
    { id: "how-you-compare", label: "How You Compare", Icon: TrendingUp, badge: benchmarkYellowCount || undefined },
  ];

  const { promoteOnEdit } = useWorkspaceStatus();
  // Auto-promote not_started → in_progress on first successful save.
  useEffect(() => {
    if (savedAt) promoteOnEdit("operations_playbook");
  }, [savedAt, promoteOnEdit]);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const save = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/workspaces/operations_playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: docRef.current }),
      });
      if (res.status === 402) {
        const body = await res.json().catch(() => null);
        setPaywallReason(body?.reason ?? "no_subscription");
        return;
      }
      if (res.ok) {
        setSavedAt(new Date().toISOString());
      }
    } finally {
      setSaving(false);
    }
  }, [canEdit]);

  // Debounced autosave on doc change (skips initial mount).
  const initialMount = useRef(true);
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      void save();
    }, 700);
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [doc, save]);

  const updateDoc = useCallback(
    (mut: (d: OperationsPlaybookDocument) => OperationsPlaybookDocument) => {
      setDoc((prev) => mut(prev));
    },
    [],
  );

  // TIM-1561: routes AI result through unified review modal before applying.
  // TIM-2382: apply Scout suggest_workspace_changes proposals for operations playbook.
  // fieldId = "sectionKey" (full section JSON replacement) or "sectionKey.intro"
  // (intro text only). Doc autosaves via useEffect watcher.
  const handleApplyPlaybookSuggestions = useCallback(async (accepted: ApprovedChange[]) => {
    setDoc((prev) => {
      let next = { ...prev };
      for (const c of accepted) {
        const dotIdx = c.fieldId.indexOf(".");
        const section = dotIdx === -1 ? c.fieldId : c.fieldId.slice(0, dotIdx);
        const subField = dotIdx === -1 ? "" : c.fieldId.slice(dotIdx + 1);
        if (subField === "intro") {
          const s = next[section as keyof OperationsPlaybookDocument] as { intro: string };
          if (s && typeof s === "object" && "intro" in s) {
            next = { ...next, [section]: { ...s, intro: c.finalValue } };
          }
        } else {
          try {
            const val = JSON.parse(c.finalValue) as OperationsPlaybookDocument[keyof OperationsPlaybookDocument];
            next = { ...next, [section as keyof OperationsPlaybookDocument]: val };
          } catch { /* ignore non-JSON */ }
        }
      }
      return next;
    });
  }, []);

  // Section statuses for progress bar
  const statuses = OPERATIONS_SECTION_KEYS.map((key) =>
    getSectionStatus(doc, key, initialRecipeCards.length),
  );

  return (
    <>
    {AIReviewModalNode}
    {benchmarkAIReviewModalNode}
    <div className="bg-[var(--background)] min-h-screen">
      <div className="w-full px-6 pt-8 pb-16">
        {/* TIM-1894: canonical WorkspaceHeader — description in the left column
            under the title, SaveIndicator + Print action top-right, matching
            Financials (was description full-width below the title row). Header
            spans full width above the 2-col grid. */}
        <WorkspaceHeader
          Icon={ClipboardList}
          title="Operations Playbook"
          description="Your planning binder: policies, schedules, and templates your team needs before opening day. Edit anything."
          actions={
            <>
              {/* TIM-2382: Scout-as-hub entry point for AI section improvement. */}
              <AskScoutButton
                workspaceKey="operations_playbook"
                focusLabel="operations playbook"
                hasContent={Object.values(doc).some((v) =>
                  v && typeof v === "object" && "items" in v
                    ? (v as { items: unknown[] }).items.length > 0
                    : false
                )}
              />
              {/* TIM-1937 (board refinement bae7ef73): icon-only collapse <1536px. */}
              <WorkspaceActionButton
                className="hidden sm:flex"
                onClick={() =>
                  window.open(
                    "/workspace/operations-playbook/print",
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
                aria-label="Print all"
                title="Open a print-friendly view of your operations playbook"
              >
                <Printer size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
                <span>Print all</span>
              </WorkspaceActionButton>
              <SaveIndicator saving={saving} savedAt={savedAt} canEdit={canEdit} />
            </>
          }
        />

        {/* TIM-2472: top-level view switcher — Playbook vs How You Compare */}
        <div className="mb-5">
          <WorkspaceSubNav
            tabs={opsTabs.map((t) => ({ key: t.id, label: t.label, Icon: t.Icon, badge: t.badge }))}
            active={activeView}
            onSelect={setActiveView}
            ariaLabel="Operations Playbook views"
            className="mb-0"
          />
        </div>

        {/* TIM-2776: accordion layout — replaces sidebar + single-section pattern */}
        {activeView === "playbook" && (
          <div>
            <PlaybookProgressBar statuses={statuses} />
            <div className="space-y-3">
              {OPERATIONS_SECTION_KEYS.map((key, i) => {
                const status = statuses[i];
                const label = operationsSectionLabel(key);

                return (
                  <AccordionSection
                    key={key}
                    title={label}
                    status={status}
                    defaultOpen={i === 0}
                  >
                    {(SOP_CATEGORY_KEYS as readonly string[]).includes(key) && (
                      <CategoryEditor
                        categoryKey={key as SopCategoryKey}
                        label={label}
                        tagline={operationsSectionTagline(key)}
                        canEdit={canEdit}
                        doc={doc}
                        updateDoc={updateDoc}
                        onGenerate={() => handleGenerate(key as SopCategoryKey)}
                        generating={generating === key}
                      />
                    )}

                    {key === RECIPES_SECTION_KEY && (
                      <RecipesPanel cards={initialRecipeCards} />
                    )}

                    {key === "roles" && (
                      <RolesEditor
                        label={label}
                        tagline={operationsSectionTagline(key)}
                        canEdit={canEdit}
                        doc={doc}
                        updateDoc={updateDoc}
                        onGenerate={() => handleGenerate("roles")}
                        generating={generating === "roles"}
                      />
                    )}

                    {key === "vendor_contacts" && (
                      <VendorContactsEditor
                        label={label}
                        tagline={operationsSectionTagline(key)}
                        canEdit={canEdit}
                        doc={doc}
                        updateDoc={updateDoc}
                        onGenerate={() => handleGenerate("vendor_contacts")}
                        generating={generating === "vendor_contacts"}
                      />
                    )}

                    {key === "training" && (
                      <TrainingEditor
                        label={label}
                        tagline={operationsSectionTagline(key)}
                        canEdit={canEdit}
                        doc={doc}
                        updateDoc={updateDoc}
                        onGenerate={() => handleGenerate("training")}
                        generating={generating === "training"}
                      />
                    )}
                  </AccordionSection>
                );
              })}
            </div>
          </div>
        )}

        {activeView === "how-you-compare" && (
          <BenchmarkDashboard
            workspaceSlug="operations-playbook"
            onYellowCountChange={setBenchmarkYellowCount}
            onAskBenchmark={(metricId, metricLabel) => {
              // TIM-2450: hand off to the Scout drawer in Benchmark mode with
              // the metric in scope.
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("copilot:open-in-mode", {
                    detail: {
                      mode: "benchmark",
                      scope: "operations_playbook",
                      focus: { metricId, metricLabel },
                    },
                  }),
                );
              }
            }}
            onApplySuggestion={(drilldown) => {
              const proposed = drilldown.proposedFormatted ?? drilldown.userValue;
              openBenchmarkAIReviewModal({
                suggestions: [
                  {
                    id: `bench:${drilldown.metricId}`,
                    fieldId: drilldown.metricId,
                    fieldLabel: drilldown.metricLabel,
                    originalValue: drilldown.userValue,
                    proposedValue: proposed,
                  },
                ],
                context: { workspace: "operations_playbook", section: "How You Compare" },
                onApply: async () => {
                  // Phase 3: review-modal-only path; per-metric write paths
                  // follow in a child issue.
                },
              });
            }}
          />
        )}
      </div>

      <CoPilotDrawer
        planId={planId}
        workspaceKey="operations_playbook"
        currentFocus={{ label: activeView === "how-you-compare" ? "How You Compare" : "Playbook" }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
        onApplySuggestions={handleApplyPlaybookSuggestions}
      />

      <PaywallModal
        open={paywallReason !== null}
        reason={paywallReason ?? "no_subscription"}
        onClose={() => setPaywallReason(null)}
      />
    </div>
    </>
  );
}

// ── Category editor (shared shape for SOPs) ─────────────────────────────────

interface CategoryEditorProps {
  categoryKey: SopCategoryKey;
  label: string;
  tagline: string;
  canEdit: boolean;
  doc: OperationsPlaybookDocument;
  updateDoc: (mut: (d: OperationsPlaybookDocument) => OperationsPlaybookDocument) => void;
}

function CategoryEditor({
  categoryKey,
  label,
  tagline,
  canEdit,
  doc,
  updateDoc,
}: CategoryEditorProps) {
  const category = doc[categoryKey];
  const useStation = categoryKey === "cleaning";
  const useDuration =
    categoryKey === "opening" ||
    categoryKey === "closing" ||
    categoryKey === "cleaning";
  // TIM-1501: Opening / Closing surfaces read as a real checklist — checkbox
  // rows with hairline dividers. Cleaning keeps its station grouping; cash
  // handling and food safety stay as longer-form prose rows.
  const checklistStyle = categoryKey === "opening" || categoryKey === "closing";

  function patchItem(idx: number, patch: Partial<SopChecklistItem>) {
    updateDoc((d) => {
      const cat = d[categoryKey];
      const items = cat.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
      return { ...d, [categoryKey]: { ...cat, items } };
    });
  }

  function move(idx: number, delta: -1 | 1) {
    updateDoc((d) => {
      const cat = d[categoryKey];
      const next = idx + delta;
      if (next < 0 || next >= cat.items.length) return d;
      const items = cat.items.slice();
      [items[idx], items[next]] = [items[next], items[idx]];
      return { ...d, [categoryKey]: { ...cat, items } };
    });
  }

  function remove(idx: number) {
    updateDoc((d) => {
      const cat = d[categoryKey];
      const items = cat.items.filter((_, i) => i !== idx);
      return { ...d, [categoryKey]: { ...cat, items } };
    });
  }

  function addItem() {
    updateDoc((d) => {
      const cat = d[categoryKey];
      const newItem: SopChecklistItem = {
        id: localId(),
        text: "",
        duration_min: null,
        station: useStation ? "Bar" : null,
        cadence: useStation ? "daily" : null,
      };
      return { ...d, [categoryKey]: { ...cat, items: [...cat.items, newItem] } };
    });
  }

  function setIntro(intro: string) {
    updateDoc((d) => ({ ...d, [categoryKey]: { ...d[categoryKey], intro } }));
  }

  // Group cleaning items visually by station so the editor mirrors the printed shop view.
  const grouped = useMemo(() => {
    if (!useStation) return null;
    const map = new Map<string, number[]>();
    category.items.forEach((item, idx) => {
      const station = item.station ?? "Other";
      const list = map.get(station) ?? [];
      list.push(idx);
      map.set(station, list);
    });
    return Array.from(map.entries());
  }, [useStation, category.items]);

  return (
    <div>
      <SectionHeader
        label={label}
        tagline={tagline}
        printDocKey={categoryKey}
      />

      <div className="mb-5">
        {/* TIM-1477: helper one-liner moved into a "?" popup beside the
            question label, matching the Financial / Concept Suite pattern.
            The old "Tip: Title each step…" footer is folded in here. */}
        <span className="flex items-center gap-1.5 mb-1">
          <label className={labelCls.replace(" mb-1", "")}>How this SOP works</label>
          <InfoTip label="How this SOP works">
            A one-line description for your team that frames the whole
            checklist. Title each step so a brand-new barista could follow it
            without asking questions.
          </InfoTip>
        </span>
        <textarea
          className={textareaCls}
          rows={3}
          value={category.intro}
          onChange={(e) => setIntro(e.target.value)}
          disabled={!canEdit}
          placeholder="A one-line description for your team."
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          {category.items.length} {category.items.length === 1 ? "step" : "steps"}
        </span>
        {category.last_generated_at && (
          <LastGeneratedAt at={category.last_generated_at} />
        )}
      </div>

      {grouped ? (
        <div className="space-y-5">
          {grouped.map(([station, indexes]) => (
            <div key={station}>
              <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-2">
                {station}
              </h3>
              <ol className="space-y-2">
                {indexes.map((idx) => (
                  <ChecklistItemRow
                    key={category.items[idx].id}
                    item={category.items[idx]}
                    idx={idx}
                    total={category.items.length}
                    canEdit={canEdit}
                    useStation={useStation}
                    useDuration={useDuration}
                    onPatch={patchItem}
                    onMove={move}
                    onRemove={remove}
                  />
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : checklistStyle ? (
        <ol className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {category.items.map((item, idx) => (
            <ChecklistRow
              key={item.id}
              item={item}
              idx={idx}
              total={category.items.length}
              canEdit={canEdit}
              useDuration={useDuration}
              onPatch={patchItem}
              onMove={move}
              onRemove={remove}
            />
          ))}
        </ol>
      ) : (
        <ol className="space-y-2">
          {category.items.map((item, idx) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              idx={idx}
              total={category.items.length}
              canEdit={canEdit}
              useStation={useStation}
              useDuration={useDuration}
              onPatch={patchItem}
              onMove={move}
              onRemove={remove}
            />
          ))}
        </ol>
      )}

      {category.items.length === 0 && (
        <p className="text-xs text-[var(--dark-grey)] italic py-4 text-center">
          No steps yet. Add your first step below or have AI draft a starter
          checklist for you.
        </p>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={addItem}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add step
        </button>
      )}
      {/* TIM-1477: inline "Tip" one-liner removed — folded into the InfoTip
          beside the "How this SOP works" question label above. */}
    </div>
  );
}

function SectionHeader({
  label,
  tagline,
  printDocKey,
}: {
  label: string;
  tagline: string;
  canEdit?: boolean;
  printDocKey?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex-1 min-w-0 flex items-center gap-1">
        <SectionHelp title={label}>{tagline}</SectionHelp>
      </div>
      {printDocKey && (
        <Link
          href={`/workspace/operations-playbook/print?doc=${printDocKey}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 px-3 py-1.5 rounded-lg border border-[var(--teal)]/30 transition-colors flex-shrink-0"
          aria-label={`Print ${label}`}
        >
          <Printer className="w-3.5 h-3.5" />
          Print
        </Link>
      )}
    </div>
  );
}

function LastGeneratedAt({ at }: { at: string }) {
  return (
    <span className="text-[10px] text-[var(--dark-grey)]">
      AI improved{" "}
      {new Date(at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}
    </span>
  );
}

interface ChecklistItemRowProps {
  item: SopChecklistItem;
  idx: number;
  total: number;
  canEdit: boolean;
  useStation: boolean;
  useDuration: boolean;
  onPatch: (idx: number, patch: Partial<SopChecklistItem>) => void;
  onMove: (idx: number, delta: -1 | 1) => void;
  onRemove: (idx: number) => void;
}

function ChecklistItemRow({
  item,
  idx,
  total,
  canEdit,
  useStation,
  useDuration,
  onPatch,
  onMove,
  onRemove,
}: ChecklistItemRowProps) {
  return (
    <li className="flex items-start gap-2">
      <div className="flex flex-col gap-0.5 pt-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => onMove(idx, -1)}
          disabled={!canEdit || idx === 0}
          aria-label="Move step up"
          className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowUp className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => onMove(idx, 1)}
          disabled={!canEdit || idx === total - 1}
          aria-label="Move step down"
          className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowDown className="w-3 h-3" />
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <textarea
          rows={2}
          className={textareaCls}
          value={item.text}
          onChange={(e) => onPatch(idx, { text: e.target.value })}
          disabled={!canEdit}
          placeholder="What does your team do at this step?"
        />
        {(useStation || useDuration) && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {useStation && (
              <>
                <select
                  className="text-[11px] border border-[var(--border-medium)] rounded-md px-2 py-1 text-[var(--muted-foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)]"
                  value={item.station ?? "Bar"}
                  onChange={(e) => onPatch(idx, { station: e.target.value })}
                  disabled={!canEdit}
                  aria-label="Station"
                >
                  {["Bar", "Retail Floor", "Restroom", "Walk-In", "Dish", "Other"].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
                <select
                  className="text-[11px] border border-[var(--border-medium)] rounded-md px-2 py-1 text-[var(--muted-foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)]"
                  value={item.cadence ?? "daily"}
                  onChange={(e) =>
                    onPatch(idx, { cadence: e.target.value as SopCadence })
                  }
                  disabled={!canEdit}
                  aria-label="Cadence"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </>
            )}
            {useDuration && !useStation && (
              <div className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                <input
                  type="number"
                  min={0}
                  max={120}
                  className="w-14 border border-[var(--border-medium)] rounded-md px-2 py-1 text-[var(--foreground)] text-right focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)]"
                  value={item.duration_min ?? ""}
                  onChange={(e) =>
                    onPatch(idx, {
                      duration_min:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  disabled={!canEdit}
                  placeholder="—"
                  aria-label="Duration in minutes"
                />
                <span>min</span>
              </div>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(idx)}
        disabled={!canEdit}
        aria-label="Remove step"
        className="text-[var(--dark-grey)] hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 mt-1"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

// TIM-1501: Compact "feels like a checklist" row used by opening / closing.
// Local checkbox state (planning surface — not a daily execution log; see
// TIM-1413 charter). Single-line text input, hairline-divided rows, and
// move/delete affordances revealed on row hover.
interface ChecklistRowProps {
  item: SopChecklistItem;
  idx: number;
  total: number;
  canEdit: boolean;
  useDuration: boolean;
  onPatch: (idx: number, patch: Partial<SopChecklistItem>) => void;
  onMove: (idx: number, delta: -1 | 1) => void;
  onRemove: (idx: number) => void;
}

function ChecklistRow({
  item,
  idx,
  total,
  canEdit,
  useDuration,
  onPatch,
  onMove,
  onRemove,
}: ChecklistRowProps) {
  const [checked, setChecked] = useState(false);
  const checkboxId = `chk_${item.id}`;
  return (
    <li className="group flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-3">
      {/* TIM-1678: full-width text row — label can no longer truncate mid-word */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="h-4 w-4 flex-shrink-0 rounded border-[var(--border-medium)] text-[var(--teal)] accent-[var(--teal)] focus-visible:outline-none focus:ring-1 focus:ring-[var(--teal)]"
          aria-label={`Mark step ${idx + 1} done`}
        />
        <label htmlFor={checkboxId} className="sr-only">
          Mark step {idx + 1} done
        </label>
        <input
          type="text"
          className={`flex-1 min-w-0 text-sm bg-transparent border-0 px-0 py-1 text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus-visible:outline-none focus:ring-0 disabled:text-[var(--dark-grey)] ${checked ? "line-through text-[var(--muted-foreground)]" : ""}`}
          value={item.text}
          onChange={(e) => onPatch(idx, { text: e.target.value })}
          disabled={!canEdit}
          placeholder="What does your team do at this step?"
          aria-label="Step description"
        />
      </div>
      {/* TIM-1678: secondary row on mobile — duration + actions indented to align with text */}
      <div className="flex items-center gap-2 pl-7 sm:pl-0">
        {useDuration && (
          <div className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
            <input
              type="number"
              min={0}
              max={120}
              className="w-12 border border-[var(--border-medium)] rounded-md px-1.5 py-0.5 text-[var(--foreground)] text-right focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)]"
              value={item.duration_min ?? ""}
              onChange={(e) =>
                onPatch(idx, {
                  duration_min:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
              disabled={!canEdit}
              placeholder="—"
              aria-label="Duration in minutes"
            />
            <span>min</span>
          </div>
        )}
        <div className="flex items-center gap-0.5 flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onMove(idx, -1)}
            disabled={!canEdit || idx === 0}
            aria-label="Move step up"
            className="p-1 text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(idx, 1)}
            disabled={!canEdit || idx === total - 1}
            aria-label="Move step down"
            className="p-1 text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(idx)}
            disabled={!canEdit}
            aria-label="Remove step"
            className="p-1 text-[var(--dark-grey)] hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

// ── Recipes panel (read-only, Menu-sourced) ─────────────────────────────────

function RecipesPanel({ cards }: { cards: OperationsRecipeCard[] }) {
  const grouped = useMemo(() => groupRecipeCardsByCategory(cards), [cards]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <SectionHelp title="Drink Recipes">
            Read-only view of the recipes you build in the Menu workspace. Edit
            a recipe by opening the menu item. Tip: add the prep notes and
            ingredients on each menu item. They print here for the bar.
          </SectionHelp>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/workspace/operations-playbook/print?doc=recipes"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 px-3 py-1.5 rounded-lg border border-[var(--teal)]/30 transition-colors"
            aria-label="Print drink recipes"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </Link>
          <Link
            href="/workspace/menu-pricing"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 px-3 py-1.5 rounded-lg border border-[var(--teal)]/30 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Menu workspace
          </Link>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-medium)] bg-[var(--background)] p-6 text-center">
          <p className="text-sm text-[var(--muted-foreground)] mb-2">
            No menu items yet.
          </p>
          <p className="text-xs text-[var(--dark-grey)] mb-4">
            Recipes live in the Menu workspace. Add your drinks and food there,
            and they will show up here as printable recipe cards.
          </p>
          <Link
            href="/workspace/menu-pricing"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:underline"
          >
            Add recipes in Menu workspace
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ category, cards: catCards }) => (
            <div key={category}>
              <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-2">
                {category}
              </h3>
              <div className="space-y-3">
                {catCards.map((card) => (
                  <RecipeCardRow key={card.menu_item_id} card={card} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TIM-1477: inline "Tip" one-liner removed — folded into the
          SectionHelp popover beside the Drink Recipes section header above. */}
    </div>
  );
}

function RecipeCardRow({ card }: { card: OperationsRecipeCard }) {
  return (
    <article className="rounded-lg border border-[var(--border-medium)] bg-white p-4">
      <header className="flex items-start justify-between gap-3 mb-2">
        <h4 className="text-sm font-semibold text-[var(--foreground)]">{card.name}</h4>
        <Link
          href={`/workspace/menu-pricing?item=${card.menu_item_id}`}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--teal)] hover:underline flex-shrink-0"
        >
          Edit recipe
          <ExternalLink className="w-3 h-3" />
        </Link>
      </header>
      {card.ingredients.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted-foreground)] mb-2">
            Ingredients
          </p>
          <ul className="text-xs text-[var(--foreground)] space-y-0.5">
            {card.ingredients.map((ing, idx) => (
              <li key={`${card.menu_item_id}-${idx}`} className="leading-snug">
                {ing.amount} {ing.unit} · {ing.ingredient_name}
              </li>
            ))}
          </ul>
        </div>
      )}
      {card.notes && (
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted-foreground)] mb-2">
            Method
          </p>
          <p className="text-xs text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
            {card.notes}
          </p>
        </div>
      )}
      {card.ingredients.length === 0 && !card.notes && (
        <p className="text-xs text-[var(--dark-grey)] italic">
          No recipe details yet. Add ingredients or prep notes in the Menu
          workspace.
        </p>
      )}
    </article>
  );
}

// ── Roles & shift responsibilities editor ───────────────────────────────────

function RolesEditor({
  label,
  tagline,
  canEdit,
  doc,
  updateDoc,
}: {
  label: string;
  tagline: string;
  canEdit: boolean;
  doc: OperationsPlaybookDocument;
  updateDoc: (mut: (d: OperationsPlaybookDocument) => OperationsPlaybookDocument) => void;
}) {
  const section = doc.roles;

  function patch(idx: number, p: Partial<RoleAssignment>) {
    updateDoc((d) => {
      const items = d.roles.items.map((it, i) => (i === idx ? { ...it, ...p } : it));
      return { ...d, roles: { ...d.roles, items } };
    });
  }
  function move(idx: number, delta: -1 | 1) {
    updateDoc((d) => {
      const items = d.roles.items.slice();
      const next = idx + delta;
      if (next < 0 || next >= items.length) return d;
      [items[idx], items[next]] = [items[next], items[idx]];
      return { ...d, roles: { ...d.roles, items } };
    });
  }
  function remove(idx: number) {
    updateDoc((d) => ({
      ...d,
      roles: { ...d.roles, items: d.roles.items.filter((_, i) => i !== idx) },
    }));
  }
  function add() {
    updateDoc((d) => ({
      ...d,
      roles: {
        ...d.roles,
        items: [
          ...d.roles.items,
          { id: localId(), role: "", responsibilities: "" },
        ],
      },
    }));
  }
  function setIntro(intro: string) {
    updateDoc((d) => ({ ...d, roles: { ...d.roles, intro } }));
  }

  return (
    <div>
      <SectionHeader
        label={label}
        tagline={tagline}
        printDocKey="roles"
      />

      <div className="mb-5">
        <label className={labelCls}>How roles work in your shop</label>
        <textarea
          className={textareaCls}
          rows={3}
          value={section.intro}
          onChange={(e) => setIntro(e.target.value)}
          disabled={!canEdit}
          placeholder="A one-line description for your team."
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          {section.items.length} {section.items.length === 1 ? "role" : "roles"}
        </span>
        {section.last_generated_at && (
          <LastGeneratedAt at={section.last_generated_at} />
        )}
      </div>

      <ol className="space-y-3">
        {section.items.map((item, idx) => (
          <li key={item.id} className="flex items-start gap-2">
            <div className="flex flex-col gap-0.5 pt-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={!canEdit || idx === 0}
                aria-label="Move role up"
                className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={!canEdit || idx === section.items.length - 1}
                aria-label="Move role down"
                className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <input
                className={inputCls}
                value={item.role}
                onChange={(e) => patch(idx, { role: e.target.value })}
                disabled={!canEdit}
                placeholder="Role (e.g. Bar, Register, Manager On Duty)"
                aria-label="Role name"
              />
              <textarea
                rows={3}
                className={textareaCls}
                value={item.responsibilities}
                onChange={(e) => patch(idx, { responsibilities: e.target.value })}
                disabled={!canEdit}
                placeholder="What this role owns on the shift."
                aria-label="Responsibilities"
              />
            </div>
            <button
              type="button"
              onClick={() => remove(idx)}
              disabled={!canEdit}
              aria-label="Remove role"
              className="text-[var(--dark-grey)] hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 mt-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ol>

      {section.items.length === 0 && (
        <p className="text-xs text-[var(--dark-grey)] italic py-4 text-center">
          No roles yet. Add your first role below or let AI draft a starter
          set.
        </p>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={add}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add role
        </button>
      )}
    </div>
  );
}

// ── Vendor & emergency contacts editor ──────────────────────────────────────

function VendorContactsEditor({
  label,
  tagline,
  canEdit,
  doc,
  updateDoc,
}: {
  label: string;
  tagline: string;
  canEdit: boolean;
  doc: OperationsPlaybookDocument;
  updateDoc: (mut: (d: OperationsPlaybookDocument) => OperationsPlaybookDocument) => void;
}) {
  const section = doc.vendor_contacts;

  function patch(idx: number, p: Partial<VendorContact>) {
    updateDoc((d) => {
      const items = d.vendor_contacts.items.map((it, i) =>
        i === idx ? { ...it, ...p } : it,
      );
      return { ...d, vendor_contacts: { ...d.vendor_contacts, items } };
    });
  }
  function move(idx: number, delta: -1 | 1) {
    updateDoc((d) => {
      const items = d.vendor_contacts.items.slice();
      const next = idx + delta;
      if (next < 0 || next >= items.length) return d;
      [items[idx], items[next]] = [items[next], items[idx]];
      return { ...d, vendor_contacts: { ...d.vendor_contacts, items } };
    });
  }
  function remove(idx: number) {
    updateDoc((d) => ({
      ...d,
      vendor_contacts: {
        ...d.vendor_contacts,
        items: d.vendor_contacts.items.filter((_, i) => i !== idx),
      },
    }));
  }
  function add() {
    updateDoc((d) => ({
      ...d,
      vendor_contacts: {
        ...d.vendor_contacts,
        items: [
          ...d.vendor_contacts.items,
          {
            id: localId(),
            label: "",
            contact_name: "",
            phone: "",
            email: "",
            notes: "",
          },
        ],
      },
    }));
  }
  function setIntro(intro: string) {
    updateDoc((d) => ({ ...d, vendor_contacts: { ...d.vendor_contacts, intro } }));
  }

  return (
    <div>
      <SectionHeader
        label={label}
        tagline={tagline}
        printDocKey="vendor_contacts"
      />

      <div className="mb-5">
        <label className={labelCls}>How to use this card</label>
        <textarea
          className={textareaCls}
          rows={3}
          value={section.intro}
          onChange={(e) => setIntro(e.target.value)}
          disabled={!canEdit}
          placeholder="A one-line description."
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          {section.items.length} {section.items.length === 1 ? "contact" : "contacts"}
        </span>
        {section.last_generated_at && (
          <LastGeneratedAt at={section.last_generated_at} />
        )}
      </div>

      <ol className="space-y-3">
        {section.items.map((item, idx) => (
          <li
            key={item.id}
            className="rounded-lg border border-[var(--border-medium)] p-3"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex flex-col gap-0.5 pt-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={!canEdit || idx === 0}
                  aria-label="Move contact up"
                  className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={!canEdit || idx === section.items.length - 1}
                  aria-label="Move contact down"
                  className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Role / type</label>
                  <input
                    className={inputCls}
                    value={item.label}
                    onChange={(e) => patch(idx, { label: e.target.value })}
                    disabled={!canEdit}
                    placeholder="Espresso Tech"
                  />
                </div>
                <div>
                  <label className={labelCls}>Contact name</label>
                  <input
                    className={inputCls}
                    value={item.contact_name}
                    onChange={(e) => patch(idx, { contact_name: e.target.value })}
                    disabled={!canEdit}
                    placeholder="Person or company"
                  />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input
                    className={inputCls}
                    type="tel"
                    value={item.phone}
                    onChange={(e) => patch(idx, { phone: e.target.value })}
                    disabled={!canEdit}
                    placeholder="555-555-5555"
                  />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input
                    className={inputCls}
                    type="email"
                    value={item.email}
                    onChange={(e) => patch(idx, { email: e.target.value })}
                    disabled={!canEdit}
                    placeholder="name@example.com"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Notes</label>
                  <textarea
                    className={textareaCls}
                    rows={2}
                    value={item.notes}
                    onChange={(e) => patch(idx, { notes: e.target.value })}
                    disabled={!canEdit}
                    placeholder="Account number, after-hours line, contract reference."
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                disabled={!canEdit}
                aria-label="Remove contact"
                className="text-[var(--dark-grey)] hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 mt-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ol>

      {section.items.length === 0 && (
        <p className="text-xs text-[var(--dark-grey)] italic py-4 text-center">
          No contacts yet. Add your first below or let AI draft a starter set.
        </p>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={add}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add contact
        </button>
      )}
    </div>
  );
}

// ── New-hire training editor ────────────────────────────────────────────────

function TrainingEditor({
  label,
  tagline,
  canEdit,
  doc,
  updateDoc,
}: {
  label: string;
  tagline: string;
  canEdit: boolean;
  doc: OperationsPlaybookDocument;
  updateDoc: (mut: (d: OperationsPlaybookDocument) => OperationsPlaybookDocument) => void;
}) {
  const section = doc.training;

  function patch(idx: number, p: Partial<TrainingItem>) {
    updateDoc((d) => {
      const items = d.training.items.map((it, i) => (i === idx ? { ...it, ...p } : it));
      return { ...d, training: { ...d.training, items } };
    });
  }
  function move(idx: number, delta: -1 | 1) {
    updateDoc((d) => {
      const items = d.training.items.slice();
      const next = idx + delta;
      if (next < 0 || next >= items.length) return d;
      [items[idx], items[next]] = [items[next], items[idx]];
      return { ...d, training: { ...d.training, items } };
    });
  }
  function remove(idx: number) {
    updateDoc((d) => ({
      ...d,
      training: { ...d.training, items: d.training.items.filter((_, i) => i !== idx) },
    }));
  }
  function add(phase: TrainingPhase) {
    updateDoc((d) => ({
      ...d,
      training: {
        ...d.training,
        items: [...d.training.items, { id: localId(), phase, text: "" }],
      },
    }));
  }
  function setIntro(intro: string) {
    updateDoc((d) => ({ ...d, training: { ...d.training, intro } }));
  }

  const groupedByPhase = useMemo(() => {
    const map: Record<TrainingPhase, { item: TrainingItem; idx: number }[]> = {
      day_1: [],
      week_1: [],
      month_1: [],
    };
    section.items.forEach((item, idx) => {
      map[item.phase].push({ item, idx });
    });
    return map;
  }, [section.items]);

  return (
    <div>
      <SectionHeader
        label={label}
        tagline={tagline}
        printDocKey="training"
      />

      <div className="mb-5">
        <label className={labelCls}>How training works in your shop</label>
        <textarea
          className={textareaCls}
          rows={3}
          value={section.intro}
          onChange={(e) => setIntro(e.target.value)}
          disabled={!canEdit}
          placeholder="A one-line description for trainers and new hires."
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          {section.items.length}{" "}
          {section.items.length === 1 ? "milestone" : "milestones"}
        </span>
        {section.last_generated_at && (
          <LastGeneratedAt at={section.last_generated_at} />
        )}
      </div>

      <div className="space-y-5">
        {TRAINING_PHASE_KEYS.map((phase) => {
          const entries = groupedByPhase[phase];
          return (
            <div key={phase}>
              <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-2">
                {TRAINING_PHASE_LABELS[phase]}
              </h3>
              <ol className="space-y-2">
                {entries.map(({ item, idx }) => (
                  <li key={item.id} className="flex items-start gap-2">
                    <div className="flex flex-col gap-0.5 pt-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => move(idx, -1)}
                        disabled={!canEdit || idx === 0}
                        aria-label="Move milestone up"
                        className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(idx, 1)}
                        disabled={!canEdit || idx === section.items.length - 1}
                        aria-label="Move milestone down"
                        className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <textarea
                        rows={2}
                        className={textareaCls}
                        value={item.text}
                        onChange={(e) => patch(idx, { text: e.target.value })}
                        disabled={!canEdit}
                        placeholder="Specific milestone a new hire should hit."
                      />
                      <select
                        className="text-[11px] border border-[var(--border-medium)] rounded-md px-2 py-1 text-[var(--muted-foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)]"
                        value={item.phase}
                        onChange={(e) =>
                          patch(idx, { phase: e.target.value as TrainingPhase })
                        }
                        disabled={!canEdit}
                        aria-label="Training phase"
                      >
                        {TRAINING_PHASE_KEYS.map((p) => (
                          <option key={p} value={p}>
                            {TRAINING_PHASE_LABELS[p]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      disabled={!canEdit}
                      aria-label="Remove milestone"
                      className="text-[var(--dark-grey)] hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 mt-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ol>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => add(phase)}
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 px-2 py-1 rounded-lg transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add to {TRAINING_PHASE_LABELS[phase]}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {section.items.length === 0 && (
        <p className="text-xs text-[var(--dark-grey)] italic py-4 text-center">
          No milestones yet. Add one above or let AI draft a starter checklist.
        </p>
      )}
    </div>
  );
}
