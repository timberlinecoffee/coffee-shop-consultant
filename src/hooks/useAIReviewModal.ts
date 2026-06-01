"use client";

// TIM-1561: Hook for opening the unified AIReviewModal.
// Lazy-loads the modal component so diff-match-patch stays out of initial bundles.
// Usage:
//   const { openAIReviewModal, AIReviewModalNode } = useAIReviewModal()
//   // Render <>{AIReviewModalNode}</> in your component tree.
//   // Call openAIReviewModal({ suggestions, context, onApply }) to open.

import dynamic from "next/dynamic";
import { useCallback, useState, createElement } from "react";
import type {
  AIReviewModalProps,
  ApprovedChange,
  SuggestionPayload,
} from "@/components/ai-assist/AIReviewModal";

export type { SuggestionPayload, ApprovedChange };

const LazyAIReviewModal = dynamic(
  () =>
    import("@/components/ai-assist/AIReviewModal").then((m) => ({
      default: m.AIReviewModal,
    })),
  { ssr: false },
);

export interface OpenAIReviewModalOptions {
  suggestions: SuggestionPayload[];
  context: AIReviewModalProps["context"];
  onApply: (accepted: ApprovedChange[]) => Promise<void>;
  isStreaming?: boolean;
  error?: string | null;
}

interface ModalState extends OpenAIReviewModalOptions {
  isOpen: boolean;
}

export function useAIReviewModal() {
  const [state, setState] = useState<ModalState | null>(null);

  const openAIReviewModal = useCallback((opts: OpenAIReviewModalOptions) => {
    setState({ ...opts, isOpen: true });
  }, []);

  const close = useCallback(() => {
    setState(null);
  }, []);

  const AIReviewModalNode = state
    ? createElement(LazyAIReviewModal, {
        isOpen: state.isOpen,
        onClose: close,
        onApply: async (accepted: ApprovedChange[]) => {
          await state.onApply(accepted);
          close();
        },
        suggestions: state.suggestions,
        context: state.context,
        isStreaming: state.isStreaming,
        error: state.error,
      })
    : null;

  return { openAIReviewModal, AIReviewModalNode };
}
