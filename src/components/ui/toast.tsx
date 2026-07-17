"use client";

import { useEffect } from "react";
import { Undo2, X } from "lucide-react";

interface ToastProps {
  /** 'success' = teal pill; 'error' = red pill; 'undo' = teal pill with action button */
  variant?: "success" | "error" | "undo";
  message: string;
  /** Label for the action button — used when variant='undo' or when actionLabel+onAction are both set */
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  /** If set, onDismiss is called automatically after this many ms. Timer resets when message changes. */
  autoClearMs?: number;
  /** Optional leading icon node (e.g. a checkmark SVG) */
  icon?: React.ReactNode;
}

export function Toast({
  variant = "success",
  message,
  actionLabel = "Undo",
  onAction,
  onDismiss,
  autoClearMs,
  icon,
}: ToastProps) {
  useEffect(() => {
    if (!autoClearMs) return;
    const t = setTimeout(onDismiss, autoClearMs);
    return () => clearTimeout(t);
  }, [autoClearMs, message, onDismiss]);

  const showAction = (variant === "undo" || (actionLabel && onAction)) && onAction;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg max-w-sm text-sm font-medium text-white ${
        variant === "error" ? "bg-red-600" : "bg-[var(--teal)]"
      }`}
    >
      {icon}
      <span className="flex-1">{message}</span>
      {showAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1.5 text-sm font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-none"
        >
          {variant === "undo" && <Undo2 size={14} aria-hidden="true" />}
          {actionLabel}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="text-white/80 hover:text-white focus-visible:outline-none"
        aria-label="Dismiss"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
