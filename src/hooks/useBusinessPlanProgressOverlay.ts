"use client";

// TIM-2385: Hook for opening/updating the two-phase Generate progress overlay
// from anywhere inside the Business Plan workspace. Mirrors the
// useAIReviewModal pattern so both surfaces compose cleanly.

import { useCallback, useState, createElement } from "react";
import { BusinessPlanProgressOverlay } from "@/components/business-plan/BusinessPlanProgressOverlay";

export interface OpenProgressOverlayOptions {
  total: number;
  onCancel: () => void;
}

interface OverlayState {
  isOpen: boolean;
  total: number;
  completed: number;
  failedSectionTitles: string[];
  onCancel: () => void;
}

export function useBusinessPlanProgressOverlay() {
  const [state, setState] = useState<OverlayState | null>(null);

  const openProgressOverlay = useCallback((opts: OpenProgressOverlayOptions) => {
    setState({
      isOpen: true,
      total: opts.total,
      completed: 0,
      failedSectionTitles: [],
      onCancel: opts.onCancel,
    });
  }, []);

  const updateProgressOverlay = useCallback(
    (patch: { completed?: number; failedSectionTitle?: string }) => {
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          completed: patch.completed ?? prev.completed,
          failedSectionTitles: patch.failedSectionTitle
            ? [...prev.failedSectionTitles, patch.failedSectionTitle]
            : prev.failedSectionTitles,
        };
      });
    },
    [],
  );

  const closeProgressOverlay = useCallback(() => {
    setState(null);
  }, []);

  const ProgressOverlayNode = state
    ? createElement(BusinessPlanProgressOverlay, {
        isOpen: state.isOpen,
        total: state.total,
        completed: state.completed,
        failedSectionTitles: state.failedSectionTitles,
        onCancel: state.onCancel,
      })
    : null;

  return {
    openProgressOverlay,
    updateProgressOverlay,
    closeProgressOverlay,
    ProgressOverlayNode,
  };
}
