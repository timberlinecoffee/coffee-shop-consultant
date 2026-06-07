// TIM-2423: shared dismissible callout component.
//
// Spec: TIM-1537 style guide → Component Patterns → DismissibleCallout. Use this
// for first-time guidance, feature-discovery prompts, and persistent info strips
// the owner should be able to permanently silence. Never for errors, blocking
// states, or auto-resolving warnings (those stay non-dismissible).

"use client";

import type { ReactNode } from "react";
import { Info, AlertTriangle, CheckCircle, X, type LucideIcon } from "lucide-react";
import { useCalloutDismissed } from "@/lib/use-callout-dismissed";
import { isKnownCalloutKey, type CalloutKey } from "@/lib/callouts";

type Variant = "info" | "warning" | "success";

type VariantSpec = {
  band: string;
  iconColor: string;
  Icon: LucideIcon;
};

const VARIANT_SPECS: Record<Variant, VariantSpec> = {
  info: {
    band: "border-[var(--teal)]/20 bg-[var(--teal)]/5",
    iconColor: "text-[var(--teal)]",
    Icon: Info,
  },
  warning: {
    band: "border-amber-200 bg-amber-50",
    iconColor: "text-amber-600",
    Icon: AlertTriangle,
  },
  success: {
    band: "border-green-200 bg-green-50",
    iconColor: "text-green-700",
    Icon: CheckCircle,
  },
};

export interface DismissibleCalloutProps {
  /** Stable key from CALLOUT_REGISTRY in src/lib/callouts.ts. */
  calloutKey: CalloutKey;
  heading: ReactNode;
  subcopy?: ReactNode;
  /** Optional right-aligned primary action. Provide `href` for navigation
   *  (preserves middle-click / ⌘-click), or `onClick` for an inline handler. */
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
    /** "primary" = filled teal button; "link" = small teal text link. Default "link". */
    variant?: "primary" | "link";
  };
  /** Visual variant — info (default, teal), warning (amber), success (green). */
  variant?: Variant;
  /** Override the default Info/AlertTriangle/CheckCircle icon (matched to variant). */
  icon?: LucideIcon;
  /** Render even when not dismissible — caller can chain extra gating. */
  hidden?: boolean;
  className?: string;
}

export function DismissibleCallout({
  calloutKey,
  heading,
  subcopy,
  action,
  variant = "info",
  icon,
  hidden,
  className,
}: DismissibleCalloutProps) {
  if (process.env.NODE_ENV !== "production" && !isKnownCalloutKey(calloutKey)) {
    // Strict in dev so unknown keys don't slip past code review.
    console.warn(
      `DismissibleCallout: "${calloutKey}" is not in CALLOUT_REGISTRY. ` +
        `Add it to src/lib/callouts.ts before merging.`,
    );
  }

  const { dismissed, dismiss } = useCalloutDismissed(calloutKey);
  if (hidden) return null;
  // dismissed === null while we're still reading the user's pref row — render
  // nothing so a previously dismissed callout never flashes on reload.
  if (dismissed === null || dismissed) return null;

  const spec = VARIANT_SPECS[variant];
  const Icon = icon ?? spec.Icon;
  const actionVariant = action?.variant ?? "link";

  return (
    <div
      role="status"
      onKeyDown={(e) => {
        if (e.key === "Escape") dismiss();
      }}
      className={[
        "relative flex items-start gap-3 rounded-xl border px-4 py-3.5 pr-10",
        spec.band,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={`mt-0.5 flex-shrink-0 ${spec.iconColor}`}>
        <Icon size={16} aria-hidden="true" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--foreground)]">{heading}</p>
        {subcopy ? (
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5 leading-relaxed">
            {subcopy}
          </p>
        ) : null}
      </div>

      {action ? (
        action.href ? (
          <a
            href={action.href}
            onClick={action.onClick}
            className={
              actionVariant === "primary"
                ? "ml-3 flex-shrink-0 self-center text-xs font-semibold text-white bg-[var(--teal)] rounded-lg px-4 py-2 hover:bg-[var(--teal-deep)] transition-colors whitespace-nowrap"
                : "ml-3 flex-shrink-0 self-center text-xs font-medium text-[var(--teal)] hover:underline whitespace-nowrap"
            }
          >
            {action.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className={
              actionVariant === "primary"
                ? "ml-3 flex-shrink-0 self-center text-xs font-semibold text-white bg-[var(--teal)] rounded-lg px-4 py-2 hover:bg-[var(--teal-deep)] transition-colors whitespace-nowrap"
                : "ml-3 flex-shrink-0 self-center text-xs font-medium text-[var(--teal)] hover:underline whitespace-nowrap"
            }
          >
            {action.label}
          </button>
        )
      ) : null}

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss this notice"
        className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-md text-[var(--dark-grey)] hover:bg-[var(--neutral-cool-100)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] focus-visible:ring-offset-1 transition-colors"
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  );
}
