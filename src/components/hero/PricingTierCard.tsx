"use client";

import { CheckIcon } from "@/lib/icons";

export interface PricingTier {
  /** Tier display name, e.g. "Starter" */
  name: string;
  /** Monthly price as a number. */
  price: number;
  /** Price period label. Defaults to "/month". */
  period?: string;
  /** Feature strings. No em-dashes. No banned words. */
  features: string[];
  /** CTA button label. */
  ctaLabel: string;
  /** CTA button destination. */
  ctaHref: string;
  /** True when this tier is the active or recommended selection. */
  isSelected?: boolean;
}

export interface PricingTierCardProps {
  /** Ordered list of pricing tiers displayed as full-width horizontal rows. */
  tiers: PricingTier[];
  /**
   * Called when the user clicks a CTA.
   * If provided, click is handled in-app; the href is ignored.
   */
  onSelect?: (tier: PricingTier) => void;
  /** Additional CSS class names for the outer wrapper. */
  className?: string;
}

/**
 * PricingTierCard — Component 4 per design-direction v3 Section 6.
 *
 * Full-width horizontal rows, not a three-column card grid. Each tier shows:
 *   - Tier name (Poppins 600 H3)
 *   - Price number (Poppins 700, Display scale) with period (Poppins 300 body)
 *   - Feature list with sage checkmarks
 *   - CTA button (teal, flat — no gradient)
 *
 * The selected/recommended tier has a 2px left border in --color-teal and
 * a --neutral-200 background. No "Most Popular" badge. No gradient button.
 * Differentiation is structural, not decorative.
 *
 * Responsive: at mobile (< 640px) the price and features stack vertically.
 */
export function PricingTierCard({
  tiers,
  onSelect,
  className = "",
}: PricingTierCardProps) {
  return (
    <div className={["flex flex-col gap-3 w-full", className].join(" ")}>
      {tiers.map((tier) => {
        const period = tier.period ?? "/month";

        return (
          <div
            key={tier.name}
            className={[
              "relative flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6",
              "rounded-lg p-5 border",
              tier.isSelected
                ? "border-[var(--color-teal)] border-l-[3px] bg-[var(--neutral-200)]"
                : "border-[var(--neutral-300)] bg-[var(--color-white)]",
            ].join(" ")}
          >
            {/* Left: name + price */}
            <div className="flex flex-col gap-1 sm:w-44 shrink-0">
              <h3
                className="font-semibold text-[var(--neutral-950)]"
                style={{
                  fontSize: "var(--text-h3)",
                  lineHeight: "var(--text-h3-lh)",
                }}
              >
                {tier.name}
              </h3>
              <div className="flex items-baseline gap-1">
                <span
                  className="font-bold text-[var(--neutral-950)]"
                  style={{ fontSize: "var(--text-h1)", lineHeight: 1 }}
                >
                  ${tier.price}
                </span>
                <span
                  className="font-light text-[var(--neutral-600)]"
                  style={{
                    fontSize: "var(--text-body)",
                    lineHeight: "var(--text-body-lh)",
                  }}
                >
                  {period}
                </span>
              </div>
            </div>

            {/* Middle: features */}
            <ul className="flex flex-col gap-2 flex-1">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <CheckIcon
                    size={16}
                    weight="regular"
                    className="shrink-0 mt-0.5"
                    style={{ color: "var(--color-sage)" }}
                    aria-hidden
                  />
                  <span
                    className="text-[var(--neutral-700)]"
                    style={{
                      fontSize: "var(--text-body)",
                      lineHeight: "var(--text-body-lh)",
                    }}
                  >
                    {feature}
                  </span>
                </li>
              ))}
            </ul>

            {/* Right: CTA */}
            <div className="flex items-start shrink-0">
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(tier)}
                  className={[
                    "rounded-md px-4 py-2 font-semibold",
                    "bg-[var(--color-teal)] text-[var(--color-white)]",
                    "transition-colors duration-[var(--duration-fast)]",
                    "hover:bg-[var(--color-teal-dark)]",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-teal)]",
                  ].join(" ")}
                  style={{
                    fontSize: "var(--text-body-sm)",
                    lineHeight: "var(--text-body-sm-lh)",
                  }}
                >
                  {tier.ctaLabel}
                </button>
              ) : (
                <a
                  href={tier.ctaHref}
                  className={[
                    "inline-block rounded-md px-4 py-2 font-semibold",
                    "bg-[var(--color-teal)] text-[var(--color-white)]",
                    "transition-colors duration-[var(--duration-fast)]",
                    "hover:bg-[var(--color-teal-dark)]",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-teal)]",
                  ].join(" ")}
                  style={{
                    fontSize: "var(--text-body-sm)",
                    lineHeight: "var(--text-body-sm-lh)",
                  }}
                >
                  {tier.ctaLabel}
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
