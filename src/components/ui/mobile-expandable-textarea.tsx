"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useUiRevamp } from "@/hooks/useUiRevamp";
import { CollapseButton } from "@/components/ui/CollapseButton";

export interface MobileExpandableTextareaProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  minRows?: number;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
  onSave?: () => void;
}

export function MobileExpandableTextarea({
  value,
  onChange,
  label,
  placeholder,
  minRows = 3,
  maxLength,
  disabled = false,
  className,
  onSave,
}: MobileExpandableTextareaProps) {
  const uiRevamp = useUiRevamp();
  const [isMobile, setIsMobile] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const desktopRef = useRef<HTMLTextAreaElement>(null);
  const sheetRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Auto-grow desktop textarea (JS fallback for field-sizing: content)
  const autoGrow = useCallback(() => {
    const el = desktopRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    autoGrow();
  }, [value, autoGrow]);

  const openSheet = () => {
    if (disabled) return;
    setDraft(value);
    setSheetOpen(true);
  };

  const handleSave = () => {
    onChange(draft);
    setSheetOpen(false);
    onSave?.();
  };

  const handleCancel = () => {
    setSheetOpen(false);
  };

  useEffect(() => {
    if (sheetOpen) {
      const t = setTimeout(() => sheetRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [sheetOpen]);

  // Close sheet on Escape
  useEffect(() => {
    if (!sheetOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sheetOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const baseTextareaCls = cn(
    "w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm",
    "text-[var(--foreground)] bg-[var(--background)]",
    "focus-visible:outline-none focus:border-[var(--teal)] transition-colors",
    "resize-none leading-relaxed overflow-hidden",
    "disabled:bg-[var(--surface-warm-200)] disabled:text-[var(--muted-foreground)]",
    className
  );

  // No revamp flag — plain textarea, same as existing behaviour
  if (!uiRevamp) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        rows={minRows}
        className={baseTextareaCls}
      />
    );
  }

  // Mobile revamp — tap-to-edit preview + bottom sheet
  if (isMobile) {
    const preview = value?.trim();
    return (
      <>
        <button
          type="button"
          disabled={disabled}
          onClick={openSheet}
          className={cn(
            "w-full text-left border border-[var(--border)] rounded-xl px-3 py-2.5 bg-[var(--background)]",
            "transition-colors focus-visible:outline-none focus:ring-1 focus:ring-[var(--teal)]",
            "disabled:opacity-50 disabled:pointer-events-none",
            className
          )}
        >
          {preview ? (
            <span className="block line-clamp-3 text-sm text-[var(--foreground)] leading-relaxed">
              {preview}
            </span>
          ) : (
            <span className="block text-sm text-[var(--muted-foreground)]">
              {placeholder ?? "Tap to add…"}
            </span>
          )}
          {!disabled && (
            <span className="block text-xs text-[var(--teal)] mt-1.5">
              Tap to edit
            </span>
          )}
        </button>

        <AnimatePresence>
          {sheetOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                className="fixed inset-0 z-40 bg-black/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleCancel}
              />

              {/* Sheet */}
              <motion.div
                className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-[var(--background)] rounded-t-2xl shadow-xl"
                style={{ height: "95dvh" }}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 36 }}
                role="dialog"
                aria-modal="true"
                aria-label={label}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
                  <span className="text-sm font-semibold text-[var(--foreground)]">
                    {label}
                  </span>
                  <CollapseButton
                    onClick={handleCancel}
                    className="h-7 w-7 flex items-center justify-center rounded-xl text-[var(--muted-foreground)] hover:bg-[var(--surface-warm-100)]"
                    aria-label="Close"
                  />
                </div>

                {/* Editing area */}
                <div className="flex-1 overflow-auto p-4">
                  <textarea
                    ref={sheetRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={placeholder}
                    maxLength={maxLength}
                    disabled={disabled}
                    className="w-full h-full text-[var(--foreground)] bg-transparent resize-none focus-visible:outline-none leading-relaxed placeholder-[var(--muted-foreground)]"
                    style={{ fontSize: "16px" }}
                  />
                </div>

                {/* Keyboard accessory bar */}
                <div className="shrink-0 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3 flex items-center gap-3">
                  {maxLength ? (
                    <span className="text-xs text-[var(--muted-foreground)] flex-1">
                      {draft.length}/{maxLength}
                    </span>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 rounded-xl text-sm font-medium border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-warm-100)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="px-4 py-2 rounded-xl text-sm font-medium bg-[var(--teal)] text-white hover:bg-[var(--teal-darker)] transition-colors"
                  >
                    Save
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }

  // Desktop revamp — auto-grow textarea
  return (
    <textarea
      ref={desktopRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onInput={autoGrow}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      rows={minRows}
      className={baseTextareaCls}
      style={{ fieldSizing: "content" } as React.CSSProperties}
    />
  );
}
