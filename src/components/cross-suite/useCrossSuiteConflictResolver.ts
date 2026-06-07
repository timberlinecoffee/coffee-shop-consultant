"use client";

// TIM-2426: Hook that owns the cross-suite resolver state.
//
// Responsibilities:
//   - Fetch conflicts from /api/copilot/cross-suite-resolver (GET) once per
//     mount and on explicit refresh requests.
//   - Open the CrossSuiteConflictResolverModal for a chosen conflict.
//   - When the user accepts a path, hand the path's SuggestionPayload[] to the
//     existing AIReviewModal (per UX spec §10.5 — apply-on-accept goes through
//     the standard review pattern, never auto-applies).
//   - On AIReviewModal Apply → POST accepted changes to the resolver's apply
//     route and re-fetch.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, createElement } from "react";
import { useAIReviewModal, type ApprovedChange } from "@/hooks/useAIReviewModal";
import type {
  CrossSuiteConflict,
  ResolutionPath,
  CrossSuiteConflictsResponse,
} from "@/lib/cross-suite/types";

const LazyResolverModal = dynamic(
  () =>
    import("./CrossSuiteConflictResolverModal").then((m) => ({
      default: m.CrossSuiteConflictResolverModal,
    })),
  { ssr: false },
);

export interface UseCrossSuiteConflictResolverResult {
  // Number of conflicts the resolver knows about for the current plan.
  conflictCount: number;
  // The conflicts themselves — exposed so workspace-header badges can render
  // their own label without re-fetching.
  conflicts: CrossSuiteConflict[];
  // True while the GET fetch is in flight on initial mount or refresh.
  isLoading: boolean;
  // Open the resolver for the conflict at this index. No-op when out of range.
  openResolver: (index: number) => void;
  // Refresh after an external edit (e.g. user changed a hiring row in a
  // sibling component). Cheap call; no spinner unless caller forces one.
  refresh: () => void;
  // Mount these as siblings in the parent component tree.
  ResolverNode: React.ReactNode;
  AIReviewModalNode: React.ReactNode;
}

export function useCrossSuiteConflictResolver(): UseCrossSuiteConflictResolverResult {
  const [conflicts, setConflicts] = useState<CrossSuiteConflict[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeConflictIndex, setActiveConflictIndex] = useState<number | null>(null);
  const [resolverOpen, setResolverOpen] = useState(false);
  const { openAIReviewModal, AIReviewModalNode } = useAIReviewModal();

  const fetchConflicts = useCallback(async () => {
    try {
      const res = await fetch("/api/copilot/cross-suite-resolver", {
        credentials: "same-origin",
      });
      if (!res.ok) {
        // 401/402/404 are fine — user just doesn't have a plan in scope.
        setConflicts([]);
        return;
      }
      const data = (await res.json()) as CrossSuiteConflictsResponse;
      setConflicts(Array.isArray(data.conflicts) ? data.conflicts : []);
    } catch {
      setConflicts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Same async fetch pattern as CoPilotDrawer's TIM-1728 consistency check —
    // state updates happen inside the awaited .then(), not the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchConflicts().then(() => {
      if (cancelled) return;
    });
    return () => { cancelled = true; };
  }, [fetchConflicts]);

  const openResolver = useCallback((index: number) => {
    if (index < 0 || index >= conflicts.length) return;
    setActiveConflictIndex(index);
    setResolverOpen(true);
  }, [conflicts.length]);

  const closeResolver = useCallback(() => {
    setResolverOpen(false);
  }, []);

  // Accept-path → close resolver → open AIReviewModal with the path's
  // SuggestionPayload[]. On Apply, POST accepted changes to the resolver.
  const onAcceptPath = useCallback(
    (path: ResolutionPath) => {
      if (activeConflictIndex === null) return;
      const conflict = conflicts[activeConflictIndex];
      if (!conflict) return;
      setResolverOpen(false);
      openAIReviewModal({
        suggestions: path.suggestions,
        context: {
          workspace: "cross-suite",
          section: `Conflict: ${conflict.suiteA.suiteLabel} vs ${conflict.suiteB.suiteLabel}`,
        },
        onApply: async (accepted: ApprovedChange[]) => {
          if (accepted.length === 0) return;
          const res = await fetch("/api/copilot/cross-suite-resolver", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              conflictId: conflict.id,
              pathId: path.id,
              changes: accepted.map((c) => ({
                fieldId: c.fieldId,
                finalValue: c.finalValue,
              })),
            }),
          });
          if (!res.ok) {
            throw new Error(
              "Couldn't save these changes. Please try again, or open the workspace and edit the values directly.",
            );
          }
          // Refresh so the badge clears or updates the next time the parent re-mounts.
          void fetchConflicts();
        },
      });
    },
    [activeConflictIndex, conflicts, openAIReviewModal, fetchConflicts],
  );

  // Dismiss is non-destructive — closes the modal without writes. Future
  // enhancement (spec §9): persist a "snoozed_until: +14d" on the conflict.
  const onDismiss = useCallback(() => {
    setResolverOpen(false);
  }, []);

  const activeConflict = useMemo(() => {
    if (activeConflictIndex === null) return null;
    return conflicts[activeConflictIndex] ?? null;
  }, [conflicts, activeConflictIndex]);

  const ResolverNode = createElement(LazyResolverModal, {
    isOpen: resolverOpen,
    conflict: activeConflict,
    onClose: closeResolver,
    onAcceptPath,
    onDismiss,
  });

  return {
    conflictCount: conflicts.length,
    conflicts,
    isLoading,
    openResolver,
    refresh: fetchConflicts,
    ResolverNode,
    AIReviewModalNode,
  };
}
