"use client";

import { useEffect, useId } from "react";

interface ConfirmDialogProps {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** true = dark foreground confirm button (reversible-but-destructive actions like Archive);
   *  false/omit = teal confirm button (AI-generate actions) */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  maxWidth?: "sm" | "md";
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
  maxWidth = "sm",
}: ConfirmDialogProps) {
  const labelId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className={`bg-white rounded-2xl shadow-xl w-full p-6 space-y-4 ${maxWidth === "md" ? "max-w-md" : "max-w-sm"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={labelId} className="text-base font-semibold text-[var(--foreground)]">
          {title}
        </h2>
        <div>{body}</div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="text-sm font-medium text-[var(--neutral-cool-700)] px-4 py-2 rounded-xl border border-[var(--neutral-cool-200)] hover:bg-[var(--neutral-cool-50)] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`text-sm font-medium text-white px-4 py-2 rounded-xl ${
              destructive
                ? "bg-[var(--foreground)] hover:opacity-90 transition-opacity"
                : "bg-[var(--teal)] hover:bg-[var(--teal-dark,var(--teal))] transition-colors"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
