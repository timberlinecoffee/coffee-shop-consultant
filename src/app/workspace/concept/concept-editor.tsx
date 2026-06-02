"use client";

// TIM-834 / TIM-865 / TIM-881: Concept workspace v2 card layout + inline concept brief.
// - Component cards with include/exclude toggle, "Improve with AI" opens AIAssistCallout modal.
// - Autosaves on each change (debounced). Toggle persists in ConceptDocumentV2 jsonb.
// - Concept Brief section (TIM-865): inline rich document preview below input cards.
// - TIM-893: per-field "Ask Co-pilot" buttons dispatch copilot:open-with-prompt and
//   the drawer is mounted here so the listener fires on this page.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Lightbulb, X } from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { AIAssistCallout } from "@/components/ai-assist/AIAssistCallout";
import { SaveIndicator } from "@/components/ui/save-indicator";
import { InfoTip } from "@/components/ui/info-tip";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import { ReadinessRing } from "@/components/workspace/ReadinessRing";
import {
  CONCEPT_COMPONENTS_V2,
  getConceptV2Progress,
  isConceptV2Complete,
  type ConceptComponentId,
  type ConceptDocumentV2,
  type CustomerPersona,
} from "@/lib/concept";
import { PersonaSection } from "@/components/concept/PersonaSection";
import { UPGRADE_PATH } from "@/lib/access";
import { FIELD_EXAMPLES, type FieldExampleKey } from "@/lib/field-examples";

// IDs that get featured (tinted, slightly larger) treatment in the brief
const BRIEF_FEATURED_IDS: ReadonlySet<ConceptComponentId> = new Set(["vision"]);

const AUTOSAVE_DEBOUNCE_MS = 700;

type SaveState =
  | { kind: "idle"; lastSavedAt: string | null }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

interface ConceptWorkspaceProps {
  planId: string;
  initialDoc: ConceptDocumentV2;
  initialUpdatedAt: string | null;
  canEdit: boolean;
  // TIM-1825: trial credits remaining (undefined for non-trial users). Replaces
  // the old 5-message counter.
  initialTrialCreditsRemaining?: number;
}

export function ConceptWorkspace({
  planId,
  initialDoc,
  initialUpdatedAt,
  canEdit,
  initialTrialCreditsRemaining,
}: ConceptWorkspaceProps) {
  const [doc, setDoc] = useState<ConceptDocumentV2>(initialDoc);
  const [saveState, setSaveState] = useState<SaveState>({
    kind: "idle",
    lastSavedAt: initialUpdatedAt,
  });
  // Cards the user has clicked into (reveals textarea even when empty)
  const [activatedCards, setActivatedCards] = useState<Set<ConceptComponentId>>(new Set());

  const [aiAssistField, setAiAssistField] = useState<{
    id: ConceptComponentId;
    label: string;
    currentValue: string;
  } | null>(null);

  const [openExampleId, setOpenExampleId] = useState<ConceptComponentId | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);

  const [paywallOpen, setPaywallOpen] = useState(false);

  const inFlightController = useRef<AbortController | null>(null);
  const pendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDocRef = useRef<ConceptDocumentV2>(initialDoc);

  const { promoteOnEdit } = useWorkspaceStatus();

  const progress = useMemo(() => getConceptV2Progress(doc), [doc]);
  const complete = useMemo(() => isConceptV2Complete(doc), [doc]);

  // TIM-1147: auto-promote workspace status to In Progress on first edit.
  useEffect(() => {
    if (progress.filled > 0) promoteOnEdit("concept");
  }, [progress.filled, promoteOnEdit]);
  const shopName = doc.components.shop_identity.content.trim();
  const pct = progress.total > 0 ? Math.round((progress.filled / progress.total) * 100) : 0;

  const lastSavedAt =
    saveState.kind === "saved"
      ? saveState.at
      : saveState.kind === "idle"
      ? saveState.lastSavedAt
      : null;

  const persist = useCallback(
    async (next: ConceptDocumentV2) => {
      if (!canEdit) return;
      if (inFlightController.current) {
        inFlightController.current.abort();
      }
      const controller = new AbortController();
      inFlightController.current = controller;
      setSaveState({ kind: "saving" });
      try {
        const res = await fetch("/api/workspaces/concept", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: next }),
          signal: controller.signal,
        });
        if (res.status === 402) {
          setSaveState({
            kind: "error",
            message: "Subscription paused — reactivate to keep editing.",
          });
          return;
        }
        if (!res.ok) throw new Error(`save failed (${res.status})`);
        const data = (await res.json()) as { updated_at?: string };
        const updatedAt = data?.updated_at ?? new Date().toISOString();
        setSaveState({ kind: "saved", at: updatedAt });
      } catch (err) {
        if (controller.signal.aborted) return;
        setSaveState({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not save. Will retry.",
        });
      }
    },
    [canEdit]
  );

  const scheduleSave = useCallback(
    (next: ConceptDocumentV2) => {
      latestDocRef.current = next;
      setSaveState({ kind: "dirty" });
      if (pendingSaveTimer.current) clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = setTimeout(() => {
        pendingSaveTimer.current = null;
        void persist(latestDocRef.current);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [persist]
  );

  useEffect(() => {
    const handler = () => {
      if (!pendingSaveTimer.current) return;
      clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = null;
      if (!canEdit) return;
      try {
        const blob = new Blob(
          [JSON.stringify({ content: latestDocRef.current })],
          { type: "application/json" }
        );
        navigator.sendBeacon?.("/api/workspaces/concept", blob);
      } catch {
        // ignore
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [canEdit]);

  useEffect(() => {
    if (!openExampleId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenExampleId(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openExampleId]);

  function updateContent(id: ConceptComponentId, content: string) {
    setDoc((prev) => {
      const next: ConceptDocumentV2 = {
        ...prev,
        components: {
          ...prev.components,
          [id]: { ...prev.components[id], content },
        },
      };
      scheduleSave(next);
      return next;
    });
  }

  function updatePersonas(personas: CustomerPersona[]) {
    setDoc((prev) => {
      const next: ConceptDocumentV2 = { ...prev, personas };
      scheduleSave(next);
      return next;
    });
  }

  function toggleIncluded(id: ConceptComponentId) {
    if (!canEdit) return;
    setDoc((prev) => {
      const next: ConceptDocumentV2 = {
        ...prev,
        components: {
          ...prev.components,
          [id]: { ...prev.components[id], included: !prev.components[id].included },
        },
      };
      scheduleSave(next);
      return next;
    });
  }

  function activateCard(id: ConceptComponentId) {
    setActivatedCards((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  // TIM-1825: trial is a one-time 15-credit grant; warn as the balance runs low.
  const trialCreditsRemaining = initialTrialCreditsRemaining ?? 0;
  const showTrialWarning =
    initialTrialCreditsRemaining !== undefined && trialCreditsRemaining <= 3;

  return (
    <div className="bg-[var(--background)]">
      <div className="max-w-3xl mx-auto px-6 pt-8 pb-12">
        {/* Page header */}
        <header className="mb-8">
          {/* TIM-1099: icon matches the sidebar entry for this workspace. */}
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb className="w-5 h-5 text-[var(--teal)] flex-shrink-0" aria-hidden="true" />
            <h1 className="text-[28px] font-bold text-[var(--foreground)] leading-tight">
              {shopName ? (
                shopName
              ) : (
                <span className="italic text-[var(--dark-grey)]">Your shop name</span>
              )}
            </h1>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            Shape the identity of your shop. Every other workspace builds on this.
          </p>

          {/* Progress row */}
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <ReadinessRing pct={pct} size={36} complete={complete} />
            <div className="flex-1 min-w-[80px] h-1 bg-[var(--border)] rounded-full overflow-hidden">
              <div
                className="h-1 bg-[var(--teal)] rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {complete ? (
              <span className="text-xs font-semibold text-[var(--teal)] shrink-0">
                Ready to print
              </span>
            ) : (
              <span className="text-xs text-[var(--dark-grey)] shrink-0">
                {progress.filled} of {progress.total} sections filled
              </span>
            )}
            <SaveIndicator
              saving={saveState.kind === "saving"}
              savedAt={saveState.kind === "saved" ? saveState.at : lastSavedAt}
              error={saveState.kind === "error" ? saveState.message : null}
              unsaved={saveState.kind === "dirty"}
              canEdit={canEdit}
              className="shrink-0"
            />
          </div>
        </header>

        {/* Read-only banner */}
        {!canEdit && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-[var(--warning-amber-bg-2)] bg-[var(--warning-bg-8)] px-4 py-3 text-sm text-[var(--warning-text-9)]"
          >
            <p className="font-medium mb-1">Read-only preview</p>
            <p className="leading-relaxed">
              Your subscription is paused so we&apos;ve locked editing.{" "}
              <Link href={UPGRADE_PATH} className="underline font-medium text-[var(--warning-text-9)]">
                Reactivate to keep editing
              </Link>
              .
            </p>
          </div>
        )}

        {/* Trial limit notice */}
        {showTrialWarning && (
          <div className="mb-6 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--muted-foreground)]">
            {trialCreditsRemaining <= 0 ? (
              <>
                You&apos;ve used all your free trial credits.{" "}
                <Link href="/pricing" className="text-[var(--teal)] font-medium underline">
                  Upgrade to keep improving
                </Link>
                .
              </>
            ) : (
              <>
                {trialCreditsRemaining} free trial credit{trialCreditsRemaining === 1 ? "" : "s"} left.
              </>
            )}
          </div>
        )}

        {/* Component cards */}
        <div className="space-y-4">
          {CONCEPT_COMPONENTS_V2.map((meta) => {
            const comp = doc.components[meta.id];
            const isEmpty = !comp.content.trim();
            const isActivated = activatedCards.has(meta.id);
            // TIM-1476: showField no longer factors in comp.included; the
            // In doc / Skip toggle only affects print inclusion, not the editor.
            const showField = !isEmpty || isActivated;

            return (
              <div
                key={meta.id}
                className="group rounded-xl border border-[var(--border)] bg-white transition-all duration-200 overflow-hidden focus-within:ring-1 focus-within:ring-[var(--teal)]/30"
              >
                <div className="px-5 pt-5 pb-4">
                  {/* Card header row */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-[var(--foreground)]">
                          {meta.label}
                        </span>
                        {/* TIM-1476: helper one-liner moved from inline <p> to a "?" popup
                            next to the question label, mirroring Financial Suite's pattern. */}
                        <InfoTip label={meta.label}>{meta.hint}</InfoTip>
                      </div>
                      {/* TIM-1408: lightbulb icon demoted to a quieter text link */}
                      <button
                        type="button"
                        onClick={() => {
                          if (openExampleId === meta.id) {
                            setOpenExampleId(null);
                          } else {
                            setOpenExampleId(meta.id);
                            setExampleIdx(0);
                          }
                        }}
                        aria-expanded={openExampleId === meta.id}
                        className="mt-1 text-xs text-[var(--teal)] font-medium hover:underline focus-visible:outline-none focus:underline"
                      >
                        {openExampleId === meta.id ? "Hide example" : "See an example"}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* TIM-881 + TIM-1408: Improve with AI is hover/focus-revealed to reduce ambient noise */}
                      {meta.multiline && (
                        <button
                          type="button"
                          onClick={() =>
                            setAiAssistField({
                              id: meta.id,
                              label: meta.label,
                              currentValue: latestDocRef.current.components[meta.id].content,
                            })
                          }
                          disabled={!canEdit}
                          className="text-xs font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-3 py-1 hover:bg-[var(--teal)]/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                        >
                          Improve with AI
                        </button>
                      )}
                      {/* TIM-1408: per-card "Ask Co-pilot" merged into the single global Co-pilot beacon */}
                      {/* Include/exclude toggle — only on deferrable components */}
                      {meta.deferrable && (
                        <button
                          type="button"
                          onClick={() => toggleIncluded(meta.id)}
                          disabled={!canEdit}
                          className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors disabled:cursor-not-allowed whitespace-nowrap ${
                            comp.included
                              ? "bg-[var(--teal)]/10 text-[var(--teal)] border-[var(--teal)]/20 hover:bg-[var(--teal)]/15"
                              : "bg-[var(--surface-warm-200)] text-[var(--muted-foreground)] border-[var(--border-medium)] hover:bg-[var(--border)]"
                          }`}
                        >
                          {comp.included ? "In doc" : "Skip"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Example panel — inline, between card header and field */}
                  {openExampleId === meta.id && (() => {
                    const examples = FIELD_EXAMPLES[meta.id as FieldExampleKey] ?? [];
                    const ex = examples[exampleIdx % Math.max(examples.length, 1)];
                    if (!ex) return null;
                    return (
                      <div
                        className="mt-2 mb-1 bg-[var(--warm-250)] border border-[var(--warm-800)] rounded-xl p-4"
                        role="region"
                        aria-label="Sample answer from a fictional coffee shop"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-[10px] font-semibold text-[var(--teal)] uppercase tracking-[0.1em] leading-none">
                              {ex.shopName}
                            </p>
                            <p className="text-[10px] text-[var(--muted-foreground)] italic mt-0.5">
                              {ex.shopType}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOpenExampleId(null)}
                            aria-label="Close example"
                            className="text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors focus-visible:outline-none ml-2 shrink-0"
                          >
                            <X size={13} aria-hidden="true" />
                          </button>
                        </div>
                        <p className="text-sm text-[var(--gray-1200)] leading-relaxed italic border-l-2 border-[var(--warm-950)] pl-3">
                          {ex.answer}
                        </p>
                        <div className="flex items-center justify-between mt-3">
                          {examples.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setExampleIdx((i) => (i + 1) % examples.length)}
                              className="text-xs text-[var(--teal)] hover:underline focus-visible:outline-none focus:text-[var(--teal-dark)]"
                            >
                              See another shop
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setOpenExampleId(null)}
                            className="text-xs font-medium text-[var(--foreground)] hover:text-[var(--teal)] transition-colors focus-visible:outline-none ml-auto"
                          >
                            Got it
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Card body */}
                  {meta.id === "target_customer" ? (
                    <PersonaSection
                      personas={doc.personas ?? []}
                      canEdit={canEdit}
                      onUpdate={updatePersonas}
                    />
                  ) : showField ? (
                    meta.multiline ? (
                      <textarea
                        id={`concept-${meta.id}`}
                        value={comp.content}
                        onChange={(e) => updateContent(meta.id, e.target.value)}
                        rows={meta.rows ?? 3}
                        disabled={!canEdit}
                        autoFocus={isEmpty && isActivated}
                        className="mt-2 w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors bg-[var(--background)] resize-none leading-relaxed disabled:bg-[var(--surface-warm-200)] disabled:text-[var(--muted-foreground)]"
                      />
                    ) : (
                      <input
                        id={`concept-${meta.id}`}
                        type="text"
                        value={comp.content}
                        onChange={(e) => updateContent(meta.id, e.target.value)}
                        disabled={!canEdit}
                        autoFocus={isEmpty && isActivated}
                        className="mt-2 w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors bg-[var(--background)] disabled:bg-[var(--surface-warm-200)] disabled:text-[var(--muted-foreground)]"
                      />
                    )
                  ) : (
                    /* Empty state: show prompt text, clicking activates the field */
                    <p
                      className="mt-2 text-sm text-[var(--dark-grey)] italic leading-relaxed cursor-text"
                      onClick={() => {
                        if (canEdit) activateCard(meta.id);
                      }}
                    >
                      {meta.emptyPrompt}
                    </p>
                  )}
                </div>

              </div>
            );
          })}
        </div>

        {/* ── Concept Brief (Section 5 — TIM-865) ─────────── */}
        {progress.filled > 0 && (
          <ConceptBriefInline doc={doc} shopName={shopName} />
        )}

        {/* Document footer CTA */}
        <div className="mt-8 border-t border-[var(--border)] pt-6 text-center">
          <Link
            href="/workspace/concept/print"
            className="inline-block bg-[var(--teal)] text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-[var(--teal-dark)] transition-colors"
          >
            Print document
          </Link>
          {!complete && progress.total - progress.filled > 0 && (
            <p className="text-xs text-[var(--dark-grey)] mt-2">
              {progress.total - progress.filled} section{progress.total - progress.filled !== 1 ? "s" : ""} unfilled. Fill them in for a more complete concept.
            </p>
          )}
          {complete && (saveState.kind === "saved" || saveState.kind === "idle") && (
            <ConceptUnlockBanner />
          )}
        </div>
      </div>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        variant="copilot_trial"
      />

      {/* TIM-881: AIAssistCallout — per-field improvement modal */}
      <AIAssistCallout
        open={aiAssistField !== null}
        onClose={() => setAiAssistField(null)}
        fieldLabel={aiAssistField?.label ?? ""}
        moduleLabel="Concept"
        fieldKey={aiAssistField?.id ?? ""}
        workspaceKey="concept"
        planId={planId}
        currentValue={aiAssistField?.currentValue ?? ""}
        onApply={(newValue) => {
          if (aiAssistField) updateContent(aiAssistField.id, newValue);
          setAiAssistField(null);
        }}
      />

      {/* TIM-880 / TIM-893: CoPilotDrawer handles both the WorkspaceTopBar button
          and per-field "Ask Co-pilot" dispatch (copilot:open-with-prompt). */}
      <CoPilotDrawer
        planId={planId}
        workspaceKey="concept"
        currentFocus={{ label: "Concept" }}
      />
    </div>
  );
}

// ── Concept Unlock Banner ────────────────────────────────────────────────────

function ConceptUnlockBanner() {
  return (
    <div
      className="mt-4 bg-[var(--teal)]/[0.08] border border-[var(--teal)]/20 rounded-xl px-5 py-4 transition-opacity duration-300 text-center"
      role="status"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--teal)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mx-auto mb-2"
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <p className="text-sm font-semibold text-[var(--teal)]">Your concept is set.</p>
      <p className="text-xs text-[var(--teal)]/80 mt-0.5">Every other workspace is now open.</p>
      <Link
        href="/dashboard"
        className="text-xs font-medium text-[var(--teal)] hover:underline mt-1.5 inline-block"
      >
        See all modules
      </Link>
    </div>
  );
}

// ── Inline Concept Brief component ───────────────────────────────────────────
// Renders a rich document preview within the workspace editor.
// Mirrors the design of /workspace/concept/print but inline and toggleable.

function ConceptBriefInline({
  doc,
  shopName,
}: {
  doc: ConceptDocumentV2;
  shopName: string;
}) {
  const [expanded, setExpanded] = useState(true);

  const briefSections = CONCEPT_COMPONENTS_V2.filter((meta) => {
    if (meta.id === "shop_identity") return false;
    const comp = doc.components[meta.id];
    if (!comp.included) return false;
    if (meta.id === "target_customer") {
      return (doc.personas && doc.personas.length > 0) || comp.content.trim().length > 0;
    }
    return comp.content.trim().length > 0;
  });

  if (briefSections.length === 0) return null;

  return (
    <div className="mt-10">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-bold tracking-[0.08em] uppercase text-[var(--teal)] mb-1 leading-tight">
            Section 5
          </p>
          <h2 className="text-lg font-bold text-[var(--foreground)] leading-tight">
            Concept Brief
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {/* TIM-1408: inline "Print" link removed — the page footer "Print document" CTA is the single entry point. */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors"
            aria-expanded={expanded}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          {/* Document header */}
          <div className="px-7 pt-7 pb-5 border-b border-[var(--border)]">
            <div className="h-[3px] bg-[var(--teal)] rounded-full mb-5 w-12" />
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">
              {shopName || <span className="italic text-[var(--dark-grey)]">Your shop name</span>}
            </h3>
            <p className="text-xs text-[var(--dark-grey)]">
              {briefSections.length} section{briefSections.length !== 1 ? "s" : ""} included
            </p>
          </div>

          {/* Section cards */}
          <div className="divide-y divide-[var(--border)]">
            {briefSections.map((meta) => {
              const comp = doc.components[meta.id];
              const isFeatured = BRIEF_FEATURED_IDS.has(meta.id);

              if (meta.id === "target_customer" && doc.personas && doc.personas.length > 0) {
                return (
                  <div key={meta.id} className="flex">
                    <div className="w-1 bg-[var(--teal)] flex-shrink-0" />
                    <div className="px-6 py-5 flex-1 min-w-0">
                      <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[var(--teal)] mb-2">
                        {meta.label}
                      </p>
                      <div className="space-y-1.5">
                        {doc.personas.map((p) => (
                          <p key={p.id} className="text-sm text-[var(--foreground)]">
                            <span className="font-medium">{p.name}</span>
                            {p.isPrimary && (
                              <span className="ml-1.5 text-[10px] text-[var(--teal)]">(primary)</span>
                            )}
                            {p.whyTheyVisit.trim() && (
                              <span className="text-[var(--muted-foreground)]">
                                {": "}
                                {p.whyTheyVisit.trim().length > 70
                                  ? p.whyTheyVisit.trim().slice(0, 70) + "..."
                                  : p.whyTheyVisit.trim()}
                              </span>
                            )}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              if (isFeatured) {
                return (
                  <div key={meta.id} className="px-7 py-5 bg-[var(--teal-tint-500)]">
                    <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[var(--teal)] mb-2">
                      {meta.label}
                    </p>
                    <p
                      className="text-[var(--foreground)] font-medium leading-[1.75]"
                      style={{ fontSize: "15px" }}
                    >
                      {comp.content.trim()}
                    </p>
                  </div>
                );
              }

              return (
                <div key={meta.id} className="flex">
                  <div className="w-1 bg-[var(--teal)] flex-shrink-0" />
                  <div className="px-6 py-5 flex-1 min-w-0">
                    <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[var(--teal)] mb-2">
                      {meta.label}
                    </p>
                    <p
                      className="text-[var(--foreground)] leading-[1.7]"
                      style={{ fontSize: "14px" }}
                    >
                      {comp.content.trim()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Document footer */}
          <div className="px-7 py-4 border-t border-[var(--border)] flex items-center justify-between">
            <span className="text-xs text-[var(--dark-grey)]">
              Timberline Coffee School
            </span>
            <Link
              href="/workspace/concept/print"
              className="text-xs font-medium text-[var(--teal)] hover:underline"
            >
              Open full document
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
