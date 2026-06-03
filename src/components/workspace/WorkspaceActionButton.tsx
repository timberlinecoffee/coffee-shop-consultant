"use client";

// TIM-1793 (board scope addition): canonical workspace-chrome action button.
// Single source of truth for the size / typography / appearance of every
// workspace header action (Save, Export, Settings, Guided setup, Manage
// Stations, …). The board chose Equipment & Supplies' control sizing as the
// platform canon, so the tokens below are locked and must NOT be overridden
// per workspace — import this component instead of hand-rolling the classes.
//
//   size/typography: text-xs font-semibold gap-1.5 px-3 py-1.5 rounded-lg
//   secondary (default): teal outline, hover teal/5
//   primary: solid teal, hover --teal-deep
//   icons: render at size={12} to match the canon.

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type WorkspaceActionButtonVariant = "primary" | "secondary";

/** Canonical icon size for chrome action buttons. */
export const WORKSPACE_ACTION_ICON_SIZE = 12;

const BASE =
  "flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50";

const VARIANT_CLASS: Record<WorkspaceActionButtonVariant, string> = {
  primary: "text-white bg-[var(--teal)] hover:bg-[var(--teal-deep)]",
  secondary:
    "text-[var(--teal)] border border-[var(--teal)]/30 hover:bg-[var(--teal)]/5",
};

type WorkspaceActionButtonProps = {
  variant?: WorkspaceActionButtonVariant;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function WorkspaceActionButton({
  variant = "secondary",
  className,
  children,
  ...rest
}: WorkspaceActionButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`${BASE} ${VARIANT_CLASS[variant]}${className ? ` ${className}` : ""}`}
    >
      {children}
    </button>
  );
}
