"use client";

// TIM-834 / TIM-865: Concept workspace v2 card layout + inline concept brief.
// - Component cards with include/exclude toggle, Improve button, inline AI panel.
// - Autosaves on each change (debounced). Toggle persists in ConceptDocumentV2 jsonb.
// - Print button active only when all included components are filled.
// - Concept Brief section (TIM-865): inline rich document preview below input cards.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Lightbulb, X } from "lucide-react";
import { PaywallModal } from "@/components/paywall-modal";
import { useCopilotStream } from "@/components/copilot/useCopilotStream";
import { useWorkspaceProgress } from "@/components/workspace/WorkspaceProgressProvider";
import {
  CONCEPT_COMPONENTS_V2,
  buildImprovePrompt,
  getConceptV2Progress,
  isConceptV2Complete,
  type ConceptComponentId,
  type ConceptDocumentV2,
} from "@/lib/concept";
import { UPGRADE_PATH, COPILOT_FREE_TRIAL_LIMIT } from "@/lib/access";
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

type PanelResult = {
  rewrite: string;
  gaps: string[];
  competitorNote: string | null;
};

type PanelStatus = "idle" | "loading" | "done" | "error" | "trial_exhausted";

interface ConceptWorkspaceProps {
  planId: string;
  initialDoc: ConceptDocumentV2;
  initialUpdatedAt: string | null;
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Not saved yet";
  try {
    const d = new Date(iso);
    return `Saved ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } catch {
    return "Saved";
  }
}

export function ConceptWorkspace({
  planId,
  initialDoc,
  initialUpdatedAt,
  canEdit,
  initialTrialMessagesUsed,
}: ConceptWorkspaceProps) {
  const [doc, setDoc] = useState<ConceptDocumentV2>(initialDoc);
  const [saveState, setSaveState] = useState<SaveState>({
    kind: "idle",
    lastSavedAt: initialUpdatedAt,
  });
  // Cards the user has clicked into (reveals textarea even when empty)
  const [activatedCards, setActivatedCards] = useState<Set<ConceptComponentId>>(new Set());

  const [openPanelId, setOpenPanelId] = useState<ConceptComponentId | null>(null);
  const [panelStatus, setPanelStatus] = useState<PanelStatus>("idle");
  const [panelResult, setPanelResult] = useState<PanelResult | null>(null);

  const [openExampleId, setOpenExampleId] = useState<ConceptComponentId | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);

  const [trialMessagesUsed, setTrialMessagesUsed] = useState(
    initialTrialMessagesUsed ?? 0
  );
  const [paywallOpen, setPaywallOpen] = useState(false);

  const inFlightController = useRef<AbortController | null>(null);
  const pendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDocRef = useRef<ConceptDocumentV2>(initialDoc);

  const copilot = useCopilotStream();
  const { setModuleProgress } = useWorkspaceProgress();

  const progress = useMemo(() => getConceptV2Progress(doc), [doc]);
  const complete = useMemo(() => isConceptV2Complete(doc), [doc]);

  // Keep the sidebar counter in sync with the live in-page counter (TIM-884).
  useEffect(() => {
    setModuleProgress(1, progress.filled, progress.total);
  }, [progress.filled, progress.total, setModuleProgress]);
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

  const handleImprove = useCallback(
    async (id: ConceptComponentId) => {
      if (openPanelId === id && panelStatus !== "loading") {
        setOpenPanelId(null);
        setPanelStatus("idle");
        setPanelResult(null);
        return;
      }

      setOpenPanelId(id);
      setPanelStatus("loading");
      setPanelResult(null);

      const meta = CONCEPT_COMPONENTS_V2.find((m) => m.id === id)!;
      const currentContent = latestDocRef.current.components[id].content;
      const ctx = {
        shopName: latestDocRef.current.components.shop_identity.content,
        vision: latestDocRef.current.components.vision.content,
        targetCustomer: latestDocRef.current.components.target_customer.content,
      };
      const prompt = buildImprovePrompt(id, meta.label, currentContent, ctx);

      const result = await copilot.send({
        planId,
        workspaceKey: "concept",
        threadId: crypto.randomUUID(),
        history: [],
        prompt,
      });

      if (!result) {
        const err = copilot.error;
        if (err?.code === "trial_exhausted") {
          setPanelStatus("trial_exhausted");
        } else if (err?.code === "paywall") {
          setPaywallOpen(true);
          setOpenPanelId(null);
          setPanelStatus("idle");
        } else {
          setPanelStatus("error");
        }
        return;
      }

      if (result.trialMessagesUsed !== undefined) {
        setTrialMessagesUsed(result.trialMessagesUsed);
      }

      try {
        const raw = result.assistant
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/, "");
        const parsed = JSON.parse(raw) as {
          rewrite?: string;
          gaps?: string[];
          competitorNote?: string | null;
        };
        setPanelResult({
          rewrite: typeof parsed.rewrite === "string" ? parsed.rewrite : "",
          gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
          competitorNote:
            typeof parsed.competitorNote === "string" ? parsed.competitorNote : null,
        });
        setPanelStatus("done");
      } catch {
        setPanelStatus("error");
      }
    },
    [openPanelId, panelStatus, copilot, planId]
  );

  function handleUseThis() {
    if (openPanelId && panelResult) {
      updateContent(openPanelId, panelResult.rewrite);
    }
    setOpenPanelId(null);
    setPanelStatus("idle");
    setPanelResult(null);
  }

  function handleEditFirst() {
    if (openPanelId && panelResult) {
      const id = openPanelId;
      updateContent(id, panelResult.rewrite);
      activateCard(id);
      setTimeout(() => document.getElementById(`concept-${id}`)?.focus(), 50);
    }
    setOpenPanelId(null);
    setPanelStatus("idle");
    setPanelResult(null);
  }

  function handleDismissPanel() {
    setOpenPanelId(null);
    setPanelStatus("idle");
    setPanelResult(null);
  }

  let saveStatusCopy = formatTimestamp(lastSavedAt);
  let saveStatusTone = "text-[#afafaf]";
  if (saveState.kind === "saving") {
    saveStatusCopy = "Saving...";
    saveStatusTone = "text-[#155e63]";
  } else if (saveState.kind === "dirty") {
    saveStatusCopy = "Unsaved";
    saveStatusTone = "text-[#6b6b6b]";
  } else if (saveState.kind === "error") {
    saveStatusCopy = saveState.message;
    saveStatusTone = "text-[#a13d3d]";
  }

  const trialRemaining = COPILOT_FREE_TRIAL_LIMIT - trialMessagesUsed;
  const showTrialWarning = initialTrialMessagesUsed !== undefined && trialRemaining <= 1;

  return (
    <div className="bg-[#faf9f7]">
      <div className="max-w-3xl mx-auto px-6 pt-8 pb-12">
        {/* Page header */}
        <header className="mb-8">
          <h1 className="font-bold text-[#1a1a1a] mb-1" style={{ fontSize: "28px" }}>
            {shopName ? (
              shopName
            ) : (
              <span className="italic text-[#afafaf]">Your shop name</span>
            )}
          </h1>
          <p className="text-sm text-[#6b6b6b] leading-relaxed">
            Shape the identity of your shop. Every other workspace builds on this.
          </p>

          {/* Progress row */}
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[120px] h-1 bg-[#efefef] rounded-full overflow-hidden">
              <div
                className="h-1 bg-[#155e63] rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {complete ? (
              <span className="text-xs font-semibold text-[#155e63] shrink-0">
                Ready to print
              </span>
            ) : (
              <span className="text-xs text-[#afafaf] shrink-0">
                {progress.filled} of {progress.total} sections filled
              </span>
            )}
            <span
              className={`text-xs shrink-0 ${saveStatusTone}`}
              role="status"
              aria-live="polite"
            >
              {saveStatusCopy}
            </span>
          </div>
        </header>

        {/* Read-only banner */}
        {!canEdit && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-[#e8d7b0] bg-[#fbf3df] px-4 py-3 text-sm text-[#7a5a17]"
          >
            <p className="font-medium mb-1">Read-only preview</p>
            <p className="leading-relaxed">
              Your subscription is paused so we&apos;ve locked editing.{" "}
              <Link href={UPGRADE_PATH} className="underline font-medium text-[#7a5a17]">
                Reactivate to keep editing
              </Link>
              .
            </p>
          </div>
        )}

        {/* Trial limit notice */}
        {showTrialWarning && (
          <div className="mb-6 rounded-2xl border border-[#efefef] bg-white px-4 py-3 text-sm text-[#6b6b6b]">
            {trialRemaining <= 0 ? (
              <>
                You&apos;ve used all 5 free AI sessions.{" "}
                <Link href="/pricing" className="text-[#155e63] font-medium underline">
                  Upgrade to keep improving
                </Link>
                .
              </>
            ) : (
              <>{trialRemaining} AI session{trialRemaining === 1 ? "" : "s"} left in your free trial.</>
            )}
          </div>
        )}

        {/* Component cards */}
        <div className="space-y-4">
          {CONCEPT_COMPONENTS_V2.map((meta) => {
            const comp = doc.components[meta.id];
            const isEmpty = !comp.content.trim();
            const isExcluded = !comp.included;
            const isActivated = activatedCards.has(meta.id);
            const showField = !isExcluded && (!isEmpty || isActivated);
            const isPanelOpen = openPanelId === meta.id;

            return (
              <div
                key={meta.id}
                className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                  isExcluded
                    ? "border-dashed border-[#d4d4d4] bg-white"
                    : "border-[#efefef] bg-white"
                }`}
                style={isExcluded ? { opacity: 0.55 } : undefined}
              >
                <div className="px-5 pt-5 pb-4">
                  {/* Card header row */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-[#1a1a1a]">
                          {meta.label}
                        </span>
                        {meta.deferrable && (
                          <span className="text-[10px] font-medium text-[#afafaf] border border-[#e0e0e0] rounded-full px-2 py-0.5 leading-none">
                            Optional
                          </span>
                        )}
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
                          aria-label={`See a sample answer for ${meta.label}`}
                          title="See a sample answer"
                          className={`inline-flex items-center justify-center w-5 h-5 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-[#155e63] ${
                            openExampleId === meta.id
                              ? "text-[#155e63]"
                              : "text-[#c8c5be] hover:text-[#155e63]"
                          }`}
                        >
                          <Lightbulb size={13} strokeWidth={2} aria-hidden="true" />
                        </button>
                      </div>
                      <p className="text-xs text-[#afafaf]">{meta.hint}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Improve button */}
                      <button
                        type="button"
                        onClick={() => void handleImprove(meta.id)}
                        disabled={isEmpty || !canEdit || (isPanelOpen && panelStatus === "loading")}
                        className="text-xs font-medium text-[#155e63] border border-[#cfe0e1] rounded-full px-3 py-1 hover:bg-[#155e63]/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {isPanelOpen && panelStatus === "loading" ? "Thinking..." : "Improve"}
                      </button>
                      {/* Include/exclude toggle — only on deferrable components */}
                      {meta.deferrable && (
                        <button
                          type="button"
                          onClick={() => toggleIncluded(meta.id)}
                          disabled={!canEdit}
                          className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors disabled:cursor-not-allowed whitespace-nowrap ${
                            comp.included
                              ? "bg-[#155e63]/10 text-[#155e63] border-[#155e63]/20 hover:bg-[#155e63]/15"
                              : "bg-[#f4f3f1] text-[#6b6b6b] border-[#e0e0e0] hover:bg-[#efefef]"
                          }`}
                        >
                          {comp.included ? "In doc" : "Skip"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Example panel — inline, between card header and field */}
                  {openExampleId === meta.id && !isExcluded && (() => {
                    const examples = FIELD_EXAMPLES[meta.id as FieldExampleKey] ?? [];
                    const ex = examples[exampleIdx % Math.max(examples.length, 1)];
                    if (!ex) return null;
                    return (
                      <div
                        className="mt-2 mb-1 bg-[#f5f3ef] border border-[#e0ddd8] rounded-xl p-4"
                        role="region"
                        aria-label="Sample answer from a fictional coffee shop"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-[10px] font-semibold text-[#155e63] uppercase tracking-wider leading-none">
                              {ex.shopName}
                            </p>
                            <p className="text-[10px] text-[#6b6b6b] italic mt-0.5">
                              {ex.shopType}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOpenExampleId(null)}
                            aria-label="Close example"
                            className="text-[#afafaf] hover:text-[#1a1a1a] transition-colors focus:outline-none ml-2 shrink-0"
                          >
                            <X size={13} aria-hidden="true" />
                          </button>
                        </div>
                        <p className="text-sm text-[#4a4a4a] leading-relaxed italic border-l-2 border-[#c5c0b8] pl-3">
                          {ex.answer}
                        </p>
                        <div className="flex items-center justify-between mt-3">
                          {examples.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setExampleIdx((i) => (i + 1) % examples.length)}
                              className="text-xs text-[#155e63] hover:underline focus:outline-none focus:text-[#0e4448]"
                            >
                              See another shop
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setOpenExampleId(null)}
                            className="text-xs font-medium text-[#1a1a1a] hover:text-[#155e63] transition-colors focus:outline-none ml-auto"
                          >
                            Got it
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Card body */}
                  {isExcluded ? (
                    <p className="mt-2 text-sm text-[#afafaf] italic">
                      Not included in your document. Toggle on when you&apos;re ready to add {meta.label}.
                    </p>
                  ) : showField ? (
                    meta.multiline ? (
                      <textarea
                        id={`concept-${meta.id}`}
                        value={comp.content}
                        onChange={(e) => updateContent(meta.id, e.target.value)}
                        rows={meta.rows ?? 3}
                        disabled={!canEdit}
                        autoFocus={isEmpty && isActivated}
                        className="mt-2 w-full border border-[#efefef] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors bg-[#faf9f7] resize-none leading-relaxed disabled:bg-[#f4f3f1] disabled:text-[#6b6b6b]"
                      />
                    ) : (
                      <input
                        id={`concept-${meta.id}`}
                        type="text"
                        value={comp.content}
                        onChange={(e) => updateContent(meta.id, e.target.value)}
                        disabled={!canEdit}
                        autoFocus={isEmpty && isActivated}
                        className="mt-2 w-full border border-[#efefef] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors bg-[#faf9f7] disabled:bg-[#f4f3f1] disabled:text-[#6b6b6b]"
                      />
                    )
                  ) : (
                    /* Empty state: show prompt text, clicking activates the field */
                    <p
                      className="mt-2 text-sm text-[#afafaf] italic leading-relaxed cursor-text"
                      onClick={() => {
                        if (canEdit) activateCard(meta.id);
                      }}
                    >
                      {meta.emptyPrompt}
                    </p>
                  )}
                </div>

                {/* AI improvement panel — inline below field */}
                {isPanelOpen && (
                  <div className="border-t border-[#efefef] px-5 py-4">
                    {panelStatus === "loading" && (
                      <div className="flex items-center gap-2 text-sm text-[#6b6b6b]">
                        <span
                          className="inline-block w-3 h-3 rounded-full border-2 border-[#155e63] border-t-transparent animate-spin"
                          aria-hidden="true"
                        />
                        Reviewing your content...
                      </div>
                    )}

                    {panelStatus === "trial_exhausted" && (
                      <div className="rounded-xl border border-[#efefef] bg-[#faf9f7] p-4 text-sm">
                        <p className="font-semibold text-[#1a1a1a] mb-1">
                          You&apos;ve used your 5 free coaching sessions
                        </p>
                        <p className="text-[#6b6b6b] mb-3">
                          Upgrade to keep improving each section with AI.
                        </p>
                        <Link
                          href="/pricing"
                          className="inline-block bg-[#155e63] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#0e4448] transition-colors"
                        >
                          Choose a plan
                        </Link>
                        <button
                          type="button"
                          onClick={handleDismissPanel}
                          className="ml-3 text-xs text-[#afafaf] hover:text-[#1a1a1a] transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}

                    {panelStatus === "error" && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[#a13d3d]">Could not get suggestions. Try again.</span>
                        <button
                          type="button"
                          onClick={handleDismissPanel}
                          className="text-xs text-[#afafaf] hover:text-[#1a1a1a]"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}

                    {panelStatus === "done" && panelResult && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-[#155e63]">
                            AI Suggestions
                          </span>
                          <button
                            type="button"
                            onClick={handleDismissPanel}
                            className="text-xs text-[#afafaf] hover:text-[#1a1a1a] transition-colors"
                          >
                            Dismiss all
                          </button>
                        </div>

                        {/* Suggested rewrite */}
                        <div className="rounded-xl border border-[#efefef] bg-[#faf9f7] p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#afafaf] mb-2">
                            Suggested rewrite
                          </p>
                          <p className="text-sm text-[#1a1a1a] leading-relaxed mb-3">
                            {panelResult.rewrite}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={handleUseThis}
                              className="text-xs font-semibold bg-[#155e63] text-white px-3 py-1.5 rounded-lg hover:bg-[#0e4448] transition-colors"
                            >
                              Use this
                            </button>
                            <button
                              type="button"
                              onClick={handleEditFirst}
                              className="text-xs font-medium border border-[#155e63] text-[#155e63] px-3 py-1.5 rounded-lg hover:bg-[#155e63]/5 transition-colors"
                            >
                              Edit first
                            </button>
                            <button
                              type="button"
                              onClick={handleDismissPanel}
                              className="text-xs text-[#afafaf] hover:text-[#1a1a1a] transition-colors"
                            >
                              Keep mine
                            </button>
                          </div>
                        </div>

                        {/* Gap questions */}
                        {panelResult.gaps.length > 0 && (
                          <div className="rounded-xl border border-[#efefef] bg-[#faf9f7] p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#afafaf] mb-2">
                              What&apos;s missing
                            </p>
                            <ul className="space-y-1.5">
                              {panelResult.gaps.map((gap, i) => (
                                <li key={i} className="text-sm text-[#1a1a1a] flex items-start gap-2">
                                  <span className="text-[#155e63] font-semibold shrink-0">?</span>
                                  {gap}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Competitor note */}
                        {panelResult.competitorNote && (
                          <div className="rounded-xl border border-[#efefef] bg-[#faf9f7] p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#afafaf] mb-2">
                              Worth knowing
                            </p>
                            <p className="text-sm text-[#1a1a1a] leading-relaxed">
                              {panelResult.competitorNote}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Concept Brief overview (unnumbered — TIM-865/TIM-886) ─────────── */}
        {progress.filled > 0 && (
          <ConceptBriefInline doc={doc} shopName={shopName} />
        )}

        {/* Document footer CTA */}
        <div className="mt-8 border-t border-[#efefef] pt-6 text-center">
          <Link
            href="/workspace/concept/print"
            className="inline-block bg-[#155e63] text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-[#0e4448] transition-colors"
          >
            Print document
          </Link>
          {!complete && progress.total - progress.filled > 0 && (
            <p className="text-xs text-[#afafaf] mt-2">
              {progress.total - progress.filled} section{progress.total - progress.filled !== 1 ? "s" : ""} unfilled — fill them in for a more complete concept.
            </p>
          )}
          <p className="text-xs text-[#afafaf] mt-3">Autosaves as you type.</p>
        </div>
      </div>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        variant="copilot_trial"
      />
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
    return comp.included && comp.content.trim().length > 0;
  });

  if (briefSections.length === 0) return null;

  return (
    <div className="mt-10 pt-10 border-t border-[#efefef]">
      {/* Section header — no section number; this is a preview, not a fillable step */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#155e63] mb-0.5">
            Overview
          </p>
          <h2 className="text-base font-semibold text-[#1a1a1a]">
            Concept Brief
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/workspace/concept/print"
            className="text-xs font-medium text-[#155e63] border border-[#cfe0e1] rounded-full px-3 py-1 hover:bg-[#155e63]/5 transition-colors"
          >
            Print
          </Link>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-[#afafaf] hover:text-[#1a1a1a] transition-colors"
            aria-expanded={expanded}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="rounded-2xl border border-[#efefef] bg-white overflow-hidden">
          {/* Document header */}
          <div className="px-7 pt-7 pb-5 border-b border-[#efefef]">
            <div className="h-[3px] bg-[#155e63] rounded-full mb-5 w-12" />
            <h3
              className="font-bold text-[#1a1a1a] leading-tight mb-1"
              style={{ fontSize: "24px", letterSpacing: "-0.01em" }}
            >
              {shopName || <span className="italic text-[#afafaf]">Your shop name</span>}
            </h3>
            <p className="text-xs text-[#afafaf]">
              {briefSections.length} section{briefSections.length !== 1 ? "s" : ""} included
            </p>
          </div>

          {/* Section cards */}
          <div className="divide-y divide-[#efefef]">
            {briefSections.map((meta) => {
              const comp = doc.components[meta.id];
              const isFeatured = BRIEF_FEATURED_IDS.has(meta.id);

              if (isFeatured) {
                return (
                  <div key={meta.id} className="px-7 py-5 bg-[#f4f9f8]">
                    <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#155e63] mb-2">
                      {meta.label}
                    </p>
                    <p
                      className="text-[#1a1a1a] font-medium leading-[1.75]"
                      style={{ fontSize: "15px" }}
                    >
                      {comp.content.trim()}
                    </p>
                  </div>
                );
              }

              return (
                <div key={meta.id} className="flex">
                  <div className="w-1 bg-[#155e63] flex-shrink-0" />
                  <div className="px-6 py-5 flex-1 min-w-0">
                    <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#155e63] mb-2">
                      {meta.label}
                    </p>
                    <p
                      className="text-[#1a1a1a] leading-[1.7]"
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
          <div className="px-7 py-4 border-t border-[#efefef] flex items-center justify-between">
            <span className="text-xs text-[#afafaf]">
              Timberline Coffee School
            </span>
            <Link
              href="/workspace/concept/print"
              className="text-xs font-medium text-[#155e63] hover:underline"
            >
              Open full document
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
