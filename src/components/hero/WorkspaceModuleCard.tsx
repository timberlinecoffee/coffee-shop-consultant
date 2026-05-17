"use client";

import Image from "next/image";
import type { ComponentType } from "react";
import type { PhosphorIconProps } from "@/lib/icons";

export interface WorkspaceModuleCardProps {
  /** Module name displayed as the card title. */
  moduleName: string;
  /** Module number (1–8) used for accessible labeling. */
  moduleNumber: number;
  /** Completion percentage 0–100. */
  completionPercent: number;
  /** Optional photography thumbnail URL (3:2 crop). */
  thumbnailUrl?: string;
  /** Optional custom icon rendered in the top-right of the thumbnail area. */
  Icon?: ComponentType<PhosphorIconProps>;
  /** Click handler for the whole card. */
  onClick?: () => void;
  /** Additional CSS class names. */
  className?: string;
}

/**
 * WorkspaceModuleCard — Component 1 per design-direction v3 Section 6.
 *
 * Horizontal card with a 64px photography thumbnail, module name, completion
 * percentage, and a sage/neutral progress bar. No box shadow. 1px neutral-300
 * border. Photography is the primary visual identity element.
 *
 * Responsive: stacks vertically below 480px.
 */
export function WorkspaceModuleCard({
  moduleName,
  moduleNumber,
  completionPercent,
  thumbnailUrl,
  Icon,
  onClick,
  className = "",
}: WorkspaceModuleCardProps) {
  const pct = Math.min(100, Math.max(0, Math.round(completionPercent)));
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      aria-label={onClick ? `Open module ${moduleNumber}: ${moduleName}` : undefined}
      onClick={onClick}
      className={[
        "flex items-stretch w-full rounded-lg overflow-hidden",
        "border border-[var(--neutral-300)] bg-[var(--color-white)]",
        "transition-colors duration-[var(--duration-fast)]",
        onClick ? "cursor-pointer text-left hover:border-[var(--neutral-400)]" : "",
        className,
      ].join(" ")}
    >
      {/* Thumbnail area — 64px wide, relative for icon overlay */}
      <div className="relative shrink-0 w-16 min-h-[64px] bg-[var(--neutral-200)]">
        {thumbnailUrl && (
          <Image
            src={thumbnailUrl}
            alt=""
            fill
            className="object-cover"
            sizes="64px"
          />
        )}

        {/* Custom icon — top-right of thumbnail */}
        {Icon && (
          <div
            className="absolute top-1 right-1 flex items-center justify-center w-6 h-6 rounded bg-[var(--color-white)]/80"
            aria-hidden
          >
            <Icon
              size={14}
              weight="regular"
              style={{ color: "var(--color-teal)" }}
            />
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex flex-col justify-center gap-1.5 px-3 py-2.5 flex-1 min-w-0">
        {/* Module name */}
        <p
          className="truncate font-semibold text-[var(--neutral-950)]"
          style={{ fontSize: "var(--text-h4)", lineHeight: "var(--text-h4-lh)" }}
        >
          {moduleName}
        </p>

        {/* Progress row */}
        <div className="flex items-center gap-2">
          {/* Bar */}
          <div
            className="flex-1 h-1.5 rounded-full bg-[var(--neutral-300)] overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${pct}% complete`}
          >
            <div
              className="h-full rounded-full bg-[var(--color-sage)] transition-[width] duration-[var(--duration-slow)]"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Percentage label */}
          <span
            className="shrink-0 font-light text-[var(--neutral-600)]"
            style={{ fontSize: "var(--text-caption)", lineHeight: "var(--text-caption-lh)" }}
          >
            {pct}%
          </span>
        </div>
      </div>
    </Tag>
  );
}
