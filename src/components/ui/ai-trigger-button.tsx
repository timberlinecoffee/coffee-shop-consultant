"use client";

// TIM-1689: Single shared AI entry-point button.
// Standardises on Lucide Sparkles, Groundwork tokens, and one visual weight
// across all 9 AI trigger sites. Use this instead of ad-hoc buttons.

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type AITriggerVariant = "sm" | "xs" | "fab" | "fab-mobile";

interface AITriggerButtonProps {
  label: string;
  /** Text shown while loading (defaults to `label`). */
  loadingLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  variant?: AITriggerVariant;
  className?: string;
  "aria-label"?: string;
  title?: string;
  type?: "button" | "submit";
}

export function AITriggerButton({
  label,
  loadingLabel,
  loading = false,
  disabled = false,
  onClick,
  variant = "sm",
  className,
  "aria-label": ariaLabel,
  title,
  type = "button",
}: AITriggerButtonProps) {
  const display = loading ? (loadingLabel ?? label) : label;

  // ── Desktop floating launcher (CoPilotBeacon) ───────────────────────────
  if (variant === "fab") {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        title={title ?? label}
        className={cn(
          "fixed bottom-6 right-6 z-30 w-12 h-12 rounded-full",
          "bg-[var(--teal)] text-white shadow-md",
          "hover:shadow-lg hover:brightness-105 transition",
          "hidden lg:flex items-center justify-center",
          disabled && "opacity-50 pointer-events-none",
          className
        )}
      >
        <Sparkles aria-hidden className="w-5 h-5" strokeWidth={1.75} />
      </button>
    );
  }

  // ── Mobile + desktop FAB (CoPilotDrawer) ────────────────────────────────
  if (variant === "fab-mobile") {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        className={cn(
          "fixed bottom-18 right-4 lg:bottom-6 lg:right-6 z-30",
          "w-14 h-14 rounded-2xl ai-gradient-bg text-white shadow-lg",
          "flex items-center justify-center active:scale-95 transition-transform",
          disabled && "opacity-50 pointer-events-none",
          className
        )}
      >
        <Sparkles aria-hidden className="w-5 h-5" />
      </button>
    );
  }

  // ── Inline trigger — xs (tight label rows, e.g. PersonaEditor) ──────────
  if (variant === "xs") {
    return (
      <Button
        type={type}
        size="xs"
        onClick={onClick}
        disabled={disabled || loading}
        className={cn("shrink-0 whitespace-nowrap", className)}
      >
        <Sparkles className="size-3 mr-1" aria-hidden />
        {display}
      </Button>
    );
  }

  // ── Inline trigger — sm (default for most AI actions) ───────────────────
  return (
    <Button
      type={type}
      size="sm"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn("shrink-0 whitespace-nowrap", className)}
    >
      <Sparkles className="size-3.5 mr-1.5" aria-hidden />
      {display}
    </Button>
  );
}
