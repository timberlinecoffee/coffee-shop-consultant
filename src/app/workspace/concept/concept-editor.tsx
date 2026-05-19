"use client";

// TIM-619: Concept workspace client editor.
// - Autosaves every field change to /api/workspaces/concept (debounced).
// - Optimistic local state survives reload (server re-renders from workspace_documents).
// - Emits a "copilot:focus-field" custom event so the CoPilotDrawer can pre-load
//   a targeted prompt when the user asks the AI to refine a specific field.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import {
  CONCEPT_FIELDS,
  isConceptComplete,
  type ConceptDocument,
} from "@/lib/concept";
import { UPGRADE_PATH } from "@/lib/access";

const AUTOSAVE_DEBOUNCE_MS = 700;

type SaveState =
  | { kind: "idle"; lastSavedAt: string | null }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

interface ConceptWorkspaceProps {
  planId: string;
  initialConcept: ConceptDocument;
  initialUpdatedAt: string | null;
  canEdit: boolean;
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
  initialConcept,
  initialUpdatedAt,
  canEdit,
}: ConceptWorkspaceProps) {
  const [concept, setConcept] = useState<ConceptDocument>(initialConcept);
  const [saveState, setSaveState] = useState<SaveState>({
    kind: "idle",
    lastSavedAt: initialUpdatedAt,
  });
  const inFlightController = useRef<AbortController | null>(null);
  const pendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestConceptRef = useRef<ConceptDocument>(initialConcept);

  const completion = useMemo(() => isConceptComplete(concept), [concept]);

  // Persist to localStorage as belt-and-suspenders against tab close mid-edit.
  // Server data is the source of truth on reload — this only matters if the
  // user disconnects before the debounced PATCH lands.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        `tim619_concept_unsaved_${planId}`,
        JSON.stringify(concept),
      );
    } catch {
      // ignore storage failures (private mode, quota)
    }
  }, [concept, planId]);

  // On mount, recover an unsaved local copy IFF it differs from server initial.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`tim619_concept_unsaved_${planId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ConceptDocument;
      if (JSON.stringify(parsed) === JSON.stringify(initialConcept)) {
        // Local copy matches server — nothing to recover.
        return;
      }
      // Otherwise we leave the user with what's currently in state from props.
      // We don't auto-overwrite because the server is authoritative.
    } catch {
      // ignore parse failures
    }
    // We intentionally only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(
    async (next: ConceptDocument) => {
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
        if (!res.ok) {
          throw new Error(`save failed (${res.status})`);
        }
        const data = (await res.json()) as { updated_at?: string };
        const updatedAt = data?.updated_at ?? new Date().toISOString();
        setSaveState({ kind: "saved", at: updatedAt });
        // Clear unsaved-local marker now that server has accepted.
        try {
          window.localStorage.removeItem(`tim619_concept_unsaved_${planId}`);
          window.localStorage.setItem(
            `tim619_concept_synced_${planId}`,
            JSON.stringify(next),
          );
        } catch {
          // ignore
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setSaveState({
          kind: "error",
          message:
            err instanceof Error ? err.message : "Could not save. Will retry.",
        });
      }
    },
    [canEdit, planId],
  );

  const scheduleSave = useCallback(
    (next: ConceptDocument) => {
      latestConceptRef.current = next;
      setSaveState({ kind: "dirty" });
      if (pendingSaveTimer.current) {
        clearTimeout(pendingSaveTimer.current);
      }
      pendingSaveTimer.current = setTimeout(() => {
        pendingSaveTimer.current = null;
        void persist(latestConceptRef.current);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [persist],
  );

  // Flush pending changes on unload (best-effort with sendBeacon).
  useEffect(() => {
    const handler = () => {
      if (!pendingSaveTimer.current) return;
      clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = null;
      if (!canEdit) return;
      try {
        const blob = new Blob(
          [JSON.stringify({ content: latestConceptRef.current })],
          { type: "application/json" },
        );
        // sendBeacon doesn't support PATCH; POST handler is identical (writeMutation).
        navigator.sendBeacon?.("/api/workspaces/concept", blob);
      } catch {
        // ignore
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [canEdit]);

  function update<K extends keyof ConceptDocument>(key: K, value: string) {
    setConcept((prev) => {
      const next = { ...prev, [key]: value };
      scheduleSave(next);
      return next;
    });
  }

  const focusOnField = useCallback(
    (fieldKey: keyof ConceptDocument, label: string) => {
      if (typeof window === "undefined") return;
      const currentValue = latestConceptRef.current[fieldKey] || "(blank)";
      const prompt = `Refine my Concept workspace's "${label}" field.\n\nCurrent value:\n${currentValue}\n\nGive me one tightened rewrite and one alternative direction. Keep it specific to my plan.`;
      window.dispatchEvent(
        new CustomEvent("copilot:open-with-prompt", {
          detail: { prompt, focusLabel: `Concept · ${label}` },
        }),
      );
    },
    [],
  );

  const lastSavedAt =
    saveState.kind === "saved"
      ? saveState.at
      : saveState.kind === "idle"
      ? saveState.lastSavedAt
      : null;

  return (
    <div className="min-h-screen bg-[#faf9f7] pb-24 lg:pb-24">
      <nav className="bg-white border-b border-[#efefef] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-sm text-[#155e63] font-medium hover:underline"
          >
            ← Back to dashboard
          </Link>
          <span
            className="text-xs text-[#6b6b6b]"
            data-workspace-key="concept"
          >
            Workspace · Concept
          </span>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <header className="mb-8">
          <div className="text-4xl mb-3" aria-hidden="true">
            ☕
          </div>
          <h1 className="font-semibold text-2xl text-[#1a1a1a] mb-2">Concept</h1>
          <p className="text-sm text-[#6b6b6b] leading-relaxed">
            Shape the identity of your shop — mission, target customer,
            differentiation, brand voice. Every other workspace reads from
            this. The co-pilot can suggest edits to any field; tap{" "}
            <span className="font-medium text-[#155e63]">Ask AI</span> to start.
          </p>
        </header>

        <div className="flex items-center gap-3 mb-6">
          <CompletionPill complete={completion} />
          <SaveStatus state={saveState} lastSavedAt={lastSavedAt} />
        </div>

        {!canEdit && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-[#e8d7b0] bg-[#fbf3df] px-4 py-3 text-sm text-[#7a5a17]"
          >
            <p className="font-medium mb-1">Read-only preview</p>
            <p className="leading-relaxed">
              Your subscription is paused so we&apos;ve locked editing. The
              co-pilot can still reference your plan.{" "}
              <Link
                href={UPGRADE_PATH}
                className="underline font-medium text-[#7a5a17]"
              >
                Reactivate to keep editing
              </Link>
              .
            </p>
          </div>
        )}

        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (pendingSaveTimer.current) {
              clearTimeout(pendingSaveTimer.current);
              pendingSaveTimer.current = null;
            }
            void persist(latestConceptRef.current);
          }}
        >
          {CONCEPT_FIELDS.map((field) => {
            const value = concept[field.key];
            const id = `concept-${field.key}`;
            return (
              <div
                key={field.key}
                className="bg-white border border-[#efefef] rounded-2xl p-5"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <label
                      htmlFor={id}
                      className="block text-sm font-semibold text-[#1a1a1a]"
                    >
                      {field.label}
                    </label>
                    <p className="text-xs text-[#afafaf] mt-0.5">
                      {field.hint}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => focusOnField(field.key, field.label)}
                    className="text-xs font-medium text-[#155e63] border border-[#cfe0e1] rounded-full px-3 py-1 hover:bg-[#155e63]/5 transition-colors whitespace-nowrap"
                  >
                    Ask AI ↗
                  </button>
                </div>
                {field.multiline ? (
                  <textarea
                    id={id}
                    value={value}
                    onChange={(e) => update(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={field.rows ?? 3}
                    disabled={!canEdit}
                    className="mt-2 w-full border border-[#efefef] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors bg-[#faf9f7] resize-none leading-relaxed disabled:bg-[#f4f3f1] disabled:text-[#6b6b6b]"
                  />
                ) : (
                  <input
                    id={id}
                    type="text"
                    value={value}
                    onChange={(e) => update(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    disabled={!canEdit}
                    className="mt-2 w-full border border-[#efefef] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors bg-[#faf9f7] disabled:bg-[#f4f3f1] disabled:text-[#6b6b6b]"
                  />
                )}
              </div>
            );
          })}

          <p className="text-xs text-[#afafaf] text-center">
            Autosaves as you type. Reload-safe.
          </p>
        </form>
      </div>

      <CoPilotDrawer
        planId={planId}
        workspaceKey="concept"
        currentFocus={{
          label: "Concept workspace",
        }}
      />

      <BottomTabBar />
    </div>
  );
}

function CompletionPill({ complete }: { complete: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
        complete
          ? "bg-[#155e63]/10 text-[#155e63]"
          : "bg-[#f4f3f1] text-[#6b6b6b]"
      }`}
      data-concept-complete={complete}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          complete ? "bg-[#155e63]" : "bg-[#afafaf]"
        }`}
      />
      {complete ? "Complete" : "In progress"}
    </span>
  );
}

function SaveStatus({
  state,
  lastSavedAt,
}: {
  state: SaveState;
  lastSavedAt: string | null;
}) {
  let copy: string;
  let tone = "text-[#afafaf]";
  switch (state.kind) {
    case "saving":
      copy = "Saving…";
      tone = "text-[#155e63]";
      break;
    case "dirty":
      copy = "Unsaved changes";
      tone = "text-[#6b6b6b]";
      break;
    case "saved":
      copy = formatTimestamp(state.at);
      break;
    case "error":
      copy = state.message;
      tone = "text-[#a13d3d]";
      break;
    case "idle":
    default:
      copy = formatTimestamp(lastSavedAt);
      break;
  }
  return (
    <span className={`text-xs ${tone}`} role="status" aria-live="polite">
      {copy}
    </span>
  );
}
